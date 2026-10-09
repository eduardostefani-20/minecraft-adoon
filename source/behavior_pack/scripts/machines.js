// @ts-check
// Máquinas (blocos com aldeão) — equivalentes aos *Block e *Tileentity Java.
//
// Cada bloco tem uma entidade invisível-ao-toque "easy_villagers:display"
// (papel "machine") que: (1) desenha o aldeão em miniatura, (2) guarda o
// inventário da máquina (12 espaços) e (3) guarda o estado em propriedade
// dinâmica. Isso emula a "block entity" do Java, que blocos personalizados do
// Bedrock não possuem.
import { world } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { cfg } from "./config.js";
import {
  BABY_AGE, CROPS, DISPLAY_ENTITY, FOOD_POINTS, NS, PROFESSIONS, PROF_FARMER, PROF_NITWIT, PROF_NONE,
  SLOT, TICK_STEP, VANILLA_VILLAGER, WORKSTATIONS, cropForSeed, workstationForItem,
} from "./constants.js";
import {
  addAutoXp, advanceAge, converterTimes, cropDrops, crossed, displayYaw, foodValue, golemDrops,
  golemTimes, incubatorStep, newAutoState, planFoodRemoval, restockDelay, rotateOffset, tradeOf,
} from "./logic.js";
import { itemLabel, itemList, lines, profName, showForm, tr } from "./ui.js";
import {
  center, consumeHeld, countItem, dist2, dropItem, fitsAll, giveToPlayer, insertInto, isCreative,
  itemExists, makeStack, moveSlotsToPlayer, playSound, playerContainer, randomVillagerSound, removeItem,
  rng, waitTicks,
} from "./util.js";
import {
  HOST_TAG, applyPending, assignProfession, captureVillager, isVillagerItem, makeVillagerItem, readData,
  releaseVillager, summarize, unhost, writeData,
} from "./villager.js";

/** @typedef {import("@minecraft/server").Block} Block */
/** @typedef {import("@minecraft/server").ItemStack} ItemStack */
/** @typedef {import("@minecraft/server").Entity} Entity */
/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Container} Container */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("./villager.js").VData} VData */

/**
 * @typedef {object} State
 * @property {string} kind
 * @property {number} timer
 * @property {number} cd        contador genérico (criação/troca automática)
 * @property {number} rt        ticks desde o último reabastecimento
 * @property {number} nr        próximo reabastecimento
 * @property {number} ti        índice da troca escolhida (Comerciante Automático)
 * @property {number} ws        estação de trabalho (= profissão)
 * @property {number} crop
 * @property {number} age       idade da cultura
 * @property {string} [host]    id do aldeão hospedado (Comerciante)
 * @property {number} miss
 * @property {Record<string, string>} aux
 */

// Posições das miniaturas: [x, z, rotaçãoExtra, escala%] (dos renderizadores Java)
/** @type {Record<string, {main: number[], aux?: Record<string, number[]>}>} */
const LAYOUT = {
  trader: { main: [0, -0.25, 0, 45] },
  auto_trader: { main: [0, -0.25, 0, 45] },
  farmer: { main: [0, -0.25, 0, 45] },
  breeder: { main: [-0.3125, 0, 90, 45], aux: { v2: [0.3125, 0, -90, 45] } },
  converter: { main: [-0.3125, 0, 90, 40], aux: { z: [0.3125, 0, -90, 40] } },
  iron_farm: { main: [-0.3125, -0.3125, 90, 30], aux: { z: [0.3125, -0.3125, -90, 30], g: [0, 0.1875, 0, 30] } },
  incubator: { main: [0, 0, 0, 45] },
  inventory_viewer: { main: [0, 0, 0, 45] },
};
const AUX_KIND = { v2: 1, z: 2, g: 3 };
const HAS_OUTPUT = new Set(["auto_trader", "farmer", "breeder", "converter", "iron_farm", "incubator"]);
const HAS_INPUT = new Set(["auto_trader", "breeder", "converter", "incubator"]);

const P = (/** @type {string} */ n) => `${NS}:${n}`;
const ROLE = "ev:role";
const ANCHOR = "ev:anchor";
const STATE = "ev:state";
const OWNER = "ev:owner";

/** @type {Map<string, string>} chave do bloco -> id da entidade-máquina */
const cache = new Map();
/** Máquinas com operação assíncrona em andamento. */
const busy = new Set();

/** @param {Dimension} dim @param {Vector3} l */
export const keyOf = (dim, l) => `${dim.id}|${l.x},${l.y},${l.z}`;

/** @param {Block} b */
export const kindOf = (b) => b.typeId.startsWith(`${NS}:`) ? b.typeId.slice(NS.length + 1) : "";

/** @param {Block} b */
export const isMachineBlock = (b) => b.hasTag(`${NS}:machine`);

/** @param {Block} b */
function facing(b) {
  try {
    return String(b.permutation.getState("minecraft:cardinal_direction") ?? "north");
  } catch {
    return "north";
  }
}

/** @param {Entity} e @returns {State} */
function loadState(e) {
  /** @type {State} */
  const s = { kind: "", timer: 0, cd: 0, rt: 0, nr: 0, ti: 0, ws: 0, crop: 0, age: 0, miss: 0, aux: {} };
  const raw = e.getDynamicProperty(STATE);
  if (typeof raw === "string") {
    try { Object.assign(s, JSON.parse(raw)); } catch { /* estado corrompido */ }
  }
  return s;
}
const saveState = (/** @type {Entity} */ e, /** @type {State} */ s) => e.setDynamicProperty(STATE, JSON.stringify(s));

/** @param {Entity} e */
const containerOf = (e) => e.getComponent("minecraft:inventory")?.container;

/** Posição de uma miniatura no mundo. */
function displayPos(/** @type {Block} */ b, /** @type {number[]} */ spec) {
  const o = rotateOffset(facing(b), spec[0], spec[1]);
  return { x: b.location.x + 0.5 + o.x, y: b.location.y + 0.0625, z: b.location.z + 0.5 + o.z };
}

/** Procura a entidade-máquina de um bloco. */
export function findMachine(/** @type {Block} */ b) {
  const key = keyOf(b.dimension, b.location);
  const id = cache.get(key);
  if (id) {
    const e = world.getEntity(id);
    if (e?.isValid) return e;
    cache.delete(key);
  }
  for (const e of b.dimension.getEntitiesAtBlockLocation(b.location)) {
    if (e.typeId === DISPLAY_ENTITY && e.getDynamicProperty(ROLE) === "machine") {
      const a = /** @type {Vector3|undefined} */ (e.getDynamicProperty(ANCHOR));
      if (a && a.x === b.location.x && a.y === b.location.y && a.z === b.location.z) {
        cache.set(key, e.id);
        return e;
      }
    }
  }
  return undefined;
}

