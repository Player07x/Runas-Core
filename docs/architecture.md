# Arquitetura

## Identificadores

Todo id de registro da suíte vem de `createId` / `createPrefixedId`
(`@runas/core/lib/ids`). Nunca chame `crypto.randomUUID` direto: ela só existe
em contexto seguro, e o Runas Tools também é servido pelo RunasVTT em
`http://IP:porta` para o jogador da rede local, onde a função não existe —
importar, salvar e criar ficha quebravam ali. O helper usa a implementação
nativa quando há, cai para `crypto.getRandomValues` (disponível fora de
contexto seguro) e ainda assim devolve um UUID v4 válido.


## Visão geral

```text
apps/runas-tools ─┐
                  ├── packages/runas-core
apps/runas-dm ────┘
       │
       ├── IndexedDB (fonte local e offline)
       └── API privada → Cloudflare D1 (snapshot de backup)
```

## `@runas/core`

Contém tipos versionados, migração/normalização de `Character`, leitura de ZIP da galeria, tabelas de consulta, cálculos derivados, sincronização de invariantes, rolagens, dano, melhoria de maestria e modificador rápido.

O núcleo não importa React, navegador, IndexedDB, Next.js, Cloudflare ou componentes. Seus módulos são publicados por subpaths, como `@runas/core/lib/damageCalculator`.

`packages/vtt-bridge` contém somente o contrato versionado entre os sites e o RunasVTT: envelope de ficha, resumo de recursos, imagem do token, leitura dos tokens da cena e entradas do Registro. Ele pode importar `@runas/core` para montar o envelope e o resumo, mas o RunasVTT guarda esses dados sem interpretar regras.

## Runas Tools

- Next.js com `output: "export"`.
- Independente de backend e com PWA.
- Consome e transpila o núcleo pelo workspace.
- O Cloudflare Pages publica somente `apps/runas-tools/out` em `runas-tools.pages.dev`.

## Runas DM

O editor mantém uma única instância de `Character` por ficha aberta. As telas Simplificada e Avançada são projeções de interface sobre essa mesma instância. Coleções de domínio (`skills`, `abilities`, `spells`, `inventory`, `bonds` e `notes`) continuam normalizadas em objetos com `id`; a interface compacta nunca cria campos alternativos de texto. JSONs antigos, múltiplos JSONs e ZIPs do Runas Tools passam por `@runas/core/lib/characterStorage` e `@runas/core/lib/galleryImport`, os mesmos módulos consumidos pelo Tools.

Toda edição passa por `synchronizeCharacterDerivedValues`. A função recalcula informações derivadas, carga, defesa e limites de recursos; combina resistências/fraquezas do elemento com as personalizadas; permite PV atual negativo; e limita PA/PE aos respectivos máximos. O teto de PE Temporário é o PE atual. Runas Tools e Runas DM consomem essa mesma função.

`Character.tokenImageDataUrl` (PNG ou WebP com transparência) e `Character.tokenSize` (0,5 a 10 células, em passos de 0,5) existem desde a versão 21 e representam a ficha no mapa do RunasVTT. Fichas anteriores migram com `tokenSize = 1` e sem token; o retrato continua sendo a reserva. O desenho do token (recorte circular, borda e fundo transparente) é `renderTokenImage`, de `@runas/vtt-bridge`, usado pelos dois apps. No Tools, o token é gravado na seção `token` do IndexedDB.

Desde a versão 22, `CharacterInventoryItem` tem `size` (comprimento em centímetros) e `mt`, sempre derivado por `calculateItemSizeModifier`. O item usa exatamente a mesma tabela de tamanho das fichas, sem ajuste: uma espada de 80 cm tem MT -2, como uma criatura de 80 cm. A normalização recalcula `mt` a partir de `size`; fichas anteriores migram com `size = 0` e `mt = 0`.

Na versão 23, o dano do item se separou em expressão e bônus. A expressão é escrita pelo jogador; o bônus é sempre derivado por `calculateItemDamageBonus` (`@runas/core/lib/itemDamage`) e nunca digitado: +1 por nível de raridade do vínculo (`calculateLegacyRarityLevel`) e, só com `Usar MT?` ativo, a diferença `MT do item − MT do personagem` (−1 por ponto abaixo, +2 por ponto acima). A afinidade do item não entra no dano. Um item de `mt === 0` é neutro: esse é também o valor de "tamanho não informado", então a diferença não é calculada. O tamanho continua gravado em centímetros e é exibido em metros por `formatItemSize` / `metersFromCentimeters` (`@runas/core/lib/inventoryCalculations`). Rolar dano por um item compõe as duas partes com `composeItemDamageExpression` — `2D+2 cortante (+poder)` com bônus 10 vira `2D+12 cortante (+poder)` — e **não** ativa mais `Aplicar MT`: o tamanho já entrou no bônus, e multiplicá-lo de novo contaria duas vezes.

