"""裁剪并放大图片区域，用于逐字比对导出与预览。"""
import sys
from PIL import Image

src = sys.argv[1]
out = sys.argv[2]
box = tuple(int(v) for v in sys.argv[3:7])
scale = int(sys.argv[7]) if len(sys.argv) > 7 else 4
im = Image.open(src).convert('RGB')
crop = im.crop(box)
crop = crop.resize((crop.width * scale, crop.height * scale), Image.NEAREST)
crop.save(out)
print('saved', out, crop.size)
