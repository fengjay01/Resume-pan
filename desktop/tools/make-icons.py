"""从 app/public/favicon.svg 的造型生成 electron-builder 需要的图标资源。

只依赖 Pillow（不依赖 cairosvg / ImageMagick）：把 64x64 的 SVG 图形
等比重绘到 1024x1024，再导出多尺寸 PNG、Windows ICO。
用法：python tools/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
# 图标统一放 resources/（构建资源层），与 .build-env/ 的缓存/临时产物分层。
OUT = ROOT / "resources"
BLUE = (37, 99, 235, 255)      # #2563eb
WHITE = (255, 255, 255, 245)
SIZE = 1024
S = SIZE / 64                   # SVG viewBox 64 -> 1024 的缩放系数


def px(v):
    return round(v * S)


def render():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    # 蓝色圆角底
    d.rounded_rectangle((0, 0, SIZE - 1, SIZE - 1), radius=px(14), fill=BLUE)
    # 白色文档：右上折角 + 底部两个圆角（用多边形近似 SVG path）
    doc = [
        (px(20), px(16)), (px(40), px(16)), (px(48), px(24)),
        (px(48), px(48)), (px(44), px(52)), (px(20), px(52)),
        (px(16), px(48)), (px(16), px(20)),
    ]
    d.polygon(doc, fill=WHITE)
    # 折角内侧的小三角，让切口更接近原 SVG 的斜边
    d.polygon([(px(40), px(16)), (px(48), px(24)), (px(40), px(24))], fill=BLUE)
    # 三条文本线
    w, r = px(3.4), px(3.4) // 2
    for x1, y1, x2 in [(24, 30, 40), (24, 38, 40), (24, 46, 34)]:
        a, b = (px(x1), px(y1)), (px(x2), px(y1))
        d.line((a[0], a[1], b[0], b[1]), fill=BLUE, width=w)
        d.ellipse((a[0] - r, a[1] - r, a[0] + r, a[1] + r), fill=BLUE)
        d.ellipse((b[0] - r, b[1] - r, b[0] + r, b[1] + r), fill=BLUE)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    base = render()
    # 只生成 Windows 打包必需的 icon.ico / icon.png；resources/icons/ 里用户自备的
    # 素材（1.png / 2.png / 3.png 等）一律不动，避免覆盖。
    base.save(OUT / "icon.png")
    base.save(OUT / "icon.ico", sizes=[(16, 16), (24, 24), (32, 32), (48, 48),
                                       (64, 64), (128, 128), (256, 256)])
    print("generated:", OUT / "icon.png", OUT / "icon.ico")


if __name__ == "__main__":
    main()