Ainda na versão 23, `CharacterInventoryItem.enchantmentSpellId` e `bondAbilityId` deram lugar a `spellIds` e `abilityIds`: listas de referências para qualquer magia e qualquer habilidade da própria ficha, não só encantamentos e habilidades de vínculo. A migração converte o campo único em lista de um elemento, e `synchronizeCharacterDerivedValues` descarta referências a registros removidos. A lista de inventário trocada com o Runas Book subiu para a versão 3 (`spells` e `abilities` embutidas) e continua lendo as versões 1 e 2.

`Character.elements` (versão 23) guarda os elementos conhecidos, exibidos no topo de Magias. Um elemento é o recorte curto da perícia: `elementId` (de `characterElements`) ou nome livre, mais `level`; o teste é `Místico + Poder + nível`. As fusões não são registros: `availableElementFusions` as deriva dos elementos de nível maior que zero, somando os níveis dos componentes. `listCharacterTestSources`/`findCharacterTestSource` (`@runas/core/lib/characterTestSources`) unificam perícias, elementos e fusões, para que qualquer campo que peça "uma perícia" — `item.skillId`, `spell.castingSkill` — aceite os três.

`Character.portraitDataUrl` é opcional e versionado desde a versão 18. O Runas DM reduz o arquivo a JPEG 512×512 antes de persistir, permitindo uso offline e sincronização pelo snapshot sem armazenar a imagem original.

Na Mesa, cada ator é uma cópia independente. Testes podem gastar Determinação ou Casualidade; usos acumulados de Determinação são reaplicados às rolagens seguintes de Casualidade. Itens vinculam sua perícia por `skillId`; magias usam `castingSkill`; e a aplicação de dano mantém as três camadas PA Extra → PA → PV, seus elementos, multiplicadores, quebra, RDF/RDM e MT. Toda rolagem de dano, inclusive a iniciada por equipamento, pertence ao atacante, seleciona explicitamente qualquer ator — inclusive ele mesmo — e cria primeiro uma simulação. `Dano causado` preserva o tipo e permite editar somente o valor; `Dano simulado` permite edição textual sob bloqueio e é recalculado ao ser bloqueado novamente. Apenas a confirmação explícita altera o alvo.

O inventário separa o estado de uso do papel defensivo: vários itens podem ter `usage: "equipped"`, mas somente um deles pode ter `equippedAsArmor: true`. `calculateEquippedArmorDefense` usa exclusivamente o RDF/RDM desse item nas calculadoras. Fichas anteriores à versão 20 migram a primeira armadura equipada para esse papel sem desequipar as demais.

A galeria do Runas Tools usa o limite de produto `GALLERY_MAX_CHARACTERS = 100`, derivado de 20 registros por página e 5 páginas. Persistência, importação individual/ZIP e interface consomem as mesmas constantes.

