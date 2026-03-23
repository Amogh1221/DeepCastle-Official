from data_loader import SparseBatchDataset

ds = SparseBatchDataset(
    'HalfKAv2_hm^',
    r'D:\deepcastle6\trainingdata\large_gensfen_multipvdiff_100_d9.binpack',
    batch_size=128,
    num_workers=1
)

print('Dataset created, trying to get batch...')
it = iter(ds)
batch = next(it)
print(f'Success! Batch size: {batch.size}')
print(f'Score sample: {batch.score[0]:.1f} cp')