# Prompt de adaptação para o Obsidian (Wiki do Runas DM)

Este documento contém um **prompt pronto para uma IA** converter material de RPG (PDF, livro de campanha, wiki, anotações) em notas `.md` que a Wiki do Runas DM reconhece ao sincronizar com o vault do Obsidian. Ele cobre as sete categorias da Wiki (Cronologia, História, Geografia, Personagens, Criaturas, Itens, Organizações) e, opcionalmente, notas de Campanha.

As regras foram extraídas de `apps/runas-dm/app/lib/obsidian-sync.ts` e `apps/runas-dm/app/lib/knowledge-model.ts`, e os exemplos do prompt foram passados pelo importador real (`mergeObsidianNotes`) para confirmar seção, tipo, tags, ano, status do personagem, links e campanha. Se o importador mudar, revise este documento.

## Como usar

1. Abra uma conversa com uma IA que aceite anexos e cole **todo o bloco “Prompt”** abaixo (ou anexe este arquivo).
2. Preencha os **Parâmetros** no topo do prompt (tag da obra, calendário, módulos).
3. Anexe o documento de origem e envie.
4. Grave os arquivos entregues na **raiz do vault**, mantendo as pastas (`Personagens/…` sem subpastas, `Geografia/Assentamentos/…`, `História/<História>/…`).
5. Sincronize com o Obsidian **uma única vez, depois de gravar o lote inteiro**. O site só liga uma nota às outras (`[[links]]`) no momento em que a lê; uma nota importada antes de suas vizinhas existirem fica sem esses vínculos até ser editada.

## Prompt

````markdown
# TAREFA

Converta o(s) documento(s) anexado(s) em notas Markdown para um vault do Obsidian, no formato exato lido pela **Wiki do Runas DM**. Um importador automático e rígido lerá esses arquivos: o que fugir das regras abaixo é descartado, cai na categoria errada ou vira texto quebrado. Siga o formato à risca; ele importa mais que o estilo.

Regras de ouro:

1. **Fidelidade.** Use apenas o que está no documento. Não invente nomes, datas, atributos, parentescos nem números. Lacuna: deixe de fora e registre no relatório final.
2. **Uma entidade, uma nota.** Cada personagem, lugar, criatura, item, organização, acontecimento e história vira um arquivo próprio.
3. **Todo link `[[...]]` precisa ter a sua nota no mesmo lote.** O site descarta em silêncio links para notas que não existem.
4. Escreva em português do Brasil e mantenha a grafia dos nomes próprios do documento.

# PARÂMETROS (o usuário edita antes de enviar)

- Tag da obra (entra como tag extra em toda nota, nunca como pasta): `Lion Heart`
- Obra de origem (opcional; deixe vazio para omitir a propriedade): `[[Lion Heart (Campanha)]]`
- Calendário: um ano em **Logi** vira C.E. somando 4027 (`0 Logi` = `4027 C.E.`). Ano sem sufixo é C.E.
- Numerar os acontecimentos de cada História (`01. `, `02. `…): `sim`
- Pastas-tag já existentes no vault (reutilize antes de criar outra):
  - Cronologia: Acontecimentos Globais, Acontecimentos Regionais
  - Geografia: Assentamentos, Continentes, Mundos, Regiões, Territórios
  - Personagens: Divindades, Runilitas
  - Criaturas: Fauna, Monstros
  - Itens, Organizações: nenhuma fixa
- Gerar o módulo opcional de **Campanha** (missões, eventos, notas): `não`
- Nome da campanha (só se o módulo de Campanha estiver ligado): `Lion Heart`

# PROCESSO

1. Leia o documento inteiro antes de escrever qualquer nota.
2. Faça um inventário de tudo o que tem nome próprio ou data: pessoas, lugares, criaturas, itens, organizações, fatos datados e trechos narrativos.
3. Classifique cada item pela **árvore de decisão** abaixo.
4. Fixe **um título canônico por entidade** (grafia mais frequente no documento; se houver variações, registre no relatório).
5. Escreva as notas seguindo o **formato universal** e o **módulo** da categoria.
6. Percorra o **checklist de validação** em cada arquivo.
7. Entregue os arquivos e o **relatório final**.

