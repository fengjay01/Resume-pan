from PIL import Image
import numpy as np
import sys

for name in sys.argv[1:]:
    img = np.asarray(Image.open(name).convert('RGB'), dtype=np.int32)
    r, g, b = img[:, :, 0], img[:, :, 1], img[:, :, 2]
    # 蓝色（43,123,205 附近）
    mask = (np.abs(r - 43) < 60) & (np.abs(g - 123) < 60) & (np.abs(b - 205) < 60)
    ys, xs = np.where(mask)
    print(name, '蓝色像素:', mask.sum())
    if len(ys):
        # 按行聚类输出位置
        rows = {}
        for y, x in zip(ys, xs):
            rows.setdefault(y // 20 * 20, []).append((x, y))
        for k in sorted(rows):
            pts = rows[k]
            print('  y~%d: x %d..%d (%d px)' % (k, min(p[0] for p in pts), max(p[0] for p in pts), len(pts)))
