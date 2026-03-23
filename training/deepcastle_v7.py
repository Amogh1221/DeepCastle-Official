"""
DeepCastle v7 - Training Script
=================================
Uses locally generated binpack data from Stockfish gensfen.
Uses official C++ data loader from nnue-pytorch for fast loading.

Architecture: HalfKP NNUE
  - HalfKP features: 20480 per side
  - L1=256, L2=31, L3=32
  - 8 layer stacks by piece count bucket
  - Product pooling (512 -> 256)
  - PSQT shortcut
  - FactorizedStackedLinear on l1
  - SqrCReLU activation

Prerequisites:
  1. Download large_gensfen_multipvdiff_100_d9.binpack
  2. Clone official nnue-pytorch and compile data loader
  3. Copy THIS script into D:\deepcastle6\nnue-pytorch\
  4. Run from inside D:\deepcastle6\nnue-pytorch\

Requirements:
  pip install torch ranger21
  (other deps from nnue-pytorch requirements.txt)
"""

import sys
import os

# ============================================================
# MUST run from inside nnue-pytorch directory
# ============================================================
NNUE_PYTORCH_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, NNUE_PYTORCH_DIR)

import torch
import torch.nn as nn
import torch.nn.functional as F
import torch.optim as optim
from torch.optim.lr_scheduler import StepLR
import numpy as np
import time
import warnings

warnings.filterwarnings('ignore')
torch.backends.cudnn.benchmark = True

from data_loader import SparseBatchDataset
HAS_NNUE_DATASET = True

try:
    import ranger21
    HAS_RANGER21 = True
except ImportError:
    HAS_RANGER21 = False
    print('WARNING: ranger21 not installed. Falling back to AdamW.')

# ============================================================
# CONFIG — UPDATE YOUR_USERNAME BEFORE RUNNING
# ============================================================

# Run "echo %USERNAME%" in cmd to find your username
TRAIN_DATA = r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack'
VAL_DATA   = r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack'
CHECKPOINT_DIR  = r'D:\deepcastle6\checkpoints_v7'
BEST_MODEL_PATH = os.path.join(CHECKPOINT_DIR, 'deepcastle7_best.pt')
LATEST_PATH     = os.path.join(CHECKPOINT_DIR, 'deepcastle7_latest.pt')
RESUME          = True

# HalfKP
NUM_KING_SQ      = 64
NUM_PIECE_TYPE   = 5
NUM_PIECE_SQ     = 64
HALFKP_FEATURES  = NUM_KING_SQ * NUM_PIECE_TYPE * NUM_PIECE_SQ   # 20480
PADDING_IDX      = HALFKP_FEATURES
MAX_PIECES       = 32

# Model
L1_SIZE          = 256
L2_SIZE          = 31
L3_SIZE          = 32
NUM_LS_BUCKETS   = 8
NUM_PSQT_BUCKETS = 8

# Loss
NNUE2SCORE       = 600.0
IN_OFFSET        = 270.0
OUT_OFFSET       = 270.0
IN_SCALING       = 340.0
OUT_SCALING      = 380.0
POW_EXP          = 2.5

# Weight clipping
CLIP_HIDDEN      = 127.0 / 64.0
CLIP_OUT         = (127.0 * 127.0) / (600.0 * 16.0)

# Optimizer
LR               = 8.75e-4
RANGER21_GAMMA   = 0.992
FT_WEIGHT_DECAY  = 0.0
DENSE_WEIGHT_DECAY = 0.0

# Training
EPOCH_SIZE       = 25_000_000  # 25M per epoch
VAL_SIZE         = 1_000_000    # 1M validation positions
EPOCHS           = 400
GRAD_CLIP        = 1.0
BATCH_SIZE       = 16384
NUM_WORKERS      = 4            # works now with C++ loader
LOG_INTERVAL     = 1000         # print every 1000 batches
PATIENCE         = 20
RANDOM_FEN_SKIP  = 3


# ============================================================
# STACKED LINEAR
# ============================================================

