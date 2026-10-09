// @ts-check
// Regras de jogo puras (sem @minecraft/server), reproduzindo o código Java
// descompilado do Easy Villagers. Testadas em tests/logic.test.mjs.

import { BREED_FOOD_NEEDED, CROPS, FOOD_POINTS, LEVEL_XP, PROFESSIONS } from "./constants.js";
import { TRADES } from "./trades.js";

/** @typedef {() => number} Rng */

/** Distribuição binomial (apply_bonus binomial_with_bonus_count). */
export function binomial(/** @type {number} */ n, /** @type {number} */ p, /** @type {Rng} */ rng) {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng() < p) k++;
  return k;
}

/** Inteiro uniforme em [min, max]. */
export function uniformInt(/** @type {number} */ min, /** @type {number} */ max, /** @type {Rng} */ rng) {
  return min + Math.floor(rng() * (max - min + 1));
}

/**
 * Drops de uma cultura madura (loot tables vanilla do Java, sem Fortuna).
 * @param {number} crop índice em CROPS
 * @param {Rng} rng
 * @returns {Array<[string, number]>}
 */
export function cropDrops(crop, rng) {
  const P = 0.5714286;
  /** @type {Array<[string, number]>} */
  const out = [];
  const add = (/** @type {string} */ id, /** @type {number} */ n) => { if (n > 0) out.push([id, n]); };
  switch (CROPS[crop]?.name) {
    case "wheat":
      add("minecraft:wheat", 1);
      add("minecraft:wheat_seeds", binomial(3, P, rng));
      break;
    case "carrots":
      add("minecraft:carrot", 1 + binomial(3, P, rng));
      break;
    case "potatoes":
      add("minecraft:potato", 1 + binomial(3, P, rng));
      if (rng() < 0.02) add("minecraft:poisonous_potato", 1);
      break;
    case "beetroots":
      add("minecraft:beetroot", 1);
      add("minecraft:beetroot_seeds", binomial(3, P, rng));
      break;
    case "torchflower":
      add("minecraft:torchflower_seeds", 1);
      break;
    case "pitcher":
      add("minecraft:pitcher_plant", 1);
      break;
  }
  return out;
}

/**
 * Drops do Golem de Ferro (loot table entities/iron_golem: papoula 0-2, ferro 3-5).
 * @param {Rng} rng
 * @returns {Array<[string, number]>}
 */
export function golemDrops(rng) {
  /** @type {Array<[string, number]>} */
  const out = [];
  const poppy = uniformInt(0, 2, rng);
  if (poppy > 0) out.push(["minecraft:poppy", poppy]);
  out.push(["minecraft:iron_ingot", uniformInt(3, 5, rng)]);
  return out;
}

/** @typedef {{id: string, amount: number} | undefined} SlotView */

/** Soma de pontos de comida (BreederTileentity.canBreed). */
export function foodValue(/** @type {SlotView[]} */ slots) {
  let v = 0;
  for (const s of slots) if (s) v += (FOOD_POINTS[/** @type {keyof typeof FOOD_POINTS} */ (s.id)] ?? 0) * s.amount;
  return v;
}

/**
 * Quanto remover de cada espaço para consumir 24 pontos
 * (BreederTileentity.removeBreedingItems). Retorna null se insuficiente.
 * @param {SlotView[]} slots
 * @returns {number[] | null}
 */
export function planFoodRemoval(slots) {
  const remove = slots.map(() => 0);
  let value = 0;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (!s) continue;
    const itemValue = FOOD_POINTS[/** @type {keyof typeof FOOD_POINTS} */ (s.id)] ?? 0;
    if (itemValue <= 0) continue;
    const needed = BREED_FOOD_NEEDED - value;
    const toRemove = Math.min(s.amount, Math.floor((needed + itemValue - 1) / itemValue));
    remove[i] = toRemove;
    value += toRemove * itemValue;
    if (value >= BREED_FOOD_NEEDED) return remove;
  }
  return null;
}

/** Tempos do Conversor (ConverterTileentity). */
export function converterTimes(/** @type {number} */ convertingTime) {
  const zombify = 60;
  const cure = zombify + 60;
  const convert = cure + convertingTime;
  return { zombify, cure, convert, finalize: convert + 60 };
}

/** Tempos da Fazenda de Ferro (IronFarmTileentity). */
export function golemTimes(/** @type {number} */ golemSpawnTime) {
  const spawn = golemSpawnTime - 200;
  return { spawn, kill: spawn + 200 };
}

