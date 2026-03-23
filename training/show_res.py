import torch
import chess
import chess.engine
import model as M
from model.config import NNUELightningConfig
from data_loader import get_sparse_batch_from_fens

config = NNUELightningConfig(features='HalfKAv2_hm^')
config.model_config.L1 = 256
config.model_config.L2 = 31

nnue = M.NNUE.load_from_checkpoint(
    r'D:\deepcastle6\checkpoints_v7\lightning_logs\version_1\checkpoints\last.ckpt',
    config=config
)
nnue.eval()
nnue = nnue.cuda()

# Start Stockfish
engine = chess.engine.SimpleEngine.popen_uci(
    r'C:\Users\amogh\Downloads\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe'
)

# Get FENs from binpack
from data_loader import FenBatchProvider
provider = FenBatchProvider(
    r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack',
    cyclic=False, num_workers=1, batch_size=64
)
fens = []
for batch in provider:
    fens.extend(batch)
    if len(fens) >= 500:
        break
fens = fens[:500]
print(f'Got {len(fens)} FENs')

# Get Stockfish depth 9 scores and network predictions
print('Evaluating...')
sf_scores   = []
net_scores  = []
valid_fens  = []

for i, fen in enumerate(fens):
    try:
        board  = chess.Board(fen)
        result = engine.analyse(board, chess.engine.Limit(depth=9))
        sf_cp  = result['score'].white().score(mate_score=10000)
        if sf_cp is None or abs(sf_cp) > 3000:
            continue

        # Network prediction
        stm   = 1 if board.turn == chess.WHITE else 0
        batch = get_sparse_batch_from_fens(
            'HalfKAv2_hm', [fen], [0], [0], [stm]
        )
        tensors = batch.contents.get_tensors('cuda')
        us, them, wi, wv, bi, bv, outcome, score, psqt, ls = tensors
        with torch.no_grad():
            res = nnue.model(us, them, wi, wv, bi, bv, psqt, ls)
        net_cp = res[0].item() * 600

        sf_scores.append(float(sf_cp))
        net_scores.append(float(net_cp))
        valid_fens.append(fen)

    except Exception:
        continue

    if i % 100 == 0:
        print(f'  {i}/{len(fens)} done...')

engine.quit()

# Metrics
import numpy as np
from sklearn.metrics import r2_score

sf_arr  = np.array(sf_scores)
net_arr = np.array(net_scores)

mae  = np.abs(sf_arr - net_arr).mean()
r2   = r2_score(sf_arr, net_arr)
rmse = np.sqrt(((sf_arr - net_arr) ** 2).mean())
corr = np.corrcoef(sf_arr, net_arr)[0, 1]

print(f'\n=== DeepCastle v7 vs Stockfish depth-9 ===')
print(f'Positions evaluated : {len(sf_arr)}')
print(f'MAE                 : {mae:.1f} cp')
print(f'RMSE                : {rmse:.1f} cp')
print(f'R²                  : {r2:.4f}')
print(f'Correlation         : {corr:.4f}')
print(f'\nSample predictions:')
print(f'{"FEN":<50} {"Stockfish":>10} {"DeepCastle":>12}')
print('-' * 75)
for i in range(min(10, len(valid_fens))):
    fen_short = valid_fens[i][:48]
    print(f'{fen_short:<50} {sf_scores[i]:>+10.1f} {net_scores[i]:>+12.1f}')