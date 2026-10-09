// Simulação mínima de @minecraft/server para testes fora do jogo.
// Implementa apenas o que os scripts do addon usam.

let nextId = 1;
export const GameMode = { Creative: "Creative", Survival: "Survival" };
export const EntityComponentTypes = { Inventory: "minecraft:inventory" };
export const StructureSaveMode = { World: "World", Memory: "Memory" };

const KNOWN_ITEMS = new Set();
export const ItemTypes = {
  get(id) {
    if (id.startsWith("minecraft:") || id.startsWith("easy_villagers:")) return { id };
    return undefined;
  },
};

export class ItemStack {
  constructor(type, amount = 1) {
    if (!ItemTypes.get(type)) throw new Error(`item desconhecido ${type}`);
    this.typeId = type;
    this.amount = amount;
    this.maxAmount = type.startsWith("easy_villagers:") ? 1 : 64;
    this.props = {};
    this.lore = [];
    this.nameTag = undefined;
    this.potion = undefined;
    KNOWN_ITEMS.add(type);
  }
  get localizationKey() { return `item.${this.typeId}`; }
  get isStackable() { return this.maxAmount > 1; }
  clone() {
    const c = new ItemStack(this.typeId, this.amount);
    c.props = { ...this.props }; c.lore = [...this.lore]; c.nameTag = this.nameTag; c.potion = this.potion;
    return c;
  }
  isStackableWith(o) {
    return this.maxAmount > 1 && o.typeId === this.typeId && JSON.stringify(o.props) === JSON.stringify(this.props) && o.potion === this.potion;
  }
  getDynamicProperty(k) { return this.props[k]; }
  setDynamicProperty(k, v) {
    if (this.maxAmount > 1) throw new Error("propriedade dinâmica em item empilhável");
    this.props[k] = v;
  }
  setLore(l) { this.lore = l ?? []; }
  getLore() { return this.lore; }
  getComponent(id) {
    if (id === "minecraft:potion" && this.potion) return { potionEffectType: { id: this.potion } };
    return undefined;
  }
}

export class Container {
  constructor(size) { this.size = size; this.slots = new Array(size).fill(undefined); }
  getItem(i) { return this.slots[i]?.clone(); }
  setItem(i, s) { this.slots[i] = s && s.amount > 0 ? s.clone() : undefined; }
  get emptySlotsCount() { return this.slots.filter((s) => !s).length; }
  addItem(stack) {
    let rest = stack.clone();
    for (let i = 0; i < this.size && rest.amount > 0; i++) {
      const cur = this.slots[i];
      if (cur && cur.isStackableWith(rest)) {
        const mv = Math.min(cur.maxAmount - cur.amount, rest.amount);
        cur.amount += mv; rest.amount -= mv;
      }
    }
    for (let i = 0; i < this.size && rest.amount > 0; i++) {
      if (!this.slots[i]) {
        const put = rest.clone(); put.amount = Math.min(rest.maxAmount, rest.amount);
        this.slots[i] = put; rest.amount -= put.amount;
      }
    }
    return rest.amount > 0 ? rest : undefined;
  }
  isValid = true;
}

