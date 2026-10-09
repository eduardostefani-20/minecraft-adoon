# Compatibilidade e arquitetura

## Versão-alvo

| Item | Valor |
|---|---|
| Minecraft Bedrock mínimo | **1.26.0** (`min_engine_version [1, 26, 0]`) |
| `@minecraft/server` | **2.4.0** (estável) |
| `@minecraft/server-ui` | **2.0.0** (estável) |
| Formatos | blocos/itens/entidade `1.21.90`, geometria `1.21.0`/`1.12.0`, receitas `1.20.10` |
| Experimentos | **nenhum** é necessário |
| Plataforma principal | Android (funciona também em Windows, iOS e consoles com a mesma versão) |

**Por que 2.4.0?** É a primeira versão estável da API com `ItemPotionComponent`,
necessário para reconhecer a Poção de Fraqueza do Conversor. As versões foram
conferidas no npm (2.4.0 publicado em dez/2025, junto com o Bedrock 1.26.0) e todos
os scripts passam por verificação de tipos (`npm run typecheck`) contra as tipagens
oficiais dessa versão — nenhuma função inexistente é usada.

## Estrutura dos pacotes

```
source/behavior_pack/
  manifest.json            módulos data + script (scripts/main.js)
  blocks/*.json            8 blocos (estados, permutações, componente easy_villagers:machine)
  items/*.json             villager, baby_villager
  entities/display.json    entidade técnica (miniaturas + inventário da máquina)
  recipes/*.json           22 arquivos (7 receitas; o Criador tem 1 por cor de cama)
  loot_tables/blocks/easy_villagers/*.json
  scripts/*.js             lógica (ver abaixo)
  texts/*.lang             14 idiomas
source/resource_pack/
  manifest.json
  blocks.json              som "metal"
  models/blocks/farm.geo.json      geometria convertida de farm.json
  models/entity/display.geo.json   aldeão (3 camadas), zumbi, golem de ferro
  entity/, render_controllers/, animations/
  textures/terrain_texture.json, item_texture.json, flipbook_textures.json
  textures/easy_villagers/         texturas do mod + ícones recriados
  texts/*.lang
```

## Como cada parte do Java foi mapeada

| Java (NeoForge) | Bedrock |
|---|---|
| `BlockEntity` com inventário/NBT | Entidade técnica `easy_villagers:display` no centro do bloco: inventário de 27 espaços (aberto como baú) + estado JSON em propriedade dinâmica |
| `BlockEntityTicker` (a cada tick) | Componente `minecraft:tick` a cada 20 ticks + componente de script `easy_villagers:machine`; temporizadores avançam 20 por execução (mesmos tempos totais) |
| `useItemOn` / `useWithoutItem` | `world.beforeEvents.playerInteractWithBlock` (cancelado e tratado no tick seguinte) |
| Telas (containers) | Interface de baú nativa da entidade da máquina + menu de estado (`ActionFormData`) |
| Tela de troca | Aldeão real hospedado nos dois comerciantes → tela vanilla |
| `copy_block_entity` (conteúdo no item) | Item não empilhável `<bloco>_packed` com propriedade dinâmica |
| `VillagerItem` com NBT completo | Item `easy_villagers:villager` (pilha 1) com propriedades dinâmicas + **estrutura salva no mundo** contendo a entidade real (trocas, nível, XP, inventário, nome, fofocas) |
| `BlockEntityRenderer` | Entidade de exibição com propriedades sincronizadas (profissão, bioma, bebê, zumbificado, ferido, escala) |
| Estação/cultura renderizadas | Partes da geometria do bloco com visibilidade por estado (`easy_villagers:workstation`, `crop`, `stage`) |
| `facing` | Traço `minecraft:placement_direction` + permutações com `minecraft:transformation` |
| Capacidades de item (funis) | Script: saídas vão para o recipiente abaixo; funil acima apontando para baixo alimenta as entradas |
| `ServerConfig`/`ClientConfig` | Propriedade dinâmica do mundo, editável com `/scriptevent easy_villagers:config` |
| Sons vanilla Java | IDs de som vanilla do Bedrock |

## Configuração

Operadores podem usar (requer comandos ativados):

```
/scriptevent easy_villagers:config                      (lista tudo)
/scriptevent easy_villagers:config breeding_time 600
```

| Chave | Padrão | Original |
|---|---|---|
| breeding_time | 1200 | breeder.breeding_time |
| converting_time | 6000 | converter.converting_time |
| farm_speed | 10 | farmer.farm_speed |
| golem_spawn_time | 4800 | iron_farm.spawn_time |
| trader_min/max_restock_time | 1200 / 3600 | trader.* |
| auto_trader_min/max_restock_time | 1200 / 3600 | auto_trader.* |
| villager_inventory_sounds | true | villager.inventory_sounds |
| villager_sound_amount | 20 | villager.sound_amount |
| incubator_speed | 2 | incubator.speed |
| sneak_pick_up | true | (cliente) villager.sneak_pick_up |
| villager_volume | 1.0 | (cliente) villager.volume |
| render_block_contents | true | (cliente) villager.render_block_contents |
| hopper_automation | true | (novo) liga/desliga a automação com funis |

`auto_trader.trade_cooldown` (o Comerciante Automático não troca mais sozinho), `farmer.crop_blacklist`, `villager.trade_cycling`, `villager.universal_reputation`,
`cycle_trades_button_location` e `block_render_distance` não têm equivalente (ver
`limitacoes.md`).

## Otimização para celular

- Cada máquina roda **1 vez por segundo** (não a cada tick) e só em chunks carregados.
- O estado só é gravado quando muda; propriedades de entidade só são enviadas quando mudam.
- Sem buscas globais por tick: a entidade de cada bloco é guardada em cache por id.
- Uma varredura de limpeza leve roda a cada 10 s.
- Miniaturas sem IA, sem física e sem colisão; o Comerciante é o único bloco com aldeão
  real (necessário para a tela de troca vanilla).
- Texturas de blocos/entidades vanilla são referenciadas (não copiadas) → pacote de ~140 KB.
- Animação única (escala) por miniatura.
