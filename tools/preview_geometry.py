#!/usr/bin/env python3
"""Renderiza uma prévia isométrica (cores planas) da geometria de bloco
convertida, para conferência visual. Saída: docs/img/preview_<bloco>.png"""
import json
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
GEO = ROOT / "source" / "resource_pack" / "models" / "blocks" / "farm.geo.json"
COLORS = {"glass": (190, 225, 235, 28), "iron": (205, 205, 205, 255), "frame": (140, 190, 200, 255),
          "frame_rot": (140, 190, 200, 255), "floor_front": (110, 80, 50, 255), "floor_back": (110, 80, 50, 255),
          "ws_side": (130, 100, 60, 255), "ws_top": (90, 140, 60, 255), "crop": (80, 170, 60, 255),
          "bed_side": (160, 120, 70, 255), "bed_top": (170, 40, 40, 255), "bed_pillow": (240, 240, 240, 255)}
FLOORS = {"trader": (215, 215, 215), "auto_trader": (70, 65, 65), "farmer": (120, 85, 55), "breeder": (160, 125, 75),
          "converter": (90, 110, 80), "iron_farm": ((220, 90, 20), (125, 125, 125)), "incubator": (235, 235, 235),
          "inventory_viewer": (30, 30, 35)}
SHADE = {"up": 1.0, "north": 0.8, "south": 0.8, "east": 0.65, "west": 0.65, "down": 0.5}


def face_quad(o, s, face):
    x0, y0, z0 = o
    x1, y1, z1 = o[0] + s[0], o[1] + s[1], o[2] + s[2]
    return {
        "up": [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)],
        "down": [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)],
        "north": [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)],
        "south": [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)],
        "west": [(x0, y0, z0), (x0, y0, z1), (x0, y1, z1), (x0, y1, z0)],
        "east": [(x1, y0, z0), (x1, y0, z1), (x1, y1, z1), (x1, y1, z0)],
    }[face]


def render(block, bones, label=True):
    W = 360
    img = Image.new("RGBA", (W, W), (32, 34, 40, 255) if label else (0, 0, 0, 0))
    d = ImageDraw.Draw(img, "RGBA")
    polys = []
    # Câmera a noroeste e acima: vê as faces norte (frente), oeste e topo.
    view = (-1.0, 1.2, -1.0)
    normals = {"up": (0, 1, 0), "down": (0, -1, 0), "north": (0, 0, -1), "south": (0, 0, 1),
               "west": (-1, 0, 0), "east": (1, 0, 0)}
    for b in json.loads(GEO.read_text())["minecraft:geometry"][0]["bones"]:
        if b["name"] not in bones:
            continue
        for c in b.get("cubes", []):
            for face, f in c["uv"].items():
                n = normals[face]
                m = f["material_instance"]
                transparent = m == "glass"
                if transparent:
                    continue  # vidro omitido para mostrar o interior
                if sum(n[i] * view[i] for i in range(3)) <= 0:
                    continue
                q = face_quad(c["origin"], c["size"], face)
                pts = [((x - z) * 0.866 * 9 + W / 2, -y * 9 - (x + z) * 0.5 * 9 + W * 0.8) for x, y, z in q]
                cx = sum(v[0] for v in q) / 4
                cy = sum(v[1] for v in q) / 4
                cz = sum(v[2] for v in q) / 4
                depth = cx * view[0] + cy * view[1] + cz * view[2]
                if m.startswith("floor"):
                    fl = FLOORS[block]
                    base = (fl[0] if m == "floor_front" else fl[1]) if isinstance(fl[0], tuple) else fl
                    col = (*base, 255)
                else:
                    col = COLORS.get(m, (255, 0, 255, 255))
                sh = SHADE[face]
                col = (int(col[0] * sh), int(col[1] * sh), int(col[2] * sh), col[3])
                polys.append((depth, pts, col))
    for _, pts, col in sorted(polys, key=lambda p: p[0]):
        d.polygon(pts, fill=col, outline=(0, 0, 0, 60))
    if label:
        d.text((8, 8), block, fill=(255, 255, 255, 255))
    return img


def main():
    out = ROOT / "docs" / "img"
    out.mkdir(parents=True, exist_ok=True)
    sheet = Image.new("RGBA", (360 * 4, 360 * 2))
    blocks = list(FLOORS)
    for i, blk in enumerate(blocks):
        bones = {"frame"}
        if blk in ("trader", "auto_trader"):
            bones.add("workstation")
        if blk == "farmer":
            bones.add("crop")
        if blk == "breeder":
            bones.add("bed")
        im = render(blk, bones)
        sheet.paste(im, ((i % 4) * 360, (i // 4) * 360))
    sheet.save(out / "preview_blocos.png")
    print("docs/img/preview_blocos.png")


if __name__ == "__main__":
    sys.exit(main())
