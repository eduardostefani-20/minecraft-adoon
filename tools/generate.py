#!/usr/bin/env python3
"""Gerador do addon Easy Villagers (Bedrock).

Lê os assets originais extraídos do JAR (original/extracted) e gera todos os
arquivos JSON/PNG/LANG do Behavior Pack e do Resource Pack em source/.
Os scripts JavaScript (source/behavior_pack/scripts) são escritos à mão e não
são tocados por este gerador.

Uso:  python3 tools/generate.py
"""
import json
import os
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ORIG = ROOT / "original" / "extracted"
OA = ORIG / "assets" / "easy_villagers"
OD = ORIG / "data" / "easy_villagers"
BP = ROOT / "source" / "behavior_pack"
RP = ROOT / "source" / "resource_pack"
NS = "easy_villagers"

VERSION = [1, 0, 0]
MIN_ENGINE = [1, 26, 0]
SERVER_API = "2.4.0"
SERVER_UI_API = "2.0.0"
BP_UUID = "a93c0b73-6b18-4755-aa2f-9f5586bd95bf"
BP_DATA_UUID = "941e74e8-17da-4a58-aa3f-d4b01a8c73dc"
BP_SCRIPT_UUID = "f663e8de-2710-415a-829c-14d81dc7a024"
RP_UUID = "420affcf-615a-4b39-b135-fa8a96fe5739"
RP_RES_UUID = "6be19e04-5e66-4cfd-9e24-cbf8c6646815"

BLOCK_FORMAT = "1.21.90"
SELECT_HEIGHT = 3  # altura (px) da área de seleção do bloco
ITEM_FORMAT = "1.21.90"
ENTITY_FORMAT = "1.21.90"

# ---------------------------------------------------------------------------
# Dados de conversão
# ---------------------------------------------------------------------------

# Texturas de piso de cada bloco (models/block/<id>.json -> front/back)
# mapeadas para caminhos vanilla do Bedrock.
JAVA_TO_BEDROCK_TEX = {
    "minecraft:block/netherite_block": "textures/blocks/netherite_block",
    "minecraft:block/oak_planks": "textures/blocks/planks_oak",
    "minecraft:block/mossy_cobblestone": "textures/blocks/cobblestone_mossy",
    "minecraft:block/dirt": "textures/blocks/dirt",
    "minecraft:block/white_wool": "textures/blocks/wool_colored_white",
    "minecraft:block/black_wool": "textures/blocks/wool_colored_black",
    "minecraft:block/lava_still": "textures/blocks/lava_still",
    "minecraft:block/stone": "textures/blocks/stone",
    "minecraft:block/iron_block": "textures/blocks/iron_block",
    "minecraft:block/glass": "textures/blocks/glass",
}

BLOCKS = ["trader", "auto_trader", "farmer", "breeder", "converter",
          "iron_farm", "incubator", "inventory_viewer"]

# Índice do estado easy_villagers:workstation == variante de profissão do
# villager_v2 do Bedrock (1..13).  Texturas vanilla Bedrock (lado, topo).
WORKSTATIONS = [
    None,
    ("composter", "textures/blocks/composter_side", "textures/blocks/composter_top"),
    ("barrel", "textures/blocks/barrel_side", "textures/blocks/barrel_top"),
    ("loom", "textures/blocks/loom_side", "textures/blocks/loom_top"),
    ("fletching_table", "textures/blocks/fletcher_table_side1", "textures/blocks/fletcher_table_top"),
    ("lectern", "textures/blocks/lectern_sides", "textures/blocks/lectern_top"),
    ("cartography_table", "textures/blocks/cartography_table_side1", "textures/blocks/cartography_table_top"),
    ("brewing_stand", "textures/blocks/brewing_stand_base", "textures/blocks/brewing_stand"),
    ("blast_furnace", "textures/blocks/blast_furnace_side", "textures/blocks/blast_furnace_top"),
    ("grindstone", "textures/blocks/grindstone_side", "textures/blocks/grindstone_round"),
    ("smithing_table", "textures/blocks/smithing_table_side", "textures/blocks/smithing_table_top"),
    ("smoker", "textures/blocks/smoker_side", "textures/blocks/smoker_top"),
    ("cauldron", "textures/blocks/cauldron_side", "textures/blocks/cauldron_top"),
    ("stonecutter", "textures/blocks/stonecutter2_side", "textures/blocks/stonecutter2_top"),
]

# Culturas do Fazendeiro: (nome, idade máxima, [textura por idade])
def _stages(prefix, mapping):
    return [f"textures/blocks/{prefix}{i}" for i in mapping]

CROPS = [
    None,
    ("wheat", 7, _stages("wheat_stage_", range(8))),
    ("carrots", 7, _stages("carrots_stage_", [0, 0, 1, 1, 2, 2, 2, 3])),
    ("potatoes", 7, _stages("potatoes_stage_", [0, 0, 1, 1, 2, 2, 2, 3])),
    ("beetroots", 3, _stages("beetroots_stage_", range(4))),
    ("torchflower", 1, _stages("torchflower_crop_stage_", range(2))),
    ("pitcher", 4, _stages("pitcher_crop_bottom_stage_", range(5))),
]

# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------