/** Cria a entidade-máquina (BlockEntity) do bloco. */
export function createMachine(/** @type {Block} */ b) {
  const existing = findMachine(b);
  if (existing) return existing;
  const kind = kindOf(b);
  const lay = LAYOUT[kind];
  if (!lay) return undefined;
  const e = b.dimension.spawnEntity(DISPLAY_ENTITY, displayPos(b, lay.main));
  e.setDynamicProperty(ROLE, "machine");
  e.setDynamicProperty(ANCHOR, b.location);
  e.setRotation({ x: 0, y: displayYaw(facing(b), lay.main[2]) });
  e.setProperty(P("scale"), lay.main[3]);
  e.setProperty(P("kind"), 0);
  const s = loadState(e);
  s.kind = kind;
  s.nr = restockDelay(cfg().trader_min_restock_time, cfg().trader_max_restock_time, rng);
  saveState(e, s);
  cache.set(keyOf(b.dimension, b.location), e.id);
  ensureAux(b, e, s);
  return e;
}

/** Garante as miniaturas auxiliares (2º aldeão, zumbi, golem). */
function ensureAux(/** @type {Block} */ b, /** @type {Entity} */ m, /** @type {State} */ s) {
  const lay = LAYOUT[s.kind];
  if (!lay.aux) return;
  for (const [name, spec] of Object.entries(lay.aux)) {
    let a = s.aux[name] ? world.getEntity(s.aux[name]) : undefined;
    if (a?.isValid) continue;
    a = b.dimension.spawnEntity(DISPLAY_ENTITY, displayPos(b, spec));
    a.setDynamicProperty(ROLE, "aux");
    a.setDynamicProperty(ANCHOR, b.location);
    a.setDynamicProperty(OWNER, m.id);
    a.setRotation({ x: 0, y: displayYaw(facing(b), spec[2]) });
    a.setProperty(P("scale"), spec[3]);
    a.setProperty(P("kind"), name === "z" ? 2 : 0);
    s.aux[name] = a.id;
  }
}

/** Atualiza a aparência de uma miniatura de aldeão. */
function showVillager(/** @type {Entity | undefined} */ e, /** @type {VData | undefined} */ d, zombified = false) {
  if (!e?.isValid) return;
  const show = !!d && cfg().render_block_contents;
  setProp(e, "kind", show ? 1 : 0);
  if (d) {
    setProp(e, "profession", d.prof);
    setProp(e, "biome", d.biome);
    setProp(e, "baby", d.baby);
    setProp(e, "zombified", zombified);
  }
}

/** setProperty apenas quando muda (economiza sincronização de rede). */
function setProp(/** @type {Entity} */ e, /** @type {string} */ name, /** @type {number|boolean} */ v) {
  if (e.getProperty(P(name)) !== v) e.setProperty(P(name), v);
}

/** Altera um estado do bloco, se diferente. */
function setBlockState(/** @type {Block} */ b, /** @type {string} */ state, /** @type {number} */ v) {
  try {
    const perm = /** @type {any} */ (b.permutation);
    if (perm.getState(P(state)) !== v) b.setPermutation(perm.withState(P(state), v));
  } catch (e) {
    console.warn(`[${NS}] estado ${state} inválido: ${e}`);
  }
}

const auxEntity = (/** @type {State} */ s, /** @type {string} */ n) => (s.aux[n] ? world.getEntity(s.aux[n]) : undefined);

// ---------------------------------------------------------------------------
// Tick (componente minecraft:tick a cada 20 ticks)
// ---------------------------------------------------------------------------

/** @param {Block} b */
export function tickMachine(b) {
  const key = keyOf(b.dimension, b.location);
  if (busy.has(key)) return;
  let m = findMachine(b);
  if (!m) {
    // Entidades podem carregar um pouco depois do bloco; só recria após 3 s.
    const n = (missing.get(key) ?? 0) + 1;
    missing.set(key, n);
    if (n < 3) return;
    m = createMachine(b);
    if (!m) return;
  }
  missing.delete(key);
  const c = containerOf(m);
  if (!c) return;
  const s = loadState(m);
  ensureAux(b, m, s);
  const before = JSON.stringify(s);
  const ctx = { b, m, c, s, dim: b.dimension, pos: center(b.location) };
  switch (s.kind) {
    case "trader": tickTrader(ctx); break;
    case "auto_trader": tickAutoTrader(ctx); break;
    case "farmer": tickFarmer(ctx); break;
    case "breeder": tickBreeder(ctx); break;
    case "converter": tickConverter(ctx); break;
    case "iron_farm": tickIronFarm(ctx); break;
    case "incubator": tickIncubator(ctx); break;
    case "inventory_viewer": tickViewer(ctx); break;
  }
  if (cfg().hopper_automation) hoppers(ctx);
  if (JSON.stringify(s) !== before) saveState(m, s);
}
/** @type {Map<string, number>} */
const missing = new Map();

/** @typedef {{b: Block, m: Entity, c: Container, s: State, dim: Dimension, pos: Vector3}} Ctx */

/** Envelhece um aldeão guardado num espaço; retorna os dados. */
function ageSlot(/** @type {Container} */ c, /** @type {number} */ slot, /** @type {number} */ amount = TICK_STEP) {
  const it = c.getItem(slot);
  if (!isVillagerItem(it) || !it) return undefined;
  const d = readData(it);
  if (d.baby) {
    const r = advanceAge(d.age, amount);
    d.age = r.age;
    if (r.grewUp) d.baby = false;
    writeData(it, d);
    c.setItem(slot, it);
  }
  return d;
}

/** @param {Ctx} x */
function tickTrader(x) {
  const { s, dim, b, m } = x;
  /** @type {Entity | undefined} */
  let v = s.host ? world.getEntity(s.host) : undefined;
  if (s.host && !v?.isValid) {
    s.miss++;
    if (s.miss >= 5) {
      v = dim.getEntities({ type: VANILLA_VILLAGER, tags: [HOST_TAG], location: x.pos, maxDistance: 1.5 })[0];
      if (v) s.host = v.id; else delete s.host;
      s.miss = 0;
    }
    if (!v) { showVillager(m, undefined); return; }
  }
  s.miss = 0;
  if (!v) { showVillager(m, undefined); return; }
  const anchor = { x: b.location.x + 0.5, y: b.location.y + 0.0625, z: b.location.z + 0.5 };
  if (dist2(v.location, anchor) > 0.04) v.teleport(anchor, { rotation: { x: 0, y: displayYaw(facing(b), 0) } });
  hostEffects(v);
  const d = summarize(v);
  showVillager(m, d);
  randomVillagerSound(dim, x.pos, "mob.villager.idle");
  s.rt += TICK_STEP;
  if (s.rt > s.nr && s.ws > 0 && d.prof === s.ws) {
    try { v.triggerEvent("minecraft:resupply_trades"); } catch { /* ignorado */ }
    const ws = WORKSTATIONS[d.prof];
    if (ws) playSound(dim, x.pos, ws.sound);
    s.rt = 0;
    s.nr = restockDelay(cfg().trader_min_restock_time, cfg().trader_max_restock_time, rng);
  }
}

