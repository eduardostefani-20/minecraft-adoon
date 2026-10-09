# Inventário técnico do mod original

**Arquivo analisado:** `original/easy-villagers-neoforge-1.1.42+26.1.2.jar`
(SHA-256 `6c8c0e0caf6931d1eee09d92656a971f03a920627e83fbf2f090779263b15c5f`, 487 186 bytes)

| Item | Valor |
|---|---|
| Mod | Easy Villagers (`easy_villagers`) v1.1.42, autor Max Henkel, licença "All rights reserved" |
| Minecraft Java | 26.1.x (`versionRange = [26.1,26.2)`) |
| Loader | NeoForge ≥ 26.1.0.1-beta (`META-INF/neoforge.mods.toml`) |
| Conteúdo | JAR compilado (181 classes) + assets + data. Sem código-fonte. |
| Bibliotecas | "corelib" de Max Henkel embutida (sombreada em `de/maxhenkel/easyvillagers/corelib`) |
| Dependências obrigatórias | NeoForge, Minecraft |
| Dependências opcionais | JEI, The One Probe, Jade (apenas integrações de exibição) |

**Como foi analisado:** o JAR foi extraído e as classes foram descompiladas com o
Vineflower 1.10.1 (ferramenta só de leitura, fora do repositório). Todos os valores
abaixo vêm do bytecode e dos JSON originais; nada foi inventado. O código
descompilado não foi incluído no repositório, porque o mod é "All rights reserved".

## Blocos (8)

Todos herdam `VillagerBlockBase` → `HorizontalRotatableBlock`: propriedade `facing`
(4 direções horizontais, o bloco fica de frente para o jogador), `strength(2.5)`
(dureza e resistência a explosões 2.5), `SoundType.METAL`, `MapColor.METAL`,
`noOcclusion`, minerável com picareta (tag `mineable/pickaxe`, sem exigir ferramenta
correta), forma de colisão = caixa oca (6 paredes de 1 px). Modelo comum
`models/block/farm.json` (19 elementos: moldura de ferro, painéis de vidro, piso
dividido em frente/fundo).

| ID | Classe Java | Piso frente / fundo | Receita | Drop | Função |
|---|---|---|---|---|---|
| `trader` | TraderBlock / TraderTileentity | bloco de ferro / ferro | sim | ele mesmo + conteúdo | Aldeão + estação de trabalho; clique abre a tela de troca vanilla; reabastece a cada 1200–3600 ticks se a profissão bater com a estação |
| `auto_trader` | AutoTraderBlock / AutoTraderTileentity | netherita / netherita | sim | idem | Igual ao anterior, mas faz a troca escolhida sozinho a cada 20 ticks usando 4 espaços de entrada e 4 de saída |
| `farmer` | FarmerBlock / FarmerTileentity | terra / terra | sim | idem | Aldeão (vira fazendeiro se for desempregado) + semente; a cultura cresce 1 estágio a cada 20 ticks com chance 1/10; quando madura e o aldeão é fazendeiro adulto, colhe para 4 espaços de saída |
| `breeder` | BreederBlock / BreederTileentity | tábuas de carvalho | sim | idem | 2 aldeões adultos + comida (pão 4, batata/cenoura/beterraba 1; precisa de 24 pontos) → aldeão bebê a cada 1200 ticks; corações + som |
| `converter` | ConverterBlock / ConverterTileentity | pedregulho com musgo | sim | idem | Aldeão + maçã dourada + poção de fraqueza → zumbificação (60), cura (120), conversão (+6000), finaliza (+60) com reputação de cura para o dono → desconto |
| `iron_farm` | IronFarmBlock / IronFarmTileentity | lava / pedra | sim | idem | Aldeão + zumbi: a cada 4800 ticks surge um golem (200 ticks apanhando) e seus drops (3–5 ferro, 0–2 papoulas) vão para a saída |
| `incubator` | IncubatorBlock / IncubatorTileentity | lã branca | sim | idem | Pega aldeões das entradas e envelhece bebês 2× mais rápido; adultos saem |
| `inventory_viewer` | InventoryViewerBlock / InventoryViewerTileentity | lã preta | **não** | **nada** (sem loot table) | Mostra/edita o inventário (8) e o equipamento do aldeão guardado |

