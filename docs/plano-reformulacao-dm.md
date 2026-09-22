# Plano de execução — Reformulação de Campanhas e Wiki do Runas DM

Destinatário: CODEX. Escopo: somente `apps/runas-dm`. Nenhuma regra de ficha,
teste, dano ou tabela muda, então `packages/runas-core` **não** é tocado e o
Runas Tools não é afetado.

Antes de começar, leia `docs/product-rules.md`, `docs/architecture.md`,
`docs/design-system.md`, `docs/data-sync.md` e `docs/obsidian-vault-organization.md`.
As restrições do `AGENTS.md` continuam valendo — em especial: navegação entre
rotas reais por âncora HTML (nunca `next/link`/`useRouter`), estado primário em
IndexedDB, D1 só como backup, e `withStoryEvents` como única fonte do corpo de
uma História.

---

## 1. Decisões já tomadas pelo dono do produto

Estas decisões não são negociáveis no meio da execução; se alguma se mostrar
inviável, pare e relate em vez de improvisar.

### Wiki

1. **Sete categorias fixas**, não criáveis nem excluíveis pelo usuário:
   Cronologia, História, Geografia, Personagens, Criaturas, Itens, Organizações.
   `Gráfico` continua sendo uma página, mas **não** é categoria.
2. **Criaturas funde Fauna e Monstros.** As páginas existentes migram para a
   categoria Criaturas recebendo a tag `Fauna` ou `Monstros`, conforme a origem.
3. **Organizações é categoria nova** da Wiki (é o que dá lar às organizações
   criadas pelo Mundo das campanhas).
4. **Tag passa a ser o agrupamento interno da categoria.** O registro de
   categoria criado pelo usuário (`KnowledgeCategory`) **deixa de existir**: vira
   tag. Tag é global por nome — `Ruínas` tem o mesmo ícone e a mesma cor em
   qualquer categoria; só a listagem é filtrada por categoria.
5. A página de uma categoria abre numa **grade de tags** (ícone em cima, nome no
   meio, número de páginas vinculadas abaixo em fonte menor). Nenhum `.md`
   aparece direto na categoria: só dentro da tag.
6. Uma tag com **0 páginas continua aparecendo** na grade da categoria onde foi
   criada. Tag nasce pelo botão **Nova tag** da grade (nome, ícone, cor) ou
   automaticamente ao ser digitada no editor de uma página (ícone e cor padrão).
7. Páginas sem tag caem na tag fantasma **"Sem Categoria"** (cinza, sem ícone,
   não editável, não removível).
8. Dentro da página de uma tag: barra de pesquisa, ordenação por data de criação
   (maior/menor) e por nome (A–Z/Z–A) e botão **Criar Novo**, que cria a página
   já com a categoria e a tag daquela página.
9. Uma página pode ter várias tags e aparecer em várias grades. O critério de
   exibição é **tag igual E categoria igual**; tag igual com categoria diferente
   não aparece.
10. **Cronologia é o gerenciador de eras** (ver seção 3).
11. **História** continua abrindo na lista de histórias e usa a grade de tags
    **ignorando as tags de era**.
12. **A Wiki é de Ordem x Caos e só isso.** Nenhuma nota de outro universo
    (Sagas de Cronos, Runas Book, rascunhos soltos do vault) pode virar página
    da Wiki nem aparecer no gráfico. Isso hoje está quebrado — a causa e a
    correção estão na seção 5.1.

### Campanhas

Estrutura nova (páginas principais → subpáginas):

```
História     Criar História · Vincular História · Cronologia agregada
Mundo        Locais · Organizações · Itens · Personagens        (grade de subpáginas)
Aventura     Missões · Eventos · Encontros · Organizador        (grade de subpáginas)
Notas        grade de tags (mesmo componente da Wiki)
Estilo       igual ao atual
Gráfico      ver regra abaixo
```