/** Efeitos que mantêm o aldeão hospedado invisível, parado e protegido. */
function hostEffects(/** @type {Entity} */ v) {
  for (const [id, amp] of /** @type {[string, number][]} */ ([["invisibility", 0], ["slowness", 255], ["resistance", 255]])) {
    const cur = v.getEffect(id);
    if (!cur || cur.duration < 600) v.addEffect(id, 20000, { amplifier: amp, showParticles: false });
  }
}

/** @param {Ctx} x */
function tickAutoTrader(x) {
  const { c, s, dim, m } = x;
  const it = c.getItem(SLOT.VILLAGER);
  const d = ageSlot(c, SLOT.VILLAGER);
  showVillager(m, d);
  if (!d || !it) return;
  randomVillagerSound(dim, x.pos, "mob.villager.idle");
  ensureAuto(c, d);
  s.cd += TICK_STEP;
  if (s.cd >= cfg().auto_trader_cooldown) {
    s.cd = 0;
    autoTrade(x, d);
  }
  s.rt += TICK_STEP;
  if (s.rt > s.nr && s.ws > 0 && d.prof === s.ws && d.auto) {
    for (const t of d.auto.trades) t.u = 0;
    saveVillager(c, d);
    const ws = WORKSTATIONS[d.prof];
    if (ws) playSound(dim, x.pos, ws.sound);
    s.rt = 0;
    s.nr = restockDelay(cfg().auto_trader_min_restock_time, cfg().auto_trader_max_restock_time, rng);
  }
}

/** Grava os dados de volta no item do aldeão principal. */
function saveVillager(/** @type {Container} */ c, /** @type {VData} */ d, slot = SLOT.VILLAGER) {
  const it = c.getItem(slot);
  if (!it) return;
  writeData(it, d);
  c.setItem(slot, it);
}

/** Cria o mercador virtual quando o aldeão tem profissão. */
function ensureAuto(/** @type {Container} */ c, /** @type {VData} */ d) {
  if (d.auto || d.baby || d.prof === PROF_NONE || d.prof === PROF_NITWIT) return;
  d.auto = newAutoState(d.prof, rng, itemExists);
  saveVillager(c, d);
}

/** AutoTraderTileentity.tick: faz uma troca com os itens de entrada. */
function autoTrade(/** @type {Ctx} */ x, /** @type {VData} */ d) {
  const { c, s } = x;
  if (!d.auto || d.baby) return;
  const ref = d.auto.trades[s.ti];
  const t = ref && tradeOf(ref, d.prof);
  if (!ref || !t || ref.u >= t[3]) return;
  if (countItem(c, SLOT.INPUT, t[0][0]) < t[0][1]) return;
  if (t[1] && countItem(c, SLOT.INPUT, t[1][0]) < t[1][1] + (t[1][0] === t[0][0] ? t[0][1] : 0)) return;
  const result = makeStack(t[2][0], t[2][1]);
  if (!result || !fitsAll(c, SLOT.OUTPUT, [result])) return;
  removeItem(c, SLOT.INPUT, t[0][0], t[0][1]);
  if (t[1]) removeItem(c, SLOT.INPUT, t[1][0], t[1][1]);
  insertInto(c, SLOT.OUTPUT, result);
  ref.u++;
  if (addAutoXp(d.auto, d.prof, t[4], rng, itemExists)) playSound(x.dim, x.pos, "random.levelup");
  saveVillager(c, d);
}

/** @param {Ctx} x */
function tickFarmer(x) {
  const { c, s, dim, b, m } = x;
  const d = ageSlot(c, SLOT.VILLAGER);
  showVillager(m, d);
  if (d) randomVillagerSound(dim, x.pos, "mob.villager.idle");
  if (!s.crop || Math.floor(Math.random() * cfg().farm_speed) !== 0) return;
  const crop = CROPS[s.crop];
  if (!crop) return;
  if (s.age < crop.maxAge) {
    s.age++;
  } else if (d && !d.baby && d.prof === PROF_FARMER) {
    for (const [id, n] of cropDrops(s.crop, rng)) {
      const st = makeStack(id, n);
      if (st) insertInto(c, SLOT.OUTPUT, st);
    }
    s.age = 0;
    playSound(dim, x.pos, WORKSTATIONS[PROF_FARMER]?.sound ?? "dig.grass");
  }
  setBlockState(b, "stage", s.age);
}

/** @param {Ctx} x */
function tickBreeder(x) {
  const { c, s, dim, m } = x;
  const d1 = ageSlot(c, SLOT.VILLAGER);
  const d2 = ageSlot(c, SLOT.VILLAGER2);
  showVillager(m, d1);
  showVillager(auxEntity(s, "v2"), d2);
  if (d1 || d2) randomVillagerSound(dim, x.pos, "mob.villager.idle");
  s.cd += TICK_STEP;
  if (s.cd < cfg().breeding_time) return;
  s.cd = 0;
  if (!d1 || !d2 || d1.baby || d2.baby) return;
  const view = SLOT.INPUT.map((i) => { const it = c.getItem(i); return it ? { id: it.typeId, amount: it.amount } : undefined; });
  if (foodValue(view) < 24) return;
  const plan = planFoodRemoval(view);
  if (!plan) return;
  /** @type {VData} */
  const baby = { prof: PROF_NONE, biome: biomeIndex(dim, x.b.location), baby: true, age: BABY_AGE, pending: [] };
  const babyItem = makeVillagerItem(baby);
  if (!fitsAll(c, SLOT.OUTPUT, [babyItem])) return;
  plan.forEach((n, i) => {
    if (n <= 0) return;
    const slot = SLOT.INPUT[i];
    const it = c.getItem(slot);
    if (!it) return;
    if (it.amount <= n) c.setItem(slot, undefined);
    else { it.amount -= n; c.setItem(slot, it); }
  });
  insertInto(c, SLOT.OUTPUT, babyItem);
  playSound(dim, x.pos, "mob.villager.yes");
  for (let i = 0; i < 5; i++) {
    dim.spawnParticle("minecraft:heart_particle", {
      x: x.b.location.x + 0.5 + (Math.random() - 0.5), y: x.b.location.y + 1 + Math.random(), z: x.b.location.z + 0.5 + (Math.random() - 0.5),
    });
  }
}

/** VillagerType.byBiome */
function biomeIndex(/** @type {Dimension} */ dim, /** @type {Vector3} */ loc) {
  let id = "";
  try { id = dim.getBiome(loc).id; } catch { return 0; }
  if (/swamp|mangrove/.test(id)) return 5;
  if (/snow|ice|frozen|cold/.test(id)) return 4;
  if (/desert|mesa|badlands/.test(id)) return 1;
  if (/jungle|bamboo/.test(id)) return 2;
  if (/savanna/.test(id)) return 3;
  if (/taiga|grove/.test(id)) return 6;
  return 0;
}