class Entity {
  constructor(typeId, dim, loc) {
    this.id = String(nextId++);
    this.typeId = typeId;
    this.dimension = dim;
    this.location = { ...loc };
    this.props = {};
    this.dyn = {};
    this.tags = new Set();
    this.effects = {};
    this.isValid = true;
    this.events = [];
    this.nameTag = "";
    this.isSneaking = false;
    this.isSleeping = false;
    this.components = {};
    if (typeId === "easy_villagers:display") this.components["minecraft:inventory"] = { container: new Container(12) };
    if (typeId === "minecraft:villager_v2") {
      this.components["minecraft:variant"] = { value: 0 };
      this.components["minecraft:mark_variant"] = { value: 0 };
      this.components["minecraft:inventory"] = { container: new Container(8) };
    }
    world._entities.set(this.id, this);
  }
  getComponent(id) { return this.components[id]; }
  getProperty(k) { return this.props[k]; }
  setProperty(k, v) { this.props[k] = v; }
  getDynamicProperty(k) { return this.dyn[k]; }
  setDynamicProperty(k, v) { this.dyn[k] = v; }
  setRotation(r) { this.rotation = r; }
  teleport(l) { this.location = { ...l }; }
  addTag(t) { this.tags.add(t); }
  removeTag(t) { this.tags.delete(t); }
  hasTag(t) { return this.tags.has(t); }
  getTags() { return [...this.tags]; }
  remove() { this.isValid = false; world._entities.delete(this.id); }
  addEffect(id, d, o) { this.effects[id] = { duration: d, ...o }; }
  getEffect(id) { return this.effects[id]; }
  removeEffect(id) { delete this.effects[id]; }
  triggerEvent(e) {
    this.events.push(e);
    const m = /^minecraft:spawn_(\w+)$/.exec(e);
    if (m && this.components["minecraft:variant"]) this.components["minecraft:variant"].value = PROFS.indexOf(m[1]);
    if (e === "minecraft:entity_born") this.components["minecraft:is_baby"] = {};
    if (e === "minecraft:ageable_grow_up") delete this.components["minecraft:is_baby"];
  }
}
const PROFS = ["unskilled", "farmer", "fisherman", "shepherd", "fletcher", "librarian", "cartographer", "cleric", "armorer", "weaponsmith", "toolsmith", "butcher", "leatherworker", "mason", "nitwit"];

export class Player extends Entity {
  constructor(dim) {
    super("minecraft:player", dim, { x: 0, y: 64, z: 0 });
    this.components["minecraft:inventory"] = { container: new Container(36) };
    this.selectedSlotIndex = 0;
    this.gameMode = GameMode.Survival;
    this.messages = [];
    this.onScreenDisplay = { setActionBar: (m) => this.messages.push(m) };
  }
  getGameMode() { return this.gameMode; }
  playSound() {}
  sendMessage(m) { this.messages.push(m); }
}

class Permutation {
  constructor(type, states) { this.type = type; this.states = states; }
  getState(k) { return this.states[k]; }
  withState(k, v) {
    if (!(k in this.states)) throw new Error(`estado inexistente ${k}`);
    return new Permutation(this.type, { ...this.states, [k]: v });
  }
  hasTag(t) { return this.type.startsWith("easy_villagers:") && t === "easy_villagers:machine"; }
}

export class Block {
  constructor(dim, loc, type, states = {}) {
    this.dimension = dim; this.location = loc; this.isValid = true;
    this.permutation = new Permutation(type, { "minecraft:cardinal_direction": "north", ...states });
    this.inventory = undefined;
  }
  get typeId() { return this.permutation.type; }
  get isAir() { return this.typeId === "minecraft:air"; }
  get isLiquid() { return false; }
  hasTag(t) { return this.permutation.hasTag(t); }
  setPermutation(p) { this.permutation = p; }
  getComponent(id) { return id === "minecraft:inventory" && this.inventory ? { container: this.inventory } : undefined; }
  below() { return this.dimension.getBlock({ ...this.location, y: this.location.y - 1 }); }
  above() { return this.dimension.getBlock({ ...this.location, y: this.location.y + 1 }); }
  offset(o) { return this.dimension.getBlock({ x: this.location.x + o.x, y: this.location.y + o.y, z: this.location.z + o.z }); }
}

class Dimension {
  constructor(id) {
    this.id = id; this.blocks = new Map(); this.sounds = []; this.particles = 0; this.items = [];
    this.heightRange = { min: -64, max: 320 };
  }
  key(l) { return `${Math.floor(l.x)},${Math.floor(l.y)},${Math.floor(l.z)}`; }
  setBlock(b) { this.blocks.set(this.key(b.location), b); return b; }
  getBlock(l) { return this.blocks.get(this.key(l)) ?? this.setBlock(new Block(this, { x: Math.floor(l.x), y: Math.floor(l.y), z: Math.floor(l.z) }, "minecraft:air")); }
  spawnEntity(type, loc, opts) {
    const e = new Entity(type, this, loc);
    if (opts?.spawnEvent) e.triggerEvent(opts.spawnEvent);
    return e;
  }
  allEntities() { return [...world._entities.values()].filter((e) => e.dimension === this && e.isValid); }
  getEntitiesAtBlockLocation(l) { return this.allEntities().filter((e) => this.key(e.location) === this.key(l)); }
  getEntities(q = {}) {
    return this.allEntities().filter((e) => {
      if (q.type && e.typeId !== q.type) return false;
      if (q.tags && !q.tags.every((t) => e.hasTag(t))) return false;
      if (q.location && q.volume) {
        const l = e.location, a = q.location, v = q.volume;
        if (l.x < a.x || l.x > a.x + v.x || l.y < a.y || l.y > a.y + v.y || l.z < a.z || l.z > a.z + v.z) return false;
      } else if (q.location && q.maxDistance !== undefined) {
        const d = Math.hypot(e.location.x - q.location.x, e.location.y - q.location.y, e.location.z - q.location.z);
        if (d > q.maxDistance) return false;
      }
      return true;
    });
  }
  playSound(id) { this.sounds.push(id); }
  spawnParticle() { this.particles++; }
  spawnItem(s, l) { this.items.push(s); }
  getBiome() { return { id: "minecraft:plains" }; }
}

