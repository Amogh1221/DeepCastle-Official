import torch
import numpy as np
import chess
import chess.engine
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

# Get FENs from binpack
provider = FenBatchProvider(
    r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack',
    cyclic=False, num_workers=1, batch_size=64
)

fens = []
for batch in provider:
    fens.extend(batch)
    if len(fens) >= 200:
        break
fens = fens[:200]
print(f'Got {len(fens)} FENs')

# Get ground truth from Stockfish at depth 9
print('Running Stockfish at depth 9...')
engine = chess.engine.SimpleEngine.popen_uci(
    r'C:\Users\amogh\Downloads\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe'
)

true_scores = []
valid_fens  = []
for i, fen in enumerate(fens):
    try:
        board  = chess.Board(fen)
        result = engine.analyse(board, chess.engine.Limit(depth=9))
        score  = result['score'].white().score(mate_score=10000)
        if score is None or abs(score) > 3000:
            continue
        # flip to side-to-move perspective to match network output
        if board.turn == chess.BLACK:
            score = -score
        true_scores.append(float(score))
        valid_fens.append(fen)
    except Exception:
        continue
    if i % 50 == 0:
        print(f'  Stockfish: {i}/{len(fens)}')

engine.quit()
print(f'Valid positions: {len(valid_fens)}')

# Get network predictions
BATCH = 64
pred_scores = []
for i in range(0, len(valid_fens), BATCH):
    batch_fens = valid_fens[i:i+BATCH]
    n = len(batch_fens)
    batch = get_sparse_batch_from_fens(
        'HalfKAv2_hm', batch_fens,
        [0]*n, [0]*n, [0]*n
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

true_arr = np.array(true_scores)
pred_arr = np.array(pred_scores)

mae  = np.abs(true_arr - pred_arr).mean()
r2   = r2_score(true_arr, pred_arr)
rmse = np.sqrt(((true_arr - pred_arr) ** 2).mean())

print(f'\n=== DeepCastle v7 Evaluation ===')
print(f'Positions : {len(true_arr)}')
print(f'MAE       : {mae:.1f} cp')
print(f'RMSE      : {rmse:.1f} cp')
print(f'R²        : {r2:.4f}')
print(f'\nReference scale:')
print(f'  R² > 0.90 → excellent')
print(f'  R² > 0.70 → good')
print(f'  R² > 0.50 → decent')
print(f'  R² < 0.30 → needs improvement')