# Direção visual do Runas DM

## Personalidade

Painel operacional moderno inspirado no Livro Vermelho: árvore, pedra rúnica e tons minerais foscos. O fundo usa uma interpretação própria sem tipografia da capa, coberta por camadas translúcidas. Não recicla o layout do Runas Tools.

## Temas

- Escuro: obsidiana quente, vinho mineral e acentos foscos; brilho aparece somente em bordas, foco e runas.
- Claro: papel quente, tinta castanha escura e acentos com contraste WCAG visualmente verificável.

## Componentes

- Cartões do bestiário equilibram densidade e leitura: no desktop usam largura mínima de 420 px e altura mínima de 184 px, com nome, raça, afinidade, eficiência, recursos e atributos legíveis sem abrir a ficha.
- A grade reduz o número de colunas automaticamente e passa para uma coluna em telas estreitas; conteúdo normal parte de 11–14 px e nunca pode invadir o componente vizinho. Compactação acontece pela organização, não por texto minúsculo.
- Motivos rúnicos usam bordas, círculos e tipografia, sem ilustrações pesadas.
- Ações primárias usam ciano; aplicar dano usa coral/vermelho.
- Informações de combate ficam visíveis sem rolagem horizontal.
- Modais preservam o contexto e não navegam para outra rota.
- Físico, Mental e Místico preservam as três faixas horizontais históricas: atributo primário à esquerda e seus três secundários na mesma linha. Não substituir por cartões independentes.
- Inputs numéricos nunca exibem os controles nativos de incremento/decremento do navegador.
- Imagens de ficha usam recorte quadrado ou retangular com cantos moderados; círculos são reservados às runas sem imagem. A ficha simplificada oferece seleção e remoção explícitas.
- No cabeçalho simplificado, Nome ocupa a linha superior; Raça, Afinidade e Eficiência permanecem juntas na linha inferior. Eficiência é sempre apresentada e editada com o sufixo `%`.
- Na simplificada, listas densas mostram resumo e edição progressiva. Na avançada, a organização acompanha o Runas Tools: perícias e vínculos são linhas editáveis; habilidades, magias e anotações são tabelas-resumo com janela de registro; inventário mostra carga, armadura e itens antes de abrir detalhes. Cartões expansíveis genéricos são proibidos nessas seções.
- Campos modificadores aparecem imediatamente antes, à esquerda, do recurso ou estado que alteram.
- A ficha simplificada usa largura máxima aproximada de 1060 px; a avançada expande até aproximadamente 1280 px.
- A barra superior usa a mesma grade nas duas áreas (`1fr auto 1fr`): marca à esquerda, navegação centralizada, ações à direita. Em telas estreitas a navegação vira barra inferior — e a barra perde o `backdrop-filter`, que de outro modo a torna bloco de contenção e prende a navegação fixa dentro dela.
- Uma página de História mostra os acontecimentos como cartões sequenciais, com o texto completo visível e os controles `^`, `v`, editar e excluir no canto superior do cartão.
- Cores têm função: vermelho para PV/dano, ciano para PA/testes, violeta para PE/magia, dourado para recursos narrativos e verde para restauração/carga.

## Velocidade percebida

- Evitar animações longas, carrosséis e transições de página.
- Feedback de salvar, rolar e aplicar dano deve ser imediato.
- Ações frequentes de uma tela (rolar teste, aplicar dano, criar ficha) ficam sempre visíveis nela. As ações da barra superior são a exceção deliberada: tema, backup, importação e Obsidian moram no botão `⋯`, porque são raras e a barra precisa caber marca e navegação sem competição.
- Em telas estreitas, navegação vira barra inferior e ações passam para baixo dos inimigos.
- Na Mesa, equipamento, perícia e magia disparam ações integradas e levam a tela até a calculadora. Dano sempre separa o valor causado da simulação no alvo antes da aplicação.