const structures = new Map();
export const world = {
  _entities: new Map(),
  _dyn: {},
  _dims: { "minecraft:overworld": new Dimension("minecraft:overworld") },
  getDimension(id) { const d = this._dims[id]; if (!d) throw new Error("dim"); return d; },
  getEntity(id) { return this._entities.get(id); },
  getDynamicProperty(k) { return this._dyn[k]; },
  setDynamicProperty(k, v) { this._dyn[k] = v; },
  getAllPlayers() { return [...this._entities.values()].filter((e) => e instanceof Player); },
  structureManager: {
    createFromWorld(id, dim, from, to) {
      const ents = dim.getEntities({ location: from, volume: { x: to.x - from.x + 1, y: to.y - from.y + 1, z: to.z - from.z + 1 } })
        .filter((e) => e.typeId !== "minecraft:player")
        .map((e) => ({ snap: JSON.parse(JSON.stringify({ typeId: e.typeId, dyn: e.dyn, tags: [...e.tags], nameTag: e.nameTag })), comps: structuredCloneComps(e), rel: { x: e.location.x - from.x, y: e.location.y - from.y, z: e.location.z - from.z } }));
      structures.set(id, ents);
      return {};
    },
    get(id) { return structures.has(id) ? {} : undefined; },
    delete(id) { return structures.delete(id); },
    place(id, dim, loc) {
      for (const s of structures.get(id) ?? []) {
        const e = new Entity(s.snap.typeId, dim, { x: loc.x + s.rel.x, y: loc.y + s.rel.y, z: loc.z + s.rel.z });
        e.dyn = s.snap.dyn; e.tags = new Set(s.snap.tags); e.nameTag = s.snap.nameTag; e.components = s.comps;
      }
    },
    _all: structures,
  },
  beforeEvents: { playerInteractWithBlock: sig(), playerInteractWithEntity: sig() },
  afterEvents: { playerBreakBlock: sig(), blockExplode: sig() },
};
function structuredCloneComps(e) {
  const out = {};
  for (const [k, v] of Object.entries(e.components)) {
    if (v.container) {
      const c = new Container(v.container.size);
      v.container.slots.forEach((s, i) => { c.slots[i] = s?.clone(); });
      out[k] = { container: c };
    } else out[k] = { ...v };
  }
  return out;
}
function sig() { const l = []; return { subscribe: (f) => { l.push(f); return f; }, _l: l }; }

// Agendador controlado manualmente pelos testes
const timers = [];
export const system = {
  currentTick: 0,
  run(f) { timers.push({ at: this.currentTick, f }); return 0; },
  runTimeout(f, n = 1) { timers.push({ at: this.currentTick + n, f }); return 0; },
  runInterval() { return 0; },
  beforeEvents: { startup: sig() },
  afterEvents: { scriptEventReceive: sig() },
};
/** Avança n ticks executando tarefas agendadas e aguardando promessas. */
export async function advance(n = 1) {
  for (let i = 0; i < n; i++) {
    system.currentTick++;
    for (;;) {
      const due = timers.filter((t) => t.at <= system.currentTick);
      if (!due.length) break;
      for (const t of due) { timers.splice(timers.indexOf(t), 1); t.f(); }
      await new Promise((r) => setImmediate(r));
    }
    await new Promise((r) => setImmediate(r));
  }
}
export const _test = { Dimension, Entity, structures };