# ÁRVORE DE DECISÃO (categoria de cada item)

| O item é… | Categoria (pasta raiz) |
|---|---|
| Ser com nome próprio e vontade própria: pessoa, deus, demônio, santo, general, NPC | `Personagens` |
| Espécie, tipo de monstro, fera, animal ou ameaça sem papel de personagem | `Criaturas` |
| Objeto, arma, armadura, artefato, poção, relíquia | `Itens` |
| Grupo organizado: ordem, religião, guilda, exército, culto, família nobre, governo/coroa | `Organizações` |
| Lugar: cidade, região, continente, masmorra, estabelecimento relevante, ponto de interesse | `Geografia` |
| Fato datado e pontual (“Em 146 Logi, Gohor é fundada”) | `Cronologia` |
| Trecho narrativo com começo, meio e fim, contado em sequência (lenda, saga, origem, guerra) | `História` |
| Regras de jogo, tabelas aleatórias, vendedores, missões, encontros, fichas de combate | **Fora da Wiki** (só entra no módulo de Campanha, se ligado) |

Casos de fronteira:

- Uma entidade que aparece em várias seções do documento vira **uma só nota**, consolidando o que se diz dela.
- Reino como território é `Geografia`; a coroa/governo como grupo de poder é `Organizações`. Só crie a segunda se o documento a tratar como grupo.
- Monstro único e nomeado: `Criaturas` se o documento o descreve como criatura/entidade; `Personagens` se tem motivações, falas e relações. Registre a decisão no relatório.
- **Não duplique fatos entre Cronologia e História.** Todo acontecimento de uma História já aparece sozinho na linha do tempo (se tiver ano). Se um fato foi narrado numa História, ele **não** ganha nota em Cronologia.
- Uma nota de entidade traz descrição e propriedades; a narrativa longa vive numa História e a nota da entidade só **linka** para ela. Não copie o mesmo texto nos dois lugares.
- Um subitem (ex.: “Forte Lunite” dentro de uma cidade) só ganha nota própria se tiver descrição substancial (≥ 2 frases) ou for citado em mais de um lugar; senão, fica como item de lista dentro da nota-mãe.

# FORMATO UNIVERSAL DO ARQUIVO

Todo arquivo tem exatamente esta forma:

```markdown
---
tags: ["Tag Principal", "Outra Tag", "Tag da obra"]
tipo: "<rótulo exato da categoria, ver módulo>"
Resumo: "<uma frase, texto puro>"
<propriedades da categoria>
---

# <Título>

<Resumo, repetido idêntico, como primeiro parágrafo>

<corpo em Markdown permitido>

## Páginas relacionadas

- [[Nota Relacionada 1]]
- [[Nota Relacionada 2]]
```

## Frontmatter

- Começa na **primeira linha** do arquivo com `---` e fecha com outra linha `---`. Nada antes dele.
- Uma propriedade por linha, no formato `chave: valor`.
- **Texto entre aspas duplas** (`"..."`). Dentro do texto, prefira aspas tipográficas (“ ”) em vez de `"` para não precisar de escape.
- **Listas em uma linha**, no estilo JSON: `["a", "b"]`. Números sem aspas. Booleanos `true`/`false`.
- **Proibido** objetos aninhados, valores em várias linhas e listas com marcadores dentro do frontmatter.
- **Nunca escreva** estas chaves (o site as gera): `runas`, `runas_id`, `runas_linked_ids`, `runas_story_events`, `runas_era`, `runas_created_at`, `runas_updated_at`, `ficha_bestiario`.
- Propriedades extras (Raça, Classe, Alinhamento…) são permitidas: o site as preserva ao regravar o arquivo. **Mas o site só exibe o corpo da nota**, então toda informação importante deve aparecer também no corpo.

## Título e nome do arquivo

