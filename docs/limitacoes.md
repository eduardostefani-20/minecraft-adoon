# Limitações e diferenças em relação ao Java

Cada item explica o motivo técnico e o que foi feito no lugar.

1. **Ofertas do aldeão não são acessíveis por script.** A Script API não lê nem executa
   as trocas de um aldeão. Por isso o **Comerciante Automático** agora usa a tela de troca
   vanilla (como o Comerciante) e **não troca sozinho** — escolha feita pelo usuário para
   manter as trocas reais. O *ciclo de trocas* e a *reputação universal* também não foram
   convertidos. Alternativa vanilla para novas trocas: quebrar e recolocar a estação de
   trabalho antes da primeira troca.

2. **Desconto de cura do Conversor.** No Bedrock o desconto depende de o próprio
   jogador curar o aldeão-zumbi; não há API para registrar isso. O Conversor
   executa o ciclo inteiro, mas o aldeão sai sem desconto.

3. **Tela de troca só abre tocando no aldeão.** Os dois comerciantes mantêm o aldeão real
   dentro do bloco (invisível, com lentidão e resistência máximas, preso no centro). A
   área de toque do aldeão vanilla tem 0,6 bloco de largura: toques no centro do bloco
   abrem a troca; toques bem na borda passam por ele.

3b. **Seleção do bloco só no piso (3 px).** É o que deixa o toque chegar ao aldeão ou à
   interface de baú. Para quebrar uma máquina, mire no piso.

3c. **Interface de baú.** É o inventário de 27 espaços da entidade da máquina
   (`container_type: minecart_chest`). ⚠️ Confirmar no jogo que tocar abre o baú; se não
   abrir, o menu de estado (tocar no piso) continua permitindo coletar a saída e retirar
   as entradas. Os espaços não têm rótulo: linha 1 = aldeões, linha 2 = entrada,
   linha 3 = saída; itens colocados em lugar inválido são devolvidos na frente do bloco.
   Entradas e saídas passaram de 4 para 9 espaços para preencher as linhas do baú.

4. **Reabastecimento do Comerciante** usa o evento `minecraft:resupply_trades` do
   `villager_v2` vanilla. ⚠️ Verificar no jogo; se a sua versão não tiver esse evento,
   o aldeão só reabastece pelas regras vanilla.

5. **Profissão por estação de trabalho**: usa os eventos vanilla `minecraft:spawn_<profissão>`.
   No Java a troca acontece se o aldeão tiver 0 de XP; como o XP não é legível no
   Bedrock, só aldeões **desempregados** recebem a nova profissão.

6. **Conteúdo guardado no item do bloco.** Itens empilháveis não aceitam dados no
   Bedrock, então uma máquina quebrada com conteúdo cai como o item não empilhável
   "… (com conteúdo)" (vazia, cai o bloco normal). Itens com encantamento, poção,
   durabilidade gasta ou nome não podem ser recriados por script e caem separados.
   No criativo nada cai (como no Java); o aldeão vivo de um comerciante é libertado.
   Se o bloco sumir por pistão ou `/setblock`, o conteúdo cai solto.

7. **Aldeão guardado como estrutura.** Cada item de aldeão aponta para uma estrutura
   salva no mundo. Se o item for destruído (lava, cacto, /clear) a estrutura fica
   órfã (alguns KB). Em modo criativo o item não é consumido ao soltar; a segunda
   cópia solta um aldeão novo, sem os dados.

8. **Idade de bebês capturados** é desconhecida (o Bedrock não expõe o tempo restante);
   assume-se 20 minutos. Bebês nascidos no Criador ganham o bioma do local onde
   forem soltos.

10. **Visualizador de Inventário** edita só o inventário de 8 espaços (não o
    equipamento), por menu, e não tem automação com funis. Cada edição recoloca o aldeão
    temporariamente no topo do mundo por ~2 ticks.

11. **Dispensador soltando aldeão**: o Bedrock não oferece evento de dispensador; não convertido.

12. **Ícones e miniaturas.** O ícone 3D dinâmico do Java foi trocado por um ícone 2D
    recriado (pixel art própria, `textures/easy_villagers/items/`). As miniaturas
    usam geometria recriada a partir dos modelos Java e **texturas vanilla do próprio
    jogo** (não copiadas). Braços cruzados do aldeão e braços do zumbi foram modelados
    sem rotação de ossos. O "aldeão-zumbi" é o aldeão com tom verde.
    O nível (insígnia) do aldeão não aparece porque não é legível por script.

13. **Texturas vanilla referenciadas** (88 caminhos listados por `tools/validate.py`)
    não podem ser verificadas fora do jogo. As de maior risco são as de
    `torchflower_crop_stage_*`, `pitcher_crop_bottom_stage_*`, algumas estações de
    trabalho (`lectern_*`, `grindstone_*`, `stonecutter2_*`) e as profissões
    `leatherworker`/`stonemason`. Se alguma faltar, apenas aquela face aparece sem textura.

14. **Sons.** Alguns IDs (ex.: `block.composter.fill_success`, `block.smithing_table.use`)
    podem não existir em todas as versões; nesse caso o som é simplesmente omitido.

15. **Idiomas croata (hr_hr) e chinês clássico (lzh)** não existem no Bedrock.
    Traduções incompletas do original caem para o inglês (igual ao Java).

16. **Tecla de atalho para pegar aldeão** e as opções de cliente
    `cycle_trades_button_location`/`block_render_distance`: o Bedrock não tem
    teclas personalizáveis nem configuração por cliente via script.

17. **Blacklist de culturas** (`farmer.crop_blacklist`) não foi portada: a única entrada
    padrão é de outro mod (Farmer's Delight), inexistente no Bedrock.
