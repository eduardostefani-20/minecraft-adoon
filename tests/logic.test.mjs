// Testes das regras de jogo portadas do código Java (node --test tests/)
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CROPS, DEFAULT_CONFIG, PROFESSIONS, WORKSTATIONS, cropForSeed, workstationForItem,
} from "../source/behavior_pack/scripts/constants.js";
import {
  addAutoXp, advanceAge, converterTimes, cropDrops, crossed, displayYaw, foodValue, golemDrops, golemTimes,
  incubatorStep, levelForXp, newAutoState, planFoodRemoval, restockDelay, rotateOffset, rollTier, tradeOf,
} from "../source/behavior_pack/scripts/logic.js";
import { TRADES } from "../source/behavior_pack/scripts/trades.js";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
const all = () => true;

test("configuração padrão igual ao ServerConfig original", () => {
  assert.equal(DEFAULT_CONFIG.breeding_time, 1200);
  assert.equal(DEFAULT_CONFIG.converting_time, 6000);
  assert.equal(DEFAULT_CONFIG.farm_speed, 10);
  assert.equal(DEFAULT_CONFIG.golem_spawn_time, 4800);
  assert.equal(DEFAULT_CONFIG.incubator_speed, 2);
  assert.equal(DEFAULT_CONFIG.auto_trader_cooldown, 20);
});

test("estações de trabalho mapeiam para a profissão correta", () => {
  assert.equal(workstationForItem("minecraft:composter"), 1);
  assert.equal(workstationForItem("minecraft:lectern"), 5);
  assert.equal(workstationForItem("minecraft:stonecutter_block"), 13);
  assert.equal(workstationForItem("minecraft:dirt"), 0);
  assert.equal(WORKSTATIONS.length, PROFESSIONS.length - 1);
});

test("sementes válidas do Fazendeiro", () => {
  assert.equal(cropForSeed("minecraft:wheat_seeds"), 1);
  assert.equal(cropForSeed("minecraft:potato"), 3);
  assert.equal(cropForSeed("minecraft:melon_seeds"), 0);
  assert.equal(CROPS[4].maxAge, 3);
});

test("drops de trigo: 1 trigo + 0..3 sementes", () => {
  assert.deepEqual(cropDrops(1, () => 0), [["minecraft:wheat", 1], ["minecraft:wheat_seeds", 3]]);
  assert.deepEqual(cropDrops(1, () => 0.99), [["minecraft:wheat", 1]]);
});

test("drops de batata incluem batata venenosa com 2%", () => {
  const d = cropDrops(3, () => 0.01);
  assert.deepEqual(d, [["minecraft:potato", 4], ["minecraft:poisonous_potato", 1]]);
});

test("drops do golem: 3-5 ferro, 0-2 papoulas", () => {
  for (let i = 0; i < 200; i++) {
    const d = golemDrops(Math.random);
    const iron = d.find((x) => x[0] === "minecraft:iron_ingot")[1];
    assert.ok(iron >= 3 && iron <= 5);
    const poppy = d.find((x) => x[0] === "minecraft:poppy");
    if (poppy) assert.ok(poppy[1] >= 1 && poppy[1] <= 2);
  }
});

test("comida do Criador: 24 pontos, pão vale 4", () => {
  const slots = [{ id: "minecraft:bread", amount: 5 }, { id: "minecraft:carrot", amount: 10 }, undefined, undefined];
  assert.equal(foodValue(slots), 30);
  assert.deepEqual(planFoodRemoval(slots), [5, 4, 0, 0]);
  assert.equal(planFoodRemoval([{ id: "minecraft:bread", amount: 5 }, undefined]), null);
  assert.deepEqual(planFoodRemoval([{ id: "minecraft:bread", amount: 64 }]), [6]);
});

test("tempos do Conversor e da Fazenda de Ferro", () => {
  assert.deepEqual(converterTimes(6000), { zombify: 60, cure: 120, convert: 6120, finalize: 6180 });
  assert.deepEqual(golemTimes(4800), { spawn: 4600, kill: 4800 });
  assert.ok(crossed(40, 60, 60));
  assert.ok(!crossed(60, 80, 60));
});

test("idade e incubadora", () => {
  assert.deepEqual(advanceAge(-10, 20), { age: 10, grewUp: true });
  assert.deepEqual(advanceAge(5, 20), { age: 25, grewUp: false });
  assert.equal(incubatorStep(-24000, 2), 2);
  assert.equal(incubatorStep(-1, 2), 1);
  assert.equal(incubatorStep(0, 2), 1);
});

test("reabastecimento entre min e max", () => {
  assert.equal(restockDelay(1200, 3600, () => 0), 1200);
  assert.equal(restockDelay(1200, 3600, () => 0.9999), 3599);
});

test("rotação das miniaturas segue o PoseStack Java", () => {
  // Bloco virado ao norte: deslocamento local (0, -0.25) vai para +z (metade de trás)
  const n = rotateOffset("north", 0, -0.25);
  assert.ok(Math.abs(n.x) < 1e-9 && Math.abs(n.z - 0.25) < 1e-9);
  const s = rotateOffset("south", 0, -0.25);
  assert.ok(Math.abs(s.z + 0.25) < 1e-9);
  assert.equal(displayYaw("north", 0), 180);
  assert.equal(displayYaw("north", 90), 90);
});

test("tabela de trocas bem-formada", () => {
  for (const [prof, tiers] of Object.entries(TRADES)) {
    assert.ok(PROFESSIONS.includes(prof), prof);
    assert.equal(tiers.length, 5, prof);
    for (const tier of tiers) for (const t of tier) {
      assert.match(t[0][0], /^minecraft:/);
      assert.ok(t[0][1] > 0 && t[2][1] > 0 && t[3] > 0 && t[4] > 0);
    }
  }
  assert.equal(Object.keys(TRADES).length, 13);
});

test("mercador virtual: 2 trocas por nível e subida de nível", () => {
  const s = newAutoState(1, seq(0, 0.5), all);
  assert.equal(s.lvl, 1);
  assert.equal(s.trades.length, 2);
  assert.equal(levelForXp(9), 1);
  assert.equal(levelForXp(10), 2);
  assert.equal(levelForXp(250), 5);
  assert.ok(addAutoXp(s, 1, 10, seq(0), all));
  assert.equal(s.lvl, 2);
  assert.equal(s.trades.length, 4);
  assert.ok(tradeOf(s.trades[0], 1));
  // filtro de itens inexistentes
  assert.equal(rollTier(1, 0, seq(0), () => false).length, 0);
});