- O nome do arquivo é `<Título>.md`, idêntico ao `# Título` e ao `[[link]]` que aponta para ele.
- O título é **único no vault inteiro** (o site compara sem diferenciar maiúsculas nem acentos, entre todas as categorias). Desambigue com parênteses: `Reino de Lion Heart`, `Luís Lionhart (Rei)`.
- Não use estes caracteres no título: `\ / : * ? " < > | # ^ [ ]`. Nada de dois-pontos (troque por ` – ` ou reescreva). Não termine com ponto ou espaço.
- Nunca termine um título com `(Campanha)`, exceto na nota-hub do módulo de Campanha.

## Resumo

- Uma linha, até 280 caracteres, **texto puro** (sem `**`, sem `[[ ]]`, sem quebra de linha).
- Vai no frontmatter (`Resumo`) **e** como primeiro parágrafo depois do `# Título`, com o **mesmo texto**. O site remove a repetição ao importar.

## Tags e pastas

- `tags` tem de 1 a 4 itens, em Title Case, sem `#`, incluindo a **tag da obra** dos parâmetros.
- A **primeira tag é a subpasta física** e o nome da pasta é igual a ela: `Geografia/Assentamentos/Cidade do Destino.md` leva `tags: ["Assentamentos", …]`. Use pasta-tag existente antes de criar outra; crie uma nova só se ao menos 3 notas a compartilharem. Sem subpasta cabível, coloque o arquivo direto na pasta da categoria. **Exceção: `Personagens` é plana** — as notas ficam direto em `Personagens/` e as tags (`Runilitas`, `Divindades`…) só aparecem no frontmatter.
- **Uma subpasta nunca contém outra subpasta** (exceção: `História`, ver módulo).
- **Não escreva tags de era** (“Era dos Monges” etc.): o site as deduz do ano.

## Corpo em Markdown: o que o site entende

Permitido:

- Cabeçalhos `##` e `###` (o `#` é só o título).
- Parágrafos separados por linha em branco. Uma quebra simples de linha dentro de um parágrafo vira espaço.
- Listas com `-` e numeradas `1.`, **de um único nível**.
- **negrito** com `**texto**`, *itálico* com `*texto*`, código `` `texto` ``, citação com `> texto` (uma linha por `>`), linha horizontal `---`.
- Links `[[Título]]`, `[[Título|texto exibido]]`, `[[Título#Seção]]` e `[texto](https://…)`.

**Proibido (o site estraga ou exibe como texto cru):**

| Não use | Use no lugar |
|---|---|
| Tabelas `\| a \| b \|` | Lista: `- **Coluna 1:** valor — **Coluna 2:** valor` (uma linha por linha da tabela) |
| Cabeçalho `####` ou mais fundo | `###` ou **negrito** numa linha própria |
| Lista dentro de lista (indentada) | Lista de um nível só; agrupe com `###` |
| Callouts `> [!note]` | Parágrafo com **Nota:** em negrito |
| Itálico com `_texto_`, `==destaque==`, `~~riscado~~` | `*texto*` e **negrito** |
| Caixas de tarefa `- [ ]` | Lista comum |
| HTML, notas de rodapé, blocos `dataview`, `%%comentários%%` | Texto simples |
| Imagens `![[…]]` inventadas | Nada; cite as imagens do documento no relatório |

## Links

- Escreva `[[Título exato]]` (ou `[[Título exato|texto]]`) para toda entidade **que também tem nota no lote**. Linke a primeira menção de cada seção, sem repetir a cada frase, e nunca linke a própria nota.
- Nunca linke conceito sem nota, número de página do documento nem nome de arquivo do documento. Sem nota, escreva em texto puro.
- A **última seção** de toda nota (exceto a de História, ver módulo) é `## Páginas relacionadas`, só com uma lista de `[[links]]` e **nenhum outro texto** depois dela. O site ignora esse trecho na exibição, mas o usa para montar o grafo de conhecimento. Repita ali os links do corpo e acrescente os que só se aplicam por contexto.

## Datas

- Só **Cronologia** e **acontecimentos de História** têm data. Duas propriedades:
  - `data`: texto livre, como no documento (`"137 Logi"`, `"Era dos Monges"`, `"1.500 C.E."`).
  - `ano_evento`: **inteiro em C.E.**, sem aspas nem separador de milhar (`4164`). Logi → C.E.: some 4027. Ano negativo permanece negativo (`-134`).