13. **Mundo**: cada subpágina tem Voltar, Criar, Vincular, barra de pesquisa e a
    listagem. Criar gera uma **página da Wiki** na categoria correspondente
    (Locais→Geografia, Organizações→Organizações, Itens→Itens,
    Personagens→Personagens), com a **tag igual ao nome da subpágina**
    (`Locais`, `Organizações`, `Itens`, `Personagens`), e já vincula à campanha.
    Vincular escolhe uma página existente da Wiki. Na listagem, clicar exibe as
    informações do item, com botão **Editar** e botão **Remover vínculo** — que
    só desfaz o vínculo e nunca apaga a página.
14. **Aventura**: Missões e Eventos mantêm status, ordem narrativa e os filtros
    atuais. **Encontros** passa a ser subpágina daqui, preservando "Salvar e
    abrir na Mesa" e o envio de tokens ao RunasVTT.
15. **Sessões deixa de ser um tipo.** As páginas `session-note` existentes viram
    notas (`gm-note`) com a tag `Sessões`.
16. **Notas** são registros de escopo campanha, exibidos na grade de tags, e
    **não** aparecem na Wiki nem no gráfico dela. "Notas" é o balde interno da
    campanha, não uma oitava categoria da Wiki.
17. **História da campanha**: "Criar História" cria a história (que continua
    sendo um registro da Wiki), vincula e abre o documento **sem sair da
    campanha**. A Cronologia da campanha agrega os acontecimentos de todas as
    histórias vinculadas, ordenados por ano fictício e agrupados por era.
18. **Organizador**: canvas único por campanha, com nós de texto e setas entre
    eles — criar, arrastar, ligar, editar e apagar. Persistido no IndexedDB com
    o resto do estado. **Sem** exportação `.canvas` para o Obsidian nesta etapa.
19. **Gráfico da campanha** mostra tudo da campanha **exceto** notas,
    organizador e estilo: missões, eventos, encontros, histórias vinculadas e os
    itens de Mundo. **Missões e eventos sempre com mais destaque** que o resto
    (raio maior e cor cheia; os demais menores e dessaturados). O gráfico da
    Wiki cobre as sete categorias.

### Navegação

20. Dois níveis com botão Voltar, endereçados por **querystring +
    `history.pushState`**: `/campaigns?c=<campanhaId>&p=mundo&s=locais` e
    `/wiki?c=<categoria>&t=<tag>`. Recarregar o navegador volta à mesma
    subpágina e o Voltar do navegador funciona. Continua proibido `next/link` e
    `useRouter`; a troca entre Bestiário/Mesa/Campanhas/Wiki segue por âncora
    HTML, como `navigation-safety.test.ts` exige.

---

## 2. Novo modelo de dados

Arquivo: `apps/runas-dm/app/lib/knowledge-model.ts`. Suba a versão do workspace
para `3` e concentre **toda** a migração em `normalizeKnowledgeWorkspace`.

```ts
export const WIKI_SECTIONS = [
  { id: "chronology",    label: "Cronologia" },
  { id: "story",         label: "História" },
  { id: "geography",     label: "Geografia" },
  { id: "characters",    label: "Personagens" },
  { id: "creatures",     label: "Criaturas" },
  { id: "items",         label: "Itens" },
  { id: "organizations", label: "Organizações" },
] as const

export const CAMPAIGN_PAGE_KINDS = [
  { id: "mission",   label: "Missão" },
  { id: "event",     label: "Evento" },
  { id: "encounter", label: "Encontro" },
  { id: "gm-note",   label: "Nota" },
] as const

/** Tag é global por nome: o mesmo ícone e a mesma cor em qualquer categoria. */
export interface KnowledgeTag {
  id: string
  /** Chave de identidade: comparada sempre por `normalizedLabel(name)`. */
  name: string
  icon: string        // nome do ícone lucide-react
  color: string
  /** Categorias/escopos onde a tag aparece na grade mesmo com 0 páginas. */
  pinnedIn: string[]  // ids de WIKI_SECTIONS ou "campaign-notes"
}
```

- `KnowledgeCategory` e `page.categoryIds` são **removidos**. Na migração, cada
  categoria antiga vira uma tag com o mesmo nome nas páginas que a usavam.
- `page.tags` continua sendo a fonte de pertencimento. Tags são comparadas sem
  acento e sem caixa; o texto exibido é o do registro `KnowledgeTag`.
