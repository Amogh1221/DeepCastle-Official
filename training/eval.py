import torch
import numpy as np
import model as M
from model.config import NNUELightningConfig
from data_loader import FenBatchProvider, get_sparse_batch_from_fens
from sklearn.metrics import r2_score

config = NNUELightningConfig(features='HalfKAv2_hm^')
config.model_config.L1 = 256
config.model_config.L2 = 31

nnue = M.NNUE.load_from_checkpoint(
    r'D:\deepcastle6\checkpoints_v7\lightning_logs\version_1\checkpoints\last.ckpt',
    config=config
)
nnue.eval()
nnue = nnue.cuda()
print('Model loaded!')

# Read FENs directly from your binpack
provider = FenBatchProvider(
    r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack',
    cyclic=False,
    num_workers=1,
    batch_size=64
)

print('Collecting positions from your training data...')
fens = []
for batch in provider:
    fens.extend(batch)
    if len(fens) >= 2000:
        break

fens = fens[:2000]
print(f'Got {len(fens)} FENs')
print(f'Sample FEN: {fens[0]}')

# Evaluate each FEN
BATCH = 64
pred_scores = []

for i in range(0, len(fens), BATCH):
    batch_fens = fens[i:i+BATCH]
    n = len(batch_fens)
    batch = get_sparse_batch_from_fens(
        'HalfKAv2_hm',
        batch_fens,
        [0] * n,
        [0] * n,
        [0] * n
    )
    tensors = batch.contents.get_tensors('cuda')
    us, them, wi, wv, bi, bv, outcome, score, psqt, ls = tensors
    with torch.no_grad():
        result = nnue.model(us, them, wi, wv, bi, bv, psqt, ls)
    preds = (result * 600).squeeze().cpu().numpy()
    if n == 1:
        pred_scores.append(float(preds))
    else:
        pred_scores.extend(preds.tolist())
    if i % 320 == 0:
        print(f'Evaluated {i}/{len(fens)}...')

print(f'\nSample predictions:')
for i in range(5):
    print(f'  {fens[i]} → {pred_scores[i]:.1f} cp')