"""Вырезает фигурку с однотонного фона, обрезает по краям и приводит к одному размеру.

python3 cutout.py <вход.png> <выход.png>
Фон определяется по цвету краёв картинки. Убирается всё, что похоже на фон и
связано с краем, а также мелкие отдельные островки (например, надписи на фоне).
"""
import sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

SIZE = 512       # итоговый квадрат
BOX = 450        # фигурка вписывается в квадрат BOX×BOX по центру
TOL = int(sys.argv[3]) if len(sys.argv) > 3 else 55  # насколько цвет может отличаться от фона


def cutout(src, dst):
    im = Image.open(src).convert('RGB')
    a = np.asarray(im).astype(np.int32)
    h, w, _ = a.shape

    border = np.concatenate([a[0], a[-1], a[:, 0], a[:, -1]])
    bg = np.median(border, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))

    # фон — похожие на фон пиксели, связанные с краем картинки
    like_bg = dist < TOL
    lab, n = ndimage.label(like_bg)
    edge_labels = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    background = np.isin(lab, list(edge_labels))

    # фигура — всё остальное, кроме мелких островков
    fg = ~background
    flab, fn = ndimage.label(fg)
    sizes = ndimage.sum(fg, flab, range(1, fn + 1))
    keep = [i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.03]
    fg = np.isin(flab, keep)
    fg = ndimage.binary_fill_holes(fg) | fg

    # мягкий край без ореола фона
    fg = ndimage.binary_erosion(fg, iterations=1)
    alpha = Image.fromarray((fg * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.8))

    rgba = im.convert('RGBA')
    rgba.putalpha(alpha)
    ys, xs = np.nonzero(fg)
    crop = rgba.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

    scale = BOX / max(crop.width, crop.height)
    crop = crop.resize((round(crop.width * scale), round(crop.height * scale)), Image.LANCZOS)
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(crop, ((SIZE - crop.width) // 2, (SIZE - crop.height) // 2), crop)
    out.save(dst, optimize=True)
    print(f'{src.split("/")[-1]} → {dst.split("/")[-1]}: фон {bg.astype(int).tolist()}, '
          f'островков убрано {fn - len(keep)}, фигурка {crop.width}×{crop.height}')


if __name__ == '__main__':
    cutout(sys.argv[1], sys.argv[2])
