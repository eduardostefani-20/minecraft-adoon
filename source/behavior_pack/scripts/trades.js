// @ts-check
// Tabela de trocas usada pelo Comerciante Automático.
//
// No mod original o Auto Trader usa as ofertas reais do aldeão. A Script API
// do Bedrock não dá acesso às ofertas de um aldeão, então este addon mantém um
// "mercador virtual" por aldeão, gerado a partir destas listas, que seguem as
// trocas vanilla do Java Edition (1.14+). Trocas que dependem de dados de item
// não reproduzíveis por script (livros/ferramentas encantados, mapas de
// explorador, flechas com efeito, ensopado suspeito, couro tingido) foram
// omitidas. Itens inexistentes na versão do jogo são filtrados em tempo de
// execução.
//
// Formato: [custoA, custoB|null, resultado, usosMáximos, xp]
// custo/resultado = [itemId, quantidade]

const E = "minecraft:emerald";
/** @typedef {[string, number]} Stack */
/** @typedef {[Stack, Stack|null, Stack, number, number]} Trade */

/** @param {string} id @param {number} n @param {number} uses @param {number} xp @returns {Trade} */
const buy = (id, n, uses, xp) => [[`minecraft:${id}`, n], null, [E, 1], uses, xp];
/** @param {number} e @param {string} id @param {number} n @param {number} uses @param {number} xp @returns {Trade} */
const sell = (e, id, n, uses, xp) => [[E, e], null, [`minecraft:${id}`, n], uses, xp];

