import torch
import model as M
from model.config import NNUELightningConfig

config = NNUELightningConfig(features='HalfKAv2_hm^')
config.model_config.L1 = 256
config.model_config.L2 = 31

nnue = M.NNUE.load_from_checkpoint(
    r'D:\deepcastle6\checkpoints_v7\lightning_logs\version_1\checkpoints\last.ckpt',
    config=config
)
nnue.eval()
nnue = nnue.cuda()
print('Model loaded successfully!')

from data_loader import get_sparse_batch_from_fens
batch = get_sparse_batch_from_fens(
    'HalfKAv2_hm',
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    [0], [0], [0]
)
tensors = batch.contents.get_tensors('cuda')
us, them, white_indices, white_values, black_indices, black_values, outcome, score, psqt_indices, layer_stack_indices = tensors

with torch.no_grad():
    result = nnue.model(us, them, white_indices, white_values, black_indices, black_values, psqt_indices, layer_stack_indices)
print(f'Starting position eval: {result[0].item() * 600:.1f} cp')