/** Poção (normal, arremesso ou prolongada) de Fraqueza? (ConverterTileentity.isWeakness) */
export function isWeakness(/** @type {ItemStack | undefined} */ it) {
  if (!it) return false;
  try {
    /** @type {any} */
    const p = it.getComponent("minecraft:potion");
    return !!p && String(p.potionEffectType?.id ?? "").includes("weakness");
  } catch {
    return false;
  }
}

/** VillagerConvertSlot.isValid */
const convertValid = (/** @type {ItemStack} */ it) => isVillagerItem(it) || it.typeId === "minecraft:golden_apple" || isWeakness(it);

/** @param {Ctx} x */
function tickConverter(x) {
  const { c, s, dim, m } = x;
  const T = converterTimes(cfg().converting_time);
  if (s.timer <= 0 && !c.getItem(SLOT.VILLAGER)) {
    const apple = SLOT.INPUT.find((i) => c.getItem(i)?.typeId === "minecraft:golden_apple");
    const potion = SLOT.INPUT.find((i) => isWeakness(c.getItem(i)));
    const vil = SLOT.INPUT.find((i) => isVillagerItem(c.getItem(i)));
    if (apple !== undefined && potion !== undefined && vil !== undefined) {
      const v = c.getItem(vil);
      c.setItem(vil, undefined);
      c.setItem(SLOT.VILLAGER, v);
      for (const slot of [apple, potion]) {
        const it = c.getItem(slot);
        if (!it) continue;
        if (it.amount <= 1) c.setItem(slot, undefined); else { it.amount--; c.setItem(slot, it); }
      }
    }
  }
  const d = ageSlot(c, SLOT.VILLAGER);
  if (!d) {
    s.timer = 0;
    showVillager(m, undefined);
    return;
  }
  const prev = s.timer;
  if (prev >= T.finalize) {
    const free = SLOT.OUTPUT.find((i) => !c.getItem(i));
    if (free !== undefined) {
      c.setItem(free, c.getItem(SLOT.VILLAGER));
      c.setItem(SLOT.VILLAGER, undefined);
      s.timer = 0;
      showVillager(m, undefined);
      return;
    }
  }
  s.timer += TICK_STEP;
  if (crossed(prev, s.timer, T.zombify)) playSound(dim, x.pos, "mob.zombie_villager.say");
  else if (crossed(prev, s.timer, T.cure)) playSound(dim, x.pos, "mob.zombie.remedy");
  else if (crossed(prev, s.timer, T.convert)) playSound(dim, x.pos, "mob.zombie.unfect");
  const zombie = s.timer >= T.zombify && s.timer < T.convert;
  randomVillagerSound(dim, x.pos, zombie ? "mob.zombie_villager.say" : "mob.villager.idle");
  randomVillagerSound(dim, x.pos, "mob.zombie.say");
  showVillager(m, d, zombie);
}

/** @param {Ctx} x */
function tickIronFarm(x) {
  const { c, s, dim, m } = x;
  const d = ageSlot(c, SLOT.VILLAGER);
  showVillager(m, d);
  const golem = auxEntity(s, "g");
  if (!d) {
    if (golem?.isValid) setProp(golem, "kind", 0);
    return;
  }
  randomVillagerSound(dim, x.pos, "mob.villager.idle");
  randomVillagerSound(dim, x.pos, "mob.zombie.say");
  const T = golemTimes(cfg().golem_spawn_time);
  const prev = s.timer;
  s.timer += TICK_STEP;
  if (crossed(prev, s.timer, T.spawn)) playSound(dim, x.pos, "mob.zombie.say");
  if (s.timer > T.spawn && s.timer < T.kill) playSound(dim, x.pos, "mob.irongolem.hit");
  else if (s.timer >= T.kill) {
    playSound(dim, x.pos, "mob.irongolem.death");
    for (const [id, n] of golemDrops(rng)) {
      const st = makeStack(id, n);
      if (st) insertInto(c, SLOT.OUTPUT, st);
    }
    s.timer = 0;
  }
  if (golem?.isValid) {
    const visible = s.timer >= T.spawn && s.timer < T.kill && cfg().render_block_contents;
    setProp(golem, "kind", visible ? 3 : 0);
    setProp(golem, "hurt", visible);
  }
}

/** @param {Ctx} x */
function tickIncubator(x) {
  const { c, dim, m } = x;
  if (!c.getItem(SLOT.VILLAGER)) {
    const vil = SLOT.INPUT.find((i) => isVillagerItem(c.getItem(i)));
    if (vil !== undefined) {
      c.setItem(SLOT.VILLAGER, c.getItem(vil));
      c.setItem(vil, undefined);
    }
  }
  const it = c.getItem(SLOT.VILLAGER);
  if (!it) { showVillager(m, undefined); return; }
  const d = readData(it);
  randomVillagerSound(dim, x.pos, "mob.villager.idle");
  let amount = 0;
  let age = d.age;
  for (let i = 0; i < TICK_STEP; i++) {
    const step = incubatorStep(age, cfg().incubator_speed);
    age += step;
    amount += step;
  }
  const r = advanceAge(d.age, amount);
  d.age = r.age;
  if (r.grewUp || d.age >= 0) d.baby = false;
  writeData(it, d);
  if (d.age > 20) {
    if (fitsAll(c, SLOT.OUTPUT, [it])) {
      d.age = 0;
      writeData(it, d);
      insertInto(c, SLOT.OUTPUT, it);
      c.setItem(SLOT.VILLAGER, undefined);
      showVillager(m, undefined);
      return;
    }
  }
  c.setItem(SLOT.VILLAGER, it);
  showVillager(m, d);
}

/** @param {Ctx} x */
function tickViewer(x) {
  const d = x.c.getItem(SLOT.VILLAGER) ? readData(/** @type {ItemStack} */ (x.c.getItem(SLOT.VILLAGER))) : undefined;
  showVillager(x.m, d);
  if (d) randomVillagerSound(x.dim, x.pos, "mob.villager.idle");
}

/** Validação de entrada por máquina (slots de entrada dos containers Java). */
function inputValid(/** @type {string} */ kind, /** @type {ItemStack} */ it) {
  switch (kind) {
    case "breeder": return (FOOD_POINTS[/** @type {keyof typeof FOOD_POINTS} */ (it.typeId)] ?? 0) > 0;
    case "converter": return convertValid(it);
    case "incubator": return isVillagerItem(it);
    case "auto_trader": return true;
    default: return false;
  }
}

