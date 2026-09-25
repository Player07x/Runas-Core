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

## Itens

- Criar ou editar um item tem dois modos, nos dois aplicativos. O **simples** mostra nome, uso, tipo, peso base, tamanho, quantidade, os botões de habilidade e encantamento e a descrição. O **avançado** é o modo simples mais todos os campos do modelo compartilhado.
- No modo simples, cada campo de combate aparece apenas para quem o usa: dano e perícia em `Arma`, PR e RDF/RDM em `Escudo`, RDF/RDM em `Armadura`.
- O modo escolhido acompanha o usuário entre itens e sessões.
- O item não tem mais um campo de encantamento nem um de habilidade. Tem os botões **Adicionar Habilidade** e **Adicionar Encantamento**, e cada um aceita três caminhos: usar um registro da própria ficha, criar um na mesma tela ou importar um arquivo externo. Magias de qualquer categoria podem ser anexadas, não só encantamentos.
- O que está anexado é exibido de forma simples — nome e texto — para ser lido de relance.
- `Dano` e `Bônus` são campos separados. O jogador escreve só a expressão; o bônus é calculado pelo sistema e não é editável.
- A afinidade do item **não** entra no bônus de dano. Ela descreve a qualidade do item e continua visível, mas somá-la ao dano inflava toda arma notável.
- O tamanho do item é lido e escrito em **metros**, na mesma unidade da altura do personagem e da tabela de MT.
- `Usar MT?` calcula o peso verdadeiro **e** entra no bônus de dano pela diferença entre o MT do item e o MT do personagem. Um item de **MT 0 é sempre neutro no dano**: MT 0 é também o valor de "tamanho não informado", o padrão de todo item sem medida e de toda ficha migrada, e não pode penalizar em silêncio.
- No modo simples, o MT e o botão `Usar MT?` não aparecem: são detalhe do modo avançado.

## Magias: elementos

- A seção de Magias começa pelos elementos: um recorte curto da perícia, com `Nome do Elemento`, `Nível` e o botão de rolar. Sem pontos de perícia e sem outros modificadores.
- O teste é `Místico + Poder + nível do elemento`.
- O usuário escolhe entre os elementos básicos, raros e divinos, ou digita um elemento qualquer.
- Basta **ter** os elementos na ficha para o sistema exibir sozinho as fusões disponíveis: um elemento de nível +0 também compõe fusão. O nível da fusão é a soma dos níveis dos componentes, e pode ser 0. Fusão não tem botão de rolar: clicar no nome já rola.
- Onde a ficha pede uma perícia — perícia do item, teste de conjuração — o elemento e a fusão são escolhas válidas.

## Runas Book

- Um recurso importado exibe apenas o que ele tem: campo opcional vazio não aparece, nem na leitura nem na exportação.
- Uma magia de aplicação `Relativo` não exibe valor fixo. Um custo `Outro` exibe o próprio texto do custo no lugar do valor fixo.
- O DM pode definir uma cor por categoria. Todos os recursos daquela categoria usam a mesma cor de box, na leitura e na exportação. A categoria de uma habilidade ou magia é a própria categoria; a de um item é o tipo.

## Barra superior

- A barra superior carrega apenas marca, navegação e um botão de ações (`⋯`). Tema, backup, importação, Obsidian e atalhos externos ficam dentro desse painel.
- O estado de salvamento continua fora do painel, reduzido a um ponto colorido no próprio botão: num aplicativo local-first, saber que a alteração foi gravada não pode depender de abrir um menu.
- A barra do arquivo do mestre (Campanhas e Wiki) exibe o selo `DM` e a navegação completa.
- Campanhas e Wiki abrem sem login nem senha. O token de backup apenas ativa a cópia na nuvem; sem ele, tudo continua local.
- O painel também mostra, com honestidade, o estado da cópia: `Nuvem: enviado às 15:03`, `Nuvem: ação necessária`, `Nuvem: falhou — <motivo>` e `Vault: …`. Um backup que falhou nunca aparece como "salvo".

## Backup e dados do mestre

- **Nada se perde depois de um backup.** Uma gravação de backup nunca substitui uma cópia sem saber qual cópia está substituindo, nunca a substitui por algo muito menor sem confirmação explícita, e a versão anterior continua recuperável. Vale para a nuvem e para os arquivos do vault.
- O backup guarda **somente** Bestiário (fichas e tabelas de maestria), Campanhas e Wiki. Mesa (encontro, iniciativa e notas da Mesa), notas do Livro Vermelho e qualquer nota fora das pastas permitidas nunca entram, na nuvem ou no vault.
- Um dispositivo sem dado algum do mestre (por exemplo, um computador novo) nunca envia nem grava nada: o backup só sai de quem tem o que salvar.
- Um dispositivo que ainda não recebeu a versão atual da nuvem não a sobrescreve. O mestre escolhe entre **Importar e mesclar**, **Substituir a nuvem por este dispositivo** (com confirmação) e **Cancelar**.
- Toda gravação na nuvem passa por `lib/cloud-backup.ts`; nenhum componente faz `fetch("/api/…")` nem `PUT` direto.
- Tudo o que o site sabe e as notas não guardam — estilo e organizador das campanhas, tags com ícone e cor, eras com anos, exclusões, preferências de interface e o Bestiário — vive também em `Runas DM/*.json` dentro do vault. Ao conectar o vault num computador novo, esses dados voltam sozinhos; se o dispositivo já tem dados, o mestre escolhe **Mesclar**, **Substituir tudo** ou **Manter**.
- Um arquivo de dados do vault que este navegador não conhece (outro computador, cópia, edição à mão) nunca é sobrescrito sem decisão do mestre.
- O mestre pode exportar e importar esses dados em JSON, sem vault e sem nuvem.

