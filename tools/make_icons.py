"""Render Veil's icons: a green rounded tile with a closed eye (lashes down)."""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "extension" / "icons"
S = 512  # draw large, downsample for crisp edges


def draw() -> Image.Image:
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((16, 16, S - 16, S - 16), radius=112, fill=(0, 168, 132, 255))
    w = 34
    # closed eyelid: lower arc
    d.arc((96, 120, S - 96, 380), start=20, end=160, fill="white", width=w)
    # lashes
    for x0, x1 in ((150, 118), (210, 196), (302, 316), (362, 394)):
        d.line((x0, 330, x1, 392), fill="white", width=w - 6)
    # veil bar across the top
    d.rounded_rectangle((120, 150, S - 120, 196), radius=23, fill=(255, 255, 255, 235))
    return im


big = draw()
OUT.mkdir(parents=True, exist_ok=True)
for size in (16, 32, 48, 128):
    big.resize((size, size), Image.LANCZOS).save(OUT / f"icon{size}.png")
print("icons written to", OUT)