- Data aproximada ou intervalo: `data` com o texto original e `ano_evento` com o ano inicial. Sem ano nenhum, omita **as duas** propriedades.
- Nunca use datas reais (`2026-09-23`). Idade, nascimento e morte de personagens são propriedades de texto (ver Personagens), não `ano_evento`.

## Erros que quebram a importação

- Título do `# Título` diferente do nome do arquivo.
- Notas duplicadas ou com o mesmo título em pastas diferentes.
- `tipo: "Cronologia"` em nota de Cronologia (vira “era”, sai da linha do tempo). O valor é `"Acontecimento"`.
- `ano_evento` com texto (`"137 Logi"`), decimal ou com pontos.
- Cabeçalho `####`, tabela, lista aninhada, callout ou `_itálico_` no corpo.
- Link para nota inexistente.
- Texto depois de `## Páginas relacionadas`.
- Subpasta dentro de subpasta, ou arquivo fora das pastas listadas nos módulos.

# MÓDULOS POR CATEGORIA

## 1. Cronologia

- **Pasta:** `Cronologia/` ou `Cronologia/<Acontecimentos Globais | Acontecimentos Regionais>/`. Global: afeta o mundo todo; regional: afeta um reino, região ou povo.
- **Quando usar:** fato datado e pontual **que não faz parte de uma História narrada** (entradas de uma “Ordem Cronológica”, marcos, fundações, mortes, guerras citadas em uma linha).
- **tipo:** `"Acontecimento"` (exatamente assim).
- **Propriedades:** `runas_kind: "event"` (trava a nota como acontecimento, mesmo fora das subpastas `Acontecimentos…`), `data` e `ano_evento` (estes dois obrigatórios quando o documento traz o ano).
- **Não crie** notas de “Era” (elas exigem limites de anos que o `.md` não carrega). Liste as eras e seus limites no relatório, para o usuário cadastrá-las no site.
- **Corpo:** o que aconteceu, quem participou (com links), consequência. Curto é aceitável.

```markdown
---
tags: ["Acontecimentos Regionais", "Han't", "Lion Heart"]
tipo: "Acontecimento"
runas_kind: "event"
Resumo: "Em 146 Logi é fundada Gohor, a cidade de Dante em Han't."
data: "146 Logi"
ano_evento: 4173
---

# Fundação de Gohor

Em 146 Logi é fundada Gohor, a cidade de Dante em Han't.

Dante, transformado em morto-vivo por [[Nekros]], fugiu para Han't e ergueu ali a cidade para se proteger de [[Mortheus]].

## Páginas relacionadas

- [[Dante]]
- [[Nekros]]
- [[Mortheus]]
```

## 2. História

Uma **História** é uma sequência de **acontecimentos**. O corpo da História é gerado pelo site a partir da lista de acontecimentos; o texto narrativo mora **em cada acontecimento**.

- **Pastas:**
  - a História: `História/<Título da História>.md`
  - cada acontecimento: `História/<Título da História>/<Título do acontecimento>.md`
  - Profundidade **exata**: essas duas. Sem outra subpasta.
- O título da História não pode ter `\ / : * ? " < > |`; o nome da subpasta é idêntico ao título.
- Cada acontecimento pertence a **uma** História. A pasta é o que o vincula: não use `runas_story_events`.
- **Ordem:** o site ordena os acontecimentos por título, em ordem alfabética, na primeira importação. Com o parâmetro de numeração ligado, prefixe o **título, o nome do arquivo e o link** com dois dígitos e ponto: `01. Criação de Lion Heart`. Se estiver desligado, avise no relatório que a ordem inicial será alfabética.
- **Quando criar História:** cada trecho narrativo autônomo do documento (origem de um reino, uma guerra, uma lenda, a trajetória de um artefato). Cada subtítulo narrativo vira um acontecimento (3 a 12 por História).
- **tipo:** História = `"História"`; acontecimento = `"Acontecimento"`.
- **Acontecimento:** `data` e `ano_evento` sempre que o documento der o ano (ou permitir deduzi-lo, e nesse caso diga a dedução no relatório). Corpo com o texto narrativo completo daquela parte, reescrito de forma fiel, com links.
- **Nota da História:** frontmatter + `# Título` + Resumo + **somente** a lista `- [[Acontecimento]]` na ordem narrativa. Qualquer outro texto no corpo é descartado. **Não** leva `## Páginas relacionadas`.
- Acontecimentos não têm `status`.