- `KnowledgeWorkspaceState` ganha `tags: KnowledgeTag[]` e perde `categories`.
  `mergeKnowledgeWorkspaces` e `applyCloudBackup` mesclam `tags` por `id`, como
  já fazem com as outras coleções, respeitando `deletedIds`.
- `CampaignRecord` ganha `worldPageIds: string[]` (itens de Mundo vinculados) e
  `organizer?: { nodes: OrganizerNode[]; edges: OrganizerEdge[] }`.

Semântica da grade, para não restar dúvida:

- A grade de uma categoria mostra as tags **usadas por páginas daquela
  categoria** mais as tags com aquela categoria em `pinnedIn` (é assim que uma
  tag recém-criada, ainda com 0 páginas, continua aparecendo).
- **Renomear** uma tag é global: muda o registro e reescreve o nome em todas as
  páginas que a usam, em qualquer categoria. Ícone e cor idem.
- **Remover** uma tag na grade de uma categoria tira a tag das páginas *daquela*
  categoria e remove a categoria de `pinnedIn`. Se a tag deixar de ser usada e
  de estar fixada em qualquer lugar, o registro é descartado. **Nenhuma página
  é excluída** e nada entra em `deletedIds`.
- "Sem Categoria" é calculada, nunca armazenada: é a lista de páginas da
  categoria sem nenhuma tag.

```ts
export interface OrganizerNode { id: string; title: string; body: string; x: number; y: number; color?: string }
export interface OrganizerEdge { id: string; fromId: string; toId: string; label?: string }
```

### Migração v2 → v3 (uma única passagem, idempotente)

1. `kind: "fauna"` → `"creatures"` + tag `Fauna`; `kind: "monsters"` →
   `"creatures"` + tag `Monstros`.
2. `kind: "session-note"` → `"gm-note"` + tag `Sessões`.
3. Cada `KnowledgeCategory` referenciada em `page.categoryIds` vira tag na
   página (nome da categoria) e um `KnowledgeTag` correspondente, com
   `pinnedIn` apontando para a categoria/escopo onde ela era usada.
4. Cada era de `state.eras` (as dez de `UNIVERSE_ERAS`, já com as edições do
   mestre) vira uma **página de era** (`scope: "wiki"`, `kind: "chronology"`,
   ver seção 3). `state.eras` deixa de ser a fonte de verdade; mantenha o campo
   sendo lido apenas para esta migração e pare de gravá-lo.
5. Páginas `kind: "chronology"` que **não** vieram dessa migração (as avulsas
   que já existiam, vindas do vault) viram acontecimentos: `kind: "event"`,
   `scope: "wiki"`, sem história vinculada.
6. `deletedIds` e `obsidianPath` são preservados intactos em todos os casos —
   nenhuma nota do vault pode ser recriada ou perdida por causa da migração.

---

## 3. Cronologia: era é página e tag ao mesmo tempo

A Cronologia deixa de listar acontecimentos e passa a **criar, editar e excluir
eras**. Cada era é uma página (`kind: "chronology"`, categoria Cronologia) que
guarda:

| Campo | Origem |
| --- | --- |
| Nome | `title` |
| Ano inicial / final (fictícios) | novos campos `eraStartYear` / `eraEndYear`, canônicos em C.E. |
| Calendário de digitação/exibição | novo campo `eraCalendar` (`"C.E."` ou `"Logi"`) |
| Resumo | `summary` |
| Cor | `accentColor` |
| Ícone | novo campo `icon` |

A era **é** a sua tag: a página Cronologia desenha as eras na mesma grade de
tags (editar nome, ícone, cor, ver o total de registros, remover). Editar ali
edita a página da era; remover exclui a era e retira a tag dos acontecimentos,
**sem apagar nenhum acontecimento**.

### Calendário (já implementado, mantenha a semântica)

`apps/runas-dm/app/lib/chronology.ts` guarda o ano sempre como **um número em
C.E.**; Logi é o mesmo eixo deslocado: `4.027 C.E. = 0 Logi`, ou seja
`Logi = C.E. − 4027` (`LOGI_EPOCH_IN_CE`). `readCalendarYear` aceita `-4725`,
`4027 C.E.` e `0 Logi`; `parseCalendarYear` devolve sempre C.E. Não invente uma
segunda escala nem grave Logi cru.

