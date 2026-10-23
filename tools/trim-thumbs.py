# 把渲染图裁掉背景留白并居中，统一尺寸。
# 用法：python3 tools/trim-thumbs.py                         零件库缩略图 public/thumbs → 360×240
#       python3 tools/trim-thumbs.py public/examples 480 360   示例预览图
import sys
from pathlib import Path

from PIL import Image, ImageChops

folder = Path(sys.argv[1] if len(sys.argv) > 1 else 'public/thumbs')
W = int(sys.argv[2]) if len(sys.argv) > 2 else 360
H = int(sys.argv[3]) if len(sys.argv) > 3 else 240
PAD = 0.06

for p in sorted(folder.glob('*.png')):
    im = Image.open(p).convert('RGB')
    bg = im.getpixel((2, 2))  # 角落就是场景背景色
    diff = ImageChops.difference(im, Image.new('RGB', im.size, bg)).convert('L')
    box = diff.point(lambda v: 255 if v > 10 else 0).getbbox()
    if not box:
        continue
    im = im.crop(box)
    scale = min(W * (1 - 2 * PAD) / im.width, H * (1 - 2 * PAD) / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    out = Image.new('RGB', (W, H), bg)
    out.paste(im, ((W - im.width) // 2, (H - im.height) // 2))
    out.save(p, optimize=True)
    print(p.name, out.size)
