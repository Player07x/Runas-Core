# Regras de produto

## Princípios

O Runas DM reduz o tempo gasto pelo mestre procurando fichas, calculando testes e transferindo dano. As palavras-chave são **simplicidade** e **velocidade**.

## Bestiário

- A galeria sempre exibe a ficha simplificada.
- Criar ou editar abre um modal, sem abandonar a tela atual.
- O modal inicia na ficha simplificada e permite alternar para a ficha avançada.
- O modo avançado preserva o modelo completo e versionado do Runas Tools.
- Simplificada e avançada são duas visualizações do mesmo objeto `Character`; nunca existem duas cópias da ficha dentro do editor.
- Perícias, habilidades, magias e itens exibidos na simplificada são os próprios registros estruturados das coleções da ficha completa, identificados por `id`. É proibido convertê-los em listas de texto ou manter cópias desnormalizadas.
- Toda alteração feita em um registro na simplificada deve aparecer imediatamente na avançada, e vice-versa.
- A simplificada pode omitir campos por velocidade. A avançada deve expor todos os campos de domínio editáveis do modelo completo.
- A importação aceita o envelope `{ version, character }` do Runas Tools sem perder os vínculos entre entidades.
- A importação aceita uma ficha JSON individual, seleção múltipla de JSON e o ZIP de fichas JSON exportado pela galeria do Runas Tools. Toda ficha passa pela mesma migração compartilhada antes de entrar no bestiário.
- Clicar em qualquer área principal do cartão abre imediatamente o modal na ficha simplificada; não existe etapa intermediária de expansão ou botão obrigatório de edição.
- A ficha simplificada usa modal mais estreito. A avançada amplia o modal, sem ocupar desnecessariamente toda a largura da tela.
- O Runas DM não limita fichas. No Runas Tools, a galeria aceita até 100 fichas, com 20 fichas por página e no máximo 5 páginas.
- Tabelas customizadas de Melhoria de Maestria são configuração do sistema, não da ficha.
- Essências geradas usam `essências totais / 10`, arredondadas para baixo.
- Características listam apenas habilidades `Racial`.
- Ações agregam itens equipados, habilidades não raciais e magias no formato `nome categoria`.
- O uso `Equipado` não escolhe automaticamente uma armadura. Vários itens, inclusive várias armaduras, podem permanecer equipados; o usuário seleciona separadamente um único item equipado como armadura ativa, e somente o RDF/RDM desse item entra nas calculadoras de dano.

## Barra superior

- A barra superior carrega apenas marca, navegação e um botão de ações (`⋯`). Tema, backup, importação, Obsidian e atalhos externos ficam dentro desse painel.
- O estado de salvamento continua fora do painel, reduzido a um ponto colorido no próprio botão: num aplicativo local-first, saber que a alteração foi gravada não pode depender de abrir um menu.
- A barra do arquivo do mestre (Campanhas e Wiki) exibe o selo `DM` e a navegação completa.
- Campanhas e Wiki abrem sem login nem senha. O token de backup apenas ativa a cópia na nuvem; sem ele, tudo continua local.

## Wiki: História

