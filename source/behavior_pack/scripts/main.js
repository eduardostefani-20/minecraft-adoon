// @ts-check
// Easy Villagers (Bedrock) — ponto de entrada dos scripts.
import { GameMode, system, world } from "@minecraft/server";
import { cfg, describeConfig, setConfig } from "./config.js";
import { DISPLAY_ENTITY, NS, TICK_STEP, VANILLA_VILLAGER, workstationForItem } from "./constants.js";
import {
  blockOfMachine, createMachine, interact, inventoryTick, isMachineBlock, isPackedItem, keyOf, machineTouchMode,
  pickUpVillager, placePacked, releaseFromItem, removeMachineAt, sweep, tickMachine,
} from "./machines.js";
import { HOST_TAG, isVillagerItem } from "./villager.js";

/** @typedef {import("@minecraft/server").Block} Block */

// Componente personalizado dos 8 blocos-máquina.
system.beforeEvents.startup.subscribe((ev) => {
  ev.blockComponentRegistry.registerCustomComponent(`${NS}:machine`, {
    onTick(e) {
      try {
        tickMachine(e.block);
      } catch (err) {
        console.warn(`[${NS}] erro no tick da máquina: ${err}`);
      }
    },
    onPlace(e) {
      const b = e.block;
      system.run(() => {
        try {
          if (b.isValid && isMachineBlock(b)) createMachine(b);
        } catch (err) {
          console.warn(`[${NS}] erro ao criar máquina: ${err}`);
        }
      });
    },
  });
});

// Interação com blocos: máquinas, máquina cheia e soltar aldeão no chão.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { player, block, itemStack } = ev;
  const machine = isMachineBlock(block);
  if (isPackedItem(itemStack) && itemStack && !(machine && !player.isSneaking)) {
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    const face = ev.blockFace;
    system.run(() => {
      const target = neighbor(block, face);
      if (target) void placePacked(player, target, itemStack);
    });
    return;
  }
  // Agachado com item na mão: comportamento vanilla (ex.: colocar bloco), como no Java.
  if (machine && !(player.isSneaking && itemStack)) {
    ev.cancel = true;
    if (!ev.isFirstEvent) return;
    system.run(() => {
      try {
        if (block.isValid) interact(player, block);
      } catch (err) {
        console.warn(`[${NS}] erro na interação: ${err}`);
      }
    });
    return;
  }
  if (!machine && isVillagerItem(itemStack)) {
    ev.cancel = true;
    if (!ev.isFirstEvent || !itemStack) return;
    const face = ev.blockFace;
    system.run(() => {
      // VillagerItem.useOn: se o bloco tem colisão, nasce no bloco vizinho da face.
      const target = block.isAir || block.isLiquid ? block : neighbor(block, face) ?? block;
      const l = target.location;
      void releaseFromItem(player, itemStack, { x: l.x + 0.5, y: l.y, z: l.z + 0.5 });
    });
  }
});

/** Bloco vizinho na face tocada. */
function neighbor(/** @type {Block} */ block, /** @type {string} */ face) {
  const off = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
  try {
    return block.offset({ x: off[0], y: off[1], z: off[2] });
  } catch {
    return undefined;
  }
}

// Interação com entidades: aldeão do Comerciante (tela de troca vanilla),
// interface de baú das máquinas e pegar aldeões.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  const held = ev.itemStack;
  if (target.typeId === DISPLAY_ENTITY) {
    if (target.getDynamicProperty("ev:role") !== "machine") return;
    // Interface de baú nativa, exceto ações especiais (inserir aldeão/semente, agachar para retirar).
    if (machineTouchMode(player, target, held) === "chest") return;
    ev.cancel = true;
    system.run(() => {
      const block = blockOfMachine(target);
      try { if (block && isMachineBlock(block)) interact(player, block); } catch (err) { console.warn(`[${NS}] ${err}`); }
    });
    return;
  }
  if (target.typeId !== VANILLA_VILLAGER) return;
  if (target.hasTag(HOST_TAG)) {
    const loc = target.location;
    const block = target.dimension.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    if (!block || !isMachineBlock(block)) return;
    const sneaking = player.isSneaking;
    // Sem agachar e sem item especial: abre a tela de troca vanilla normalmente.
    const special = (sneaking && !held) || (!sneaking && !!held && wantsBlock(held.typeId));
    if (!special) return;
    ev.cancel = true;
    system.run(() => {
      try { interact(player, block); } catch (err) { console.warn(`[${NS}] ${err}`); }
    });
    return;
  }
  if (cfg().sneak_pick_up && player.isSneaking) {
    ev.cancel = true;
    system.run(() => { void pickUpVillager(player, target); });
  }
});

/** Itens que o Comerciante consome quando usados no aldeão hospedado. */
function wantsBlock(/** @type {string} */ id) {
  return id === `${NS}:villager` || id === `${NS}:baby_villager` || workstationForItem(id) > 0;
}

// Quebra do bloco: o conteúdo fica guardado no item (no criativo nada cai, como no Java).
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  const perm = ev.brokenBlockPermutation;
  if (!perm.hasTag(`${NS}:machine`)) return;
  const kind = perm.type.id.slice(NS.length + 1);
  const mode = ev.player.getGameMode() === GameMode.Creative ? "none" : "pack";
  removeMachineAt(ev.block.dimension, ev.block.location, kind, mode);
});

// Explosões: o item do bloco cai com o conteúdo.
world.afterEvents.blockExplode.subscribe((ev) => {
  const perm = ev.explodedBlockPermutation;
  if (!perm.hasTag(`${NS}:machine`)) return;
  removeMachineAt(ev.dimension, ev.block.location, perm.type.id.slice(NS.length + 1), "pack");
});

// Tarefas periódicas leves.
system.runInterval(() => {
  try { inventoryTick(); } catch (err) { console.warn(`[${NS}] ${err}`); }
}, TICK_STEP);
system.runInterval(() => {
  try { sweep(); } catch (err) { console.warn(`[${NS}] varredura: ${err}`); }
}, 200);

// Configuração por operadores.
system.afterEvents.scriptEventReceive.subscribe((ev) => {
  if (ev.id !== `${NS}:config`) return;
  const src = ev.sourceEntity;
  const parts = ev.message.trim().split(/\s+/).filter(Boolean);
  const msg = parts.length >= 2 ? setConfig(parts[0], parts[1]) : describeConfig();
  if (src && src.typeId === "minecraft:player") /** @type {any} */ (src).sendMessage(msg);
  else console.warn(msg);
});

export { keyOf };