/** TraderTileentityBase.calculateNextRestock */
export function restockDelay(/** @type {number} */ min, /** @type {number} */ max, /** @type {Rng} */ rng) {
  return min + Math.floor(rng() * Math.max(max - min, 1));
}

/** true se um valor-alvo foi atingido entre dois ticks (prev, now]. */
export function crossed(/** @type {number} */ prev, /** @type {number} */ now, /** @type {number} */ target) {
  return prev < target && now >= target;
}

/** VillagerTileentity.advanceAge */
export function advanceAge(/** @type {number} */ age, /** @type {number} */ amount) {
  const next = age + amount;
  return { age: next, grewUp: age < 0 && next >= 0 };
}

/** Passo de envelhecimento da Incubadora por tick Java. */
export function incubatorStep(/** @type {number} */ age, /** @type {number} */ speed) {
  return age < 0 ? Math.min(speed, Math.abs(age)) : 1;
}

/** Direction.toYRot() do Java para minecraft:cardinal_direction. */
export const DIR_YROT = { south: 0, west: 90, north: 180, east: 270 };

/**
 * Converte um deslocamento local dos renderizadores Java
 * (PoseStack.mulPose(YP(-dir.toYRot()))) em deslocamento no mundo.
 * @param {string} dir
 * @param {number} x
 * @param {number} z
 */
export function rotateOffset(dir, x, z) {
  const deg = -(DIR_YROT[/** @type {keyof typeof DIR_YROT} */ (dir)] ?? 180);
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r) * 1e6) / 1e6;
  const s = Math.round(Math.sin(r) * 1e6) / 1e6;
  return { x: x * c + z * s, z: -x * s + z * c };
}

/** Yaw final da miniatura: toYRot(dir) - rotaçãoExtra. */
export function displayYaw(/** @type {string} */ dir, /** @type {number} */ extra) {
  const y = (DIR_YROT[/** @type {keyof typeof DIR_YROT} */ (dir)] ?? 180) - extra;
  return ((y % 360) + 360) % 360;
}

// ---------------------------------------------------------------------------
// Mercador virtual do Comerciante Automático
// ---------------------------------------------------------------------------

/** @typedef {{lvl: number, xp: number, trades: Array<{t: number, i: number, u: number}>}} AutoState */

/** Nível (1..5) correspondente a um total de XP. */
export function levelForXp(/** @type {number} */ xp) {
  let lvl = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) lvl = i + 1;
  return lvl;
}

/**
 * Sorteia até 2 trocas de um nível (VillagerTrades: 2 ofertas por nível).
 * @param {number} prof variante de profissão
 * @param {number} tier 0..4
 * @param {Rng} rng
 * @param {(id: string) => boolean} valid
 */
export function rollTier(prof, tier, rng, valid) {
  const pool = TRADES[PROFESSIONS[prof]]?.[tier] ?? [];
  const idx = [];
  for (let i = 0; i < pool.length; i++) {
    const t = pool[i];
    if (valid(t[0][0]) && valid(t[2][0]) && (!t[1] || valid(t[1][0]))) idx.push(i);
  }
  const chosen = [];
  while (idx.length > 0 && chosen.length < 2) {
    const k = Math.floor(rng() * idx.length);
    chosen.push({ t: tier, i: idx[k], u: 0 });
    idx.splice(k, 1);
  }
  return chosen;
}

/** Cria o estado inicial (nível 1). */
export function newAutoState(/** @type {number} */ prof, /** @type {Rng} */ rng, /** @type {(id: string) => boolean} */ valid) {
  /** @type {AutoState} */
  const s = { lvl: 1, xp: 0, trades: rollTier(prof, 0, rng, valid) };
  return s;
}

/**
 * Aplica XP de uma troca e sobe de nível se necessário
 * (increaseMerchantCareer adiciona as ofertas do novo nível).
 * @param {AutoState} s
 */
export function addAutoXp(s, /** @type {number} */ prof, /** @type {number} */ xp, /** @type {Rng} */ rng, /** @type {(id: string) => boolean} */ valid) {
  s.xp += xp;
  let leveled = false;
  while (s.lvl < 5 && s.xp >= LEVEL_XP[s.lvl]) {
    s.lvl++;
    s.trades.push(...rollTier(prof, s.lvl - 1, rng, valid));
    leveled = true;
  }
  return leveled;
}

/** @param {{t: number, i: number}} ref @param {number} prof */
export function tradeOf(ref, prof) {
  return TRADES[PROFESSIONS[prof]]?.[ref.t]?.[ref.i];
}