def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def tex_key(path: str) -> str:
    return "ev_" + path.split("/")[-1]


TERRAIN = {}  # chave -> caminho


def terrain(path: str) -> str:
    key = tex_key(path)
    TERRAIN[key] = path
    return key


def mat(path: str):
    return {"texture": terrain(path), "render_method": "alpha_test",
            "ambient_occlusion": False, "face_dimming": False}

# ---------------------------------------------------------------------------
# Geometria do bloco (conversão de models/block/farm.json)
# ---------------------------------------------------------------------------

TEXVAR_TO_MAT = {"#1": "glass", "#2": "iron", "#6": "frame",
                 "#front": "floor_front", "#back": "floor_back"}


def convert_farm_geometry():
    farm = load_json(OA / "models" / "block" / "farm.json")
    cubes = []
    for el in farm["elements"]:
        f, t = el["from"], el["to"]
        cube = {"origin": [f[0] - 8, f[1], f[2] - 8],
                "size": [t[0] - f[0], t[1] - f[1], t[2] - f[2]],
                "uv": {}}
        for face, fd in el["faces"].items():
            u1, v1, u2, v2 = fd["uv"]
            m = TEXVAR_TO_MAT[fd["texture"]]
            rot = fd.get("rotation", 0)
            if m == "frame" and rot in (90, 270):
                # farm_rot.png é a transposta de farm.png: (u,v) -> (v,u)
                m = "frame_rot"
                u1, v1, u2, v2 = v1, u1, v2, u2
            cube["uv"][face] = {"uv": [u1, v1], "uv_size": [u2 - u1, v2 - v1],
                                "material_instance": m}
        cubes.append(cube)

    full = {"uv": [0, 0], "uv_size": [16, 16]}

    def box(origin, size, faces):
        return {"origin": origin, "size": size,
                "uv": {k: dict(full, material_instance=v) for k, v in faces.items()}}

    # Estação de trabalho / cultura: TraderRendererBase/FarmerRenderer
    # (translate 0.125, escala 0.45) -> cubo de 7.2 px na metade frontal.
    ws = box([-3.6, 1, -5.6], [7.2, 7.2, 7.2],
             {"north": "ws_side", "south": "ws_side", "east": "ws_side",
              "west": "ws_side", "up": "ws_top", "down": "ws_top"})
    crop_cubes = []
    for x in (-1.8, 1.8):
        crop_cubes.append(box([x, 1, -5.6], [0, 7.2, 7.2], {"east": "crop", "west": "crop"}))
    for z in (-3.8, -0.2):
        crop_cubes.append(box([-3.6, 1, z], [7.2, 7.2, 0], {"north": "crop", "south": "crop"}))
    # Cama do Criador (BreederRenderer: escala 0.4, deslocada 0.1875)
    bed = [
        box([-3.2, 1, -6.2], [6.4, 1.2, 12.8],
            {"north": "bed_side", "south": "bed_side", "east": "bed_side",
             "west": "bed_side", "down": "bed_side"}),
        box([-3.2, 2.2, -6.2], [6.4, 1.4, 12.8],
            {"north": "bed_top", "south": "bed_top", "east": "bed_top",
             "west": "bed_top", "up": "bed_top"}),
        box([-2.4, 3.6, 3.0], [4.8, 0.8, 2.8],
            {"north": "bed_pillow", "south": "bed_pillow", "east": "bed_pillow",
             "west": "bed_pillow", "up": "bed_pillow"}),
    ]
    geo = {
        "format_version": "1.21.0",
        "minecraft:geometry": [{
            "description": {"identifier": f"geometry.{NS}.farm",
                            "texture_width": 16, "texture_height": 16,
                            "visible_bounds_width": 2, "visible_bounds_height": 2,
                            "visible_bounds_offset": [0, 0.5, 0]},
            "bones": [
                {"name": "root", "pivot": [0, 0, 0]},
                {"name": "frame", "parent": "root", "pivot": [0, 0, 0], "cubes": cubes},
                {"name": "workstation", "parent": "root", "pivot": [0, 0, 0], "cubes": [ws]},
                {"name": "crop", "parent": "root", "pivot": [0, 0, 0], "cubes": crop_cubes},
                {"name": "bed", "parent": "root", "pivot": [0, 0, 0], "cubes": bed},
            ],
        }],
    }
    write_json(RP / "models" / "blocks" / "farm.geo.json", geo)

# ---------------------------------------------------------------------------
# Blocos
# ---------------------------------------------------------------------------

FACING_PERMS = [
    ("north", 0), ("west", 90), ("south", 180), ("east", -90)
]


def base_materials(block):
    model = load_json(OA / "models" / "block" / f"{block}.json")
    front = JAVA_TO_BEDROCK_TEX[model["textures"]["front"]]
    back = JAVA_TO_BEDROCK_TEX[model["textures"]["back"]]
    mats = {
        "*": mat("textures/blocks/iron_block"),
        "glass": mat("textures/blocks/glass"),
        "iron": mat("textures/blocks/iron_block"),
        "frame": {**mat("textures/easy_villagers/blocks/farm"), "texture": "ev_farm"},
        "frame_rot": {**mat("textures/easy_villagers/blocks/farm_rot"), "texture": "ev_farm_rot"},
        "floor_front": mat(front),
        "floor_back": mat(back),
    }
    if block in ("trader", "auto_trader"):
        mats["ws_side"] = mat(WORKSTATIONS[1][1])
        mats["ws_top"] = mat(WORKSTATIONS[1][2])
    if block == "farmer":
        mats["crop"] = mat(CROPS[1][2][0])
    if block == "breeder":
        mats["bed_side"] = mat("textures/blocks/planks_oak")
        mats["bed_top"] = mat("textures/blocks/wool_colored_red")
        mats["bed_pillow"] = mat("textures/blocks/wool_colored_white")
    return mats