/** Automação com funis: saída -> recipiente abaixo; funil acima -> entradas. */
function hoppers(/** @type {Ctx} */ x) {
  const { b, c, s } = x;
  if (HAS_OUTPUT.has(s.kind)) {
    const below = b.below();
    const inv = below?.getComponent("minecraft:inventory")?.container;
    if (inv) {
      for (const slot of SLOT.OUTPUT) {
        const it = c.getItem(slot);
        if (!it) continue;
        c.setItem(slot, inv.addItem(it));
      }
    }
  }
  if (HAS_INPUT.has(s.kind)) {
    const above = b.above();
    if (above?.typeId === "minecraft:hopper" && above.permutation.getState("facing_direction") === 0) {
      const inv = above.getComponent("minecraft:inventory")?.container;
      if (!inv) return;
      for (let i = 0; i < inv.size; i++) {
        const it = inv.getItem(i);
        if (!it || !inputValid(s.kind, it)) continue;
        inv.setItem(i, insertInto(c, SLOT.INPUT, it));
        break; // um tipo de item por segundo, como um funil lento
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Interação (useItemOn / useWithoutItem)
// ---------------------------------------------------------------------------

/**
 * @param {Player} p
 * @param {Block} b
 * @param {boolean} fromVillager interação veio do aldeão hospedado
 * @returns {"handled" | "trade"}
 */
export function interact(p, b, fromVillager = false) {
  const key = keyOf(b.dimension, b.location);
  if (busy.has(key)) return "handled";
  const m = findMachine(b) ?? createMachine(b);
  if (!m) return "handled";
  const c = containerOf(m);
  if (!c) return "handled";
  const s = loadState(m);
  const held = playerContainer(p)?.getItem(p.selectedSlotIndex);
  const sneaking = p.isSneaking;
  const front = frontPos(b);
  const ctx = { b, m, c, s, dim: b.dimension, pos: center(b.location) };
  /** @type {"handled" | "trade"} */
  let result = "handled";
  if (sneaking && held) return fromVillager ? "trade" : "handled";
  switch (s.kind) {
    case "trader":
    case "auto_trader":
      result = interactTrader(ctx, p, held, sneaking, front, fromVillager);
      break;
    case "farmer": interactFarmer(ctx, p, held, sneaking, front); break;
    case "breeder": interactBreeder(ctx, p, held, sneaking, front); break;
    case "iron_farm": interactSimple(ctx, p, held, sneaking, front, "mob.villager.no"); break;
    case "inventory_viewer": interactSimple(ctx, p, held, sneaking, front, "mob.villager.yes"); break;
    case "converter":
    case "incubator":
      if (held && inputValid(s.kind, held)) insertHeld(ctx, p, held);
      else void openMenu(ctx, p);
      break;
  }
  saveState(m, s);
  return result;
}

/** Ponto em frente ao bloco (onde o Java derruba itens). */
function frontPos(/** @type {Block} */ b) {
  const o = rotateOffset(facing(b), 0, 1);
  return { x: b.location.x + 0.5 + o.x, y: b.location.y + 0.5, z: b.location.z + 0.5 + o.z };
}

/** Coloca o item da mão nas entradas. */
function insertHeld(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack} */ held) {
  const rest = insertInto(x.c, SLOT.INPUT, held);
  const used = held.amount - (rest?.amount ?? 0);
  if (used > 0) {
    consumeHeld(p, used);
    playSound(x.dim, x.pos, "random.pop");
  } else {
    p.onScreenDisplay.setActionBar(tr("full"));
  }
}

/** Insere o aldeão da mão no espaço indicado. */
function insertVillager(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack} */ held, slot = SLOT.VILLAGER) {
  const it = held.clone();
  it.amount = 1;
  x.c.setItem(slot, it);
  consumeHeld(p, 1);
}

/** Remove o aldeão de um espaço e entrega ao jogador. */
function takeVillager(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {import("@minecraft/server").Vector3} */ front, slot = SLOT.VILLAGER) {
  const it = x.c.getItem(slot);
  if (!it) return false;
  x.c.setItem(slot, undefined);
  giveToPlayer(p, it, front);
  playSound(x.dim, x.pos, "mob.villager.yes");
  return true;
}

/** TraderBlockBase / AutoTraderBlock.useItemOn */
function interactTrader(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack|undefined} */ held, /** @type {boolean} */ sneaking, /** @type {Vector3} */ front, /** @type {boolean} */ fromVillager) {
  const { s, c, b, dim } = x;
  const auto = s.kind === "auto_trader";
  const hasVillager = auto ? !!c.getItem(SLOT.VILLAGER) : !!s.host;
  const wsItem = held ? workstationForItem(held.typeId) : 0;
  if (!hasVillager && held && isVillagerItem(held)) {
    const d = readData(held);
    if (s.ws > 0 && assignProfession(d, s.ws)) writeData(held, d);
    if (auto) {
      insertVillager(x, p, held);
      ensureAuto(c, d);
      saveVillager(c, d);
      playWorkOrNo(x, d);
      showVillager(x.m, d);
    } else {
      consumeHeld(p, 1);
      void hostVillager(x, d);
    }
    if (!s.ws) playSound(dim, x.pos, "mob.villager.yes");
    return "handled";
  }
  if (!s.ws && wsItem > 0) {
    s.ws = wsItem;
    setBlockState(b, "workstation", wsItem);
    consumeHeld(p, 1);
    playSound(dim, x.pos, "dig.stone");
    if (auto) {
      const it = c.getItem(SLOT.VILLAGER);
      if (it) {
        const d = readData(it);
        if (assignProfession(d, wsItem)) { ensureAuto(c, d); saveVillager(c, d); }
        playWorkOrNo(x, d);
      }
    } else if (s.host) {
      const v = world.getEntity(s.host);
      if (v?.isValid) {
        const d = summarize(v);
        if (d.prof === PROF_NONE) {
          try { v.triggerEvent(`minecraft:spawn_${PROFESSIONS[wsItem]}`); } catch { /* ignorado */ }
          d.prof = wsItem;
        }
        playWorkOrNo(x, d);
      }
    }
    return "handled";
  }
  if (sneaking && hasVillager) {
    if (auto) takeVillager(x, p, front);
    else void unhostToPlayer(x, p, front);
    return "handled";
  }
  if (sneaking && s.ws) {
    const ws = WORKSTATIONS[s.ws];
    const st = ws && makeStack(ws.items[0], 1);
    s.ws = 0;
    setBlockState(b, "workstation", 0);
    if (st) giveToPlayer(p, st, front);
    if (hasVillager) playSound(dim, x.pos, "mob.villager.no");
    return "handled";
  }
  if (auto && held && !isVillagerItem(held)) { insertHeld(x, p, held); return "handled"; }
  if (auto) { void openMenu(x, p); return "handled"; }
  if (fromVillager) return "trade";
  void openMenu(x, p);
  return "handled";
}

/** playWorkstationSound */
function playWorkOrNo(/** @type {Ctx} */ x, /** @type {VData} */ d) {
  if (!x.s.ws) return;
  const ws = WORKSTATIONS[x.s.ws];
  playSound(x.dim, x.pos, d.prof === x.s.ws && ws ? ws.sound : "mob.villager.no");
}

/** Coloca o aldeão real dentro do Comerciante (modo hospedado). */
async function hostVillager(/** @type {Ctx} */ x, /** @type {VData} */ d) {
  const key = keyOf(x.dim, x.b.location);
  busy.add(key);
  try {
    const anchor = { x: x.b.location.x + 0.5, y: x.b.location.y + 0.0625, z: x.b.location.z + 0.5 };
    const v = await releaseVillager(d, x.dim, anchor);
    if (!v) {
      // Falhou: devolve o item para não perder o aldeão.
      dropItem(x.dim, frontPos(x.b), makeVillagerItem(d));
      return;
    }
    v.addTag(HOST_TAG);
    hostEffects(v);
    v.teleport(anchor, { rotation: { x: 0, y: displayYaw(facing(x.b), 0) } });
    const m = findMachine(x.b);
    if (m) {
      const s = loadState(m);
      s.host = v.id;
      s.miss = 0;
      saveState(m, s);
      showVillager(m, summarize(v));
    }
  } finally {
    busy.delete(key);
  }
}

/** Retira o aldeão hospedado como item. */
async function unhostToPlayer(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {Vector3} */ front) {
  const v = x.s.host ? world.getEntity(x.s.host) : undefined;
  const key = keyOf(x.dim, x.b.location);
  if (!v?.isValid) return;
  busy.add(key);
  try {
    unhost(v);
    const d = await captureVillager(v);
    const m = findMachine(x.b);
    if (m) {
      const s = loadState(m);
      delete s.host;
      saveState(m, s);
      showVillager(m, undefined);
    }
    if (d) {
      giveToPlayer(p, makeVillagerItem(d), front);
      playSound(x.dim, x.pos, "mob.villager.yes");
    }
  } finally {
    busy.delete(key);
  }
}

/** FarmerBlock.useItemOn */
function interactFarmer(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack|undefined} */ held, /** @type {boolean} */ sneaking, /** @type {Vector3} */ front) {
  const { c, s, b, dim } = x;
  if (!c.getItem(SLOT.VILLAGER) && held && isVillagerItem(held)) {
    const d = readData(held);
    if (assignProfession(d, PROF_FARMER)) writeData(held, d);
    insertVillager(x, p, held);
    showVillager(x.m, d);
    playSound(dim, x.pos, "mob.villager.yes");
    return;
  }
  const crop = held ? cropForSeed(held.typeId) : 0;
  if (!s.crop && crop) {
    s.crop = crop;
    s.age = 0;
    setBlockState(b, "crop", crop);
    setBlockState(b, "stage", 0);
    consumeHeld(p, 1);
    if (c.getItem(SLOT.VILLAGER)) playSound(dim, x.pos, WORKSTATIONS[PROF_FARMER]?.sound ?? "dig.grass");
    playSound(dim, x.pos, "dig.grass");
    return;
  }
  if (sneaking && s.crop) {
    const seed = makeStack(CROPS[s.crop]?.seed ?? "minecraft:wheat_seeds", 1);
    s.crop = 0;
    s.age = 0;
    setBlockState(b, "crop", 0);
    setBlockState(b, "stage", 0);
    if (seed) giveToPlayer(p, seed, front);
    if (c.getItem(SLOT.VILLAGER)) playSound(dim, x.pos, "mob.villager.no");
    return;
  }
  if (sneaking && takeVillager(x, p, front)) return;
  void openMenu(x, p);
}

