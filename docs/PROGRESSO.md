# Registro de progresso

Registro persistente para continuar o trabalho em sessões futuras.

## Sessão 1 (2026-10-09)

- [x] FASE 1–2: JAR extraído, 181 classes descompiladas (Vineflower 1.10.1), inventário em `inventario-original.md`.
- [x] FASE 3: alvo Bedrock 1.26.0 / `@minecraft/server` 2.4.0 / `server-ui` 2.0.0 (versões conferidas no npm).
- [x] FASE 4: textura `farm.png`, setas, ícone e 16 idiomas reaproveitados; geometria convertida de `farm.json`.
- [x] FASE 5: 8 blocos, 2 itens, 7 receitas (22 arquivos), 7 loot tables, entidade técnica.
- [x] FASE 6: lógica das 8 máquinas, item de aldeão por estrutura, menus, funis, configuração.
- [x] FASE 7–9: gerador, validador, testes (13 de regras + 12 de simulação), pacotes em `release/`.
- [x] FASE 10: documentação.

## Próximos passos sugeridos

1. Rodar `docs/testes-manuais.md` num Android com Bedrock 1.26+ e anotar o resultado aqui.
2. Corrigir caminhos de texturas vanilla que aparecerem sem textura (lista em `tools/validate.py`).
3. Confirmar o evento `minecraft:resupply_trades` e os eventos `minecraft:spawn_<profissão>`.
4. Se a Script API ganhar acesso às ofertas de aldeões, trocar o mercador virtual
   do Comerciante Automático pelas ofertas reais e portar o ciclo de trocas.