class StackedLinear(nn.Module):
    def __init__(self, in_features, out_features, count):
        super().__init__()
        self.in_features  = in_features
        self.out_features = out_features
        self.count        = count
        self.linear       = nn.Linear(in_features, out_features * count)
        self._init_uniformly()

    @torch.no_grad()
    def _init_uniformly(self):
        w0 = self.linear.weight[:self.out_features].clone()
        b0 = self.linear.bias[:self.out_features].clone()
        self.linear.weight.copy_(w0.repeat(self.count, 1))
        self.linear.bias.copy_(b0.repeat(self.count))

    def _select(self, stacked_output, ls_indices):
        reshaped = stacked_output.reshape(-1, self.out_features)
        offset   = torch.arange(
            0, ls_indices.shape[0] * self.count, self.count,
            device=stacked_output.device
        )
        indices = ls_indices.flatten() + offset
        return reshaped[indices]

    def forward(self, x, ls_indices):
        return self._select(self.linear(x), ls_indices)


class FactorizedStackedLinear(StackedLinear):
    def __init__(self, in_features, out_features, count):
        super().__init__(in_features, out_features, count)
        self.factorized_linear = nn.Linear(in_features, out_features)
        with torch.no_grad():
            self.factorized_linear.weight.zero_()
            self.factorized_linear.bias.zero_()

    def forward(self, x, ls_indices):
        merged_w = (self.linear.weight
                    + self.factorized_linear.weight.repeat(self.count, 1))
        merged_b = (self.linear.bias
                    + self.factorized_linear.bias.repeat(self.count))
        stacked  = F.linear(x, merged_w, merged_b)
        return self._select(stacked, ls_indices)


# ============================================================
# LAYER STACKS
# ============================================================