Nota da História:

```markdown
---
tags: ["Lion Heart"]
tipo: "História"
Resumo: "Da fundação de Lion Heart ao selamento do rei Luís Lionhart."
---

# A Ascensão e a Queda de Luís Lionhart

Da fundação de Lion Heart ao selamento do rei Luís Lionhart.

- [[01. Criação de Lion Heart]]
- [[02. A Guerra de Hion]]
```

Acontecimento (`História/A Ascensão e a Queda de Luís Lionhart/01. Criação de Lion Heart.md`):

```markdown
---
tags: ["Lion Heart"]
tipo: "Acontecimento"
Resumo: "Teresa e Faer Lionhart fundam Tária, capital de um reino que se tornará Lion Heart."
data: "137 Logi"
ano_evento: 4164
---

# 01. Criação de Lion Heart

Teresa e Faer Lionhart fundam Tária, capital de um reino que se tornará Lion Heart.

O reino foi fundado em 137 Logi por [[Teresa Lionhart]] e [[Faer Lionhart]], guerreiros que exploraram as terras a leste de Hillhorn. Expulsos de Hion pelos faunos, viajaram ao sul e fundaram sua cidade perto de um rio.

## Páginas relacionadas

- [[Teresa Lionhart]]
- [[Faer Lionhart]]
- [[Reino de Lion Heart]]
```

## 3. Geografia

- **Pasta:** `Geografia/<Assentamentos | Continentes | Mundos | Regiões | Territórios>/`.
  - Assentamentos: cidades, vilas, fortes, masmorras habitadas. Regiões: florestas, montanhas, planícies. Territórios: reinos e províncias. Continentes e Mundos: escala maior.
- **tipo:** `"Geografia"`.
- **Corpo (seções sugeridas, omita as vazias):** descrição geral → `## Localização` (uma linha: “Parte de [[…]]”) → `## Pontos de interesse` com `###` por grupo e uma lista `- **Nome:** descrição` → `## Habitantes e governo` → `## Curiosidades e segredos`.
- A hierarquia (cidade dentro de reino) é expressa por link e pela linha de localização; não existe propriedade de “pai”.
- Título único: um reino que compartilha nome com a obra é `Reino de Lion Heart`, não `Lion Heart`.

```markdown
---
tags: ["Assentamentos", "Lion Heart"]
tipo: "Geografia"
Resumo: "Cidade na fronteira de Lion Heart, responsável por inúmeros imigrantes."
---

# Lunite

Cidade na fronteira de Lion Heart, responsável por inúmeros imigrantes.

Atualmente a fronteira está fechada por determinação da rainha, sob a justificativa de que os Patagotitânicos destruiriam a cultura do reino.

## Localização

Parte do [[Reino de Lion Heart]].

## Pontos de interesse

### Locais públicos

- **Forte Lunite:** protege a cidade dos runos e de imigrantes ilegais.
- **Árvore de Maestria de Luna:** fica na propriedade da família Mizuki.

### Diversão

- **Bar da Estela:** bar de uma minotaura.
- **Igreja de Mulk:** dedicada ao Santo Mulk.

## Páginas relacionadas

- [[Reino de Lion Heart]]
```

## 4. Personagens

- **Pasta:** direto em `Personagens/`, **sem subpasta**. Use as tags `Divindades` (deuses, demônios, santos) ou `Runilitas` (mortais) no frontmatter; a tag não vira pasta.
- **tipo:** `"Personagens"`.
- **Propriedade especial `status_personagem`:** exatamente `"alive"`, `"dead"` ou `"unknown"`. Use `"dead"` **só** se o documento diz que morreu; `"alive"` se está claramente vivo; na dúvida, `"unknown"`. (Selado, desaparecido = `"unknown"`.)
- **Propriedades extras (use os rótulos do documento):** `Raça`, `Classe`, `Alinhamento`, `Elementos` (lista), `Nascimento`, `Morte`, `Título`, além de outras que o documento trouxer. Datas dessas propriedades são **texto**, como aparecem no documento. Se o formato de data for ambíguo (dia/mês/ano ou ano/mês/dia), copie como está e registre no relatório.
- Se o parâmetro **Obra de origem** estiver preenchido, inclua `Obra de Origem: ["<valor>"]`.
- **Corpo (omita seções vazias):** descrição → `## Ficha` (as mesmas propriedades em lista, para aparecerem no site) → `## História` → `## Personalidade` → `## Relações` (com links e o tipo de relação).