### Marcação automática das tags de era

- Nova função pura `erasForYear(year, eraPages): KnowledgePage[]` — devolve
  **todas** as eras cujo intervalo contém o ano (sobreposição marca as duas; a
  regra atual de "vence a mais específica" deixa de valer para a marcação).
  Era sem `eraStartYear` e sem `eraEndYear` nunca marca nada.
- Nova função pura `withEraTags(pages, eraPages): KnowledgePage[]` — para cada
  acontecimento (`scope: "wiki"`, `kind: "event"`), recalcula as tags: mantém as
  tags que não são de era e substitui as de era pelas eras que batem com o ano.
  Acontecimento sem ano, ou com ano fora de todas as eras, fica **sem** tag de
  era e aparece em "Sem Categoria" da Cronologia.
- Quando roda: ao abrir a página de uma era, **e** sempre que um acontecimento é
  salvo ou o intervalo de uma era muda. A função é idempotente: rodar duas vezes
  não muda nada e não pode disparar gravação no vault sem diferença real.
- A tag de era é reconhecida por bater com o título de alguma página de era.
  A grade de tags de História e das demais categorias **filtra essas tags fora**.

---

## 4. Componentes: como quebrar o portal

`app/components/knowledge-portal.tsx` tem 649 linhas e concentra Wiki e
Campanha. Ele **precisa** ser quebrado; deixe-o apenas como casca de estado e
sincronização. Estrutura alvo:

```
app/lib/knowledge-route.ts          leitura/escrita da querystring + popstate
app/lib/knowledge-tags.ts           registro de tags, contagem, "Sem Categoria", renomear/remover
app/components/tag-grid.tsx         grade de tags (ícone, nome, contagem) + "Nova tag"
app/components/tag-editor.tsx       nome, ícone (lucide) e cor de uma tag
app/components/tag-page.tsx         busca + ordenação (data ↑↓, nome A–Z/Z–A) + "Criar Novo" + PageGrid
app/components/subpage-header.tsx   título + botão Voltar, usado por toda subpágina
app/components/wiki-portal.tsx      as 7 categorias da Wiki
app/components/era-manager.tsx      Cronologia: grade de eras + formulário de era
app/components/campaign-portal.tsx  casca da campanha (páginas principais)
app/components/campaign-story.tsx   Criar/Vincular História + cronologia agregada
app/components/campaign-world.tsx   Mundo e suas 4 subpáginas
app/components/campaign-adventure.tsx  Aventura e suas 4 subpáginas
app/components/campaign-organizer.tsx  canvas do Organizador
```

Regras de estilo: siga `docs/design-system.md` e reaproveite as classes de
`app/globals.css` (`knowledge-grid`, `knowledge-card`, `knowledge-toolbar`,
`knowledge-empty`). A grade de subpáginas do Mundo e da Aventura usa o mesmo
desenho da grade de tags (ícone em cima, nome embaixo). Nada de biblioteca nova:
ícones continuam vindo de `lucide-react`.

O Organizador é SVG/DOM próprio, sem dependência externa: arrastar por
`pointerdown/move/up`, setas em `<svg>`, zoom/pan reaproveitando a lógica de
`app/lib/graph-wheel.ts`.

---

## 5. Sincronização com o Obsidian

`app/lib/obsidian-sync.ts` e `docs/obsidian-vault-organization.md`:

- Pastas raiz passam a ser as sete categorias. `Criaturas` é nova; `Fauna` e
  `Monstros` passam a ser **subpastas** dela (porque viraram tags).
  `Organizações` é nova.
- A subpasta física de uma página passa a ser a **primeira tag** (era a primeira
  categoria). Tags de era valem como subpasta na Cronologia.
- Acontecimento de história continua morando em `História/<Nome da História>/`.
- Na leitura, aceite o frontmatter antigo: `categorias:` é importado **como
  tags**, sem duplicar com `tags:`. Escreva só `tags:` daqui em diante.
