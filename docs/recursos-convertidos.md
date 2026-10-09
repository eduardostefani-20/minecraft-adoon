# Situação da conversão

Legenda: ✅ concluído (implementado e coberto por teste automatizado fora do jogo) ·
🟡 parcial · ❌ não convertido · ⚠️ depende de verificação no jogo.

> Nenhum item foi testado dentro do Minecraft nesta etapa (o ambiente de
> desenvolvimento não tem o jogo). "Concluído" significa implementado, validado
> estaticamente e exercitado na simulação da API (`tests/simulation.test.mjs`).
> A lista `testes-manuais.md` deve ser seguida no Android.

## Blocos — 8 encontrados, 8 convertidos

| Bloco | Visual | Função | Observações |
|---|---|---|---|
| Comerciante | ✅ | ✅ ⚠️ | Aldeão real hospedado (invisível, imóvel, protegido) + miniatura; tocar nele abre a **tela de troca vanilla** com as trocas reais; estação define profissão; reabastecimento por evento `minecraft:resupply_trades`. Ciclo de trocas não convertido |
| Comerciante Automático | ✅ | 🟡 | Por escolha do usuário, usa a **mesma tela de troca vanilla** (aldeão real hospedado) e seus próprios tempos de reabastecimento. **Não troca sozinho**: o Bedrock não deixa scripts lerem/executarem as trocas reais |
| Fazendeiro | ✅ | ✅ | 6 culturas, crescimento 1/10 a cada segundo, colheita só com fazendeiro adulto, drops das loot tables vanilla |
| Criador | ✅ | ✅ | 24 pontos de comida, bebê a cada 1200 ticks, corações e som |
| Conversor | ✅ | 🟡 | Ciclo completo (consumo, fases, sons, aparência zumbificada), **sem o desconto de cura** (impossível por script) |
| Fazenda de Ferro | ✅ | ✅ | Golem aparece nos últimos 200 ticks com sobreposição vermelha; 3–5 ferro + 0–2 papoulas |
| Incubadora | ✅ | ✅ | Envelhece bebês na velocidade configurada |
| Visualizador de Inventário | ✅ | 🟡 | Inventário (8 espaços): ver, retirar, guardar. Equipamento do aldeão não convertido |

Comum a todos: dureza/resistência 2,5, picareta, som metálico, cor de mapa metal,
rotação de 4 direções de frente para o jogador, geometria fiel ao `farm.json`
(19 elementos, mesma textura `farm.png`), pisos com as texturas originais, loot table
(o Visualizador não dropa nada, como no original). ✅

## Itens — 9 encontrados, 9 convertidos

| Item | Situação |
|---|---|
| Aldeão (`easy_villagers:villager`) | ✅ guarda o aldeão inteiro (estrutura); 🟡 ícone 2D recriado (o original é um modelo 3D dinâmico); ❌ uso por dispensador |
| 8 itens de bloco | ✅ (o Bedrock gera o ícone 3D a partir da geometria) |
| 8 itens "… (com conteúdo)" | ✅ máquina quebrada guarda aldeões, itens e progresso (equivale ao `copy_block_entity` do Java); itens com encantamento/poção/durabilidade/nome caem no chão à parte |
| "Aldeão bebê" da aba criativa | ✅ como item `easy_villagers:baby_villager`, convertido automaticamente em item de aldeão bebê |

## Receitas — 7 encontradas, 7 convertidas ✅

Tags do Java trocadas por itens do Bedrock: vidraça incolor → `glass_pane`, lingotes →
`iron_ingot`/`netherite_ingot`, redstone → `redstone`, tábuas → tag `minecraft:planks`,
qualquer cama → 16 receitas (uma por cor de `minecraft:bed`).

## Entidades — 0 no original

Nenhuma criatura nova existe no mod. Foi criada 1 entidade técnica
(`easy_villagers:display`, não invocável naturalmente) para as miniaturas e o
inventário das máquinas.

## Mecânicas

| Mecânica | Situação |
|---|---|
| Pegar aldeão agachando + interagir | ✅ (tecla de atalho não existe no Bedrock) |
| Soltar aldeão com o item | ✅ (nasce no bloco vizinho da face clicada, como no Java) |
| Sons do aldeão no inventário | ✅ |
| Sons dos blocos (ambiente, zumbi, golem, estações, cura) | ✅ ⚠️ alguns IDs de som do Bedrock podem não existir (silenciosos se faltarem) |
| Inserir/retirar aldeão, estação e semente (agachar + mão vazia) | ✅ mesma ordem de prioridade do Java |
| Telas | ✅ interface de baú nativa (27 espaços) nas máquinas com itens; ⚠️ verificar no jogo; menu de estado ao tocar no piso |
| Automação com funis | 🟡 saídas → recipiente abaixo; funil acima → entradas (Visualizador e comerciantes sem automação) |
| Configuração | ✅ 14 opções via `/scriptevent` |
| Idiomas | ✅ 14 de 16 (Bedrock não tem croata nem chinês clássico) |
| Ciclo de trocas | ❌ |
| Reputação universal | ❌ |
| Integrações JEI / Jade / TOP | ❌ (não existem no Bedrock; o menu do bloco mostra as informações) |