/** BreederBlock.useItemOn */
function interactBreeder(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack|undefined} */ held, /** @type {boolean} */ sneaking, /** @type {Vector3} */ front) {
  const { c, s } = x;
  if (held && isVillagerItem(held)) {
    if (!c.getItem(SLOT.VILLAGER)) { insertVillager(x, p, held, SLOT.VILLAGER); playSound(x.dim, x.pos, "mob.villager.yes"); return; }
    if (!c.getItem(SLOT.VILLAGER2)) { insertVillager(x, p, held, SLOT.VILLAGER2); playSound(x.dim, x.pos, "mob.villager.yes"); return; }
  }
  if (sneaking && takeVillager(x, p, front, SLOT.VILLAGER2)) { showVillager(auxEntity(s, "v2"), undefined); return; }
  if (sneaking && takeVillager(x, p, front, SLOT.VILLAGER)) { showVillager(x.m, undefined); return; }
  if (held && inputValid("breeder", held)) { insertHeld(x, p, held); return; }
  void openMenu(x, p);
}

/** IronFarmBlock / InventoryViewerBlock.useItemOn */
function interactSimple(/** @type {Ctx} */ x, /** @type {Player} */ p, /** @type {ItemStack|undefined} */ held, /** @type {boolean} */ sneaking, /** @type {Vector3} */ front, /** @type {string} */ insertSound) {
  const { c } = x;
  if (!c.getItem(SLOT.VILLAGER) && held && isVillagerItem(held)) {
    insertVillager(x, p, held);
    showVillager(x.m, readData(held));
    playSound(x.dim, x.pos, insertSound);
    return;
  }
  if (sneaking && takeVillager(x, p, front)) { showVillager(x.m, undefined); return; }
  if (x.s.kind === "inventory_viewer" && !c.getItem(SLOT.VILLAGER)) return;
  void openMenu(x, p);
}

// ---------------------------------------------------------------------------
// Menus (substituem os containers/telas Java)
// ---------------------------------------------------------------------------

