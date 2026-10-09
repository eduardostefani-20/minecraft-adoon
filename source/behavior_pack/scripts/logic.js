// @ts-check
// Regras de jogo puras (sem @minecraft/server), reproduzindo o código Java
// descompilado do Easy Villagers. Testadas em tests/logic.test.mjs.

import { BREED_FOOD_NEEDED, CROPS, FOOD_POINTS } from "./constants.js";

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