- `page.obsidianPath` existente **nunca** é reescrito pela migração: nota já
  sincronizada fica onde está; só notas novas usam o caminho novo.
- `IGNORED_VAULT_FOLDERS` continua ignorando a raiz `Notas`; as notas de
  campanha seguem em `Campanhas/<Campanha>/…`, então não há conflito.
- Campanha: `Encontros` continua como pasta; `Anotações/Sessões` deixa de ser
  gerada (as notas migradas mantêm o caminho antigo por `obsidianPath`).

### 5.1 Correção obrigatória: a Wiki importa notas de fora de Ordem x Caos

**Sintoma relatado:** o gráfico da Wiki exibe itens de Sagas de Cronos, mesmo a
Wiki sendo de Ordem x Caos.

**Causa, encontrada no código atual** (`app/lib/obsidian-sync.ts`):

1. `isIgnoredVaultPath` é uma **lista de exclusão**: `IGNORED_VAULT_FOLDERS` só
   conhece `.obsidian`, `.trash`, `Assets`, `Bases`, `Templates`, `Notas`,
   `Histórias`, `Campanhas` e `Runas-Book`. Qualquer outra pasta na raiz do
   vault (e qualquer `.md` solto na raiz) é considerada sincronizável.
2. Em `noteToPage`, quando o caminho não bate com `wikiLocation` nem com
   `campaignLocation`, o escopo cai no ramo final `: "wiki"` e o tipo vira
   `kindFromValue(...)`, cujo fallback para a Wiki é `"chronology"`.

O resultado é que **toda nota desconhecida do vault vira página da Wiki na
Cronologia** — e daí entra no gráfico. Pior: a exportação de volta grava
`runas_id` e os demais campos `runas_*` no frontmatter dessas notas, então
Cronos passa a carregar metadados do Runas DM.

**Correção exigida (lista de permissão, não de exclusão):**

1. Uma nota só é sincronizável se a **pasta raiz** dela for uma das sete
   categorias da Wiki (ou o alias legado `Cronologia Geral`) ou `Campanhas`.
   Reescreva `isSynchronizableVaultPath` nesse sentido e mantenha
   `IGNORED_VAULT_FOLDERS` apenas como reforço.
2. `noteToPage` **nunca** cria página quando `wikiLocation` e `campaignLocation`
   falham: o fallback `: "wiki"` sai. Sem localização reconhecida, a nota é
   ignorada na importação.
3. `runas_id` deixa de ser passe livre: só é honrado dentro das pastas
   permitidas. Isso é o que impede as notas de Cronos já contaminadas de voltar.
4. **A exportação nunca escreve fora das pastas permitidas.** Hoje
   `obsidianPathForPage` grava página de campanha na **raiz do vault** quando
   `page.obsidianPath` está vazio (`if (page.scope === "campaign") return
   pathInsideRoot(filename, rootFolder)`); passe a usar sempre
   `Campanhas/<Campanha>/<pasta>/`, como o modo organizado já faz.
5. **Limpeza do que já entrou, sem apagar nada do vault.** No carregamento,
   detecte as páginas cujo `obsidianPath` esteja fora das pastas permitidas e
   apresente uma ação explícita — “Páginas fora das categorias da Wiki (N)” —
   listando título e caminho, com botão **Remover do site**. Remover tira o
   registro do estado e **não** toca no `.md`. Não apague em silêncio durante a
   migração e não adicione essas páginas a `deletedIds`.
6. **Cinto e suspensório no gráfico:** `KnowledgeGraph` passa a receber apenas
   páginas cujo `kind` esteja nas sete categorias (Wiki) ou nos tipos da
   campanha, descartando qualquer registro com `kind` desconhecido.
7. Testes em `obsidian-sync.test.ts`: uma nota em `Sagas de Cronos/x.md`, uma
   solta na raiz do vault e uma em `Runas-Book/…` **não** viram página, nem
   mesmo quando trazem `runas_id` no frontmatter; uma nota em
   `Personagens/Runilitas/…` continua virando página normalmente.

---

## 6. Ordem de execução

Cada fase termina com `npm run typecheck -w @runas/dm` e
`npm run test -w @runas/dm` verdes. Não comece a fase seguinte com a anterior
quebrada.

