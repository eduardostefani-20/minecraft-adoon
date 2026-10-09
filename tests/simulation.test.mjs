// Teste de simulação: executa os scripts reais do addon contra uma simulação
// da Script API (tests/mocks). Não substitui o teste no jogo, mas exercita os
// fluxos completos de cada máquina.
import "./mocks/register.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";

const mc = await import("@minecraft/server");
const { world, system, advance, ItemStack, Player, Block } = mc;
const { ui } = await import("@minecraft/server-ui");
await import("../source/behavior_pack/scripts/main.js");
const machines = await import("../source/behavior_pack/scripts/machines.js");
const { readData, makeVillagerItem, HOST_TAG } = await import("../source/behavior_pack/scripts/villager.js");

/** @type {any} */
let component;
system.beforeEvents.startup._l[0]({ blockComponentRegistry: { registerCustomComponent: (_n, c) => { component = c; } } });
const dim = world.getDimension("minecraft:overworld");
const player = new Player(dim);
const inv = player.getComponent("minecraft:inventory").container;
const realRandom = Math.random;

function place(type, x, states = {}) {
  const b = dim.setBlock(new Block(dim, { x, y: 64, z: 0 }, `easy_villagers:${type}`, states));
  component.onPlace({ block: b });
  return b;
}
async function useOn(block, item, sneaking = false) {
  inv.setItem(0, item);
  player.isSneaking = sneaking;
  const ev = { player, block, itemStack: inv.getItem(0), isFirstEvent: true, cancel: false, blockFace: "Up" };
  world.beforeEvents.playerInteractWithBlock._l[0](ev);
  await advance(2);
  return ev;
}
async function tick(block, n) {
  for (let i = 0; i < n; i++) component.onTick({ block });
  await advance(1);
}
const machineOf = (b) => machines.findMachine(b);
const slots = (b, list) => list.map((i) => machineOf(b).getComponent("minecraft:inventory").container.getItem(i));
const outputs = (b) => slots(b, [8, 9, 10, 11]).filter(Boolean);
function villagerItem(prof = 0, baby = false) {
  return makeVillagerItem({ prof, biome: 0, baby, age: baby ? -24000 : 0, pending: [] });
}
ui.respond = () => ({ canceled: true });

test("pegar aldeão agachado e soltá-lo de volta preserva os dados", async () => {
  const v = dim.spawnEntity("minecraft:villager_v2", { x: 5.5, y: 64, z: 5.5 });
  v.getComponent("minecraft:variant").value = 5;
  v.getComponent("minecraft:mark_variant").value = 2;
  v.nameTag = "Bob";
  player.isSneaking = true;
  inv.setItem(0, undefined);
  const ev = { player, target: v, cancel: false };
  world.beforeEvents.playerInteractWithEntity._l[0](ev);
  assert.ok(ev.cancel);
  await advance(3);
  assert.ok(!v.isValid, "aldeão removido do mundo");
  const it = inv.getItem(0);
  assert.equal(it.typeId, "easy_villagers:villager");
  const d = readData(it);
  assert.equal(d.prof, 5);
  assert.equal(d.biome, 2);
  assert.equal(d.name, "Bob");
  assert.ok(world.structureManager.get(d.sid));
  // soltar no chão
  const ground = dim.setBlock(new Block(dim, { x: 20, y: 63, z: 20 }, "minecraft:stone"));
  await useOn(ground, it);
  await advance(3);
  const back = dim.getEntities({ type: "minecraft:villager_v2" }).find((e) => e.nameTag === "Bob");
  assert.ok(back, "aldeão voltou ao mundo");
  assert.equal(back.getComponent("minecraft:variant").value, 5);
  assert.equal(Math.floor(back.location.y), 64);
  assert.ok(!world.structureManager.get(d.sid), "estrutura apagada");
  assert.equal(inv.getItem(0), undefined);
  back.remove();
});

test("Fazendeiro: dá profissão, planta e colhe trigo", async () => {
  Math.random = () => 0;
  const b = place("farmer", 100, { "easy_villagers:crop": 0, "easy_villagers:stage": 0 });
  await advance(1);
  assert.ok(machineOf(b));
  await useOn(b, villagerItem(0));
  const d = readData(slots(b, [0])[0]);
  assert.equal(d.prof, 1);
  assert.deepEqual(d.pending, ["minecraft:spawn_farmer"]);
  await useOn(b, new ItemStack("minecraft:wheat_seeds", 3));
  assert.equal(b.permutation.getState("easy_villagers:crop"), 1);
  assert.equal(inv.getItem(0).amount, 2);
  await tick(b, 8);
  const out = outputs(b);
  Math.random = realRandom;
  assert.ok(out.some((s) => s.typeId === "minecraft:wheat"), JSON.stringify(out.map((s) => s.typeId)));
  // agachar com a mão vazia: retira a semente, depois o aldeão
  await useOn(b, undefined, true);
  assert.equal(inv.getItem(0).typeId, "minecraft:wheat_seeds");
  assert.equal(b.permutation.getState("easy_villagers:crop"), 0);
  await useOn(b, undefined, true);
  assert.equal(inv.getItem(0).typeId, "easy_villagers:villager");
});

