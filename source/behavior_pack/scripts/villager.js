// @ts-check
// Item "Aldeão": guarda um aldeão real (com trocas, nível, nome e
// inventário) dentro de um item, usando o StructureManager para salvar a
// entidade completa e propriedades dinâmicas do item para o resumo.
import { ItemStack, StructureSaveMode, world } from "@minecraft/server";
import {
  BABY_AGE, BABY_VILLAGER_ITEM, BIOMES, NS, PROFESSIONS, PROF_NONE, VANILLA_VILLAGER, VILLAGER_ITEM,
} from "./constants.js";
import { waitTicks } from "./util.js";

/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */

/**
 * @typedef {object} VData
 * @property {string} [sid]     id da estrutura com a entidade salva
 * @property {number} prof      variante de profissão
 * @property {number} biome     variante de bioma
 * @property {boolean} baby
 * @property {number} age       idade estilo Java (<0 = bebê)
 * @property {string} [name]
 * @property {string[]} pending eventos a aplicar quando o aldeão for liberado
 */

const PROP = "ev:data";
export const CARRY_TAG = "ev_carry";
export const HOST_TAG = "ev_host";

const PROF_PT = ["Desempregado", "Fazendeiro", "Pescador", "Pastor", "Flecheiro", "Bibliotecário",
  "Cartógrafo", "Clérigo", "Armeiro", "Armeiro de armas", "Ferramenteiro", "Açougueiro", "Coureiro",
  "Pedreiro", "Bobo"];
const BIOME_PT = ["Planície", "Deserto", "Selva", "Savana", "Neve", "Pântano", "Taiga"];

/** @param {ItemStack | undefined} s */
export const isVillagerItem = (s) => !!s && (s.typeId === VILLAGER_ITEM || s.typeId === BABY_VILLAGER_ITEM);

/** @returns {VData} */
export function defaultData(baby = false) {
  return { prof: PROF_NONE, biome: 0, baby, age: baby ? BABY_AGE : 0, pending: [] };
}

/** VillagerData.getOrCreate */
export function readData(/** @type {ItemStack} */ stack) {
  if (stack.typeId === BABY_VILLAGER_ITEM) return defaultData(true);
  const raw = stack.getDynamicProperty(PROP);
  if (typeof raw === "string") {
    try {
      return /** @type {VData} */ ({ ...defaultData(), ...JSON.parse(raw) });
    } catch {
      /* dado corrompido: trata como aldeão novo */
    }
  }
  return defaultData();
}

/** Linhas de descrição (equivalente ao tooltip "Profissão (Nível)"). */
export function describe(/** @type {VData} */ d) {
  const lines = [`§7${PROF_PT[d.prof] ?? PROFESSIONS[d.prof]} (${BIOME_PT[d.biome] ?? BIOMES[d.biome]})`];
  if (d.baby) lines.push("§7Bebê");
  return lines;
}

/** Cria um item de aldeão com os dados. */
export function makeVillagerItem(/** @type {VData} */ d) {
  const s = new ItemStack(VILLAGER_ITEM, 1);
  writeData(s, d);
  return s;
}

/** @param {ItemStack} s @param {VData} d */
export function writeData(s, d) {
  s.setDynamicProperty(PROP, JSON.stringify(d));
  s.setLore(describe(d));
  if (d.name) s.nameTag = d.name;
}

/** Lê o resumo de uma entidade villager_v2 viva. */
export function summarize(/** @type {Entity} */ v) {
  /** @type {any} */
  const variant = v.getComponent("minecraft:variant");
  /** @type {any} */
  const mark = v.getComponent("minecraft:mark_variant");
  const baby = v.getComponent("minecraft:is_baby") !== undefined;
  /** @type {VData} */
  const d = {
    prof: Math.max(0, Math.min(14, variant?.value ?? 0)),
    biome: Math.max(0, Math.min(6, mark?.value ?? 0)),
    baby,
    age: baby ? BABY_AGE : 0,
    pending: [],
  };
  if (v.nameTag) d.name = v.nameTag;
  return d;
}

const newSid = () => `${NS}:v${Date.now().toString(36)}${Math.floor(Math.random() * 1e9).toString(36)}`;

/**
 * Captura um aldeão vivo num item (VillagerEvents.pickUp).
 * O aldeão é levado para o topo da coluna (área livre) para que a estrutura
 * salve somente ele, e então removido do mundo.
 * @param {Entity} v
 * @param {Partial<VData>} [keep] campos a preservar (ex.: auto, pending)
 * @returns {Promise<VData | undefined>}
 */
