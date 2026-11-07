"""提取两张图的「文本行」纵向位置，量化对比版面偏移。

用法: python tools/rowcmp.py ref.png other.png [x0 x1]
"""
import sys
from PIL import Image

ref_p, oth_p = sys.argv[1], sys.argv[2]
x0 = int(sys.argv[3]) if len(sys.argv) > 3 else 0
x1 = int(sys.argv[4]) if len(sys.argv) > 4 else 10 ** 9


def line_rows(path):
    im = Image.open(path).convert('L')
    W, H = im.size
    x1c = min(x1, W)
    px = im.load()
    prof = []
    for y in range(H):
        n = 0
        for x in range(x0, x1c):
            if px[x, y] < 160:
                n += 1
        prof.append(n)
    rows = []
    y = 0
    while y < H:
        if prof[y] > 1:
            y0 = y
            ink = 0
            while y < H and prof[y] > 1:
                ink += prof[y]
                y += 1
            rows.append((y0, y - 1, (y0 + y - 1) / 2, ink))
        else:
            y += 1
    return rows, im.size


ra, size_a = line_rows(ref_p)
rb, size_b = line_rows(oth_p)
print(f'ref {size_a} 行数 {len(ra)} / other {size_b} 行数 {len(rb)}')
print(f'{"ref行(y0-y1,中心)":<28} {"other行(y0-y1,中心)":<28} 中心差')
for i in range(max(len(ra), len(rb))):
    a = ra[i] if i < len(ra) else None
    b = rb[i] if i < len(rb) else None
    sa = f'{a[0]:4d}-{a[1]:4d} c={a[2]:7.1f}' if a else ' ' * 20
    sb = f'{b[0]:4d}-{b[1]:4d} c={b[2]:7.1f}' if b else ' ' * 20
    d = f'{b[2]-a[2]:+6.1f}' if a and b else ''
    print(f'{sa:<28} {sb:<28} {d}')
    if i > 80:
        print('... 省略')
        break