test("Criador: dois adultos + 24 pontos de comida geram um bebê", async () => {
  const b = place("breeder", 110);
  await advance(1);
  await useOn(b, villagerItem(1));
  await useOn(b, villagerItem(2));
  await useOn(b, new ItemStack("minecraft:bread", 7));
  await tick(b, 60);
  const out = outputs(b);
  assert.equal(out.length, 1);
  const d = readData(out[0]);
  assert.ok(d.baby);
  assert.equal(slots(b, [4])[0].amount, 1, "6 pães consumidos");
  assert.ok(dim.particles >= 5);
});

test("Fazenda de Ferro: golem gera ferro e funil/baú abaixo recebe a saída", async () => {
  const b = place("iron_farm", 120);
  const chest = dim.setBlock(new Block(dim, { x: 120, y: 63, z: 0 }, "minecraft:chest"));
  chest.inventory = new mc.Container(27);
  await advance(1);
  await useOn(b, villagerItem(0));
  await tick(b, 235);
  const g = world.getEntity(JSON.parse(machineOf(b).getDynamicProperty("ev:state")).aux.g);
  assert.equal(g.getProperty("easy_villagers:kind"), 3, "golem visível na fase de morte");
  await tick(b, 6);
  const items = chest.inventory.slots.filter(Boolean);
  assert.ok(items.some((s) => s.typeId === "minecraft:iron_ingot"), "ferro no baú");
  assert.equal(outputs(b).length, 0);
});

test("Incubadora: bebê cresce e sai adulto", async () => {
  const b = place("incubator", 130);
  await advance(1);
  await useOn(b, villagerItem(0, true));
  assert.ok(slots(b, [4])[0]);
  await tick(b, 12000 / 20 + 3);
  const out = outputs(b);
  assert.equal(out.length, 1);
  assert.equal(readData(out[0]).baby, false);
});

test("Conversor: aldeão + maçã dourada + poção de fraqueza", async () => {
  const b = place("converter", 140);
  await advance(1);
  const potion = new ItemStack("minecraft:potion", 1);
  potion.potion = "minecraft:weakness";
  await useOn(b, villagerItem(3));
  await useOn(b, new ItemStack("minecraft:golden_apple", 1));
  await useOn(b, potion);
  await tick(b, 4);
  assert.ok(slots(b, [0])[0], "aldeão em conversão");
  assert.ok(machineOf(b).getProperty("easy_villagers:zombified"), "aparência zumbificada");
  await tick(b, 6200 / 20);
  assert.equal(outputs(b).length, 1);
  assert.equal(slots(b, [4, 5, 6, 7]).filter(Boolean).length, 0, "insumos consumidos");
});

test("Comerciante Automático: troca 20 trigos por 1 esmeralda e sobe XP", async () => {
  Math.random = () => 0;
  const b = place("auto_trader", 150, { "easy_villagers:workstation": 0 });
  await advance(1);
  await useOn(b, new ItemStack("minecraft:composter", 1));
  assert.equal(b.permutation.getState("easy_villagers:workstation"), 1);
  await useOn(b, villagerItem(0));
  let d = readData(slots(b, [0])[0]);
  assert.equal(d.prof, 1, "desempregado vira fazendeiro");
  assert.ok(d.auto && d.auto.trades.length === 2);
  await useOn(b, new ItemStack("minecraft:wheat", 40));
  await tick(b, 2);
  Math.random = realRandom;
  const out = outputs(b);
  assert.equal(out[0].typeId, "minecraft:emerald");
  assert.equal(out[0].amount, 2);
  d = readData(slots(b, [0])[0]);
  assert.equal(d.auto.xp, 4);
});