def gen_blocks():
    for block in BLOCKS:
        mats = base_materials(block)
        states = {}
        vis = {"frame": True, "workstation": False, "crop": False, "bed": block == "breeder"}
        perms = []
        for d, rot in FACING_PERMS:
            perms.append({"condition": f"q.block_state('minecraft:cardinal_direction') == '{d}'",
                          "components": {"minecraft:transformation": {"rotation": [0, rot, 0]}}})
        if block in ("trader", "auto_trader"):
            states[f"{NS}:workstation"] = list(range(14))
            vis["workstation"] = f"q.block_state('{NS}:workstation') > 0"
            for i in range(1, 14):
                m = dict(mats)
                m["ws_side"] = mat(WORKSTATIONS[i][1])
                m["ws_top"] = mat(WORKSTATIONS[i][2])
                perms.append({"condition": f"q.block_state('{NS}:workstation') == {i}",
                              "components": {"minecraft:material_instances": m}})
        if block == "farmer":
            states[f"{NS}:crop"] = list(range(len(CROPS)))
            states[f"{NS}:stage"] = list(range(8))
            vis["crop"] = f"q.block_state('{NS}:crop') > 0"
            for c in range(1, len(CROPS)):
                _, max_age, texs = CROPS[c]
                for age in range(max_age + 1):
                    m = dict(mats)
                    m["crop"] = mat(texs[age])
                    perms.append({"condition": f"q.block_state('{NS}:crop') == {c} && q.block_state('{NS}:stage') == {age}",
                                  "components": {"minecraft:material_instances": m}})
        description = {
            "identifier": f"{NS}:{block}",
            "menu_category": {"category": "items"},
            "traits": {"minecraft:placement_direction": {
                "enabled_states": ["minecraft:cardinal_direction"], "y_rotation_offset": 180}},
        }
        if states:
            description["states"] = states
        # Os comerciantes hospedam o aldeão real dentro do bloco: colisão só no piso.
        collision = ({"origin": [-8, 0, -8], "size": [16, 1, 16]} if block in ("trader", "auto_trader")
                     else {"origin": [-8, 0, -8], "size": [16, 16, 16]})
        # O drop é feito pelo script (item normal ou item "com conteúdo").
        loot = f"loot_tables/blocks/{NS}/empty.json"
        comps = {
            "minecraft:display_name": f"block.{NS}.{block}",
            "minecraft:geometry": {"identifier": f"geometry.{NS}.farm", "bone_visibility": vis},
            "minecraft:material_instances": mats,
            "minecraft:collision_box": collision,
            # Seleção só no piso: o toque no interior chega ao aldeão (tela de troca)
            # ou à entidade da máquina (interface de baú). Para quebrar, mire no piso.
            "minecraft:selection_box": {"origin": [-8, 0, -8], "size": [16, SELECT_HEIGHT, 16]},
            "minecraft:destructible_by_mining": {"seconds_to_destroy": 2.5},
            "minecraft:destructible_by_explosion": {"explosion_resistance": 2.5},
            "minecraft:light_dampening": 0,
            "minecraft:map_color": "#A7A7A7",
            "minecraft:loot": loot,
            "minecraft:tick": {"interval_range": [20, 20], "looping": True},
            f"{NS}:machine": {"kind": block},
            "tag:minecraft:is_pickaxe_item_destructible": {},
            f"tag:{NS}:machine": {},
        }
        write_json(BP / "blocks" / f"{block}.json", {
            "format_version": BLOCK_FORMAT,
            "minecraft:block": {"description": description, "components": comps, "permutations": perms},
        })
    write_json(BP / "loot_tables" / "blocks" / NS / "empty.json", {"pools": []})
    write_json(RP / "blocks.json", {"format_version": [1, 1, 0],
                                    **{f"{NS}:{b}": {"sound": "metal"} for b in BLOCKS}})

# ---------------------------------------------------------------------------
# Itens
# ---------------------------------------------------------------------------