**F0 — Baseline.** Rode `npm run test -w @runas/dm`, `npm run typecheck` e
`npm run lint -w @runas/dm` e anote o estado inicial.

**F1 — Modelo e migração.** `knowledge-model.ts` + `chronology.ts`: novas
categorias, `KnowledgeTag`, campos de era, `worldPageIds`, `organizer`,
`erasForYear`, `withEraTags`, remoção de `KnowledgeCategory`, migração v2→v3.
Testes novos em `knowledge-model.test.ts` cobrindo: fusão Fauna+Monstros,
sessões→notas, categorias→tags, eras→páginas, cronologia avulsa→acontecimento,
marcação com sobreposição de eras, ano fora de todas as eras, idempotência.

**F2 — Obsidian.** Caminhos por tag, pastas novas, compat de `categorias:` na
leitura, `obsidianPath` preservado — **e a correção da seção 5.1** (lista de
permissão, fim do fallback para `wiki`/`chronology`, exportação sempre dentro
de `Campanhas/`, limpeza explícita das páginas já importadas de fora). Atualize
`obsidian-sync.test.ts`.

**F3 — Infraestrutura de tela.** `knowledge-route.ts` (querystring +
`popstate`), `knowledge-tags.ts`, `tag-grid`, `tag-editor`, `tag-page`,
`subpage-header`. Teste de rota em `knowledge-navigation.test.ts`, mantendo o
contrato de âncoras que já é verificado.

**F4 — Wiki.** Sete categorias, grade de tags por categoria, página da tag,
`era-manager` na Cronologia, História com a lista de histórias ignorando tags de
era. O editor de página perde o painel "Categorias" e ganha o de tags.

**F5 — Campanha.** Quebra do portal, páginas História/Mundo/Aventura/Notas/
Estilo/Gráfico, vínculos de Mundo (`worldPageIds`, criar/vincular/remover
vínculo), criação de história sem sair da campanha, cronologia agregada,
Encontros dentro de Aventura.

**F6 — Organizador.** Canvas único por campanha, nós de texto e setas.

**F7 — Gráfico.** Wiki com as sete categorias e **sem nenhum registro de fora
de Ordem x Caos** (filtro por `kind` conhecido, seção 5.1); campanha com tudo
exceto notas, organizador e estilo, missões e eventos em destaque. Atualize
`knowledge-graph.test.ts`.

**F8 — Documentação e validação final.** Atualize `docs/product-rules.md`
(seções de Wiki e Campanhas), `docs/architecture.md` (modelo e rotas por
querystring), `docs/obsidian-vault-organization.md` e o `AGENTS.md` no que citar
categorias/tags. Rode, nesta ordem:

```
npm run test -w @runas/dm
npm run typecheck
npm run lint -w @runas/dm
npm run build:dm
npm run build:tools
```

---

## 7. Armadilhas conhecidas

- **Não** reintroduza `next/link`/`useRouter` para trocar de área: só âncoras.
  A navegação nova é interna à mesma rota, via `pushState`.
- **Não** grave o corpo de uma História à mão: continua derivado por
  `withStoryEvents`.
- Toda mutação de estado passa por `mutate()` e é persistida no IndexedDB; o
  `PUT` no D1 é consequência, nunca requisito.
- `deletedIds` é a lápide que impede um backup ou o vault de ressuscitar um
  registro excluído — preserve em todas as operações novas (remover tag, excluir
  era, desvincular item de Mundo **não** entram em `deletedIds`, porque não
  apagam página nenhuma).
- Excluir campanha precisa continuar limpando as notas do vault; itens de Mundo
  vinculados **não** podem ser apagados junto, porque pertencem à Wiki.
- Não mexa em `public/sw.js` nem em `scripts/prepare-pages.mjs`: o nome do cache
  já recebe o identificador do build, e nada de RSC pode ser armazenado.
- O portal roda `"use client"` inteiro; qualquer componente novo que use
  `window`, `pointer events` ou `history` precisa do mesmo cuidado com
  hidratação que o código atual já toma (efeitos com `setTimeout(…, 0)`).