test("Comerciante: hospeda o aldeão real e devolve ao agachar", async () => {
  const b = place("trader", 160, { "easy_villagers:workstation": 0 });
  await advance(1);
  await useOn(b, new ItemStack("minecraft:lectern", 1));
  await useOn(b, villagerItem(0));
  await advance(5);
  const host = dim.getEntities({ type: "minecraft:villager_v2", tags: [HOST_TAG] })[0];
  assert.ok(host, "aldeão hospedado");
  assert.ok(host.getEffect("invisibility") && host.getEffect("resistance"));
  assert.ok(host.events.includes("minecraft:spawn_librarian"));
  await tick(b, 200);
  assert.ok(host.events.includes("minecraft:resupply_trades"), "reabastecimento");
  // interação agachado no próprio aldeão
  player.isSneaking = true;
  inv.setItem(0, undefined);
  const ev = { player, target: host, cancel: false };
  world.beforeEvents.playerInteractWithEntity._l[0](ev);
  assert.ok(ev.cancel);
  await advance(4);
  assert.ok(!host.isValid);
  assert.equal(readData(inv.getItem(0)).prof, 5);
  // sem agachar e mão vazia: abre a troca vanilla (não cancela)
});

test("Quebrar bloco derruba o conteúdo e apaga as miniaturas", async () => {
  const b = place("breeder", 170);
  await advance(1);
  await useOn(b, villagerItem(1));
  const m = machineOf(b);
  const aux = Object.values(JSON.parse(m.getDynamicProperty("ev:state")).aux);
  const before = dim.items.length;
  world.afterEvents.playerBreakBlock._l[0]({ player, block: b, brokenBlockPermutation: b.permutation });
  assert.ok(!m.isValid);
  for (const id of aux) assert.ok(!world.getEntity(id));
  assert.equal(dim.items.length - before, 1);
});

test("Varredura: bloco removido por outros meios devolve o conteúdo", async () => {
  const b = place("iron_farm", 180);
  await advance(1);
  await useOn(b, villagerItem(0));
  const m = machineOf(b);
  dim.setBlock(new Block(dim, b.location, "minecraft:air"));
  const before = dim.items.length;
  machines.sweep();
  assert.ok(!m.isValid);
  assert.equal(dim.items.length - before, 1);
});

test("Menu do Fazendeiro abre e coleta a saída", async () => {
  const b = place("farmer", 190, { "easy_villagers:crop": 0, "easy_villagers:stage": 0 });
  await advance(1);
  machineOf(b).getComponent("minecraft:inventory").container.setItem(8, new ItemStack("minecraft:carrot", 5));
  ui.respond = (data) => ({ canceled: false, selection: data.buttons.findIndex((x) => x.t.translate === "ui.easy_villagers.btn.collect") });
  inv.setItem(1, undefined);
  await useOn(b, undefined);
  await advance(3);
  ui.respond = () => ({ canceled: true });
  assert.equal(outputs(b).length, 0);
  assert.ok(inv.slots.some((s) => s?.typeId === "minecraft:carrot"));
});

test("Visualizador de Inventário: retira item do inventário do aldeão guardado", async () => {
  // Captura um aldeão real com pão no inventário
  const v = dim.spawnEntity("minecraft:villager_v2", { x: 300.5, y: 64, z: 0.5 });
  v.getComponent("minecraft:inventory").container.setItem(0, new ItemStack("minecraft:bread", 3));
  player.isSneaking = true;
  inv.setItem(0, undefined);
  world.beforeEvents.playerInteractWithEntity._l[0]({ player, target: v, cancel: false });
  await advance(3);
  const vil = inv.getItem(0);
  const b = place("inventory_viewer", 200);
  await advance(1);
  await useOn(b, vil);
  assert.ok(slots(b, [0])[0]);
  // menu principal -> botão "inventário"; depois -> "Retirar: pão"
  let step = 0;
  ui.respond = (data) => {
    step++;
    if (step === 1) return { canceled: false, selection: 0 };
    if (step === 2) return { canceled: false, selection: 0 };
    return { canceled: true };
  };
  inv.setItem(0, undefined);
  player.isSneaking = false;
  const ev = { player, block: b, itemStack: undefined, isFirstEvent: true, cancel: false, blockFace: "Up" };
  world.beforeEvents.playerInteractWithBlock._l[0](ev);
  await advance(40);
  ui.respond = () => ({ canceled: true });
  assert.ok(inv.slots.some((s) => s?.typeId === "minecraft:bread" && s.amount === 3), "pão entregue ao jogador");
  const after = slots(b, [0])[0];
  assert.ok(after, "aldeão continua no bloco");
  assert.equal(dim.getEntities({ type: "minecraft:villager_v2" }).filter((e) => e.location.y > 300).length, 0, "nenhum aldeão perdido no topo do mundo");
  const sid = readData(after).sid;
  const snap = world.structureManager._all.get(sid);
  assert.equal(snap[0].comps["minecraft:inventory"].container.slots.filter(Boolean).length, 0, "inventário atualizado na estrutura");
});