def gen_items():
    for item in ("villager", "baby_villager"):
        write_json(BP / "items" / f"{item}.json", {
            "format_version": ITEM_FORMAT,
            "minecraft:item": {
                "description": {"identifier": f"{NS}:{item}", "menu_category": {"category": "items"}},
                "components": {
                    "minecraft:icon": {"textures": {"default": f"ev_{item}"}},
                    "minecraft:max_stack_size": 1,
                    "minecraft:display_name": {"value": f"item.{NS}.{item}"},
                },
            },
        })
    tex = {
        "ev_villager": {"textures": f"textures/{NS}/items/villager"},
        "ev_baby_villager": {"textures": f"textures/{NS}/items/baby_villager"},
    }
    # Máquina com conteúdo (não empilhável, guarda aldeões/itens/estado)
    for block in BLOCKS:
        write_json(BP / "items" / f"{block}_packed.json", {
            "format_version": ITEM_FORMAT,
            "minecraft:item": {
                "description": {"identifier": f"{NS}:{block}_packed",
                                "menu_category": {"category": "none"}},
                "components": {
                    "minecraft:icon": {"textures": {"default": f"ev_{block}_packed"}},
                    "minecraft:max_stack_size": 1,
                    "minecraft:display_name": {"value": f"item.{NS}.{block}_packed"},
                    "minecraft:glint": True,
                },
            },
        })
        tex[f"ev_{block}_packed"] = {"textures": f"textures/{NS}/items/{block}_packed"}
    write_json(RP / "textures" / "item_texture.json", {
        "resource_pack_name": NS, "texture_name": "atlas.items", "texture_data": tex})

# ---------------------------------------------------------------------------
# Receitas (data/easy_villagers/recipe/*.json)
# ---------------------------------------------------------------------------

JAVA_INGREDIENT = {
    "#c:glass_panes/colorless": {"item": "minecraft:glass_pane"},
    "#c:ingots/iron": {"item": "minecraft:iron_ingot"},
    "#c:dusts/redstone": {"item": "minecraft:redstone"},
    "#c:ingots/netherite": {"item": "minecraft:netherite_ingot"},
    "#minecraft:planks": {"tag": "minecraft:planks"},
}


def gen_recipes():
    count = 0
    for f in sorted((OD / "recipe").glob("*.json")):
        r = load_json(f)
        result = r["result"]["id"]
        name = result.split(":")[1]
        variants = [{}]
        key = {}
        for k, v in r["key"].items():
            if v == "#minecraft:beds":
                # Camas no Bedrock: minecraft:bed com dado de cor 0..15
                variants = [{k: {"item": "minecraft:bed", "data": d}} for d in range(16)]
            elif v in JAVA_INGREDIENT:
                key[k] = JAVA_INGREDIENT[v]
            else:
                key[k] = {"item": v}
        for i, extra in enumerate(variants):
            ident = f"{NS}:{name}" + (f"_bed{i}" if len(variants) > 1 else "")
            write_json(BP / "recipes" / f"{ident.split(':')[1]}.json", {
                "format_version": "1.20.10",
                "minecraft:recipe_shaped": {
                    "description": {"identifier": ident},
                    "tags": ["crafting_table"],
                    "pattern": r["pattern"],
                    "key": {**key, **extra},
                    "unlock": [{"item": "minecraft:glass_pane"}],
                    "result": {"item": result, "count": 1},
                }})
            count += 1
    return count

# ---------------------------------------------------------------------------
# Entidade de exibição (miniaturas e inventário da máquina)
# ---------------------------------------------------------------------------

PROFESSION_TEX = ["", "farmer", "fisherman", "shepherd", "fletcher", "librarian",
                  "cartographer", "cleric", "armorer", "weaponsmith", "toolsmith",
                  "butcher", "leatherworker", "stonemason", "nitwit"]
BIOME_TEX = ["plains", "desert", "jungle", "savanna", "snow", "swamp", "taiga"]


def villager_geometry(identifier, extra_inflate):
    def c(origin, size, uv, inflate=0.0, mirror=False):
        d = {"origin": origin, "size": size, "uv": uv}
        if inflate + extra_inflate:
            d["inflate"] = round(inflate + extra_inflate, 3)
        if mirror:
            d["mirror"] = True
        return d
    rim = {"origin": [-8, 29, -8], "size": [16, 1, 16],
           "uv": {"up": {"uv": [31, 48], "uv_size": [16, 16]},
                  "down": {"uv": [48, 48], "uv_size": [16, 16]},
                  "north": {"uv": [31, 47], "uv_size": [16, 1]},
                  "south": {"uv": [31, 47], "uv_size": [16, 1]},
                  "east": {"uv": [31, 47], "uv_size": [16, 1]},
                  "west": {"uv": [31, 47], "uv_size": [16, 1]}}}
    if extra_inflate:
        rim["inflate"] = extra_inflate
    return {
        "description": {"identifier": identifier, "texture_width": 64, "texture_height": 64,
                        "visible_bounds_width": 2, "visible_bounds_height": 3,
                        "visible_bounds_offset": [0, 1, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "head", "parent": "root", "pivot": [0, 24, 0], "cubes": [
                c([-4, 24, -4], [8, 10, 8], [0, 0]),
                c([-1, 23, -6], [2, 4, 2], [24, 0])]},
            {"name": "hat", "parent": "head", "pivot": [0, 24, 0], "cubes": [
                c([-4, 24, -4], [8, 10, 8], [32, 0], 0.51), rim]},
            {"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": [
                c([-4, 12, -3], [8, 12, 6], [16, 20]),
                c([-4, 4, -3], [8, 20, 6], [0, 38], 0.5)]},
            # Braços cruzados (pose do VillagerModel) aproximados sem rotação
            {"name": "arms", "parent": "body", "pivot": [0, 21, -1], "cubes": [
                c([-4, 16.07, -5.73], [8, 4, 4], [40, 38]),
                c([-8, 15.54, -4.36], [4, 8, 4], [44, 22]),
                c([4, 15.54, -4.36], [4, 8, 4], [44, 22], mirror=True)]},
            {"name": "leg0", "parent": "root", "pivot": [-2, 12, 0], "cubes": [
                c([-4, 0, -2], [4, 12, 4], [0, 22])]},
            {"name": "leg1", "parent": "root", "pivot": [2, 12, 0], "cubes": [
                c([0, 0, -2], [4, 12, 4], [0, 22], mirror=True)]},
        ],
    }