export async function captureVillager(v, keep = {}) {
  const dim = v.dimension;
  const d = { ...summarize(v), ...keep };
  const sid = newSid();
  const x = Math.floor(v.location.x);
  const z = Math.floor(v.location.z);
  const top = dim.heightRange.max - 1;
  const from = { x, y: top - 3, z };
  const back = { ...v.location };
  try {
    v.addTag(`${CARRY_TAG}:${sid}`);
    v.teleport({ x: x + 0.5, y: top - 2, z: z + 0.5 });
    await waitTicks(1);
    if (!v.isValid) return undefined;
    const others = dim.getEntities({ location: from, volume: { x: 1, y: 4, z: 1 } })
      .filter((e) => e.id !== v.id && e.typeId !== "minecraft:player");
    for (const o of others) o.teleport({ x: x + 0.5, y: top - 6, z: z + 0.5 });
    world.structureManager.createFromWorld(sid, dim, from, { x, y: top, z },
      { includeBlocks: false, includeEntities: true, saveMode: StructureSaveMode.World });
    v.remove();
    for (const o of others) if (o.isValid) o.teleport(back);
    d.sid = sid;
    return d;
  } catch (e) {
    console.warn(`[${NS}] falha ao capturar aldeão: ${e}`);
    if (v.isValid) {
      v.removeTag(`${CARRY_TAG}:${sid}`);
      v.teleport(back);
    }
    return undefined;
  }
}

/**
 * Libera o aldeão de um item no mundo (VillagerItem.useOn / createEasyVillager),
 * aplicando as alterações acumuladas (profissão, crescimento, nome).
 * @param {VData} d
 * @param {Dimension} dim
 * @param {Vector3} loc
 * @returns {Promise<Entity | undefined>}
 */
export async function releaseVillager(d, dim, loc) {
  /** @type {Entity | undefined} */
  let ent;
  const sm = world.structureManager;
  if (d.sid && sm.get(d.sid)) {
    const base = { x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) };
    sm.place(d.sid, dim, base, { includeBlocks: false, includeEntities: true });
    const tag = `${CARRY_TAG}:${d.sid}`;
    for (let i = 0; i < 10 && !ent; i++) {
      await waitTicks(1);
      ent = dim.getEntities({ type: VANILLA_VILLAGER, tags: [tag], location: { x: base.x + 0.5, y: base.y + 2, z: base.z + 0.5 }, maxDistance: 8 })[0];
    }
    if (!ent) {
      console.warn(`[${NS}] aldeão da estrutura ${d.sid} não apareceu`);
      return undefined;
    }
    ent.removeTag(tag);
    ent.teleport(loc);
    sm.delete(d.sid);
  } else {
    ent = dim.spawnEntity(VANILLA_VILLAGER, loc, d.baby ? { spawnEvent: "minecraft:entity_born" } : undefined);
    await waitTicks(1);
    if (!ent.isValid) return undefined;
    if (!d.baby && ent.getComponent("minecraft:is_baby")) ent.triggerEvent("minecraft:ageable_grow_up");
  }
  applyPending(ent, d);
  return ent;
}

/** Aplica eventos pendentes e o crescimento registrado nos blocos. */
export function applyPending(/** @type {Entity} */ ent, /** @type {VData} */ d) {
  for (const ev of d.pending) {
    try {
      ent.triggerEvent(ev);
    } catch (e) {
      console.warn(`[${NS}] evento ${ev} falhou: ${e}`);
    }
  }
  d.pending = [];
  if (!d.baby && ent.getComponent("minecraft:is_baby")) {
    try {
      ent.triggerEvent("minecraft:ageable_grow_up");
    } catch { /* ignorado */ }
  }
  if (d.name) ent.nameTag = d.name;
}

/** Evento vanilla que dá uma profissão a um villager_v2. */
export const professionEvent = (/** @type {number} */ prof) => `minecraft:spawn_${PROFESSIONS[prof]}`;

/**
 * Atribui profissão a um aldeão desempregado (fixProfession / onAddVillager).
 * No Java a condição é "XP <= 0 e não é bobo"; no Bedrock o XP não é legível,
 * então só aldeões desempregados recebem a nova profissão.
 * @returns {boolean} true se mudou
 */
export function assignProfession(/** @type {VData} */ d, /** @type {number} */ prof) {
  if (d.prof !== PROF_NONE || prof <= 0) return false;
  d.prof = prof;
  d.pending = d.pending.filter((e) => !e.startsWith("minecraft:spawn_"));
  d.pending.push(professionEvent(prof));
  return true;
}

/** Remove os efeitos de hospedagem antes de guardar/liberar um aldeão. */
export function unhost(/** @type {Entity} */ v) {
  for (const e of ["invisibility", "slowness", "resistance"]) {
    try { v.removeEffect(e); } catch { /* ignorado */ }
  }
  v.removeTag(HOST_TAG);
}
