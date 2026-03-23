import torch
import struct
import os

# CONFIG
BEST_MODEL_PATH = r'C:\Users\Amogh\Stuff\Projects\Deepcastle\nnue-pytorch\output.nnue'
if not os.path.exists(BEST_MODEL_PATH):
    # Try the checkpoint directory if output.nnue is not there
    BEST_MODEL_PATH = r'D:\deepcastle6\checkpoints_v7\deepcastle7_best.pt'

OUTPUT_BIN = r'C:\Users\Amogh\Stuff\Projects\Deepcastle\Cpp\deepcastle.nnue'

def export():
    if not os.path.exists(BEST_MODEL_PATH):
        print(f"Error: Model not found at {BEST_MODEL_PATH}")
        return

    print(f"Loading model from {BEST_MODEL_PATH}...")
    ckpt = torch.load(BEST_MODEL_PATH, map_location='cpu')
    weights = ckpt['model'] if 'model' in ckpt else ckpt['weights']
    
    # We want to export:
    # 1. embedding.weight (HALFKP_FEATURES x (256 + 8))
    # ... and other layers.
    
    with open(OUTPUT_BIN, 'wb') as f:
        # Header: Version/Magic
        f.write(struct.pack('I', 0x44433037)) # DC07
        
        def write_tensor(name):
            t = weights[name].float().numpy()
            print(f"Writing {name}: {t.shape}")
            f.write(t.tobytes())

        # Layer by layer (order must match C++ load)
        write_tensor('embedding.weight')
        # Note: In deepcastle_v7.py, layer_stacks contains l1, l2, output.
        # They are StackedLinear (multiple buckets).
        for i in range(8): # NUM_LS_BUCKETS
             # We might need to slice them or write the whole block.
             # StackedLinear weights are usually (out*count) x in.
             pass

        print(f"Exported to {OUTPUT_BIN}")

if __name__ == '__main__':
    # export() # User can run this manually if they have the file.
    pass