def zombie_geometry():
    arm_uv = lambda u: {"north": {"uv": [u + 8, 16], "uv_size": [4, 4]},
                        "south": {"uv": [u + 4, 16], "uv_size": [4, 4]},
                        "up": {"uv": [u + 4, 20], "uv_size": [4, 12]},
                        "down": {"uv": [u + 12, 20], "uv_size": [4, 12]},
                        "east": {"uv": [u, 20], "uv_size": [4, 12]},
                        "west": {"uv": [u + 8, 20], "uv_size": [4, 12]}}
    return {
        "description": {"identifier": f"geometry.{NS}.zombie", "texture_width": 64, "texture_height": 64,
                        "visible_bounds_width": 2, "visible_bounds_height": 3,
                        "visible_bounds_offset": [0, 1, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "head", "parent": "root", "pivot": [0, 24, 0], "cubes": [
                {"origin": [-4, 24, -4], "size": [8, 8, 8], "uv": [0, 0]},
                {"origin": [-4, 24, -4], "size": [8, 8, 8], "uv": [32, 0], "inflate": 0.5}]},
            {"name": "body", "parent": "root", "pivot": [0, 24, 0], "cubes": [
                {"origin": [-4, 12, -2], "size": [8, 12, 4], "uv": [16, 16]}]},
            # Braços estendidos para frente (pose do zumbi) sem rotação de osso
            {"name": "arms", "parent": "body", "pivot": [0, 22, 0], "cubes": [
                {"origin": [-8, 20, -10], "size": [4, 4, 12], "uv": arm_uv(40)},
                {"origin": [4, 20, -10], "size": [4, 4, 12], "uv": arm_uv(40)}]},
            {"name": "legs", "parent": "root", "pivot": [0, 12, 0], "cubes": [
                {"origin": [-4, 0, -2], "size": [4, 12, 4], "uv": [0, 16]},
                {"origin": [0, 0, -2], "size": [4, 12, 4], "uv": [0, 16], "mirror": True}]},
        ],
    }


def golem_geometry():
    return {
        "description": {"identifier": f"geometry.{NS}.iron_golem", "texture_width": 128, "texture_height": 128,
                        "visible_bounds_width": 3, "visible_bounds_height": 4,
                        "visible_bounds_offset": [0, 1.5, 0]},
        "bones": [
            {"name": "root", "pivot": [0, 0, 0]},
            {"name": "head", "parent": "root", "pivot": [0, 31, -2], "cubes": [
                {"origin": [-4, 33, -7.5], "size": [8, 10, 8], "uv": [0, 0]},
                {"origin": [-1, 32, -9.5], "size": [2, 4, 2], "uv": [24, 0]}]},
            {"name": "body", "parent": "root", "pivot": [0, 31, 0], "cubes": [
                {"origin": [-9, 21, -6], "size": [18, 12, 11], "uv": [0, 40]},
                {"origin": [-4.5, 16, -3], "size": [9, 5, 6], "uv": [0, 70], "inflate": 0.5}]},
            {"name": "arms", "parent": "body", "pivot": [0, 31, 0], "cubes": [
                {"origin": [-13, 3.5, -3], "size": [4, 30, 6], "uv": [60, 21]},
                {"origin": [9, 3.5, -3], "size": [4, 30, 6], "uv": [60, 58]}]},
            {"name": "legs", "parent": "root", "pivot": [0, 13, 0], "cubes": [
                {"origin": [-7.5, 0, -3], "size": [6, 16, 5], "uv": [37, 0]},
                {"origin": [1.5, 0, -3], "size": [6, 16, 5], "uv": [60, 0], "mirror": True}]},
        ],
    }