- Vinext/React publicado como Pages Function em `runas-dm.pages.dev`.
- Interface client-side para resposta imediata.
- IndexedDB salva bestiário, encontro e tabelas customizadas.
- `/api/backup` guarda o backup privado do Bestiário (fichas e tabelas de maestria; nunca a Mesa) e `/api/campaign-data` guarda o de Campanhas e Wiki. As duas rotas são o mesmo contrato versionado (`lib/server/backup-routes.ts`): o servidor guarda os bytes (gzip do cliente) em blocos no D1, sem interpretá-los; cada `PUT` informa a versão-base que o dispositivo conhece e recebe `409` se a nuvem já mudou (`stale`) ou se o envio encolheria demais os dados (`shrink`); o histórico guarda a versão atual e até 10 checkpoints. As tabelas `cloud_backups` e `cloud_backup_chunks` são criadas sob demanda (`CREATE TABLE IF NOT EXISTS`); as tabelas antigas (`backup_snapshots`, `knowledge_snapshots`) viram a "versão 1" somente leitura. O estado primário continua no IndexedDB.
- O cliente é único: `lib/cloud-backup.ts` (`putCloudBackup`, `fetchCloudBackup`, `fetchCloudMeta`). O Runas DM nunca busca o remoto sozinho para aplicá-lo: o caminho de volta é a ação manual "Importar da nuvem", que escolhe uma versão e aplica `applyCloudBackup` no modo `"merge"` (reescreve por `id` o que existe no backup, cria o que só existe nele, preserva o que só existe localmente, respeitando `deletedIds`) ou `"replace"` (descarta o local e adota o backup por inteiro). Ver `docs/data-sync.md`.
- Os dados do mestre também vivem no vault: `Runas DM/wiki-e-campanhas.json` e `Runas DM/bestiario.json` (`lib/vault-data.ts`), com a mesma política de versões e as mesmas travas da nuvem. O vault é o backup **completo** (estilo, tags, eras, preferências); a nuvem é a cópia remota.
- A sincronização com o Obsidian usa somente a File System Access API (pasta local); a política de *Private Network Access* do Chrome torna a API REST local do plugin inviável para um site público, então esse modo não existe.
- O banco remoto não participa dos cálculos nem bloqueia o uso offline.
- As rotas reais do Runas DM usam navegação de documento por âncoras HTML. O Vinext beta não oferece transições RSC confiáveis em produção; por isso `next/link` e `useRouter` não podem controlar Bestiário, Mesa, Campanhas ou Wiki. Campanhas e Wiki não têm tela de login; o token de backup só ativa a cópia na nuvem.

## Modelo de conhecimento do Runas DM

`KnowledgeWorkspaceState` é versionado em v3 e salvo primeiro no IndexedDB. O
domínio compartilha `KnowledgePage`, `KnowledgeTag` e `CampaignRecord` entre a
Wiki e as Campanhas; a normalização de snapshots antigos permanece em
`knowledge-model.ts`.

- A Wiki usa sete seções fixas. `fauna`/`monsters` migram para `creatures`,
  `session-note` para `gm-note`, e `KnowledgeCategory` antiga é convertida em
  tag global. Eras deixam de ser uma lista especial e viram páginas de
  Cronologia; `withEraTags` recalcula as tags dos acontecimentos.
- Uma campanha guarda `storyIds`, `worldPageIds` e o `organizer`. Páginas do
  Mundo continuam no escopo Wiki; o vínculo é somente a presença do id no
  registro da campanha. Notas de campanha são `gm-note` e não entram no
  Gráfico.
- `knowledge-route.ts` serializa os dois níveis internos em querystring:
  `c` identifica campanha ou seção, `p` a página principal, `s` a subpágina e
  `t` a tag. `useKnowledgeRoute` sincroniza `pushState`, `replaceState` e
  `popstate`; a troca entre áreas continua sendo uma âncora HTML.
- Política e escopo do backup (módulos puros, cada um com teste):
  `snapshot-policy.ts` (encolhimento, checkpoints, hash), `knowledge-scope.ts`
  e `bestiary-scope.ts` (o que entra no backup e o que é "virgem"),
  `server/versioned-backup.ts` (versões e blocos, sobre um `BackupStore`
  injetável: D1 em produção, memória nos testes), `cloud-backup.ts` (cliente),
  `vault-data.ts` e `vault-restore.ts` (arquivos do vault), `ui-preferences.ts`
  (as preferências de interface e suas chaves, importadas pelos componentes) e
  `frontmatter-values.ts` (leitura de listas e nomes sem perder colchetes).
- `knowledge-portal.tsx` mantém hidratação, IndexedDB, nuvem e Obsidian. A
  apresentação é dividida entre `CampaignPortal`, `CampaignWorld`,
  `CampaignAdventure`, `CampaignStory`, `CampaignOrganizer` e `WikiPortal`.
- `filterKnowledgeGraphPages` define o contrato de escopo do gráfico: a Wiki
  aceita somente registros das sete seções e a campanha aceita seus registros,
  histórias vinculadas e páginas do Mundo, excluindo notas, estilo e
  organizador.

## Política para mudanças

1. Regra ou tabela comum deve ser alterada em `@runas/core`.
2. Adicione teste determinístico no núcleo.
3. Atualize interfaces somente para consumir o contrato.
4. Execute typecheck, testes, lint e build.
5. Ao mudar `Character`, aumente `CHARACTER_VERSION` e implemente migração.
