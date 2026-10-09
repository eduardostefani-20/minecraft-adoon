// @ts-check
// Constantes puras (sem dependência de @minecraft/server) para poderem ser
// testadas em Node.

export const NS = "easy_villagers";
export const VILLAGER_ITEM = `${NS}:villager`;
export const BABY_VILLAGER_ITEM = `${NS}:baby_villager`;
export const DISPLAY_ENTITY = `${NS}:display`;
export const VANILLA_VILLAGER = "minecraft:villager_v2";

export const MACHINE_KINDS = /** @type {const} */ ([
  "trader", "auto_trader", "farmer", "breeder", "converter", "iron_farm", "incubator", "inventory_viewer",
]);

/** Variantes de profissão do minecraft:villager_v2 (componente minecraft:variant). */
export const PROFESSIONS = [
  "unskilled", "farmer", "fisherman", "shepherd", "fletcher", "librarian", "cartographer",
  "cleric", "armorer", "weaponsmith", "toolsmith", "butcher", "leatherworker", "mason", "nitwit",
];
export const PROF_NONE = 0;
export const PROF_FARMER = 1;
export const PROF_NITWIT = 14;

/** Variantes de bioma (minecraft:mark_variant) do villager_v2. */
export const BIOMES = ["plains", "desert", "jungle", "savanna", "snow", "swamp", "taiga"];

/**
 * Estações de trabalho. O índice é igual à variante de profissão, e também ao
 * valor do estado de bloco easy_villagers:workstation.
 * `sound` = som de trabalho tocado (equivalente ao VillagerProfession.workSound).
 */
export const WORKSTATIONS = [
  null,
  { items: ["minecraft:composter"], sound: "block.composter.fill_success" },
  { items: ["minecraft:barrel"], sound: "block.barrel.open" },
  { items: ["minecraft:loom"], sound: "block.loom.use" },
  { items: ["minecraft:fletching_table"], sound: "dig.wood" },
  { items: ["minecraft:lectern"], sound: "item.book.page_turn" },
  { items: ["minecraft:cartography_table"], sound: "block.cartography_table.use" },
  { items: ["minecraft:brewing_stand"], sound: "random.potion.brewed" },
  { items: ["minecraft:blast_furnace"], sound: "block.blastfurnace.fire_crackle" },
  { items: ["minecraft:grindstone"], sound: "block.grindstone.use" },
  { items: ["minecraft:smithing_table"], sound: "block.smithing_table.use" },
  { items: ["minecraft:smoker"], sound: "block.smoker.smoke" },
  { items: ["minecraft:cauldron"], sound: "cauldron.fillwater" },
  { items: ["minecraft:stonecutter_block", "minecraft:stonecutter"], sound: "block.stonecutter.use" },
];

/** @param {string} itemId */
export function workstationForItem(itemId) {
  for (let i = 1; i < WORKSTATIONS.length; i++) {
    if (WORKSTATIONS[i]?.items.includes(itemId)) return i;
  }
  return 0;
}

/** Villager.FOOD_POINTS (Java). */
export const FOOD_POINTS = {
  "minecraft:bread": 4,
  "minecraft:potato": 1,
  "minecraft:carrot": 1,
  "minecraft:beetroot": 1,
};
export const BREED_FOOD_NEEDED = 24;

/**
 * Culturas aceitas pelo Fazendeiro (tag villager_plantable_seeds).
 * O índice é o valor do estado easy_villagers:crop.
 */
export const CROPS = [
  null,
  { name: "wheat", seed: "minecraft:wheat_seeds", maxAge: 7 },
  { name: "carrots", seed: "minecraft:carrot", maxAge: 7 },
  { name: "potatoes", seed: "minecraft:potato", maxAge: 7 },
  { name: "beetroots", seed: "minecraft:beetroot_seeds", maxAge: 3 },
  { name: "torchflower", seed: "minecraft:torchflower_seeds", maxAge: 1 },
  { name: "pitcher", seed: "minecraft:pitcher_pod", maxAge: 4 },
];

/** @param {string} itemId */
export function cropForSeed(itemId) {
  for (let i = 1; i < CROPS.length; i++) if (CROPS[i]?.seed === itemId) return i;
  return 0;
}

/** Valores padrão = ServerConfig/ClientConfig do mod original. */
export const DEFAULT_CONFIG = {
  breeding_time: 1200,
  converting_time: 6000,
  farm_speed: 10,
  golem_spawn_time: 4800,
  trader_min_restock_time: 1200,
  trader_max_restock_time: 3600,
  auto_trader_min_restock_time: 1200,
  auto_trader_max_restock_time: 3600,
  auto_trader_cooldown: 20,
  villager_inventory_sounds: true,
  villager_sound_amount: 20,
  incubator_speed: 2,
  sneak_pick_up: true,
  villager_volume: 1.0,
  render_block_contents: true,
  hopper_automation: true,
};

/** Limites (defineInRange) do ServerConfig original. */
export const CONFIG_LIMITS = {
  breeding_time: [20, 2147483647],
  converting_time: [20, 2147483647],
  farm_speed: [1, 2147483647],
  golem_spawn_time: [201, 2147483647],
  trader_min_restock_time: [1, 2147483647],
  trader_max_restock_time: [2, 2147483647],
  auto_trader_min_restock_time: [1, 2147483647],
  auto_trader_max_restock_time: [2, 2147483647],
  auto_trader_cooldown: [1, 2147483647],
  villager_sound_amount: [1, 2147483647],
  incubator_speed: [1, 1024],
  villager_volume: [0, 1],
};

/** Layout do inventário da entidade-máquina (12 espaços). */
export const SLOT = {
  VILLAGER: 0,
  VILLAGER2: 1,
  INPUT: [4, 5, 6, 7],
  OUTPUT: [8, 9, 10, 11],
};

/** Ticks por execução do componente minecraft:tick dos blocos. */
export const TICK_STEP = 20;

/** Idade de um bebê recém-nascido (Java: setAge(-24000)). */
export const BABY_AGE = -24000;

/** Limiares de XP de nível de aldeão (Java VillagerData). */
export const LEVEL_XP = [0, 10, 70, 150, 250];
