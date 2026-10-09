#!/usr/bin/env python3
"""Gera os pacotes instaláveis em release/:
  EasyVillagers_BP.mcpack, EasyVillagers_RP.mcpack e EasyVillagers.mcaddon
e verifica se são ZIPs válidos com manifest.json na posição correta."""
import json
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
OUT = ROOT / "release"
PACKS = {"BP": SRC / "behavior_pack", "RP": SRC / "resource_pack"}
FIXED_TIME = (2026, 1, 1, 0, 0, 0)  # datas fixas -> builds reprodutíveis


def add_dir(z: zipfile.ZipFile, folder: Path, prefix: str):
    for p in sorted(folder.rglob("*")):
        if p.is_file():
            info = zipfile.ZipInfo(prefix + p.relative_to(folder).as_posix(), FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, p.read_bytes())


def main():
    OUT.mkdir(exist_ok=True)
    version = ".".join(map(str, json.loads((PACKS["BP"] / "manifest.json").read_text())["header"]["version"]))
    outputs = []
    for tag, folder in PACKS.items():
        path = OUT / f"EasyVillagers_{tag}.mcpack"
        with zipfile.ZipFile(path, "w") as z:
            add_dir(z, folder, "")
        outputs.append(path)
    addon = OUT / "EasyVillagers.mcaddon"
    with zipfile.ZipFile(addon, "w") as z:
        add_dir(z, PACKS["BP"], "EasyVillagers_BP/")
        add_dir(z, PACKS["RP"], "EasyVillagers_RP/")
    outputs.append(addon)

    # Verificação
    ok = True
    for path in outputs:
        with zipfile.ZipFile(path) as z:
            bad = z.testzip()
            names = z.namelist()
            manifests = [n for n in names if n.endswith("manifest.json")]
            expected = ["manifest.json"] if path.suffix == ".mcpack" else \
                ["EasyVillagers_BP/manifest.json", "EasyVillagers_RP/manifest.json"]
            good = bad is None and sorted(manifests) == sorted(expected)
            for m in manifests:
                json.loads(z.read(m))
            ok &= good
            print(f"{'OK ' if good else 'ERRO'} {path.relative_to(ROOT)}  {path.stat().st_size} bytes, {len(names)} arquivos")
    print(f"versão {version}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
