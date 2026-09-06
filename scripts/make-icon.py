"""Reproducible application icon, drawn from simple branch geometry."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1]
image = Image.new('RGBA', (512, 512))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((12, 12, 500, 500), radius=110, fill='#142b37')
draw.rounded_rectangle((35, 35, 477, 477), radius=95, outline='#325a53', width=4)
draw.line([(177, 368), (177, 168)], fill='#83ddb5', width=21)
draw.line([(177, 301), (276, 244), (332, 164)], fill='#83ddb5', width=21, joint='curve')
for x, y in [(177, 368), (177, 159), (334, 152)]:
    draw.ellipse((x-35, y-35, x+35, y+35), fill='#142b37', outline='#83ddb5', width=16)
image.save(root / 'resources' / 'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])
image.resize((128,128), Image.Resampling.LANCZOS).save(root / 'resources' / 'icon.png')
