// @ts-check
// Easy Villagers (Bedrock) — ponto de entrada dos scripts.
import { GameMode, system, world } from "@minecraft/server";
import { cfg, describeConfig, setConfig } from "./config.js";
import { NS, TICK_STEP, VANILLA_VILLAGER } from "./constants.js";
import {
  createMachine, interact, inventoryTick, isMachineBlock, keyOf, pickUpVillager, releaseFromItem,
  removeMachineAt, sweep, tickMachine,
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

// Interação com blocos: máquinas e soltar aldeão no chão.
world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
  const { player, block, itemStack } = ev;
  const machine = isMachineBlock(block);
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
      let target = block;
      try {
        if (!block.isAir && !block.isLiquid) {
          const off = { Up: [0, 1, 0], Down: [0, -1, 0], North: [0, 0, -1], South: [0, 0, 1], East: [1, 0, 0], West: [-1, 0, 0] }[face] ?? [0, 1, 0];
          target = block.offset({ x: off[0], y: off[1], z: off[2] }) ?? block;
        }
      } catch { /* mantém o bloco */ }
      const l = target.location;
      void releaseFromItem(player, itemStack, { x: l.x + 0.5, y: l.y, z: l.z + 0.5 });
    });
  }
});

// Interação com entidades: pegar aldeões e o aldeão hospedado no Comerciante.
world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
  const { player, target } = ev;
  if (target.typeId !== VANILLA_VILLAGER) return;
  if (target.hasTag(HOST_TAG)) {
    const loc = target.location;
    const block = target.dimension.getBlock({ x: Math.floor(loc.x), y: Math.floor(loc.y), z: Math.floor(loc.z) });
    if (!block || !isMachineBlock(block)) return;
    const sneaking = player.isSneaking;
    const hasItem = !!ev.itemStack;
    // Sem agachar e com mão vazia/item comum, decide após rodar a lógica do bloco;
    // como o evento "before" não pode alterar o mundo, prevemos o resultado:
    // itens de aldeão/estação e agachar+mão vazia são tratados pelo bloco.
    const special = (sneaking && !hasItem) || (!sneaking && hasItem && wantsBlock(ev.itemStack?.typeId ?? ""));
    if (!special) return; // abre a tela de troca normalmente
    ev.cancel = true;
    system.run(() => {
      try { interact(player, block, true); } catch (err) { console.warn(`[${NS}] ${err}`); }
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
  return id === `${NS}:villager` || id === `${NS}:baby_villager` || [
    "minecraft:composter", "minecraft:barrel", "minecraft:loom", "minecraft:fletching_table",
    "minecraft:lectern", "minecraft:cartography_table", "minecraft:brewing_stand", "minecraft:blast_furnace",
    "minecraft:grindstone", "minecraft:smithing_table", "minecraft:smoker", "minecraft:cauldron",
    "minecraft:stonecutter_block", "minecraft:stonecutter",
  ].includes(id);
}

// Quebra do bloco por jogador: conteúdo cai (exceto no criativo, como no Java).
world.afterEvents.playerBreakBlock.subscribe((ev) => {
  if (!ev.brokenBlockPermutation.hasTag(`${NS}:machine`)) return;
  const drop = ev.player.getGameMode() !== GameMode.Creative;
  removeMachineAt(ev.block.dimension, ev.block.location, drop);
});

// Explosões: conteúdo cai.
world.afterEvents.blockExplode.subscribe((ev) => {
  if (!ev.explodedBlockPermutation.hasTag(`${NS}:machine`)) return;
  removeMachineAt(ev.dimension, ev.block.location, true);
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
