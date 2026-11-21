# Damages the clean barcodes in evals/barcode-images the way a phone camera sees a pack in a kitchen.
# Each photo is the barcode printed on a coloured pack, 720 x 480, saved as JPEG. Seeded, so the set is the same every time.
#   python3 scripts/barcode-damage.py
import json, math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance
import numpy as np
import sys
FRESH = len(sys.argv) > 1 and sys.argv[1] == 'fresh'
D = os.path.join(os.path.dirname(__file__), '..', 'evals', 'barcode-images-fresh' if FRESH else 'barcode-images')
clean = json.load(open(os.path.join(D, 'clean.json')))
rng = random.Random(4242 if FRESH else 20261120)
PACKS = [(214, 60, 48), (240, 196, 70), (40, 110, 170), (250, 246, 236), (90, 150, 80), (120, 60, 140)]

def on_pack(bar, scale=1.0, color=None):
    W, H = 720, 480
    bg = Image.new('RGB', (W, H), color or rng.choice(PACKS))
    d = ImageDraw.Draw(bg)
    for _ in range(14):  # pack printing around the label
        x, y = rng.randrange(W), rng.randrange(H)
        d.rectangle([x, y, x + rng.randrange(20, 160), y + rng.randrange(6, 40)], fill=tuple(rng.randrange(256) for _ in range(3)))
    b = bar.convert('RGB')
    w = int(min(W * 0.62, b.width * 1.25) * scale)
    b = b.resize((w, int(b.height * w / b.width)), Image.LANCZOS)
    x, y = (W - b.width) // 2 + rng.randrange(-30, 31), (H - b.height) // 2 + rng.randrange(-30, 31)
    bg.paste(b, (x, y))
    return bg, (x, y, b.width, b.height)

def noise(im, s):
    a = np.asarray(im).astype(np.float32) + np.random.default_rng(rng.randrange(1 << 30)).normal(0, s, (im.height, im.width, 3))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

def warp(im, fn):
    a = np.asarray(im); h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    sx, sy = fn(xx.astype(np.float32), yy.astype(np.float32), w, h)
    sx = np.clip(sx, 0, w - 1).astype(np.int32); sy = np.clip(sy, 0, h - 1).astype(np.int32)
    return Image.fromarray(a[sy, sx])

def cylinder(x, y, w, h):  # a can: the middle is near, the sides run away
    cx = w / 2; t = (x - cx) / (w / 2); t = np.clip(t, -0.999, 0.999)
    return cx + np.arcsin(t) / (math.pi / 2) * (w / 2) * 0.92, y

def crumple(x, y, w, h):
    return x + 5 * np.sin(y / 13.0) + 3 * np.sin(y / 5.0), y + 4 * np.sin(x / 17.0)

def keystone(im):
    w, h = im.size; k = 0.18
    return im.transform((w, h), Image.QUAD, (int(w * k), 0, 0, h, w, h, int(w * (1 - k)), 0), Image.BICUBIC)

DAMAGE = {
  'pack': lambda b: on_pack(b)[0],
  'blur-soft': lambda b: on_pack(b)[0].filter(ImageFilter.GaussianBlur(1.4)),
  'blur-shake': lambda b: on_pack(b)[0].filter(ImageFilter.BoxBlur(2.6)),
  'tilt-12': lambda b: on_pack(b)[0].rotate(12, resample=Image.BICUBIC, fillcolor=(70, 70, 70)),
  'tilt-35': lambda b: on_pack(b, 0.85)[0].rotate(-35, resample=Image.BICUBIC, fillcolor=(70, 70, 70)),
  'angle': lambda b: keystone(on_pack(b)[0]),
  'dim': lambda b: noise(ImageEnhance.Brightness(on_pack(b)[0]).enhance(0.33), 10),
  'glare': lambda b: glare(b),
  'can': lambda b: warp(on_pack(b, 1.1)[0], cylinder),
  'crumpled': lambda b: warp(on_pack(b)[0], crumple),
  'far': lambda b: on_pack(b, 0.42)[0],
  'thumb': lambda b: thumb(b),
  'jpeg-low': lambda b: on_pack(b)[0],  # saved at quality 12 below
  'faded': lambda b: ImageEnhance.Contrast(on_pack(b, 1.0, (236, 226, 204))[0]).enhance(0.38),
}
def glare(b):
    im, (x, y, w, h) = on_pack(b)
    g = Image.new('L', im.size, 0); d = ImageDraw.Draw(g)
    cx = x + int(w * rng.uniform(0.3, 0.7))
    d.ellipse([cx - w * 0.14, y - 10, cx + w * 0.14, y + h * 0.8], fill=235)
    g = g.filter(ImageFilter.GaussianBlur(14))
    return Image.composite(Image.new('RGB', im.size, (255, 255, 250)), im, g)
def thumb(b):
    im, (x, y, w, h) = on_pack(b)
    d = ImageDraw.Draw(im); cx = x + int(w * rng.uniform(0.35, 0.65))
    d.ellipse([cx - w * 0.2, y + h * 0.1, cx + w * 0.2, y + h * 1.6], fill=(222, 170, 140))
    return im

out = []
for c in clean:
    bar = Image.open(os.path.join(D, c['file']))
    for k, f in DAMAGE.items():
        im = f(bar)
        name = 'photo-' + c['code'] + '-' + k + '.jpg'
        im.save(os.path.join(D, name), quality=12 if k == 'jpeg-low' else 74)
        out.append({'file': name, 'code': c['code'], 'gtin': c['gtin'], 'type': c['type'], 'damage': k})
json.dump(out, open(os.path.join(D, 'photos.json'), 'w'), indent=1)
print('photos:', len(out))