## Nomes que nunca perdem colchetes

- Nomes de campanha e tags podem começar com `[`, como `[O&C] Lion Heart pt. II`. Importar, exportar, restaurar ou mesclar nunca remove, divide nem move esses colchetes. Um valor só é lista quando não tem aspas e o primeiro `[` fecha no último caractere.
- Nunca use `.replace(/^\[/…` ou `.replace(/\]$/…` sobre nomes; use `referenceList`, `tagList` e `stringList` (`lib/frontmatter-values.ts`). `bracket-safety.test.ts` protege isso.

## Wiki: História

**Pastas permitidas do vault.** A sincronização com o Obsidian usa lista de
permissão: só entram notas cuja pasta raiz seja uma das sete categorias da
Wiki (ou o alias `Cronologia Geral`) ou `Campanhas`. Nota solta na raiz, pasta
de outro universo, `Runas Book/`, `Runas DM/`, `Outros Documentos/` e
`_Arquivo morto/` nunca viram página, mesmo com `runas_id` no frontmatter, e a
sincronização de notas **nunca as reescreve** nem cria backup delas (`Runas DM/`
só recebe os arquivos de dados do site). Uma página já rastreada fora
dessas pastas **não** é apagada em silêncio: `pagesOutsideAllowedFolders` a
lista para remoção explícita, uma a uma ou todas de uma vez
(`removePagesOutsideAllowedFolders`), que tira o registro do site e nunca toca
no `.md`.

**Nomes e estrutura.** O arquivo de uma nota nova tem o título exato como nome
(`noteFileName`). `Personagens` é uma seção plana, sem subpastas de categoria;
uma era nova mora na própria pasta (`Cronologia/<Era>/<Era>.md`). A norma
completa está em `docs/obsidian-vault-organization.md`.


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

## Wiki: categorias e tags

- A Wiki tem sete categorias fixas: Cronologia, História, Geografia, Personagens, Criaturas, Itens e Organizações. Gráfico é uma visualização, não uma categoria.
- Fauna e Monstros são migrados para Criaturas; a origem permanece como tag. Categorias antigas de snapshots v2 também viram tags globais, preservando compatibilidade de leitura.
- Cada categoria abre uma grade de tags. A página de tag oferece busca, ordenação, criação e edição sem duplicar registros. Tags de era aparecem somente em Cronologia.
- Uma página de História continua sendo o registro Wiki `story`; seu corpo é derivado de `storyEventIds` por `withStoryEvents`.

## Campanhas

- A campanha se organiza em História, Mundo, Aventura, Notas, Estilo e Gráfico.
- Mundo tem Locais, Organizações, Itens e Personagens. Criar um item cria uma página na categoria equivalente da Wiki e grava seu id em `worldPageIds`; vincular ou remover vínculo nunca apaga a página da Wiki.
- Aventura tem Missões, Eventos, Encontros e Organizador. Encontros preservam o envio de fichas para a Mesa/RunasVTT, e missões continuam usando ordem narrativa e status.
- História permite criar ou vincular Histórias da Wiki sem sair da campanha e exibe a cronologia agregada dos acontecimentos vinculados.
- Notas são registros de campanha `gm-note`, agrupados por tags e excluídos da Wiki e do Gráfico.
- O Organizador é um canvas local por campanha com nós de texto, arrastar, editar, excluir e setas entre nós; não há exportação `.canvas` nesta etapa.
- O Gráfico da campanha inclui missões, eventos, encontros, Histórias vinculadas e páginas do Mundo. Missões e eventos recebem destaque visual; notas, estilo e organizador ficam fora.

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

## Token da ficha

- No Runas DM, a imagem da ficha é um token: escolher uma imagem abre o editor de token (recorte, círculo com borda opcional ou imagem livre, fundo transparente e tamanho no mapa). Cartões, Mesa e encontros mostram o token; fichas antigas continuam mostrando o retrato.
- O Runas Tools mantém o retrato 2:3 e ganha o campo Token ao lado dele, com o mesmo editor e o mesmo formato.
- A ficha avançada do DM expõe o token e o tamanho em Informações, na mesma posição do Tools.

## Integração com o RunasVTT

Os sites detectam o RunasVTT pela ponte `window.runasVTT`, que só ele injeta, e só nas origens da suíte (`@runas/vtt-bridge` → `getRunasVtt`). Fora do VTT, nada muda. Dentro dele:

- "Exportar ficha", "Exportar fichas" e "Exportar ZIP (JSON)" (Tools e DM) viram "Enviar ao RunasVTT": cada ficha vira um token na cena aberta, com a imagem e o tamanho do token da ficha (sem token, o retrato e 1 célula).
- A Mesa do DM opera sobre os tokens com ficha da cena aberta, não sobre a Mesa local. O token é uma cópia independente: dano não altera o bestiário. "Restaurar" e "Remover" somem do cartão (tokens são removidos no VTT), e "Anexar inimigo" e "Duplicar" criam tokens.
- O token selecionado no mapa do VTT vira o alvo do dano. O dano só é aplicado com a confirmação explícita de sempre.
- Testes e danos confirmados (inclusive o dano massivo) vão para o Registro do VTT e sobem como texto sobre o token.
- "Iniciar encontro" nas Campanhas envia as criaturas como tokens para a cena aberta, sem substituir a Mesa local.
- O cartão de instalação (PWA) não aparece dentro do VTT.
- O VTT nunca calcula regra: ele recebe o envelope `{ version, character }` e o resumo de PV/PA/PE calculado por `summarizeCharacterResources` (`@runas/core`).