```markdown
---
tags: ["Runilitas", "Lion Heart"]
tipo: "Personagens"
Resumo: "Rei de Lion Heart, conhecido como General da Guerra, selado em 212 Logi."
status_personagem: "unknown"
Raça: "Humano"
Classe: "Reforço da Magia"
Alinhamento: "Louco"
Elementos: ["Abissal", "Fogo", "Metal"]
Nascimento: "162/04/09"
Selamento: "212/03/18"
Obra de Origem: ["[[Lion Heart (Campanha)]]"]
---

# Luís Lionhart

Rei de Lion Heart, conhecido como General da Guerra, selado em 212 Logi.

Foi um exímio guerreiro e um rei cruel com os faunos. Foi selado aos 52 anos por sua irmã [[Vitória Lionhart]].

## Ficha

- **Raça:** Humano
- **Classe:** Reforço da Magia
- **Alinhamento:** Louco
- **Elementos:** Abissal (pós-selo), Fogo e Metal
- **Nascimento:** 162/04/09
- **Selamento:** 212/03/18

## Relações

- **Irmã:** [[Vitória Lionhart]]
- **Origem do fantasma:** [[Fantasma de Um Olho]]

## Páginas relacionadas

- [[Vitória Lionhart]]
- [[Fantasma de Um Olho]]
- [[A Ascensão e a Queda de Luís Lionhart]]
```

Personagem morto: use `status_personagem: "dead"` e `Morte: "21/01/423"`.

## 5. Criaturas

- **Pasta:** `Criaturas/<Fauna | Monstros>/`. Fauna: animais e bestas naturais. Monstros: criaturas hostis, demônios sem papel de personagem, mortos-vivos, espíritos.
- **tipo:** `"Criaturas"`.
- **Corpo:** descrição → `## Aparência` → `## Habitat e comportamento` → `## Habilidades` → `## Origem` → `## Como enfrentar` (só se o documento disser).
- **Não invente atributos de combate.** Se o documento trouxer números (vida, dano, CD, nível), coloque em `## Características` como lista, exatamente como estão. A ficha do bestiário do Runas DM é criada à parte no site; não escreva `ficha_bestiario`.

```markdown
---
tags: ["Monstros", "Lion Heart"]
tipo: "Criaturas"
Resumo: "Fantasma criado pelo Artefato de Sangue a partir de metade da alma de Luís Lionhart."
---

# Fantasma de Um Olho

Fantasma criado pelo Artefato de Sangue a partir de metade da alma de Luís Lionhart.

Todo aquele que toca o [[Artefato de Sangue]] passa a vê-lo. Seu objetivo é seguir os passos de [[Luís Lionhart]] e eliminar todos os faunos de Hion.

## Origem

Nasceu quando [[Vitória Lionhart]] usou o artefato para selar o próprio irmão: a natureza assassina de Luís foi consumida pelo artefato e ganhou forma.

## Páginas relacionadas

- [[Artefato de Sangue]]
- [[Luís Lionhart]]
- [[Vitória Lionhart]]
```

## 6. Itens

- **Pasta:** `Itens/<Artefatos | Armas | Armaduras | Consumíveis | Relíquias>/`, ou direto em `Itens/`.
- **tipo:** `"Itens"`.
- **Corpo:** descrição → `## Propriedades` (lista com efeitos, requisitos, preço e raridade **somente se o documento informar**) → `## Origem e história` (resumo curto e link para a História, se houver) → `## Portadores` (lista de quem o portou, em ordem, com links).
- Itens de listas de “Novos Itens” do documento: uma nota por item, com as propriedades exatamente como o documento apresenta (sem rebalancear).