- `História` é uma seção da Wiki, ao lado de Cronologia. Uma página de História não é escrita como texto: ela é a sequência ordenada dos seus **acontecimentos**.
- O nome é `Acontecimento`, e não `Evento`, para não se confundir com os Eventos de campanha. Um acontecimento já ocorreu, então não tem status (`Concluída`, `Em Progresso`).
- Um acontecimento é o mesmo registro `KnowledgePage` usado nas campanhas (`kind: "event"`), com escopo `wiki`. Ele é criado, editado, movido (`^`/`v`) e excluído dentro da própria página de História.
- Criar ou editar um acontecimento abre o editor **dentro do documento**, na posição dele. Não é modal: a História continua visível em volta.
- O corpo da página de História é sempre derivado da lista. No arquivo `.md` ele aparece como tópicos `- [[Acontecimento]]`; no site, cada link é substituído pelo conteúdo completo do acontecimento.
- Excluir um acontecimento remove o arquivo `.md` dele e o tira da sequência. Excluir a História remove também os acontecimentos dela.
- Cronologia e História datam pelo calendário fictício (era + ano), nunca pela data real de criação do arquivo.
- O ano é digitado no calendário que o mestre preferir: `1200`, `1.200 C.E.` ou `0 Logi`. Sem sufixo, vale C.E. O campo mostra a conversão antes de salvar, e o registro guarda sempre o ano canônico em C.E., para que uma única escala ordene a linha do tempo. `4.027 C.E.` equivale a `0 Logi`, conforme a Era dos Caçadores em `[O&C] História do Universo`.
- A era não é escolhida à mão: ela é deduzida do ano e exibida no formulário enquanto o mestre digita. Quando dois intervalos se sobrepõem, vence o mais específico; uma era sem fim (a atual) cobre todo ano a partir do início dela. Um ano fora de todos os intervalos fica honestamente `Sem era definida` — corrigir os limites em `Editar era` reclassifica o acervo inteiro, sem reeditar registro algum.
- Onde um ano fictício aparece — linha do tempo, cabeçalho do acontecimento e limites da era — os dois calendários são exibidos. Uma era com calendário renomeado pelo mestre não tem equivalência conhecida e mostra apenas o próprio.
- A Cronologia é a linha do tempo inteira: além das suas próprias páginas, ela exibe os acontecimentos de todas as Histórias, filtrados pela mesma era e ordenados pelo mesmo ano fictício. Cada um mostra a que História pertence e, ao ser aberto, leva ao documento dela — nunca a um formulário solto.

## Mesa de encontro

- Anexar uma ficha cria cópia independente; mudanças de recursos não alteram o bestiário.
- A mesma ficha pode gerar quantas cópias forem necessárias.
- Duplicar uma criatura duplica seu estado atual.
- O alvo selecionado abre testes e dano em painel lateral na mesma página.

## Ações rápidas

- `Modificador` abre um campo compacto.
- Inteiros (`+3`, `-2`, `3`) somam ou subtraem do resultado final.
- Valores iniciados por `x` multiplicam. `x0,5` equivale a dividir por dois.
- `Avançado` abre configurações completas no mesmo painel.
- Dano percorre PA Extra, PA e PV, considerando redução, resistência e fraqueza.
- Dano de equipamento pertence ao atacante e exige alvo explícito para aplicar a simulação. Outros atores aparecem primeiro, mas o próprio atacante também é uma opção válida para representar auto-dano.

## Paridade da ficha avançada

- A ficha avançada do Runas DM replica a organização funcional da ficha do Runas Tools, mudando apenas o tema visual e removendo ações de rolar teste, rolar dano e conjurar dentro do editor.
- Perícias e vínculos são linhas editáveis, sem cartões expansíveis.
- Habilidades e magias exibem tabelas-resumo e abrem o registro selecionado em uma janela de edição.
- Inventário exibe carga, armadura, equipamentos e lista de itens; clicar no item abre sua visualização e permite entrar em edição.
- Informações e Estatísticas preservam os mesmos agrupamentos, valores derivados e hierarquia do Runas Tools.
- O painel mostra separadamente `Dano causado` (valor numérico editável, tipo imutável) e `Dano simulado` (texto protegido por bloqueio de edição). Ao bloquear novamente, a simulação é recalculada.
- Ao gastar Determinação, o bônus permanece em toda nova rolagem feita por Casualidade no mesmo teste.
- Disparar um teste por perícia, equipamento ou magia rola a página até a calculadora integrada.

## Privacidade e custo

- O projeto é particular e não possui cadastro público.
- A hospedagem deve usar Cloudflare Access e token de backup.
- Os componentes escolhidos possuem camada gratuita compatível com uso particular.