/** @type {Record<string, Trade[][]>} profissão -> 5 níveis */
export const TRADES = {
  farmer: [
    [buy("wheat", 20, 16, 2), buy("potato", 26, 16, 2), buy("carrot", 22, 16, 2), buy("beetroot", 15, 16, 2), sell(1, "bread", 6, 16, 1)],
    [buy("pumpkin", 6, 12, 10), sell(1, "pumpkin_pie", 4, 12, 5), sell(1, "apple", 4, 16, 5)],
    [buy("melon_block", 4, 12, 20), sell(3, "cookie", 18, 12, 10)],
    [sell(1, "cake", 1, 12, 15)],
    [sell(3, "golden_carrot", 3, 12, 30), sell(4, "glistering_melon_slice", 3, 12, 30)],
  ],
  fisherman: [
    [buy("string", 20, 16, 2), buy("coal", 10, 16, 2), [["minecraft:cod", 6], [E, 1], ["minecraft:cooked_cod", 6], 16, 1], sell(1, "cod_bucket", 1, 16, 1)],
    [buy("cod", 15, 16, 10), [["minecraft:salmon", 6], [E, 1], ["minecraft:cooked_salmon", 6], 16, 5], sell(2, "campfire", 1, 12, 5)],
    [buy("salmon", 13, 16, 20)],
    [buy("tropical_fish", 6, 12, 30)],
    [buy("pufferfish", 4, 12, 30), buy("oak_boat", 1, 12, 30)],
  ],
  shepherd: [
    [buy("white_wool", 18, 16, 2), buy("brown_wool", 18, 16, 2), buy("black_wool", 18, 16, 2), buy("gray_wool", 18, 16, 2), sell(2, "shears", 1, 12, 1)],
    [buy("white_dye", 12, 16, 10), buy("gray_dye", 12, 16, 10), buy("black_dye", 12, 16, 10), buy("light_blue_dye", 12, 16, 10), buy("lime_dye", 12, 16, 10), sell(1, "white_wool", 1, 16, 5), sell(1, "white_carpet", 4, 16, 5)],
    [buy("yellow_dye", 12, 16, 20), buy("light_gray_dye", 12, 16, 20), buy("orange_dye", 12, 16, 20), buy("red_dye", 12, 16, 20), buy("pink_dye", 12, 16, 20), sell(3, "bed", 1, 12, 10)],
    [buy("brown_dye", 12, 16, 30), buy("purple_dye", 12, 16, 30), buy("blue_dye", 12, 16, 30), buy("green_dye", 12, 16, 30), buy("magenta_dye", 12, 16, 30), buy("cyan_dye", 12, 16, 30), sell(3, "banner", 1, 12, 15)],
    [sell(2, "painting", 3, 12, 30)],
  ],
  fletcher: [
    [buy("stick", 32, 16, 2), sell(1, "arrow", 16, 12, 1), [["minecraft:gravel", 10], [E, 1], ["minecraft:flint", 10], 12, 1]],
    [buy("flint", 26, 12, 10), sell(2, "bow", 1, 12, 5)],
    [buy("string", 14, 16, 20), sell(3, "crossbow", 1, 12, 10)],
    [buy("feather", 24, 16, 30)],
    [buy("tripwire_hook", 8, 12, 30)],
  ],
  librarian: [
    [buy("paper", 24, 16, 2), sell(9, "bookshelf", 1, 12, 1)],
    [buy("book", 4, 12, 10), sell(1, "lantern", 1, 12, 5)],
    [buy("ink_sac", 5, 12, 20), sell(1, "glass", 4, 12, 10)],
    [buy("writable_book", 2, 12, 30), sell(5, "clock", 1, 12, 15), sell(4, "compass", 1, 12, 15)],
    [sell(20, "name_tag", 1, 12, 30)],
  ],
  cartographer: [
    [buy("paper", 24, 16, 2), sell(7, "empty_map", 1, 12, 1)],
    [buy("glass_pane", 11, 16, 10)],
    [buy("compass", 1, 12, 20)],
    [sell(7, "frame", 1, 12, 15), sell(3, "banner", 1, 12, 15)],
    [sell(8, "globe_banner_pattern", 1, 12, 30)],
  ],
  cleric: [
    [buy("rotten_flesh", 32, 16, 2), sell(1, "redstone", 2, 12, 1)],
    [buy("gold_ingot", 3, 12, 10), sell(1, "lapis_lazuli", 1, 12, 5)],
    [buy("rabbit_foot", 2, 12, 20), sell(4, "glowstone", 1, 12, 10)],
    [buy("turtle_scute", 4, 12, 30), buy("glass_bottle", 9, 12, 30), sell(5, "ender_pearl", 1, 12, 15)],
    [buy("nether_wart", 22, 12, 30), sell(3, "experience_bottle", 1, 12, 30)],
  ],
  armorer: [
    [buy("coal", 15, 16, 2), sell(7, "iron_leggings", 1, 12, 1), sell(4, "iron_boots", 1, 12, 1), sell(5, "iron_helmet", 1, 12, 1), sell(9, "iron_chestplate", 1, 12, 1)],
    [buy("iron_ingot", 4, 12, 10), sell(36, "bell", 1, 12, 5), sell(3, "chainmail_leggings", 1, 12, 5), sell(1, "chainmail_boots", 1, 12, 5)],
    [buy("lava_bucket", 1, 12, 20), buy("diamond", 1, 12, 20), sell(1, "chainmail_helmet", 1, 12, 10), sell(4, "chainmail_chestplate", 1, 12, 10), sell(5, "shield", 1, 12, 10)],
    [],
    [],
  ],
  weaponsmith: [
    [buy("coal", 15, 16, 2), sell(3, "iron_axe", 1, 12, 1)],
    [buy("iron_ingot", 4, 12, 10), sell(36, "bell", 1, 12, 5)],
    [buy("flint", 24, 12, 20)],
    [buy("diamond", 1, 12, 30)],
    [],
  ],
  toolsmith: [
    [buy("coal", 15, 16, 2), sell(1, "stone_axe", 1, 12, 1), sell(1, "stone_shovel", 1, 12, 1), sell(1, "stone_pickaxe", 1, 12, 1), sell(1, "stone_hoe", 1, 12, 1)],
    [buy("iron_ingot", 4, 12, 10), sell(36, "bell", 1, 12, 5)],
    [buy("flint", 30, 12, 20), sell(4, "diamond_hoe", 1, 12, 10)],
    [buy("diamond", 1, 12, 30)],
    [],
  ],
  butcher: [
    [buy("chicken", 14, 16, 2), buy("porkchop", 7, 16, 2), buy("rabbit", 4, 16, 2), sell(1, "rabbit_stew", 1, 12, 1)],
    [buy("coal", 15, 16, 2), sell(1, "cooked_porkchop", 5, 16, 5), sell(1, "cooked_chicken", 8, 16, 5)],
    [buy("mutton", 7, 16, 20), buy("beef", 10, 16, 20)],
    [buy("dried_kelp_block", 10, 12, 30)],
    [buy("sweet_berries", 10, 12, 30)],
  ],
  leatherworker: [
    [buy("leather", 6, 16, 2), sell(3, "leather_leggings", 1, 12, 1), sell(7, "leather_chestplate", 1, 12, 1)],
    [buy("flint", 26, 12, 10), sell(5, "leather_helmet", 1, 12, 5), sell(4, "leather_boots", 1, 12, 5)],
    [buy("rabbit_hide", 9, 12, 20), sell(7, "leather_chestplate", 1, 12, 10)],
    [buy("turtle_scute", 4, 12, 30), sell(6, "leather_horse_armor", 1, 12, 15)],
    [sell(6, "saddle", 1, 12, 30), sell(5, "leather_helmet", 1, 12, 30)],
  ],
  mason: [
    [buy("clay_ball", 10, 16, 2), sell(1, "brick", 10, 16, 1)],
    [buy("stone", 20, 16, 10), sell(1, "chiseled_stone_bricks", 4, 16, 5)],
    [buy("granite", 16, 16, 20), buy("andesite", 16, 16, 20), buy("diorite", 16, 16, 20), sell(1, "polished_andesite", 4, 16, 10), sell(1, "polished_diorite", 4, 16, 10), sell(1, "polished_granite", 4, 16, 10)],
    [buy("quartz", 12, 12, 30), sell(1, "white_terracotta", 1, 12, 15), sell(1, "white_glazed_terracotta", 1, 12, 15)],
    [sell(1, "quartz_pillar", 1, 12, 30), sell(1, "quartz_block", 1, 12, 30)],
  ],
};

/** @param {Trade} t */
export function tradeItems(t) {
  const ids = [t[0][0], t[2][0]];
  if (t[1]) ids.push(t[1][0]);
  return ids;
}
