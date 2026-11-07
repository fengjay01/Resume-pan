"""测量指定区域里第一团墨迹的包围盒（用于比对圆点等小元素的坐标）。

用法: python tools/probe_box.py img.png x0 y0 x1 y1 [thresh]
"""
import sys
from PIL import Image

p = sys.argv[1]
x0, y0, x1, y1 = (int(v) for v in sys.argv[2:6])
th = int(sys.argv[6]) if len(sys.argv) > 6 else 170

im = Image.open(p).convert('L')
px = im.load()
cols = {}
for y in range(y0, y1):
    for x in range(x0, x1):
        if px[x, y] < th:
            cols.setdefault(x, []).append(y)

if not cols:
    print(f'{p}: 区域内无墨迹')
else:
    xs = sorted(cols)
    groups = []
    cur = [xs[0]]
    for x in xs[1:]:
        if x - cur[-1] <= 2:
            cur.append(x)
        else:
            groups.append(cur)
            cur = [x]
    groups.append(cur)
    for i, g in enumerate(groups[:6]):
        ys = [y for x in g for y in cols[x]]
        print(f'{p} 团{i}: x {g[0]}..{g[-1]} (宽 {g[-1]-g[0]+1})  y {min(ys)}..{max(ys)} (高 {max(ys)-min(ys)+1})  墨迹像素 {sum(len(cols[x]) for x in g)}')
