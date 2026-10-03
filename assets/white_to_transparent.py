from PIL import Image
from pathlib import Path

input_folder = Path("Zed")
output_folder = Path("output")

output_folder.mkdir(exist_ok=True)

for file in input_folder.iterdir():
    if file.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
        continue

    img = Image.open(file).convert("RGBA")

    pixels = img.load()
    threshold = 240

    for y in range(img.height):
        for x in range(img.width):
            r, g, b, a = pixels[x, y]

            if r >= threshold and g >= threshold and b >= threshold:
                pixels[x, y] = (255, 255, 255, 0)

    output_path = output_folder / file.name
    img.save(output_path)

    print(f"Processed: {file.name}")
