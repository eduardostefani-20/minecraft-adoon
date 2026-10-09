// @ts-check
// "Máquina com conteúdo": guarda aldeões, itens e estado dentro do item do
// bloco ao quebrar (equivalente ao copy_block_entity do Java / caixa de
// shulker do Bedrock). Itens comuns empilham e não aceitam dados, então uma
// máquina com conteúdo cai como o item não empilhável `<bloco>_packed`.
import { ItemStack } from "@minecraft/server";
import { NS, VILLAGER_ITEM } from "./constants.js";
import { describe, readData, isVillagerItem } from "./villager.js";

/** @typedef {{v?: string, n?: string, id?: string, a?: number}} ItemRec */
/**
 * @typedef {object} Packed
 * @property {string} kind
 * @property {Record<string, number>} st   estado numérico (estação, cultura, temporizadores)
 * @property {Array<[number, ItemRec]>} items
 * @property {import("./villager.js").VData} [host] aldeão hospedado (Comerciante)
 */

const PROP = "ev:packed";
export const packedId = (/** @type {string} */ kind) => `${NS}:${kind}_packed`;

/**
 * Converte uma pilha em registro serializável, ou undefined se ela tiver
 * dados que não podem ser recriados por script (encantamentos, poções,
 * durabilidade, nomes, descrição).
 * @param {ItemStack} it
 * @returns {ItemRec | undefined}
 */
export function serializeItem(it) {
  if (isVillagerItem(it)) {
    const raw = it.getDynamicProperty("ev:data");
    return { v: typeof raw === "string" ? raw : JSON.stringify(readData(it)), n: it.nameTag };
  }
  if (it.nameTag || it.getLore().length || it.getDynamicPropertyIds().length) return undefined;
  try {
    /** @type {any} */
    const ench = it.getComponent("minecraft:enchantable");
    if (ench && ench.getEnchantments().length) return undefined;
    /** @type {any} */
    const dur = it.getComponent("minecraft:durability");
    if (dur && dur.damage > 0) return undefined;
    if (it.getComponent("minecraft:potion")) return undefined;
  } catch {
    return undefined;
  }
  return { id: it.typeId, a: it.amount };
}

/** @param {ItemRec} r */
export function deserializeItem(r) {
  try {
    if (r.v !== undefined) {
      const s = new ItemStack(VILLAGER_ITEM, 1);
      s.setDynamicProperty("ev:data", r.v);
      s.setLore(describe(readData(s)));
      if (r.n) s.nameTag = r.n;
      return s;
    }
    if (r.id) return new ItemStack(r.id, r.a ?? 1);
  } catch { /* item inexistente */ }
  return undefined;
}

/** @param {Packed} p */
export function isEmptyPack(p) {
  return !p.items.length && !p.host && !p.st.ws && !p.st.crop;
}

/** Cria o item da máquina cheia. */
export function makePackedItem(/** @type {Packed} */ p) {
  const s = new ItemStack(packedId(p.kind), 1);
  s.setDynamicProperty(PROP, JSON.stringify(p));
  /** @type {string[]} */
  const lore = [];
  const villagers = p.items.filter(([, r]) => r.v !== undefined).map(([, r]) => describe(readData(fake(r)))[0]);
  if (p.host) villagers.unshift(describe(p.host)[0]);
  lore.push(...villagers);
  const others = p.items.filter(([, r]) => r.v === undefined).reduce((n, [, r]) => n + (r.a ?? 1), 0);
  if (others) lore.push(`§7+${others} itens`);
  s.setLore(lore.slice(0, 8));
  return s;
}

/** Pilha temporária só para ler dados de aldeão de um registro. */
function fake(/** @type {ItemRec} */ r) {
  const s = new ItemStack(VILLAGER_ITEM, 1);
  if (r.v) s.setDynamicProperty("ev:data", r.v);
  return s;
}

/** @param {ItemStack} it @returns {Packed | undefined} */
export function readPacked(it) {
  const raw = it.getDynamicProperty(PROP);
  if (typeof raw !== "string") return undefined;
  try { return JSON.parse(raw); } catch { return undefined; }
}

/** @param {ItemStack | undefined} it */
export const isPackedItem = (it) => !!it && it.typeId.startsWith(`${NS}:`) && it.typeId.endsWith("_packed");