/** @param {Ctx} x @param {Player} p */
async function openMenu(x, p) {
  const { c, s } = x;
  const v1 = c.getItem(SLOT.VILLAGER);
  /** @type {import("@minecraft/server").RawMessage[]} */
  const body = [];
  const vline = (/** @type {string} */ k, /** @type {ItemStack|undefined} */ it) => body.push(tr(k, it ? itemLabel(it) : tr("empty")));
  /** @type {Array<[import("@minecraft/server").RawMessage, string | undefined, () => void | Promise<void>]>} */
  const buttons = [];
  const inputs = SLOT.INPUT.map((i) => c.getItem(i));
  const outputs = SLOT.OUTPUT.map((i) => c.getItem(i));
  switch (s.kind) {
    case "trader": {
      const v = s.host ? world.getEntity(s.host) : undefined;
      body.push(tr("villager_line", v?.isValid ? profName(summarize(v).prof) : tr("empty")));
      body.push(tr("workstation_line", s.ws ? profName(s.ws) : tr("empty")));
      body.push(tr("trader_hint"));
      break;
    }
    case "auto_trader": {
      vline("villager_line", v1);
      body.push(tr("workstation_line", s.ws ? profName(s.ws) : tr("empty")));
      const d = v1 ? readData(v1) : undefined;
      if (d?.auto) {
        body.push(tr("level_line", String(d.auto.lvl), String(d.auto.xp)));
        const n = d.auto.trades.length;
        if (s.ti >= n) s.ti = 0;
        const ref = d.auto.trades[s.ti];
        const t = ref && tradeOf(ref, d.prof);
        if (t && ref) {
          const a = makeStack(t[0][0], t[0][1]);
          const bb = t[1] ? makeStack(t[1][0], t[1][1]) : undefined;
          const r = makeStack(t[2][0], t[2][1]);
          body.push(tr("trade_line", String(s.ti + 1), String(n), itemList([a, bb]), itemLabel(r), String(t[3] - ref.u), String(t[3])));
          if (ref.u >= t[3]) body.push(tr("out_of_stock"));
        }
        buttons.push([tr("btn.prev"), `textures/${NS}/gui/arrow_left`, () => { s.ti = (s.ti - 1 + n) % n; }]);
        buttons.push([tr("btn.next"), `textures/${NS}/gui/arrow_right`, () => { s.ti = (s.ti + 1) % n; }]);
      } else body.push(tr("trade_none"));
      break;
    }
    case "farmer":
      vline("villager_line", v1);
      body.push(s.crop ? tr("crop_line", tr(`crop.${s.crop}`), String(s.age), String(CROPS[s.crop]?.maxAge ?? 0)) : tr("crop_none"));
      break;
    case "breeder": {
      vline("villager_line", v1);
      vline("villager2_line", c.getItem(SLOT.VILLAGER2));
      const view = inputs.map((it) => (it ? { id: it.typeId, amount: it.amount } : undefined));
      body.push(tr("food_line", String(Math.min(24, foodValue(view)))));
      body.push(tr("next_breed", String(Math.ceil((cfg().breeding_time - s.cd) / 20))));
      break;
    }
    case "converter": {
      vline("villager_line", v1);
      const T = converterTimes(cfg().converting_time);
      if (v1) body.push(tr("timer_line", String(Math.floor(s.timer / 20)), String(Math.ceil(T.finalize / 20))));
      body.push(tr("converter_hint"));
      break;
    }
    case "iron_farm": {
      vline("villager_line", v1);
      const T = golemTimes(cfg().golem_spawn_time);
      if (v1) body.push(tr("golem_line", String(Math.max(0, Math.ceil((T.kill - s.timer) / 20)))));
      break;
    }
    case "incubator": {
      vline("villager_line", v1);
      if (v1) {
        const d = readData(v1);
        const per = Math.max(1, cfg().incubator_speed);
        body.push(tr("incubating_line", String(Math.ceil(Math.max(0, -d.age) / per / 20))));
      }
      break;
    }
    case "inventory_viewer":
      vline("villager_line", v1);
      if (v1) buttons.push([tr("btn.inventory"), undefined, () => viewerMenu(x.b, p)]);
      break;
  }
  if (HAS_INPUT.has(s.kind)) {
    body.push(tr(s.kind === "breeder" ? "gui.easy_villagers.food_items" : s.kind === "incubator" ? "gui.easy_villagers.input_villagers" : "gui.easy_villagers.input"));
    body.push(itemList(inputs));
    if (inputs.some((i) => i)) buttons.push([tr("btn.take_inputs"), undefined, () => { moveSlotsToPlayer(c, SLOT.INPUT, p); }]);
  }
  if (HAS_OUTPUT.has(s.kind)) {
    body.push(tr(s.kind === "breeder" || s.kind === "incubator" || s.kind === "converter" ? "gui.easy_villagers.output_villagers" : "gui.easy_villagers.output"));
    body.push(itemList(outputs));
    if (outputs.some((i) => i)) buttons.push([tr("btn.collect"), undefined, () => { moveSlotsToPlayer(c, SLOT.OUTPUT, p); }]);
  }
  buttons.push([tr("btn.close"), undefined, () => {}]);
  const form = new ActionFormData().title({ translate: `block.${NS}.${s.kind}` }).body(lines(body));
  for (const [label, icon] of buttons) form.button(label, icon);
  const r = await showForm(form, p);
  if (!r || r.canceled || r.selection === undefined) return;
  // Recarrega: o estado pode ter mudado enquanto o menu estava aberto.
  const m = findMachine(x.b);
  if (!m || m.id !== x.m.id) return;
  const fresh = loadState(m);
  s.cd = fresh.cd; s.timer = fresh.timer; s.rt = fresh.rt; s.nr = fresh.nr; s.age = fresh.age; s.host = fresh.host;
  s.crop = fresh.crop; s.ws = fresh.ws; s.aux = fresh.aux;
  await buttons[r.selection]?.[2]();
  saveState(m, s);
  if (s.kind === "auto_trader" && r.selection < 2 && buttons.length > 3) void openMenu({ ...x, s }, p);
}

/** InventoryViewerContainer: inventário (8) e equipamento do aldeão. */
async function viewerMenu(/** @type {Block} */ b, /** @type {Player} */ p) {
  const m = findMachine(b);
  const c = m && containerOf(m);
  const it = c?.getItem(SLOT.VILLAGER);
  if (!m || !c || !it) return;
  const key = keyOf(b.dimension, b.location);
  if (busy.has(key)) return;
  busy.add(key);
  /** @type {ItemStack[]} */
  let items = [];
  try {
    const d = readData(it);
    await withLiveVillager(b, c, d, (v) => {
      const inv = v.getComponent("minecraft:inventory")?.container;
      if (inv) for (let i = 0; i < inv.size; i++) { const s = inv.getItem(i); if (s) items.push(s); }
      return false;
    });
  } finally {
    busy.delete(key);
  }
  const form = new ActionFormData().title(tr("gui.easy_villagers.villager_inventory"));
  form.body(items.length ? itemList(items) : tr("empty"));
  items.forEach((s) => form.button({ rawtext: [tr("btn.take"), { text: " " }, itemLabel(s)] }));
  const held = playerContainer(p)?.getItem(p.selectedSlotIndex);
  const canDeposit = !!held && !isVillagerItem(held);
  if (canDeposit) form.button(tr("btn.deposit"));
  form.button(tr("btn.close"));
  const r = await showForm(form, p);
  if (!r || r.canceled || r.selection === undefined) return;
  const sel = r.selection;
  const take = sel < items.length ? items[sel] : undefined;
  const deposit = canDeposit && sel === items.length;
  if (!take && !deposit) return;
  if (busy.has(key)) return;
  busy.add(key);
  try {
    const cur = c.getItem(SLOT.VILLAGER);
    if (!cur) return;
    const d = readData(cur);
    await withLiveVillager(b, c, d, (v) => {
      const inv = v.getComponent("minecraft:inventory")?.container;
      if (!inv) return false;
      if (take) {
        for (let i = 0; i < inv.size; i++) {
          const s = inv.getItem(i);
          if (s && s.typeId === take.typeId && s.amount === take.amount) {
            inv.setItem(i, undefined);
            giveToPlayer(p, s, p.location);
            return true;
          }
        }
        return false;
      }
      const h = playerContainer(p)?.getItem(p.selectedSlotIndex);
      if (!h || isVillagerItem(h)) return false;
      const rest = inv.addItem(h);
      playerContainer(p)?.setItem(p.selectedSlotIndex, rest);
      return true;
    });
  } finally {
    busy.delete(key);
  }
}

