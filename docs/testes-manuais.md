# Testes manuais no jogo (Android)

Crie um mundo de teste **com comandos ativados**, ative os dois pacotes e marque cada item.
Abra o "Registro de conteúdo" (Configurações → Criador → Ativar registro de conteúdo
na tela) para ver erros de script/JSON.

## Carregamento
- [ ] O mundo abre sem erros no registro de conteúdo.
- [ ] Os 8 blocos e o item Aldeão aparecem no inventário criativo (aba Itens), com nomes em português.
- [ ] Os blocos mostram moldura de ferro, vidro e o piso correto (lava animada na Fazenda de Ferro).

## Aldeão
- [ ] Agachar + tocar num aldeão → item "Aldeão" com descrição (profissão, bioma).
- [ ] Usar o item no chão → o mesmo aldeão volta (mesmo nome e trocas).
- [ ] Item "Aldeão bebê" do criativo vira item de aldeão bebê no inventário.
- [ ] Sons de aldeão ocasionais com o item no inventário.

## Comerciante
- [ ] Usar atril e depois aldeão desempregado → vira bibliotecário; miniatura aparece.
- [ ] Tocar no aldeão dentro do bloco → **tela de troca vanilla**, com as trocas reais.
- [ ] Após esgotar uma troca, ela reabastece em 1–3 min (estação = profissão). ⚠️
- [ ] Agachar + mão vazia → retira o aldeão (com as trocas); de novo → retira a estação.

## Comerciante Automático
- [ ] Composteira + aldeão → fazendeiro; tocar no aldeão abre a mesma tela de troca vanilla.

## Interface de baú
- [ ] Tocar dentro do Fazendeiro/Criador/Conversor/Fazenda de Ferro/Incubadora abre um baú de 27 espaços. ⚠️
- [ ] Colocar terra na linha de entrada do Criador → é devolvida na frente do bloco.
- [ ] Tocar no piso com a mão vazia abre o menu de estado.

## Fazendeiro
- [ ] Aldeão desempregado + sementes de trigo → a cultura cresce e é colhida; saída no menu.
- [ ] Cenoura, batata, beterraba, flor-tocha e planta-jarro mostram textura correta. ⚠️

## Criador
- [ ] Dois aldeões adultos + 6 pães → bebê na saída após ~1 min, corações e som.

## Conversor
- [ ] Aldeão + maçã dourada + poção de fraqueza (normal/arremesso/prolongada) → aparência
      esverdeada, sons de cura, aldeão na saída após ~5 min.

## Fazenda de Ferro
- [ ] Miniaturas de aldeão e zumbi; aos ~3min50s o golem aparece piscando vermelho;
      aos 4 min ferro e papoulas na saída.

## Incubadora
- [ ] Aldeão bebê nas entradas → sai adulto após ~10 min.

## Visualizador de Inventário
- [ ] Aldeão fazendeiro com itens → "Abrir inventário do aldeão" lista os itens; retirar e guardar funcionam.

## Quebra e limpeza
- [ ] Quebrar (mirando no piso) uma máquina vazia → cai o bloco normal.
- [ ] Quebrar uma máquina com aldeão/itens → cai "… (com conteúdo)" com brilho e descrição; colocá-lo restaura tudo (inclusive o aldeão do Comerciante, com as trocas).
- [ ] Explosão de TNT → cai o item com conteúdo.
- [ ] `/setblock` de ar sobre uma máquina → em até 10 s o conteúdo cai e as miniaturas somem.
- [ ] Sair e voltar ao mundo → máquinas continuam com o conteúdo e o progresso.

## Configuração
- [ ] `/scriptevent easy_villagers:config breeding_time 200` acelera o Criador.

## Desempenho
- [ ] 20+ máquinas juntas sem queda perceptível de FPS/TPS num celular intermediário.