def gen_display_entity():
    props = {
        f"{NS}:kind": {"type": "int", "range": [0, 3], "default": 0, "client_sync": True},
        f"{NS}:profession": {"type": "int", "range": [0, 14], "default": 0, "client_sync": True},
        f"{NS}:biome": {"type": "int", "range": [0, 6], "default": 0, "client_sync": True},
        f"{NS}:baby": {"type": "bool", "default": False, "client_sync": True},
        f"{NS}:zombified": {"type": "bool", "default": False, "client_sync": True},
        f"{NS}:hurt": {"type": "bool", "default": False, "client_sync": True},
        f"{NS}:scale": {"type": "int", "range": [10, 100], "default": 45, "client_sync": True},
    }
    write_json(BP / "entities" / "display.json", {
        "format_version": ENTITY_FORMAT,
        "minecraft:entity": {
            "description": {"identifier": f"{NS}:display", "is_spawnable": False,
                            "is_summonable": True, "properties": props},
            # Caixa de toque grande cobre o interior do bloco (abre o baú);
            # mínima deixa o toque passar para o aldeão real do Comerciante.
            "component_groups": {
                f"{NS}:big": {"minecraft:collision_box": {"width": 0.85, "height": 0.9}},
            },
            "events": {
                f"{NS}:become_big": {"add": {"component_groups": [f"{NS}:big"]}},
                f"{NS}:become_small": {"remove": {"component_groups": [f"{NS}:big"]}},
            },
            "components": {
                "minecraft:type_family": {"family": [f"{NS}_display", "inanimate"]},
                "minecraft:collision_box": {"width": 0.01, "height": 0.01},
                "minecraft:health": {"value": 1, "max": 1},
                "minecraft:damage_sensor": {"triggers": [{"cause": "all", "deals_damage": "no"}]},
                "minecraft:physics": {"has_gravity": False, "has_collision": False},
                "minecraft:pushable": {"is_pushable": False, "is_pushable_by_piston": False},
                "minecraft:knockback_resistance": {"value": 1},
                "minecraft:fire_immune": {},
                "minecraft:persistent": {},
                # Interface de baú nativa ao tocar na entidade da máquina
                "minecraft:inventory": {"inventory_size": 27, "container_type": "minecart_chest", "private": True},
                "minecraft:nameable": {"always_show": False, "allow_name_tag_renaming": False},
            },
        },
    })
    textures = {"villager": "textures/entity/villager2/villager",
                "zombie": "textures/entity/zombie/zombie",
                "golem": "textures/entity/iron_golem"}
    for b in BIOME_TEX:
        textures[f"biome_{b}"] = f"textures/entity/villager2/biomes/biome_{b}"
    for p in PROFESSION_TEX[1:]:
        textures[f"prof_{p}"] = f"textures/entity/villager2/professions/{p}"
    kind = f"query.property('{NS}:kind')"
    write_json(RP / "entity" / "display.entity.json", {
        "format_version": "1.10.0",
        "minecraft:client_entity": {"description": {
            "identifier": f"{NS}:display",
            "materials": {"default": "entity_alphatest"},
            "textures": textures,
            "geometry": {"villager": f"geometry.{NS}.villager",
                         "villager_l1": f"geometry.{NS}.villager_l1",
                         "villager_l2": f"geometry.{NS}.villager_l2",
                         "zombie": f"geometry.{NS}.zombie",
                         "golem": f"geometry.{NS}.iron_golem"},
            "animations": {"scale": f"animation.{NS}.display.scale"},
            "scripts": {"animate": ["scale"]},
            "render_controllers": [
                {f"controller.render.{NS}.villager_base": f"{kind} == 1"},
                {f"controller.render.{NS}.villager_biome": f"{kind} == 1"},
                {f"controller.render.{NS}.villager_profession": f"{kind} == 1 && query.property('{NS}:profession') > 0"},
                {f"controller.render.{NS}.zombie": f"{kind} == 2"},
                {f"controller.render.{NS}.golem": f"{kind} == 3"},
            ],
        }}})
    zomb = {"r": 0.25, "g": 0.6, "b": 0.2, "a": f"query.property('{NS}:zombified') ? 0.55 : 0.0"}
    m = [{"*": "Material.default"}]
    write_json(RP / "render_controllers" / "display.render_controllers.json", {
        "format_version": "1.8.0",
        "render_controllers": {
            f"controller.render.{NS}.villager_base": {
                "geometry": "Geometry.villager", "materials": m,
                "textures": ["Texture.villager"], "overlay_color": zomb},
            f"controller.render.{NS}.villager_biome": {
                "arrays": {"textures": {"Array.biomes": [f"Texture.biome_{b}" for b in BIOME_TEX]}},
                "geometry": "Geometry.villager_l1", "materials": m,
                "textures": [f"Array.biomes[query.property('{NS}:biome')]"], "overlay_color": zomb},
            f"controller.render.{NS}.villager_profession": {
                "arrays": {"textures": {"Array.professions":
                    ["Texture.prof_farmer"] + [f"Texture.prof_{p}" for p in PROFESSION_TEX[1:]]}},
                "geometry": "Geometry.villager_l2", "materials": m,
                "textures": [f"Array.professions[query.property('{NS}:profession')]"], "overlay_color": zomb},
            f"controller.render.{NS}.zombie": {
                "geometry": "Geometry.zombie", "materials": m, "textures": ["Texture.zombie"]},
            f"controller.render.{NS}.golem": {
                "geometry": "Geometry.golem", "materials": m, "textures": ["Texture.golem"],
                # IronFarmRenderer: overlay vermelho alternando a cada 10 ticks
                "overlay_color": {"r": 1.0, "g": 0.0, "b": 0.0,
                                  "a": f"query.property('{NS}:hurt') && math.mod(math.floor(query.life_time * 2.0), 2) == 0 ? 0.5 : 0.0"}},
        }})
    write_json(RP / "animations" / "display.animation.json", {
        "format_version": "1.8.0",
        "animations": {f"animation.{NS}.display.scale": {
            "loop": True,
            "bones": {"root": {"scale": f"query.property('{NS}:scale') / 100.0 * (query.property('{NS}:baby') ? 0.5 : 1.0)"}}}}})
    write_json(RP / "models" / "entity" / "display.geo.json", {
        "format_version": "1.12.0",
        "minecraft:geometry": [
            villager_geometry(f"geometry.{NS}.villager", 0.0),
            villager_geometry(f"geometry.{NS}.villager_l1", 0.02),
            villager_geometry(f"geometry.{NS}.villager_l2", 0.04),
            zombie_geometry(), golem_geometry()]})

