// @ts-check
import { EntityComponentTypes, GameMode, ItemStack, ItemTypes, system } from "@minecraft/server";
import { cfg } from "./config.js";
import { TICK_STEP } from "./constants.js";

/** @typedef {import("@minecraft/server").Player} Player */
/** @typedef {import("@minecraft/server").Dimension} Dimension */
/** @typedef {import("@minecraft/server").Vector3} Vector3 */
/** @typedef {import("@minecraft/server").Container} Container */

export const rng = () => Math.random();

/** Aguarda n ticks. */
export function waitTicks(/** @type {number} */ n) {
  return new Promise((resolve) => system.runTimeout(() => resolve(undefined), n));
}

/** @param {Vector3} l */
export const center = (l) => ({ x: l.x + 0.5, y: l.y + 0.5, z: l.z + 0.5 });

/** @param {Vector3} a @param {Vector3} b */
export const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2;

/** VillagerBlockBase.playVillagerSound */
export function playSound(/** @type {Dimension} */ dim, /** @type {Vector3} */ loc, /** @type {string} */ id) {
  const volume = cfg().villager_volume;
  if (volume <= 0) return;
  try {
    dim.playSound(id, loc, { volume, pitch: 1 });
  } catch {
    // som inexistente nesta versão: ignorar
  }
}

/**
 * VillagerBlockBase.playRandomVillagerSound: no Java é testado a cada tick com
 * gameTime % soundAmount == 0 e chance 1/40. Aqui rodamos a cada 20 ticks.
 */
export function randomVillagerSound(/** @type {Dimension} */ dim, /** @type {Vector3} */ loc, /** @type {string} */ id) {
  const checks = Math.min(1, TICK_STEP / cfg().villager_sound_amount);
  if (Math.random() < checks / 40) playSound(dim, loc, id);
}

/** @param {string} id */
export function itemExists(id) {
  try {
    return ItemTypes.get(id) !== undefined;
  } catch {
    return false;
  }
}

/** @param {Player} p */
export function isCreative(p) {
  return p.getGameMode() === GameMode.Creative;
}

/** @param {Player} p @returns {Container | undefined} */
export function playerContainer(p) {
  return p.getComponent(EntityComponentTypes.Inventory)?.container;
}

/** @param {Player} p */
export function heldItem(p) {
  return playerContainer(p)?.getItem(p.selectedSlotIndex);
}

/** ItemUtils.decrItemStack: consome n itens da mão (exceto no criativo). */
export function consumeHeld(/** @type {Player} */ p, /** @type {number} */ n = 1) {
  if (isCreative(p)) return;
  const c = playerContainer(p);
  if (!c) return;
  const it = c.getItem(p.selectedSlotIndex);
  if (!it) return;
  if (it.amount <= n) c.setItem(p.selectedSlotIndex, undefined);
  else {
    it.amount -= n;
    c.setItem(p.selectedSlotIndex, it);
  }
}

/** Derruba um item no mundo. */
export function dropItem(/** @type {Dimension} */ dim, /** @type {Vector3} */ loc, /** @type {ItemStack} */ stack) {
  try {
    dim.spawnItem(stack, loc);
  } catch (e) {
    console.warn(`[easy_villagers] falha ao derrubar item: ${e}`);
  }
}

/**
 * Entrega um item ao jogador como no Java: mão vazia -> mão; senão inventário;
 * senão derruba em `dropAt`.
 */
export function giveToPlayer(/** @type {Player} */ p, /** @type {ItemStack} */ stack, /** @type {Vector3} */ dropAt) {
  const c = playerContainer(p);
  if (!c) return dropItem(p.dimension, dropAt, stack);
  if (!c.getItem(p.selectedSlotIndex)) {
    c.setItem(p.selectedSlotIndex, stack);
    return;
  }
  const rest = c.addItem(stack);
  if (rest) dropItem(p.dimension, dropAt, rest);
}

/** Cria ItemStack com segurança (undefined se o item não existir). */
export function makeStack(/** @type {string} */ id, /** @type {number} */ n) {
  try {
    return new ItemStack(id, n);
  } catch {
    return undefined;
  }
}

/** Tenta inserir uma pilha nos espaços indicados; retorna o que sobrou. */
export function insertInto(/** @type {Container} */ c, /** @type {number[]} */ slots, /** @type {ItemStack} */ stack) {
  let rest = stack.clone();
  for (const s of slots) {
    if (rest.amount <= 0) break;
    const cur = c.getItem(s);
    if (cur && cur.isStackableWith(rest) && cur.amount < cur.maxAmount) {
      const move = Math.min(cur.maxAmount - cur.amount, rest.amount);
      cur.amount += move;
      c.setItem(s, cur);
      rest.amount -= move;
      if (rest.amount <= 0) return undefined;
    }
  }
  for (const s of slots) {
    if (!c.getItem(s)) {
      const move = Math.min(rest.maxAmount, rest.amount);
      const put = rest.clone();
      put.amount = move;
      c.setItem(s, put);
      if (rest.amount - move <= 0) return undefined;
      rest.amount -= move;
    }
  }
  return rest;
}

/** Verifica se uma lista de pilhas cabe inteira nos espaços (sem alterar nada). */
export function fitsAll(/** @type {Container} */ c, /** @type {number[]} */ slots, /** @type {ItemStack[]} */ stacks) {
  /** @type {(ItemStack|undefined)[]} */
  const sim = slots.map((s) => c.getItem(s));
  for (const st of stacks) {
    let left = st.amount;
    for (let i = 0; i < sim.length && left > 0; i++) {
      const cur = sim[i];
      if (cur && cur.isStackableWith(st)) {
        const mv = Math.min(cur.maxAmount - cur.amount, left);
        cur.amount += mv;
        left -= mv;
      }
    }
    for (let i = 0; i < sim.length && left > 0; i++) {
      if (!sim[i]) {
        const cl = st.clone();
        cl.amount = Math.min(st.maxAmount, left);
        sim[i] = cl;
        left -= cl.amount;
      }
    }
    if (left > 0) return false;
  }
  return true;
}

/** Conta itens de um tipo nos espaços. */
export function countItem(/** @type {Container} */ c, /** @type {number[]} */ slots, /** @type {string} */ id) {
  let n = 0;
  for (const s of slots) {
    const it = c.getItem(s);
    if (it && it.typeId === id) n += it.amount;
  }
  return n;
}

/** Remove n itens de um tipo dos espaços (assume que existem). */
export function removeItem(/** @type {Container} */ c, /** @type {number[]} */ slots, /** @type {string} */ id, /** @type {number} */ n) {
  for (const s of slots) {
    if (n <= 0) return;
    const it = c.getItem(s);
    if (!it || it.typeId !== id) continue;
    const take = Math.min(n, it.amount);
    n -= take;
    if (take >= it.amount) c.setItem(s, undefined);
    else {
      it.amount -= take;
      c.setItem(s, it);
    }
  }
}

/** Esvazia espaços para o jogador (ou chão). */
export function moveSlotsToPlayer(/** @type {Container} */ c, /** @type {number[]} */ slots, /** @type {Player} */ p) {
  const inv = playerContainer(p);
  let moved = 0;
  for (const s of slots) {
    const it = c.getItem(s);
    if (!it) continue;
    const rest = inv ? inv.addItem(it) : it;
    if (rest) dropItem(p.dimension, p.location, rest);
    c.setItem(s, undefined);
    moved++;
  }
  return moved;
}
