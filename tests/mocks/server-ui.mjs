// Simulação de @minecraft/server-ui: os testes definem a resposta do formulário.
export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };
export const ui = { shown: [], respond: () => ({ canceled: true }) };
export class ActionFormData {
  constructor() { this.data = { buttons: [] }; }
  title(t) { this.data.title = t; return this; }
  body(b) { this.data.body = b; return this; }
  button(t, icon) { this.data.buttons.push({ t, icon }); return this; }
  async show(p) { ui.shown.push(this.data); return ui.respond(this.data, p); }
}
