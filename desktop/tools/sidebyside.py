"""生成「预览 vs 导出」并排对比长图（中间加分隔线）。

用法: python tools/sidebyside.py ref1 pdf1 [ref2 pdf2 ...] out.png
"""
import sys
from PIL import Image

args = sys.argv[1:]
out = args[-1]
pairs = [(args[i], args[i + 1]) for i in range(0, len(args) - 1, 2)]

imgs = []
W = 0
H = 0
for ref_p, pdf_p in pairs:
    a = Image.open(ref_p).convert('RGB')
    b = Image.open(pdf_p).convert('RGB')
    w = min(a.width, b.width)
    h = min(a.height, b.height)
    a = a.crop((0, 0, w, h))
    b = b.crop((0, 0, w, h))
    imgs.append((a, b))
    W = max(W, w * 2 + 12)
    H += h + 8

canvas = Image.new('RGB', (W, H), (120, 120, 128))
y = 0
for a, b in imgs:
    canvas.paste(a, (0, y))
    canvas.paste(b, (a.width + 12, y))
    y += a.height + 8
canvas.save(out)
print('saved', out, canvas.size)
