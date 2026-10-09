#!/usr/bin/env python3
"""Validador estático do addon (sem o jogo).

Verifica JSON, manifestos, referências cruzadas (geometrias, texturas,
materiais, loot tables, receitas, idiomas, componentes de script) e
identificadores duplicados. Sai com código 1 se houver erros.
"""
import json
import re
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BP = ROOT / "source" / "behavior_pack"
RP = ROOT / "source" / "resource_pack"
NS = "easy_villagers"

errors, warnings, info = [], [], []


def err(m):
    errors.append(m)


def load(p):
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        err(f"JSON inválido: {p.relative_to(ROOT)}: {e}")
        return None


def lang(p):
    d = {}
    for line in p.read_text(encoding="utf-8").splitlines():
        if line.startswith("##") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k in d:
            err(f"chave de idioma duplicada {k} em {p.name}")
        d[k] = v
    return d


def main():
    # 1. JSON
    all_json = {p: load(p) for p in list(BP.rglob("*.json")) + list(RP.rglob("*.json"))}
    info.append(f"{len(all_json)} arquivos JSON analisados")

    # 2. Manifestos
    bpm, rpm = all_json[BP / "manifest.json"], all_json[RP / "manifest.json"]
    uuids = [bpm["header"]["uuid"], rpm["header"]["uuid"]] + [m["uuid"] for m in bpm["modules"] + rpm["modules"]]
    for u in uuids:
        try:
            uuid.UUID(u)
        except ValueError:
            err(f"UUID inválido {u}")
    if len(set(uuids)) != len(uuids):
        err("UUIDs repetidos nos manifestos")
    deps = bpm.get("dependencies", [])
    if not any(d.get("uuid") == rpm["header"]["uuid"] for d in deps):
        err("BP não depende do RP")
    script_mod = [m for m in bpm["modules"] if m["type"] == "script"]
    if not script_mod or not (BP / script_mod[0]["entry"]).exists():
        err("módulo de script/entrada ausente")
    for d in deps:
        if "module_name" in d:
            info.append(f"dependência de script: {d['module_name']} {d['version']}")
    info.append(f"min_engine_version: {bpm['header']['min_engine_version']}")

    # 3. Texturas e idiomas
    terrain = all_json[RP / "textures" / "terrain_texture.json"]["texture_data"]
    items_tex = all_json[RP / "textures" / "item_texture.json"]["texture_data"]
    external = set()
    for table in (terrain, items_tex):
        for k, v in table.items():
            path = v["textures"]
            if path.startswith(f"textures/{NS}/"):
                if not (RP / (path + ".png")).exists():
                    err(f"textura local ausente: {path}.png")
            else:
                external.add(path)
    en = lang(RP / "texts" / "en_US.lang")
    langs = {p.stem: lang(p) for p in (RP / "texts").glob("*.lang")}
    for code, d in langs.items():
        missing = set(en) - set(d)
        if missing:
            err(f"{code}.lang sem chaves: {sorted(missing)[:5]}")
    for code in all_json[RP / "texts" / "languages.json"]:
        if not (RP / "texts" / f"{code}.lang").exists():
            err(f"languages.json lista {code} sem arquivo")

    # 4. Geometrias
    geos = {}
    for p in (RP / "models").rglob("*.json"):
        for g in all_json[p]["minecraft:geometry"]:
            gid = g["description"]["identifier"]
            if gid in geos:
                err(f"geometria duplicada {gid}")
            geos[gid] = g

    def faces_materials(g, visible_bones=None):
        mats = set()
        for b in g["bones"]:
            for c in b.get("cubes", []):
                if isinstance(c.get("uv"), dict):
                    for f in c["uv"].values():
                        if "material_instance" in f:
                            mats.add(f["material_instance"])
        return mats

    farm = geos.get(f"geometry.{NS}.farm")
    if farm:
        for b in farm["bones"]:
            for c in b.get("cubes", []):
                for i in range(3):
                    lo = c["origin"][i]
                    hi = lo + c["size"][i]
                    bounds = (0, 16) if i == 1 else (-8, 8)
                    if lo < bounds[0] - 1e-6 or hi > bounds[1] + 1e-6:
                        err(f"cubo fora do bloco em {b['name']}: {c['origin']} {c['size']}")

    # 5. Blocos
    block_ids = set()
    scripts = "\n".join(p.read_text(encoding="utf-8") for p in (BP / "scripts").glob("*.js"))
    for p in sorted((BP / "blocks").glob("*.json")):
        blk = all_json[p]["minecraft:block"]
        ident = blk["description"]["identifier"]
        if ident in block_ids:
            err(f"bloco duplicado {ident}")
        block_ids.add(ident)
        comps = blk["components"]
        g = comps["minecraft:geometry"]
        gid = g["identifier"]
        if gid not in geos:
            err(f"{ident}: geometria {gid} inexistente")
            continue
        bones = {b["name"] for b in geos[gid]["bones"]}
        for bone in g.get("bone_visibility", {}):
            if bone not in bones:
                err(f"{ident}: osso {bone} inexistente")
        needed = faces_materials(geos[gid])
        mat_sets = [comps["minecraft:material_instances"]]
        mat_sets += [pm["components"]["minecraft:material_instances"] for pm in blk.get("permutations", [])
                     if "minecraft:material_instances" in pm["components"]]
        for ms in mat_sets:
            for mname, m in ms.items():
                if m["texture"] not in terrain:
                    err(f"{ident}: textura {m['texture']} não está em terrain_texture.json")
            # ossos invisíveis podem ter materiais não definidos; o "*" cobre o resto
            if "*" not in ms:
                missing = needed - set(ms)
                if missing:
                    err(f"{ident}: material_instances sem {missing}")
        loot = comps.get("minecraft:loot")
        if loot and not (BP / loot).exists():
            err(f"{ident}: loot table {loot} ausente")
        dn = comps.get("minecraft:display_name")
        if dn and dn not in en:
            err(f"{ident}: chave de nome {dn} ausente no en_US.lang")
        for k in comps:
            if k.startswith(f"{NS}:") and f"`${{NS}}:{k.split(':')[1]}`" not in scripts and k not in scripts:
                err(f"{ident}: componente {k} não registrado nos scripts")
        states = blk["description"].get("states", {})
        for pm in blk.get("permutations", []):
            for s in re.findall(r"q\.block_state\('([^']+)'\)", pm["condition"]):
                if s not in states and s != "minecraft:cardinal_direction":
                    err(f"{ident}: permutação usa estado inexistente {s}")
        info.append(f"bloco {ident}: {len(blk.get('permutations', []))} permutações, estados {list(states)}")

    # 6. Itens
    item_ids = set()
    for p in sorted((BP / "items").glob("*.json")):
        it = all_json[p]["minecraft:item"]
        ident = it["description"]["identifier"]
        item_ids.add(ident)
        icon = it["components"]["minecraft:icon"]["textures"]["default"]
        if icon not in items_tex:
            err(f"{ident}: ícone {icon} não está em item_texture.json")
        dn = it["components"]["minecraft:display_name"]["value"]
        if dn not in en:
            err(f"{ident}: nome {dn} ausente no idioma")

    # 7. Receitas
    rec_ids = set()
    for p in sorted((BP / "recipes").glob("*.json")):
        r = all_json[p]["minecraft:recipe_shaped"]
        rid = r["description"]["identifier"]
        if rid in rec_ids:
            err(f"receita duplicada {rid}")
        rec_ids.add(rid)
        res = r["result"]["item"]
        if res.startswith(f"{NS}:") and res not in block_ids | item_ids:
            err(f"receita {rid}: resultado {res} inexistente")
        letters = set("".join(r["pattern"])) - {" "}
        if letters != set(r["key"]):
            err(f"receita {rid}: chaves {sorted(r['key'])} != padrão {sorted(letters)}")
    for p in (BP / "loot_tables").rglob("*.json"):
        for pool in all_json[p].get("pools", []):
            for e in pool["entries"]:
                if e["name"].startswith(f"{NS}:") and e["name"] not in block_ids | item_ids:
                    err(f"loot {p.name}: item {e['name']} inexistente")

    # 8. Entidade
    ent = all_json[BP / "entities" / "display.json"]["minecraft:entity"]
    ce = all_json[RP / "entity" / "display.entity.json"]["minecraft:client_entity"]["description"]
    if ent["description"]["identifier"] != ce["identifier"]:
        err("identificador da entidade difere entre BP e RP")
    rcs = {}
    for p in (RP / "render_controllers").glob("*.json"):
        rcs.update(all_json[p]["render_controllers"])
    anims = {}
    for p in (RP / "animations").glob("*.json"):
        anims.update(all_json[p]["animations"])
    for gname, gid in ce["geometry"].items():
        if gid not in geos:
            err(f"entidade: geometria {gid} inexistente")
        elif "root" not in {b["name"] for b in geos[gid]["bones"]}:
            err(f"{gid}: sem osso root (necessário para a animação de escala)")
    for a in ce["animations"].values():
        if a not in anims:
            err(f"entidade: animação {a} inexistente")
    props = ent["description"]["properties"]
    for entry in ce["render_controllers"]:
        name = list(entry)[0] if isinstance(entry, dict) else entry
        rc = rcs.get(name)
        if not rc:
            err(f"render controller {name} inexistente")
            continue
        refs = set(re.findall(r"Texture\.(\w+)", json.dumps(rc)))
        for t in refs - set(ce["textures"]):
            err(f"{name}: textura {t} não declarada")
        for gref in re.findall(r"Geometry\.(\w+)", json.dumps(rc)):
            if gref not in ce["geometry"]:
                err(f"{name}: geometria {gref} não declarada")
    used_props = set(re.findall(r"query\.property\('([^']+)'\)", json.dumps([ce, rcs, anims])))
    for up in used_props - set(props):
        err(f"propriedade {up} usada no RP mas não declarada")
    events = set(ent.get("events", {}))
    block_states = set()
    for p in (BP / "blocks").glob("*.json"):
        block_states |= set(all_json[p]["minecraft:block"]["description"].get("states", {}))
    for pname in re.findall(r'P\("(\w+)"\)', scripts):
        if f"{NS}:{pname}" not in set(props) | events | block_states:
            err(f"script usa propriedade/evento/estado inexistente {pname}")
    for pname in re.findall(r'setProp\([^,]+, "(\w+)"', scripts):
        if f"{NS}:{pname}" not in props:
            err(f"script usa propriedade inexistente {pname}")
    for st in re.findall(r'setBlockState\([^,]+, "(\w+)"', scripts):
        if f"{NS}:{st}" not in block_states:
            err(f"script usa estado de bloco inexistente {st}")
    for evn, evd in ent.get("events", {}).items():
        for g in evd.get("add", {}).get("component_groups", []) + evd.get("remove", {}).get("component_groups", []):
            if g not in ent.get("component_groups", {}):
                err(f"evento {evn} usa grupo inexistente {g}")
    for t in ce["textures"].values():
        external.add(t)

    # 9. Textos usados pelos scripts
    for key in set(re.findall(r'tr\("([\w.]+)"', scripts)) | set(re.findall(r"tr\(`([\w.]+)\.\$\{", scripts)):
        full = key if re.match(r"^(gui|block|item)\.", key) else f"ui.{NS}.{key}"
        if "${" in key:
            continue
        if not any(k == full or k.startswith(full + ".") for k in en):
            err(f"script usa texto sem tradução: {full}")
    for i in range(15):
        if f"ui.{NS}.prof.{i}" not in en:
            err(f"falta ui.{NS}.prof.{i}")

    # Relatório
    print("== Informações")
    for m in info:
        print("  " + m)
    print(f"== Referências a texturas vanilla (verificáveis apenas no jogo): {len(external)}")
    for e in sorted(external):
        print("  " + e)
    print(f"== Avisos: {len(warnings)}")
    for w in warnings:
        print("  " + w)
    print(f"== Erros: {len(errors)}")
    for e in errors:
        print("  " + e)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