/**
 * Coloca temporariamente o aldeão guardado no mundo para ler/alterar dados
 * que só existem na entidade (inventário), e o guarda de novo.
 * @param {Block} b
 * @param {Container} c
 * @param {VData} d
 * @param {(v: Entity) => boolean} fn retorna true se alterou algo
 */
async function withLiveVillager(b, c, d, fn) {
  const keep = { auto: d.auto, pending: [...d.pending], baby: d.baby, age: d.age };
  const loc = { x: b.location.x + 0.5, y: b.dimension.heightRange.max - 3, z: b.location.z + 0.5 };
  const copy = { ...d, pending: [] }; // eventos pendentes ficam guardados, não aplicados
  const v = await releaseVillager(copy, b.dimension, loc);
  if (!v) return;
  v.addEffect("invisibility", 100, { showParticles: false });
  fn(v);
  const nd = await captureVillager(v, keep);
  if (nd) {
    if (d.name) nd.name = d.name;
    const it = makeVillagerItem(nd);
    c.setItem(SLOT.VILLAGER, it);
  } else {
    // Falha ao guardar de novo: deixa o aldeão livre ao lado do bloco.
    if (v.isValid) v.teleport(frontPos(b));
    c.setItem(SLOT.VILLAGER, undefined);
  }
}

// ---------------------------------------------------------------------------
// Remoção do bloco
// ---------------------------------------------------------------------------

/**
 * Bloco removido: derruba o conteúdo (no Java ele ficaria dentro do item do
 * bloco — o Bedrock não permite dados em itens empilháveis) e limpa entidades.
 * @param {Dimension} dim
 * @param {Vector3} loc
 * @param {boolean} drop
 */
export function removeMachineAt(dim, loc, drop) {
  const key = keyOf(dim, loc);
  /** @type {Entity | undefined} */
  let m;
  const id = cache.get(key);
  if (id) m = world.getEntity(id);
  if (!m?.isValid) {
    m = dim.getEntitiesAtBlockLocation(loc).find((e) => e.typeId === DISPLAY_ENTITY && e.getDynamicProperty(ROLE) === "machine");
  }
  cache.delete(key);
  if (!m?.isValid) return;
  destroyMachine(m, drop);
}

/** @param {Entity} m @param {boolean} drop */
function destroyMachine(m, drop) {
  const s = loadState(m);
  const c = containerOf(m);
  const anchor = /** @type {Vector3} */ (m.getDynamicProperty(ANCHOR)) ?? m.location;
  const at = center(anchor);
  const dim = m.dimension;
  if (drop && c) {
    for (let i = 0; i < c.size; i++) {
      const it = c.getItem(i);
      if (it) dropItem(dim, at, it);
    }
    if (s.ws > 0) { const ws = WORKSTATIONS[s.ws]; const st = ws && makeStack(ws.items[0], 1); if (st) dropItem(dim, at, st); }
    if (s.crop > 0) { const st = makeStack(CROPS[s.crop]?.seed ?? "", 1); if (st) dropItem(dim, at, st); }
  }
  if (s.host) {
    // O aldeão vivo do Comerciante é libertado (nunca apagado).
    const v = world.getEntity(s.host);
    if (v?.isValid) unhost(v);
  }
  for (const id of Object.values(s.aux)) {
    const a = world.getEntity(id);
    if (a?.isValid) a.remove();
  }
  m.remove();
}

/**
 * Varredura de segurança: entidades de máquinas cujo bloco sumiu (pistão,
 * /setblock, /fill...) devolvem o conteúdo e são removidas; miniaturas órfãs
 * são apagadas.
 */
export function sweep() {
  for (const dimId of ["minecraft:overworld", "minecraft:nether", "minecraft:the_end"]) {
    let dim;
    try { dim = world.getDimension(dimId); } catch { continue; }
    for (const e of dim.getEntities({ type: DISPLAY_ENTITY })) {
      const anchor = /** @type {Vector3 | undefined} */ (e.getDynamicProperty(ANCHOR));
      if (!anchor) { e.remove(); continue; }
      let block;
      try { block = dim.getBlock(anchor); } catch { continue; }
      if (!block) continue; // chunk não carregado
      const role = e.getDynamicProperty(ROLE);
      if (role === "aux") {
        const owner = String(e.getDynamicProperty(OWNER) ?? "");
        const om = world.getEntity(owner);
        if (!isMachineBlock(block) || (!om?.isValid && !findMachine(block))) e.remove();
        continue;
      }
      if (!isMachineBlock(block) || kindOf(block) !== loadState(e).kind) destroyMachine(e, true);
    }
  }
}

/** Libera um aldeão de um item no mundo, fora das máquinas. */
export async function releaseFromItem(/** @type {Player} */ p, /** @type {ItemStack} */ held, /** @type {Vector3} */ loc) {
  const d = readData(held);
  const slot = p.selectedSlotIndex;
  const inv = playerContainer(p);
  if (!inv) return;
  // Retira o item antes (evita duplicação se o jogador trocar de espaço).
  if (!isCreative(p)) inv.setItem(slot, undefined);
  const v = await releaseVillager(d, p.dimension, loc);
  if (!v && !isCreative(p)) {
    const rest = inv.addItem(held);
    if (rest) dropItem(p.dimension, p.location, rest);
  }
}

/** Pega um aldeão do mundo (VillagerEvents.pickUp). */
export async function pickUpVillager(/** @type {Player} */ p, /** @type {Entity} */ v) {
  if (!v.isValid || v.hasTag(HOST_TAG)) return;
  if (v.isSleeping) return;
  const inv = playerContainer(p);
  if (!inv) return;
  if (inv.getItem(p.selectedSlotIndex) && inv.emptySlotsCount === 0) {
    p.onScreenDisplay.setActionBar(tr("full"));
    return;
  }
  const d = await captureVillager(v);
  if (!d) return;
  giveToPlayer(p, makeVillagerItem(d), p.location);
}

/** Sons do aldeão no inventário (VillagerItem.inventoryTick) + conversão do bebê criativo. */
export function inventoryTick() {
  for (const p of world.getAllPlayers()) {
    const inv = playerContainer(p);
    if (!inv) continue;
    let n = 0;
    for (let i = 0; i < inv.size; i++) {
      const it = inv.getItem(i);
      if (!it) continue;
      if (it.typeId === `${NS}:baby_villager`) {
        inv.setItem(i, makeVillagerItem(readData(it)));
        n++;
      } else if (isVillagerItem(it)) n++;
    }
    if (n && cfg().villager_inventory_sounds) {
      const chance = 1 - Math.pow(1 - Math.min(1, TICK_STEP / cfg().villager_sound_amount) / 40, n);
      if (Math.random() < chance) {
        try { p.playSound("mob.villager.idle", { volume: cfg().villager_volume }); } catch { /* ignorado */ }
      }
    }
  }
}
