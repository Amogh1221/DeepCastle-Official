import struct
with open('D:/deepcastle6/nnue-pytorch/output.nnue', 'rb') as f:
    data = f.read()
print('File size:', len(data), 'bytes')
print('First 4 bytes (version):', data[:4].hex())
print('Network file looks valid!' if len(data) > 1000 else 'File too small - something wrong')