```markdown
---
tags: ["Artefatos", "Lion Heart"]
tipo: "Itens"
Resumo: "Arma sanguínea forjada pela Irmandade com o sangue de Mortheus."
---

# Artefato de Sangue

Arma sanguínea forjada pela Irmandade com o sangue de Mortheus.

Criado para converter sangue comum em sangue maldito, foi muito usado em hemomancia. É a origem dos Caçadores de Sangue.

## Portadores

1. [[Irmão, Líder da Irmandade]]
2. [[Cíntia]]
3. [[Derah]]
4. [[Vitória Lionhart]]

## Páginas relacionadas

- [[Fantasma de Um Olho]]
- [[Verdadeira Fé]]
```

## 7. Organizações

- **Pasta:** `Organizações/<Religiões | Famílias | Guildas | Exércitos | Ordens | Reinos e Governos>/`, ou direto em `Organizações/`.
- **tipo:** `"Organizações"`.
- **Corpo:** descrição → `## Objetivos` → `## Estrutura e membros` (lista com links; hierarquias e cargos) → `## Territórios e sedes` → `## Relações` (aliados, rivais, com links) → `## História` (resumo e link).

```markdown
---
tags: ["Religiões", "Lion Heart"]
tipo: "Organizações"
Resumo: "Religião criada pela Irmandade para venerar Mortheus."
---

# Verdadeira Fé

Religião criada pela Irmandade para venerar [[Mortheus]].

## Estrutura e membros

- **Deus:** [[Mortheus]], Deus dos Santos e Demônios.
- **Santos atuais:** Kouno, Khenzu, Tenebra, Gruz, Mordred e Deimos.
- **Ex-santos:** Mulk, Mephisto e Dante.

## Páginas relacionadas

- [[Mortheus]]
- [[Artefato de Sangue]]
```

## 8. Campanha (módulo opcional: só se ligado nos parâmetros)

Use para missões, eventos e anotações de mestre do documento. **Nada** deste módulo entra na Wiki.

- **Nota-hub** (uma por campanha): `Campanhas/<Campanha>/<Campanha> (Campanha).md`, com `tipo: "Campanha"`, `# <Campanha> (Campanha)` e um parágrafo. É ela que faz o site criar a campanha.
- **Missões e eventos:** `Campanhas/<Campanha>/Eventos e Missões/<Título>.md`
- **Notas do mestre:** `Campanhas/<Campanha>/Anotações/<Título>.md`
- **Toda nota de campanha** leva `campanha: "<Campanha>"` (sem isso o site não a vincula a nenhuma campanha) e `runas_kind` + `tipo`:
  - Missão: `runas_kind: "mission"`, `tipo: "Missão"`
  - Evento de campanha: `runas_kind: "event"`, `tipo: "Evento"`
  - Nota do mestre: `runas_kind: "gm-note"`, `tipo: "Nota"`
- **`status`** (missões e eventos): exatamente um de `"Sem Status"`, `"Não Iniciada"`, `"Em Progresso"`, `"Concluída"`, `"Fracassada"`, `"Parcialmente Concluída"`, `"Parcialmente Fracassada"`. Para material de livro ainda não jogado, use `"Não Iniciada"`.
- **`ordem`** (missões): número que segue a sequência do documento, entre aspas: `"1"`, `"2"`, `"2.1"`. Omita se não houver sequência.
- **Encontros:** **não** use `runas_kind: "encounter"`. O `.md` não carrega a lista de criaturas e o corpo seria descartado na próxima regravação. Escreva como Nota, com a tag `Encontros`.
- Regras de jogo, tabelas aleatórias e vendedores sem lugar próprio: uma Nota do mestre por bloco, tag `Jogabilidade`.
- Links para a Wiki (`[[Verdadeira Fé]]`) funcionam normalmente.

```markdown
---
runas_kind: "mission"
tipo: "Missão"
campanha: "Lion Heart"
status: "Não Iniciada"
ordem: "3"
Resumo: "Descobrir a causa dos fungos que dominam Wiliad."
tags: ["Arco dos Beladonas"]
---

# Fungos de Wiliad

Descobrir a causa dos fungos que dominam Wiliad.

Fale com o Médico Gary, investigue a caverna e o galpão abandonado do ferreiro.

## Páginas relacionadas

- [[Wiliad]]
```