class LayerStacks(nn.Module):
    def __init__(self, count, l1, l2, l3):
        super().__init__()
        self.count = count
        self.L2    = l2
        self.L3    = l3

        self.l1     = FactorizedStackedLinear(l1,     l2 + 1, count)
        self.l2     = StackedLinear(l2 * 2,  l3,     count)
        self.output = StackedLinear(l3,       1,      count)

        with torch.no_grad():
            self.output.linear.bias.zero_()

    @staticmethod
    def get_bucket(piece_count):
        return ((piece_count - 1) // 4).clamp(0, 7)

    def forward(self, x, ls_indices):
        l1c = self.l1(x, ls_indices)
        l1x, l1x_out = l1c.split(self.L2, dim=1)

        l1x = torch.clamp(
            torch.cat([l1x.pow(2.0) * (255.0 / 256.0), l1x], dim=1),
            0.0, 1.0
        )

        l2c = self.l2(l1x, ls_indices)
        l2x = torch.clamp(l2c, 0.0, 1.0)

        l3c = self.output(l2x, ls_indices)
        return l3c + l1x_out


# ============================================================
# MODEL
# ============================================================

class DeepCastle7(nn.Module):
    def __init__(self):
        super().__init__()

        self.embedding = nn.Embedding(
            HALFKP_FEATURES + 1,
            L1_SIZE + NUM_PSQT_BUCKETS,
            padding_idx=PADDING_IDX
        )

        self.layer_stacks = LayerStacks(
            count = NUM_LS_BUCKETS,
            l1    = L1_SIZE,
            l2    = L2_SIZE,
            l3    = L3_SIZE
        )

        self._init_weights()

    def _init_weights(self):
        sigma = 0.025
        with torch.no_grad():
            self.embedding.weight.uniform_(-sigma, sigma)
            self.embedding.weight[PADDING_IDX].zero_()

    def forward(self, w_idx, b_idx, us, them, piece_count):
        wp = self.embedding(w_idx).sum(dim=1)
        bp = self.embedding(b_idx).sum(dim=1)

        w,  wpsqt = wp[:, :L1_SIZE], wp[:, L1_SIZE:]
        b,  bpsqt = bp[:, :L1_SIZE], bp[:, L1_SIZE:]

        us_col   = us.unsqueeze(1)
        them_col = them.unsqueeze(1)
        l0_ = ((us_col   * torch.cat([w, b], dim=1)) +
               (them_col * torch.cat([b, w], dim=1)))
        l0_ = torch.clamp(l0_, 0.0, 1.0)

        l0_s = torch.split(l0_, L1_SIZE // 2, dim=1)
        l0_  = torch.cat([l0_s[0] * l0_s[1],
                          l0_s[2] * l0_s[3]], dim=1) * (127.0 / 128.0)

        ls_bucket = LayerStacks.get_bucket(piece_count)
        fc_out    = self.layer_stacks(l0_, ls_bucket)

        psqt_idx = ls_bucket.unsqueeze(1)
        wpsqt_v  = wpsqt.gather(1, psqt_idx)
        bpsqt_v  = bpsqt.gather(1, psqt_idx)
        psqt_out = (wpsqt_v - bpsqt_v) * (us_col - 0.5)

        return fc_out + psqt_out

    def clip_weights(self):
        with torch.no_grad():
            self.embedding.weight.clamp_(-CLIP_HIDDEN, CLIP_HIDDEN)
            self.layer_stacks.l1.linear.weight.clamp_(-CLIP_HIDDEN, CLIP_HIDDEN)
            self.layer_stacks.l1.factorized_linear.weight.clamp_(-CLIP_HIDDEN, CLIP_HIDDEN)
            self.layer_stacks.l2.linear.weight.clamp_(-CLIP_HIDDEN, CLIP_HIDDEN)
            self.layer_stacks.output.linear.weight.clamp_(-CLIP_OUT, CLIP_OUT)

    def get_param_groups(self, lr):
        return [
            {'params': [p for n, p in self.embedding.named_parameters()
                        if 'bias' not in n], 'lr': lr, 'weight_decay': FT_WEIGHT_DECAY},
            {'params': [p for n, p in self.embedding.named_parameters()
                        if 'bias' in n],    'lr': lr, 'weight_decay': 0.0},
            {'params': [self.layer_stacks.l1.factorized_linear.weight],
             'lr': lr, 'weight_decay': DENSE_WEIGHT_DECAY},
            {'params': [self.layer_stacks.l1.factorized_linear.bias],
             'lr': lr, 'weight_decay': 0.0},
            {'params': [self.layer_stacks.l1.linear.weight],
             'lr': lr, 'weight_decay': DENSE_WEIGHT_DECAY},
            {'params': [self.layer_stacks.l1.linear.bias],
             'lr': lr, 'weight_decay': 0.0},
            {'params': [self.layer_stacks.l2.linear.weight],
             'lr': lr, 'weight_decay': DENSE_WEIGHT_DECAY},
            {'params': [self.layer_stacks.l2.linear.bias],
             'lr': lr, 'weight_decay': 0.0},
            {'params': [self.layer_stacks.output.linear.weight],
             'lr': lr, 'weight_decay': DENSE_WEIGHT_DECAY},
            {'params': [self.layer_stacks.output.linear.bias],
             'lr': lr, 'weight_decay': 0.0},
        ]


# ============================================================
# LOSS
# ============================================================

def nnue_loss(output, score):
    """
    Symmetric sigmoid loss from official nnue-pytorch.
    score: raw centipawn values white POV.
    """
    scorenet = output * NNUE2SCORE

    q  = (scorenet  - IN_OFFSET)  / IN_SCALING
    qm = (-scorenet - IN_OFFSET)  / IN_SCALING
    qf = 0.5 * (1.0 + torch.sigmoid(q) - torch.sigmoid(qm))

    s  = (score  - OUT_OFFSET) / OUT_SCALING
    sm = (-score - OUT_OFFSET) / OUT_SCALING
    pf = 0.5 * (1.0 + torch.sigmoid(s) - torch.sigmoid(sm))

    loss = torch.pow(torch.abs(pf - qf), POW_EXP)
    return loss.mean()


def cp_error(output, score):
    """
    Mean absolute error in centipawns.
    Display only — no gradient, does not affect training.

    What the numbers mean:
      300+ CP  → barely learned anything
      200-300  → early training
      100-200  → learning chess basics
       50-100  → decent
        20-50  → strong
          <20  → Stockfish territory
    """
    scorenet = output * NNUE2SCORE
    mae      = torch.abs(scorenet - score).mean()
    return mae.item()


# ============================================================
# BATCH CONVERSION
# ============================================================

def sparse_batch_to_tensors(batch, device):
    """
    Convert SparseBatch from C++ loader to dense tensors.
    """
    B = batch.size

    w_idx = torch.full((B, MAX_PIECES), PADDING_IDX, dtype=torch.long)
    for i in range(B):
        feats = batch.white_indices[i]
        n     = min(len(feats), MAX_PIECES)
        w_idx[i, :n] = torch.tensor(feats[:n], dtype=torch.long)

    b_idx = torch.full((B, MAX_PIECES), PADDING_IDX, dtype=torch.long)
    for i in range(B):
        feats = batch.black_indices[i]
        n     = min(len(feats), MAX_PIECES)
        b_idx[i, :n] = torch.tensor(feats[:n], dtype=torch.long)

    us    = torch.tensor(batch.us,          dtype=torch.float32)
    them  = 1.0 - us
    score = torch.tensor(batch.score,       dtype=torch.float32).unsqueeze(1)
    pc    = torch.tensor(batch.piece_count, dtype=torch.long)

    return (
        w_idx.to(device, non_blocking=True),
        b_idx.to(device, non_blocking=True),
        score.to(device, non_blocking=True),
        us.to(device, non_blocking=True),
        them.to(device, non_blocking=True),
        pc.to(device, non_blocking=True),
    )


# ============================================================
# TRAINING
# ============================================================

def train():
    if not HAS_NNUE_DATASET:
        print('Cannot train: data_loader not available.')
        print('Run this script from inside the nnue-pytorch directory.')
        print('Make sure training_data_loader.dll is present.')
        return

    for path in [TRAIN_DATA, VAL_DATA]:
        if not os.path.exists(path):
            print(f'ERROR: Data file not found: {path}')
            print('Update TRAIN_DATA and VAL_DATA paths in the script.')
            return

    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

    print('=' * 65)
    print('  DeepCastle v7 - Binpack Training')
    print('=' * 65)
    print(f'Device          : {device}')
    if device.type == 'cuda':
        print(f'GPU             : {torch.cuda.get_device_name(0)}')
        free, total_vram = torch.cuda.mem_get_info()
        print(f'Free VRAM       : {free/1024**3:.1f} / {total_vram/1024**3:.1f} GB')
    print(f'Train data      : {TRAIN_DATA}')
    print(f'Val data        : {VAL_DATA}')
    print(f'HalfKP features : {HALFKP_FEATURES:,} per side')
    print(f'L1={L1_SIZE} L2={L2_SIZE} L3={L3_SIZE}')
    print(f'Layer stacks    : {NUM_LS_BUCKETS} | PSQT: {NUM_PSQT_BUCKETS}')
    print(f'Epoch size      : {EPOCH_SIZE:,}')
    print(f'Val size        : {VAL_SIZE:,}')
    print(f'Batch size      : {BATCH_SIZE:,}')
    print(f'Num workers     : {NUM_WORKERS}')
    print(f'Epochs          : {EPOCHS} | Patience: {PATIENCE}')
    print(f'Optimizer       : {"Ranger21" if HAS_RANGER21 else "AdamW"}')
    print()

    feature_set = 'HalfKP^'

    train_dataset = SparseBatchDataset(
        feature_set,
        TRAIN_DATA,
        batch_size  = BATCH_SIZE,
        num_workers = NUM_WORKERS,
    )

    val_dataset = SparseBatchDataset(
        feature_set,
        VAL_DATA,
        batch_size  = BATCH_SIZE,
        num_workers = 2,
    )

    model  = DeepCastle7().to(device)
    params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    print(f'Parameters      : {params:,}')
    print(f'Model size      : {params*4/1024**2:.1f} MB (fp32)')
    print()

    num_batches = EPOCH_SIZE // BATCH_SIZE

    if HAS_RANGER21:
        optimizer = ranger21.Ranger21(
            model.get_param_groups(LR),
            lr                             = LR,
            betas                          = (0.9, 0.999),
            eps                            = 1e-7,
            using_gc                       = False,
            using_normgc                   = False,
            weight_decay                   = 0.0,
            num_batches_per_epoch          = num_batches,
            num_epochs                     = EPOCHS,
            warmdown_active                = False,
            use_warmup                     = False,
            use_adaptive_gradient_clipping = False,
            softplus                       = False,
            pnm_momentum_factor            = 0.0,
        )
    else:
        optimizer = optim.AdamW(model.get_param_groups(LR), lr=LR)

    scheduler = StepLR(optimizer, step_size=1, gamma=RANGER21_GAMMA)

    use_amp = device.type == 'cuda'
    scaler  = torch.amp.GradScaler('cuda', enabled=use_amp)

    start_epoch      = 0
    best_val         = float('inf')
    patience_counter = 0

    if RESUME and os.path.exists(LATEST_PATH):
        print(f'Resuming from {LATEST_PATH}')
        ckpt = torch.load(LATEST_PATH, map_location=device)
        model.load_state_dict(ckpt['model'])
        optimizer.load_state_dict(ckpt['optimizer'])
        if ckpt.get('scheduler'):
            scheduler.load_state_dict(ckpt['scheduler'])
        scaler.load_state_dict(ckpt['scaler'])
        start_epoch      = ckpt['epoch'] + 1
        best_val         = ckpt['best_val']
        patience_counter = ckpt.get('patience_counter', 0)
        print(f'  Epoch: {start_epoch} | Best val: {best_val:.6f} | '
              f'Patience: {patience_counter}/{PATIENCE}')
        print()

    for epoch in range(start_epoch, EPOCHS):

        # ==================== TRAIN ====================
        model.train()
        total_train_loss = 0.0
        total_train_cp   = 0.0
        epoch_start      = time.time()
        batch_count      = 0

        for batch_idx, batch in enumerate(train_dataset):
            if batch_idx >= num_batches:
                break

            w_idx, b_idx, score, us, them, pc = sparse_batch_to_tensors(
                batch, device
            )

            optimizer.zero_grad(set_to_none=True)

            with torch.amp.autocast(
                device_type = device.type,
                dtype       = torch.bfloat16 if use_amp else torch.float32,
                enabled     = use_amp
            ):
                output = model(w_idx, b_idx, us, them, pc)
                loss   = nnue_loss(output, score)

            scaler.scale(loss).backward()
            scaler.unscale_(optimizer)
            torch.nn.utils.clip_grad_norm_(model.parameters(), GRAD_CLIP)
            scaler.step(optimizer)
            scaler.update()
            model.clip_weights()

            total_train_loss += loss.item()
            batch_count      += 1

            # CP error — display only, zero effect on training
            with torch.no_grad():
                cp_err = cp_error(output, score)
                total_train_cp += cp_err

            if batch_idx % LOG_INTERVAL == 0:
                elapsed    = time.time() - epoch_start
                speed      = int((batch_idx + 1) * BATCH_SIZE / elapsed) if elapsed > 0 else 0
                current_lr = optimizer.param_groups[0]['lr']
                print(f'Ep {epoch:02d} | '
                      f'Batch {batch_idx:6d}/{num_batches} | '
                      f'Loss: {loss.item():.6f} | '
                      f'CP err: {cp_err:.1f} | '
                      f'Speed: {speed:,} pos/sec | '
                      f'LR: {current_lr:.2e}')

        scheduler.step()
        avg_train_loss = total_train_loss / max(batch_count, 1)
        avg_train_cp   = total_train_cp   / max(batch_count, 1)

        # ==================== VALIDATE ====================
        model.eval()
        total_val_loss = 0.0
        total_val_cp   = 0.0
        val_batches    = 0
        val_limit      = VAL_SIZE // BATCH_SIZE

        with torch.no_grad():
            for batch_idx, batch in enumerate(val_dataset):
                if batch_idx >= val_limit:
                    break

                w_idx, b_idx, score, us, them, pc = sparse_batch_to_tensors(
                    batch, device
                )

                with torch.amp.autocast(
                    device_type = device.type,
                    dtype       = torch.bfloat16 if use_amp else torch.float32,
                    enabled     = use_amp
                ):
                    output = model(w_idx, b_idx, us, them, pc)
                    loss   = nnue_loss(output, score)

                total_val_loss += loss.item()
                total_val_cp   += cp_error(output, score)
                val_batches    += 1

        avg_val_loss = total_val_loss / max(val_batches, 1)
        avg_val_cp   = total_val_cp   / max(val_batches, 1)
        epoch_time   = time.time() - epoch_start

        print(f'\n{"─"*65}')
        print(f'  Epoch {epoch:02d} | Time: {epoch_time/60:.1f} min')
        print(f'  Train Loss: {avg_train_loss:.6f} | Val Loss: {avg_val_loss:.6f}')
        print(f'  Train CP err: {avg_train_cp:.1f} | Val CP err: {avg_val_cp:.1f}')

        improved = avg_val_loss < best_val
        if improved:
            best_val         = avg_val_loss
            patience_counter = 0
            print(f'  New best: {best_val:.6f} ✓')
        else:
            patience_counter += 1
            print(f'  No improvement. Patience: {patience_counter}/{PATIENCE}')
        print(f'{"─"*65}\n')

        ckpt = {
            'epoch'           : epoch,
            'model'           : model.state_dict(),
            'optimizer'       : optimizer.state_dict(),
            'scheduler'       : scheduler.state_dict(),
            'scaler'          : scaler.state_dict(),
            'best_val'        : best_val,
            'patience_counter': patience_counter,
            'val_loss'        : avg_val_loss,
            'val_cp_err'      : avg_val_cp,
            'config': {
                'HALFKP_FEATURES' : HALFKP_FEATURES,
                'L1_SIZE'         : L1_SIZE,
                'L2_SIZE'         : L2_SIZE,
                'L3_SIZE'         : L3_SIZE,
                'NUM_LS_BUCKETS'  : NUM_LS_BUCKETS,
                'NUM_PSQT_BUCKETS': NUM_PSQT_BUCKETS,
                'NNUE2SCORE'      : NNUE2SCORE,
                'EPOCH_SIZE'      : EPOCH_SIZE,
                'BATCH_SIZE'      : BATCH_SIZE,
            }
        }

        torch.save(ckpt, LATEST_PATH)
        if improved:
            torch.save(ckpt, BEST_MODEL_PATH)
            print(f'  Saved best -> {BEST_MODEL_PATH}')

        epoch_path = os.path.join(
            CHECKPOINT_DIR, f'deepcastle7_epoch{epoch:02d}.pt'
        )
        torch.save(ckpt, epoch_path)
        print(f'  Saved      -> {epoch_path}\n')

        if patience_counter >= PATIENCE:
            print(f'  Early stopping at epoch {epoch} | Best: {best_val:.6f}')
            break

    print(f'\n  Training complete! Best val loss: {best_val:.6f}')


# ============================================================
# QUANTIZE
# ============================================================

def quantize():
    QUANT_OUTPUT = os.path.join(CHECKPOINT_DIR, 'deepcastle7_quant.pt')
    if not os.path.exists(BEST_MODEL_PATH):
        print('No best model found — skipping quantization.')
        return

    print(f'\nQuantizing {BEST_MODEL_PATH}')
    ckpt      = torch.load(BEST_MODEL_PATH, map_location='cpu')
    quantized = {}
    scales    = {}

    for name, weight in ckpt['model'].items():
        if weight.dtype == torch.float32:
            max_val         = weight.abs().max().item()
            scale           = (32767.0 / max_val) if max_val != 0 else 1.0
            quantized[name] = torch.round(weight * scale).to(torch.int16)
            scales[name]    = scale
        else:
            quantized[name] = weight

    torch.save({
        'weights': quantized,
        'scales' : scales,
        'config' : ckpt.get('config', {})
    }, QUANT_OUTPUT)

    orig_mb  = os.path.getsize(BEST_MODEL_PATH) / 1024**2
    quant_mb = os.path.getsize(QUANT_OUTPUT)    / 1024**2
    print(f'Float32 : {orig_mb:.1f} MB')
    print(f'Int16   : {quant_mb:.1f} MB')
    print(f'Saved   -> {QUANT_OUTPUT}')


if __name__ == '__main__':
    train()
    quantize()