## Itens (9 registrados)

| ID | Tipo | Observações |
|---|---|---|
| `villager` | `VillagerItem`, pilha máx. 1 | Guarda o NBT completo do aldeão (componente `easy_villagers:villager`); usar no chão/dispensador solta o aldeão; faz sons no inventário |
| 8 itens de bloco | `BlockItem` | Renderização 3D especial (o conteúdo aparece no ícone) |
| (aba criativa) "Baby Villager" | mesma `villager` com `Age=-24000` | Não é um item separado; existe a chave de tradução `item.easy_villagers.baby_villager` |

## Receitas (7, todas `crafting_shaped`)

| Resultado | Padrão | Chaves |
|---|---|---|
| trader | `GGG/GRG/III` | G vidraça incolor, R redstone, I lingote de ferro |
| auto_trader | `GGG/GRG/INI` | + N lingote de netherita |
| farmer | `GGG/GWG/IDI` | W balde d'água, D terra |
| breeder | `GGG/GBG/IWI` | B qualquer cama, W qualquer tábua |
| converter | `GGG/GFG/ICI` | F carne podre, C pedregulho com musgo |
| iron_farm | `GGG/GLG/ISI` | L balde de lava, S pedra |
| incubator | `GGG/G G/IWI` | W lã branca |

## Loot tables (7)

Uma por bloco (exceto o Visualizador), com a função `easy_villagers:copy_block_entity`
que guarda o conteúdo dentro do item do bloco.

## Tags

- `minecraft:mineable/pickaxe`: os 8 blocos.
- `easy_villagers:invalid_farmer_crop`: `farmersdelight:tomato_seeds` (opcional; outro mod).

## Entidades

Nenhuma entidade nova é registrada. `EasyVillagerEntity` é uma subclasse de `Villager`
usada só internamente (reputação universal, nome com profissão, recálculo de ofertas).
Os renderizadores desenham entidades vanilla dentro dos blocos: aldeão (escala
0,3–0,45), zumbi, aldeão-zumbi, golem de ferro (com sobreposição vermelha) e cama.

## Texturas, modelos, sons e partículas

| Recurso | Arquivos |
|---|---|
| Textura de bloco | `textures/block/farm.png` (moldura 16×16) |
| Interface | `gui/arrow_left.png`, `gui/arrow_right.png`, 6 fundos de container em `gui/container/` |
| Modelos | 9 blockstates, 9 modelos de bloco (`farm` + 8 filhos), 9 modelos de item (`builtin/entity`), 9 definições `items/*.json` |
| Sons | `sounds.json` vazio — usa apenas sons vanilla (aldeão, zumbi, golem, plantio, estações) |
| Partículas | corações (`ParticleTypes.HEART`) no Criador |
| Idiomas | 16 (`en_us, pt_br, de_de, es_mx, fr_fr, hr_hr, hu_hu, id_id, ja_jp, ko_kr, lzh, ru_ru, tr_tr, uk_ua, zh_cn, zh_tw`) |
| Ícone | `icon.png` 256×256 |

## Mecânicas gerais

- **Pegar aldeão:** agachar + clicar com o botão direito (configurável) ou tecla de atalho.
- **Ciclo de trocas:** botão na tela de troca que sorteia de novo as ofertas de um aldeão que ainda não negociou.
- **Reputação universal:** os descontos de cura valem para todos os jogadores.
- **Automação:** capacidades de item (funis/canos) — entradas e saídas por bloco.
- **Configuração:** 15 opções de servidor e 5 de cliente (ver `docs/compatibilidade.md`).
- **Integrações:** JEI (categorias de criação/conversão/incubação), Jade/TOP (dicas).

## Estruturas, dimensões, biomas e geração de mundo

Nenhuma.