# ---------------------------------------------------------------------------
# Texturas
# ---------------------------------------------------------------------------

def draw_villager_icon(baby: bool) -> Image.Image:
    """Ícone 16x16 recriado (pixel art própria) da cabeça de um aldeão."""
    im = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    skin, shade, brow = (189, 139, 114, 255), (160, 112, 90, 255), (73, 49, 38, 255)
    robe = (110, 78, 56, 255)
    if baby:
        d.rectangle([4, 4, 11, 13], fill=skin)
        d.rectangle([4, 4, 11, 5], fill=shade)
        d.line([5, 7, 10, 7], fill=brow)
        d.point([6, 8], fill=(255, 255, 255, 255)); d.point([9, 8], fill=(255, 255, 255, 255))
        d.point([7, 8], fill=(36, 132, 64, 255)); d.point([8, 8], fill=(36, 132, 64, 255))
        d.rectangle([7, 9, 8, 11], fill=shade)
        d.rectangle([5, 14, 10, 15], fill=robe)
    else:
        d.rectangle([3, 0, 12, 12], fill=skin)
        d.rectangle([3, 0, 12, 2], fill=shade)
        d.line([4, 5, 11, 5], fill=brow)
        for x, c in ((5, (255, 255, 255, 255)), (6, (36, 132, 64, 255)),
                     (9, (36, 132, 64, 255)), (10, (255, 255, 255, 255))):
            d.point([x, 6], fill=c)
        d.rectangle([7, 6, 8, 10], fill=shade)
        d.line([5, 11, 10, 11], fill=shade)
        d.rectangle([2, 13, 13, 15], fill=robe)
    return im


def make_packed_icons(folder: Path):
    """Ícone 32x32 de cada máquina cheia: prévia isométrica do bloco convertido
    (tools/preview_geometry.py) + cabeça de aldeão no canto."""
    sys.path.insert(0, str(ROOT / "tools"))
    import preview_geometry as pg  # noqa: E402
    head = draw_villager_icon(False).resize((14, 14), Image.Resampling.NEAREST)
    for block in BLOCKS:
        bones = {"frame"} | ({"workstation"} if "trader" in block else set()) | \
                ({"crop"} if block == "farmer" else set()) | ({"bed"} if block == "breeder" else set())
        im = pg.render(block, bones, label=False)
        bbox = im.getbbox()
        im = im.crop(bbox).resize((30, 30), Image.Resampling.LANCZOS)
        icon = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
        icon.alpha_composite(im, (1, 1))
        icon.alpha_composite(head, (18, 18))
        icon.save(folder / f"{block}_packed.png")


def gen_textures():
    out = RP / "textures" / NS
    (out / "blocks").mkdir(parents=True, exist_ok=True)
    (out / "items").mkdir(parents=True, exist_ok=True)
    (out / "gui").mkdir(parents=True, exist_ok=True)
    farm = Image.open(OA / "textures" / "block" / "farm.png").convert("RGBA")
    farm.save(out / "blocks" / "farm.png")
    farm.transpose(Image.Transpose.TRANSPOSE).save(out / "blocks" / "farm_rot.png")
    for g in ("arrow_left", "arrow_right"):
        shutil.copy(OA / "textures" / "gui" / f"{g}.png", out / "gui" / f"{g}.png")
    draw_villager_icon(False).save(out / "items" / "villager.png")
    draw_villager_icon(True).save(out / "items" / "baby_villager.png")
    make_packed_icons(out / "items")
    icon = Image.open(ORIG / "icon.png").convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    icon.save(RP / "pack_icon.png")
    icon.save(BP / "pack_icon.png")
    TERRAIN["ev_farm"] = f"textures/{NS}/blocks/farm"
    TERRAIN["ev_farm_rot"] = f"textures/{NS}/blocks/farm_rot"
    write_json(RP / "textures" / "terrain_texture.json", {
        "resource_pack_name": NS, "texture_name": "atlas.terrain", "padding": 8, "num_mip_levels": 4,
        "texture_data": {k: {"textures": v} for k, v in sorted(TERRAIN.items())}})
    write_json(RP / "textures" / "flipbook_textures.json", [
        {"flipbook_texture": "textures/blocks/lava_still", "atlas_tile": tex_key("textures/blocks/lava_still"),
         "ticks_per_frame": 2}])

# ---------------------------------------------------------------------------
# Idiomas
# ---------------------------------------------------------------------------

BEDROCK_LANGS = {"en_us": "en_US", "pt_br": "pt_BR", "de_de": "de_DE", "es_mx": "es_MX",
                 "fr_fr": "fr_FR", "hu_hu": "hu_HU", "id_id": "id_ID", "ja_jp": "ja_JP",
                 "ko_kr": "ko_KR", "ru_ru": "ru_RU", "tr_tr": "tr_TR", "uk_ua": "uk_UA",
                 "zh_cn": "zh_CN", "zh_tw": "zh_TW"}
