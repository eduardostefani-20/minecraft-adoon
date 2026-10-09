// @ts-check
// Configuração persistente do mundo (equivalente ao ServerConfig/ClientConfig).
// Alterável por operadores com:
//   /scriptevent easy_villagers:config <chave> <valor>
//   /scriptevent easy_villagers:config            (lista os valores)
import { world } from "@minecraft/server";
import { CONFIG_LIMITS, DEFAULT_CONFIG, NS } from "./constants.js";

const KEY = `${NS}:config`;
/** @type {typeof DEFAULT_CONFIG} */
let cache = { ...DEFAULT_CONFIG };
let loaded = false;

export function cfg() {
  if (!loaded) {
    loaded = true;
    try {
      const raw = world.getDynamicProperty(KEY);
      if (typeof raw === "string") cache = { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch (e) {
      console.warn(`[${NS}] configuração inválida, usando padrões: ${e}`);
    }
  }
  return cache;
}

/**
 * @param {string} key
 * @param {string} value
 * @returns {string} mensagem de resultado
 */
export function setConfig(key, value) {
  const c = cfg();
  if (!(key in DEFAULT_CONFIG)) return `§cChave desconhecida: ${key}`;
  const k = /** @type {keyof typeof DEFAULT_CONFIG} */ (key);
  const def = DEFAULT_CONFIG[k];
  /** @type {any} */
  let v;
  if (typeof def === "boolean") {
    if (!["true", "false"].includes(value)) return "§cUse true ou false";
    v = value === "true";
  } else {
    v = Number(value);
    if (!Number.isFinite(v)) return "§cValor numérico inválido";
    if (key !== "villager_volume") v = Math.floor(v);
    const lim = CONFIG_LIMITS[/** @type {keyof typeof CONFIG_LIMITS} */ (key)];
    if (lim) v = Math.min(lim[1], Math.max(lim[0], v));
  }
  /** @type {any} */ (c)[k] = v;
  world.setDynamicProperty(KEY, JSON.stringify(c));
  return `§a${key} = ${v}`;
}

export function describeConfig() {
  const c = cfg();
  return Object.entries(c).map(([k, v]) => `§e${k}§r = ${v}`).join("\n");
}
