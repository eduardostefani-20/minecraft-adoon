// @ts-check
// Utilidades de interface (formulários) — substituem as telas (GUIs) Java.
import { FormCancelationReason } from "@minecraft/server-ui";
import { NS } from "./constants.js";
import { readData, isVillagerItem } from "./villager.js";
import { waitTicks } from "./util.js";

/** @typedef {import("@minecraft/server").RawMessage} RawMessage */
/** @typedef {import("@minecraft/server").ItemStack} ItemStack */
/** @typedef {import("@minecraft/server").Player} Player */

/** Mensagem traduzível com chave de interface do addon. */
export function tr(/** @type {string} */ key, /** @type {(string|RawMessage)[]} */ ...args) {
  /** @type {RawMessage} */
  const m = { translate: /^(gui|block|item)\./.test(key) ? key : `ui.${NS}.${key}` };
  if (args.length) {
    m.with = { rawtext: args.map((a) => (typeof a === "string" ? { text: a } : a)) };
  }
  return m;
}

export const profName = (/** @type {number} */ p) => tr(`prof.${p}`);

/** Nome traduzido + quantidade de uma pilha. */
export function itemLabel(/** @type {ItemStack | undefined} */ s) {
  if (!s) return tr("empty");
  if (isVillagerItem(s)) {
    const d = readData(s);
    return { rawtext: [profName(d.prof), { text: d.baby ? " " : "" }, d.baby ? tr("baby") : { text: "" }] };
  }
  return { rawtext: [{ translate: s.localizationKey }, { text: s.amount > 1 ? ` x${s.amount}` : "" }] };
}

/** Junta várias mensagens em linhas. */
export function lines(/** @type {RawMessage[]} */ parts) {
  /** @type {RawMessage[]} */
  const raw = [];
  parts.forEach((p, i) => {
    if (i) raw.push({ text: "\n" });
    raw.push(p);
  });
  return { rawtext: raw };
}

/** Lista de pilhas (ou "(vazio)"). */
export function itemList(/** @type {(ItemStack|undefined)[]} */ stacks) {
  const present = stacks.filter((s) => !!s);
  if (!present.length) return tr("empty");
  /** @type {RawMessage[]} */
  const raw = [];
  present.forEach((s, i) => {
    raw.push({ text: i ? ", " : "" });
    raw.push(itemLabel(s));
  });
  return { rawtext: raw };
}

/**
 * Mostra um formulário, repetindo se o jogador ainda estiver com outra tela
 * aberta (UserBusy).
 * @template {{show(p: Player): Promise<any>}} F
 * @param {F} form
 * @param {Player} player
 */
export async function showForm(form, player) {
  for (let i = 0; i < 10; i++) {
    const r = await form.show(player);
    if (r.canceled && r.cancelationReason === FormCancelationReason.UserBusy) {
      await waitTicks(5);
      continue;
    }
    return r;
  }
  return undefined;
}
