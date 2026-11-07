"""对比两张图，输出差异分布并落一张「参考图染红差异」的可视化。

用法: python tools/imgdiff.py ref.png other.png out_prefix [tolerance]
"""
import sys
from PIL import Image, ImageChops

ref_p, oth_p, prefix = sys.argv[1], sys.argv[2], sys.argv[3]
tol = int(sys.argv[4]) if len(sys.argv) > 4 else 24

ref = Image.open(ref_p).convert('RGB')
oth = Image.open(oth_p).convert('RGB')
W = min(ref.width, oth.width)
H = min(ref.height, oth.height)
ref = ref.crop((0, 0, W, H))
oth = oth.crop((0, 0, W, H))

diff = ImageChops.difference(ref, oth).convert('L')
px = diff.load()
rpx = ref.load()

# 逐行差异像素数 + 参考行墨迹数
rows = []
for y in range(H):
    d = 0
    ink = 0
    for x in range(W):
        if px[x, y] > tol:
            d += 1
        r, g, b = rpx[x, y]
        if r < 200 or g < 200 or b < 200:
            ink += 1
    rows.append((y, d, ink))

# 可视化：参考图 + 差异处标红
vis = ref.copy()
vpx = vis.load()
for y in range(H):
    for x in range(W):
        if px[x, y] > tol:
            vpx[x, y] = (255, 0, 0)
vis.crop((0, 0, W, H)).save(f'{prefix}-overlay.png')

total_diff = sum(r[1] for r in rows)
total_ink = sum(r[2] for r in rows) or 1
print(f'size {W}x{H}; 差异像素 {total_diff} 占墨迹 {100*total_diff/total_ink:.2f}%')

# 差异最集中的行带（每 20 行合并）
print('差异最集中的 20px 行带:')
band = 20
best = []
for y0 in range(0, H, band):
    d = sum(r[1] for r in rows[y0:y0 + band])
    ink = sum(r[2] for r in rows[y0:y0 + band])
    best.append((d, y0, ink))
best.sort(reverse=True)
for d, y0, ink in best[:12]:
    print(f'  y={y0:4d}-{y0+band:4d}  差异 {d:5d}  参考墨迹 {ink:5d}  占比 {100*d/(ink or 1):5.1f}%')