# ENTREGA

1. Entregue **um bloco de código por arquivo**, cada um precedido de uma linha `Arquivo: <caminho completo com pastas>`, com o conteúdo integral (do `---` inicial à última linha). Se você consegue gerar arquivos, entregue também um `.zip` com as pastas prontas.
2. Nunca abrevie (`…`, “o resto igual”) e nunca resuma uma nota. Se a resposta não couber, entregue por lotes na ordem **Geografia → Organizações → Itens → Criaturas → Personagens → História → Cronologia → Campanha**, terminando cada lote com “CONTINUA” até o último.
3. Depois das notas, entregue o **RELATÓRIO FINAL** com:
   - Tabela: caminho do arquivo · categoria · onde está no documento (seção/página).
   - Decisões de classificação ambíguas (e por quê).
   - Datas convertidas: original → `data` → `ano_evento`, e dedução de ano feita.
   - Eras e limites de ano encontrados (para o usuário cadastrar no site).
   - Nomes com grafias divergentes no documento e a grafia escolhida.
   - Conteúdo deixado de fora (regras de jogo, imagens, tabelas convertidas em lista, trechos ilegíveis).
   - Lacunas e contradições do documento.

# CHECKLIST DE VALIDAÇÃO (aplique a cada arquivo antes de entregar)

- [ ] Começa com `---` na linha 1 e o frontmatter fecha com `---`.
- [ ] Nenhuma chave proibida (`runas_id`, `runas_linked_ids`, `runas_story_events`, `runas_era`, `ficha_bestiario`…).
- [ ] Textos entre aspas duplas; listas em uma linha `["a", "b"]`; `ano_evento` é inteiro.
- [ ] `tipo` tem o valor exato do módulo (Cronologia usa `"Acontecimento"`).
- [ ] `# Título` é idêntico ao nome do arquivo e único no lote; sem `: / \ ? * " < > | # ^ [ ]`.
- [ ] `Resumo` tem até 280 caracteres, texto puro, e é idêntico ao primeiro parágrafo.
- [ ] A primeira tag é o nome da subpasta (exceto em `Personagens`, que é plana); nenhuma tag de era; tag da obra presente.
- [ ] O corpo não tem tabela, `####`, lista aninhada, callout, `_itálico_`, HTML ou imagem inventada.
- [ ] Todo `[[link]]` aponta para o título exato de uma nota do lote.
- [ ] `## Páginas relacionadas` é a última seção, sem texto depois (notas de História não a têm).
- [ ] Sem fato duplicado entre Cronologia e História; sem informação inventada.
- [ ] Caminho válido: `<Categoria>/<Tag>/<Título>.md`, ou `História/<História>/<NN. Acontecimento>.md`, ou `Campanhas/<Campanha>/<Pasta>/<Título>.md`.
````

## Limites conhecidos do importador

Estes pontos vêm do código atual e explicam algumas regras do prompt:

- **Eras não vêm do `.md`.** Os limites de ano de uma era só existem no site; o arquivo carrega apenas o ano do acontecimento (`ano_evento`), e a era é deduzida a partir dele.
- **Ordem dos acontecimentos de uma História.** Na primeira importação eles entram em ordem alfabética de título (`reconcileStories`). A numeração `01.`, `02.` é a forma de fixar a sequência a partir do arquivo; depois disso ela pode ser ajustada no site.
- **Links só são resolvidos na leitura.** Uma nota importada antes das notas que ela cita fica sem esses vínculos até ser alterada de novo.
- **Encontros de campanha** perdem o corpo ao serem regravados pelo site; por isso o prompt os converte em Notas.
- **Pasta da campanha vira tag** em notas de campanha (por exemplo, `Eventos e Missões`).
- `docs/obsidian-vault-organization.md` afirma que `Campanhas` não é importada pela Wiki; o código atual (`isSynchronizableVaultPath`) a importa. Este documento segue o código.