# hr_hr e lzh não existem como idioma no Bedrock.

LANG_NAMES = {"en_US": "English (US)", "pt_BR": "Português (Brasil)", "de_DE": "Deutsch",
              "es_MX": "Español (México)", "fr_FR": "Français", "hu_HU": "Magyar",
              "id_ID": "Bahasa Indonesia", "ja_JP": "日本語", "ko_KR": "한국어",
              "ru_RU": "Русский", "tr_TR": "Türkçe", "uk_UA": "Українська",
              "zh_CN": "简体中文", "zh_TW": "繁體中文"}


def gen_langs():
    extra = {}
    for code in ("en_US", "pt_BR"):
        extra[code] = {}
        for line in (ROOT / "tools" / "lang" / f"ui_{code}.lang").read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                extra[code][k.strip()] = v.strip()
    for jcode, bcode in BEDROCK_LANGS.items():
        # Traduções incompletas caem para o inglês, como no Java.
        j = {**load_json(OA / "lang" / "en_us.json"), **load_json(OA / "lang" / f"{jcode}.json")}
        lines = [f"## Easy Villagers - {bcode} (gerado por tools/generate.py)"]
        for k, v in j.items():
            if k.startswith(("block.", "item.", "gui.", "tooltip.", "jei.")):
                lines.append(f"{k}={v}")
            if k.startswith("block."):
                lines.append(f"tile.{NS}:{k.split('.')[-1]}.name={v}")
            if k.startswith("item.") and k.count(".") == 2:
                lines.append(f"item.{NS}:{k.split('.')[-1]}={v}")
                lines.append(f"item.{NS}:{k.split('.')[-1]}.name={v}")
        suffix = {"pt_BR": " (com conteúdo)", "en_US": " (filled)"}.get(bcode, " (+)")
        for b in BLOCKS:
            lines.append(f"item.{NS}.{b}_packed={j[f'block.{NS}.{b}']}{suffix}")
            lines.append(f"item.{NS}:{b}_packed={j[f'block.{NS}.{b}']}{suffix}")
        lines.append(f"entity.{NS}:display.name={j['itemGroup.easy_villagers']}")
        ui = dict(extra["en_US"])
        ui.update(extra.get(bcode, {}))
        lines.append("## Textos de interface do addon")
        lines += [f"{k}={v}" for k, v in ui.items()]
        for pack in (BP, RP):
            p = pack / "texts" / f"{bcode}.lang"
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text("\n".join(lines) + "\n", encoding="utf-8")
    codes = list(BEDROCK_LANGS.values())
    for pack in (BP, RP):
        write_json(pack / "texts" / "languages.json", codes)
        write_json(pack / "texts" / "language_names.json", [[c, LANG_NAMES[c]] for c in codes])

# ---------------------------------------------------------------------------
# Manifestos
# ---------------------------------------------------------------------------

def gen_manifests():
    write_json(BP / "manifest.json", {
        "format_version": 2,
        "header": {"name": "Easy Villagers (Bedrock) BP",
                   "description": "Conversão do mod Easy Villagers (Max Henkel) para Bedrock - comportamento",
                   "uuid": BP_UUID, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [
            {"type": "data", "uuid": BP_DATA_UUID, "version": VERSION},
            {"type": "script", "language": "javascript", "uuid": BP_SCRIPT_UUID,
             "version": VERSION, "entry": "scripts/main.js"}],
        "dependencies": [
            {"uuid": RP_UUID, "version": VERSION},
            {"module_name": "@minecraft/server", "version": SERVER_API},
            {"module_name": "@minecraft/server-ui", "version": SERVER_UI_API}],
        "metadata": {"authors": ["Max Henkel (mod original)", "Conversão Bedrock"],
                     "license": "All rights reserved (mod original)"}})
    write_json(RP / "manifest.json", {
        "format_version": 2,
        "header": {"name": "Easy Villagers (Bedrock) RP",
                   "description": "Conversão do mod Easy Villagers (Max Henkel) para Bedrock - recursos",
                   "uuid": RP_UUID, "version": VERSION, "min_engine_version": MIN_ENGINE},
        "modules": [{"type": "resources", "uuid": RP_RES_UUID, "version": VERSION}]})


def clean():
    keep_scripts = BP / "scripts"
    for pack in (BP, RP):
        if pack.exists():
            for child in pack.iterdir():
                if child == keep_scripts:
                    continue
                if child.is_dir():
                    shutil.rmtree(child)
                else:
                    child.unlink()


def main():
    clean()
    BP.mkdir(parents=True, exist_ok=True)
    RP.mkdir(parents=True, exist_ok=True)
    convert_farm_geometry()
    gen_blocks()
    gen_items()
    n = gen_recipes()
    gen_display_entity()
    gen_textures()
    gen_langs()
    gen_manifests()
    print(f"OK: {len(BLOCKS)} blocos, {2 + len(BLOCKS)} itens próprios, {n} receitas, {len(TERRAIN)} texturas de terreno")


if __name__ == "__main__":
    main()
