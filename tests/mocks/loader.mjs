// Redireciona os módulos do jogo para as simulações durante os testes.
const map = {
  "@minecraft/server": new URL("./server.mjs", import.meta.url).href,
  "@minecraft/server-ui": new URL("./server-ui.mjs", import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  if (map[specifier]) return { url: map[specifier], shortCircuit: true };
  return next(specifier, context);
}
