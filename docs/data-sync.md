# Persistência, backup e offline

## Regra de ouro

**Depois de um backup, nada pode ter sido perdido.** Uma gravação de backup nunca substitui uma cópia existente sem saber qual cópia está substituindo, e nunca a substitui por algo muito menor sem confirmação explícita. A versão anterior é sempre recuperável. Essa regra vale para a nuvem e para os arquivos de dados dentro do vault do Obsidian, e é o motivo de quase todo o desenho abaixo.

## Fonte primária e onde cada dado mora

O Runas DM é local-first. Nada depende da rede para funcionar.

| Dado | Onde fica no navegador | Vai à nuvem? | Vai ao vault? |
| - | - | - | - |
| Fichas do Bestiário e tabelas de maestria | IndexedDB (`runas-dm`) | sim | sim (`Runas DM/bestiario.json`) |
| Mesa: encontro, iniciativa e notas da Mesa | IndexedDB | **não** | não |
| Campanhas e Wiki (páginas, campanhas, tags, eras, exclusões) | IndexedDB (`runas-dm-knowledge`) | sim | sim (`.md` + `Runas DM/wiki-e-campanhas.json`) |
| Preferências de interface (tema, tamanho da grade, colunas da cronologia, modo do editor de itens) | `localStorage` | **não** | sim (dentro de `wiki-e-campanhas.json`) |
| Preferências da integração com o Obsidian | `localStorage` | não | não |
| Versão-base e assinatura da nuvem, id do dispositivo | `localStorage` | não | não |
| Token de backup | `sessionStorage` (só a aba) | — | não |

O site **não usa cookies**. O que muda de computador para computador é o conteúdo do navegador; por isso os dados do mestre precisam estar no vault ou na nuvem para voltar num computador novo.

## Escopo do backup: só Bestiário, Campanhas e Wiki

Nada além disso sai do dispositivo, na nuvem ou no vault:

- O payload do Bestiário mantém o formato `RunasDmState` v2 (compatível com `normalizeRunasDmState` e com a importação JSON), mas com `encounter: []`, `initiative: []` e `workspaceNotesHtml: ""`. As fichas e as `masteryTables` ficam, porque as fichas referenciam as tabelas. Ver `bestiaryBackupPayload` em `lib/backup-sync.ts`.
- O payload de Campanhas e Wiki passa por `knowledgeSnapshotForStorage` (`lib/knowledge-scope.ts`): páginas cujo `obsidianPath` está fora das pastas permitidas (Livro Vermelho, `_Arquivo morto`, notas soltas de outros apps) ficam de fora.
- Preferências de interface nunca vão à nuvem; viajam apenas dentro de `Runas DM/wiki-e-campanhas.json`.
- Um dispositivo **virgem** (sem página, campanha, tag, era, exclusão nem ficha além das duas de exemplo) nunca envia nem grava nada (`isPristineKnowledge`, `isPristineBestiary`).

## Backup remoto (D1) versionado

As duas rotas seguem o mesmo contrato (`lib/server/backup-routes.ts`): `/api/backup` guarda o Bestiário (`kind: "bestiary"`) e `/api/campaign-data` guarda Campanhas e Wiki (`kind: "knowledge"`).

| Requisição | Resposta |
| - | - |
| `GET` | bytes da versão mais recente (cabeçalhos `X-Runas-Version`, `X-Runas-Updated-At`, `X-Runas-Encoding`, `X-Runas-Stats`, `X-Runas-Device`) ou `{ head: null }` |
| `GET ?meta=1` | `{ head, versions }`: a lista de versões disponíveis |
| `GET ?version=N` | bytes daquela versão |
| `PUT` | grava uma nova versão; corpo = gzip do JSON |

Todas exigem `Authorization: Bearer <token>` (a única exceção é `/api/campaign-data` em `localhost`, descrita abaixo), respondem `Cache-Control: no-store` e nunca são armazenadas pelo service worker.

**O servidor não interpreta o payload.** Ele guarda os bytes que recebe (gzip do cliente) em blocos de 900 KB, com limite de 32 MB, num único `db.batch` atômico. Quem normaliza é o cliente, ao restaurar. Isso corrige a falha antiga em que o D1 recusava linhas acima de ~2 MB e o cliente tratava qualquer erro como "salvo localmente".

**Concorrência otimista.** O `PUT` envia `X-Runas-Base-Version`, a versão que o dispositivo conhece. Se a nuvem já está numa versão diferente, a resposta é `409 { reason: "stale", head }` e **nada é sobrescrito**. Cliente sem o cabeçalho também recebe `stale` quando já existe backup.

**Trava de encolhimento.** O cliente envia `X-Runas-Stats` (`total` = páginas + campanhas + tags, ou fichas). Um envio que cai abaixo de 60 % do total atual (quando o atual tem 10 ou mais), ou que zera uma cópia que tinha conteúdo, recebe `409 { reason: "shrink" }`. `X-Runas-Force: 1` libera o envio, sempre depois de preservar a versão anterior. Ver `lib/snapshot-policy.ts` (`isShrink`).

**Histórico.** A versão anterior vira *checkpoint* quando o envio é forçado, quando encolhe, ou quando passaram 6 horas ou mais do último checkpoint. A nuvem guarda a versão atual e até 10 checkpoints; o excedente é apagado no mesmo `batch`.

**Legado.** Se não há versões novas mas existe uma linha em `knowledge_snapshots` ou `backup_snapshots`, ela é a "versão 1 virtual": `GET` a devolve, ela nunca é apagada, e o primeiro `PUT` legítimo cria a versão 2.

**Outros códigos.** `401` (token), `413` (`too-large`, com `limitBytes`), `503` (banco indisponível), `500` com o motivo real.

**`localhost`.** Em `localhost`/`127.0.0.1`, `/api/campaign-data` responde `localOnly` sem tocar o D1: o preview de desenvolvimento nunca escreve num backup real.

### Cliente

`lib/cloud-backup.ts` é o **único** caminho de rede para os backups: `putCloudBackup`, `fetchCloudBackup`, `fetchCloudMeta`, com resultado tipado (`ok`, `stale`, `shrink`, `unauthorized`, `too-large`, `unavailable`). Nenhum componente faz `fetch("/api/…")` nem `PUT` direto; `navigation-safety.test.ts` protege isso.

- O dispositivo guarda, por tipo, a versão-base e a assinatura do conteúdo enviado por último (`localStorage`, `runas-dm.cloud-base.*`). Um `409` cuja versão atual foi escrita por este mesmo dispositivo a partir da nossa base (resposta perdida) é adotado e repetido, em vez de virar conflito.
- Um dispositivo que nunca recebeu a nuvem não a sobrescreve: recebe `stale` e o usuário decide.
- O token fica somente em `sessionStorage`; não entra no bundle, IndexedDB ou Git.

Antes de publicar, aplique as migrações registradas em `apps/runas-dm/drizzle` ao D1. As tabelas do backup versionado (`cloud_backups`, `cloud_backup_chunks`) são criadas sob demanda pelo próprio servidor (`CREATE TABLE IF NOT EXISTS`), sem migração nova. A configuração versionada do Pages usa o binding `DB`; nunca duplique esse binding no artefato gerado pelo Vinext.

## Bestiário

`Backup` e `Sincronizar` (menu `⋯`) passam pelo cliente versionado: lê a cabeça da nuvem, mescla e envia com a versão-base. O snapshot possui `updatedAt`, e a sincronização informa a data remota e pede confirmação antes de mesclar. A identidade de uma ficha é composta por nome, raça e elemento, comparados sem diferença de caixa e ignorando espaços excedentes.

- Ao criar o backup, a ficha local substitui a remota com a mesma identidade; fichas exclusivas dos dois lados continuam no snapshot.
- Ao sincronizar, a ficha remota substitui a local com a mesma identidade; fichas exclusivas dos dois lados continuam no navegador.
- A sincronização preserva o identificador local da ficha substituída para não quebrar cópias já anexadas à mesa.
- Falhas mostram o motivo real (tamanho, token, versão), nunca "salvo localmente".

## Campanhas e Wiki na nuvem

Campanhas e Wiki abrem sem login nem senha. O token de backup, o mesmo do Bestiário, serve apenas para ativar a cópia na nuvem; sem token, nada sai do dispositivo.

1. Cada mudança é salva no IndexedDB 850 ms depois. Isso é independente da nuvem.
2. Com token na sessão, o envio à nuvem espera 15 s sem novas mudanças (no máximo 2 min desde a primeira pendente), compara a assinatura do conteúdo com a do último envio e não envia se nada mudou.
3. Nunca envia um estado virgem. Um dispositivo que ainda não recebeu a versão atual da nuvem não a sobrescreve: o servidor responde `stale`.
4. `stale`: o envio fica **bloqueado** (sem novas tentativas) e o `CloudConflictDialog` pergunta: **Importar e mesclar** (traz a nuvem e retoma o envio com a base nova), **Substituir a nuvem por este dispositivo** (com confirmação; a versão anterior fica no histórico) ou **Cancelar**.
5. `shrink`: o diálogo informa quantos registros o envio removeria e só envia com confirmação.
6. Outras falhas mostram o motivo no menu `⋯` e são repetidas após 60 s.
7. O status honesto aparece no menu `⋯`: `Nuvem: enviado às 15:03`, `Nuvem: ação necessária — envio pausado para não sobrescrever nada`, `Nuvem: falhou — <motivo>` e `Vault: …`.

A única forma de trazer dados da nuvem é a ação manual "Importar da nuvem", que lista as versões (a mais recente vem selecionada) e oferece dois modos:

- **Sincronizar**: por `id`, um registro (campanha, página ou categoria) que existe nos dois lados é reescrito com os dados do backup; um registro que só existe no backup é criado localmente; um registro que só existe localmente é preservado — exceto um já apagado neste dispositivo (presente em `deletedIds`), que um backup antigo não ressuscita.
- **Substituir tudo**: descarta o estado local por inteiro e adota o backup, inclusive suas próprias exclusões.

Depois de importar, a versão importada passa a ser a base do dispositivo.

## Dados do Runas DM dentro do vault (`Runas DM/`)

As notas `.md` guardam o texto das páginas. Tudo o mais — campanhas (estilo, organizador, vínculos, ordem), tags com ícone e cor, eras com anos e calendário, exclusões, o Bestiário e as preferências de interface — só existia no navegador e na nuvem. Por isso o vault ganhou uma pasta visível:

```text
Runas DM/
├── LEIA-ME.md                 (runas_system: true)
├── wiki-e-campanhas.json      estado completo de Campanhas e Wiki + preferências de interface
├── bestiario.json             fichas e tabelas de maestria
└── versoes/                   cópias anteriores (checkpoints)
```

Cada arquivo é um envelope `{ format: "runas-dm-vault-data", kind, version: 1, revision, writerId, savedAt, counts, contentHash, preferences?, data }` com o cabeçalho **antes** de `data`, o que permite ler só o começo do arquivo para saber de quem ele é (`lib/vault-data.ts`).

**Regras de gravação (todas com teste):**

- Só grava se a `revision` do arquivo for a que **este navegador** conhece (`localStorage`, por arquivo). Um arquivo de outro computador, de uma cópia do vault, ilegível, editado à mão ou de uma versão de formato mais nova **nunca é sobrescrito**: com o dispositivo virgem restaura, senão pergunta.
- Nunca grava um dispositivo virgem.
- Aplica a mesma trava de encolhimento da nuvem, salvo confirmação.
- Antes de sobrescrever, guarda o arquivo atual em `versoes/` (Campanhas e Wiki: 5 cópias, uma a cada 6 h ou mais; Bestiário: 2 cópias, uma a cada 24 h ou mais) e sempre antes de uma sobrescrita forçada. Nome: `wiki-e-campanhas-<data ISO>.json`.
- Só reescreve quando o hash do conteúdo mudou; `navigator.locks` serializa abas; a escrita é atômica (`createWritable`).
- Nunca pede permissão sozinho: sem permissão de escrita mostra "permissão pendente" e um botão.
- Só roda com "Integração com Obsidian ativa".

**Quando grava:** ao fim de cada sincronização de notas (automática e ao salvar uma página), 2 s depois de qualquer mudança de estado (estilo, tags… sem esperar os 30 s da sincronização), em "Salvar agora" e, no Bestiário, 5 s depois de cada gravação local (`saveBestiaryToVault`).

**Quando restaura:** ao selecionar ou conectar o vault, antes da primeira sincronização de notas. É automático **somente** se o dispositivo estiver virgem (`applyCloudBackup(…, "replace")`, que mantém as lápides); caso contrário o `VaultRestoreDialog` oferece **Mesclar**, **Substituir tudo** ou **Manter os dados deste dispositivo** (grava por cima, guardando o arquivo atual em `versoes/`). Depois a sincronização normal reconcilia com os `.md` (baseline por `obsidianSourceMarkdown` e fingerprint) e as preferências de interface são aplicadas ao vivo. Um computador novo com o vault conectado volta exatamente como estava, sem nenhuma chamada à nuvem.

**Sem vault:** "Exportar dados" gera um ZIP com os dois `.json`, e o ZIP de notas também leva `Runas DM/wiki-e-campanhas.json`. "Importar JSON" aceita esses arquivos. Serve para tirar os dados de um navegador antigo antes de trocar de computador.

O estilo da campanha continua **fora** das notas `.md` (nem no frontmatter das páginas, nem em nota da campanha): ele vive só no `.json`.

## Cópias em conflito

Quando a mesma página muda no site e no vault, o site guarda a versão local como "(cópia local em conflito)". Elas se acumulam, então há duas ações (`lib/conflict-copies.ts`): o aviso **Cópias em conflito** no topo da Wiki e das Campanhas remove todas do sistema e do Obsidian, e o botão **Remover cópias em conflito** da página de uma tag remove só as daquela tag. Cada remoção pede confirmação, limpa referências, grava a lápide e, com a integração ativa, apaga o arquivo do vault depois de guardar uma cópia em `Assets/Runas DM Backups`.

## Tags

Toda tag é **minúscula** e única (`lib/tag-normalization.ts`, aplicada em `normalizeKnowledgeWorkspace` e em cada alteração):

- Variantes de caixa, acento e plural viram uma só (`assentamento`, `Assentamentos` → `assentamentos`; `regiao`, `Regiões` → `regiões`); vence a forma mais completa.
- O ruído do erro dos colchetes (`] Lion Heart pt. II`, `O&C] …`, `…"] …`) e `Sem Tag` saem. Um nome bem formado nunca é removido, nem quando igual ao da campanha.
- Cada tag ganha um emoji relacionado (`assentamentos` 🏘️, `regiões` 🏞️, `sessões` 🎬…); o emoji que o mestre escolheu nunca é trocado.
- A assinatura de sincronização compara só a forma canônica: mudar a caixa não regrava as notas do vault. Uma nota só ganha as tags minúsculas quando é salva pelo site. A pasta de uma página nova usa a tag com a inicial maiúscula (`Geografia/Assentamentos/`), para não criar pastas paralelas.

## PWA

Runas Tools e Runas DM possuem manifesto, ícones e service worker. O service worker armazena o shell e assets versionados; os dados continuam no IndexedDB. O backup falha de forma não bloqueante sem rede. Regras completas em `docs/offline-pwa.md`.

## Obsidian

A sincronização das notas de campanhas/wiki é bidirecional e acontece diretamente no navegador. Antes de gravar, o Runas DM percorre os arquivos Markdown, importa notas novas ou modificadas e resolve vínculos `[[Página]]`; em seguida, grava as alterações do site. A sincronização automática repete essa leitura ao entrar, ao voltar para a aba, a cada 30 segundos enquanto ela estiver visível e depois de salvar uma página.

O acesso é feito por **Pasta local**: a File System Access API seleciona um vault existente ou cria uma nova pasta pelo seletor do navegador, funcionando mesmo com o Obsidian fechado. O Runas DM cria somente os recursos ausentes: `Assets`, `.obsidian/app.json` configurado para anexos em `Assets` e um arquivo de orientação. Configurações e documentos existentes nunca são substituídos durante essa preparação. Não existe modo de sincronização por rede (API REST do Obsidian): o Chrome aplica a política de *Private Network Access* a qualquer chamada de um domínio público para um endereço de rede privado, e o plugin Local REST API não responde ao preflight correspondente — a conexão é bloqueada mesmo com o certificado aceito manualmente, sem sequer gerar aviso de CSP. Como essa é uma limitação do plugin, não do Runas DM, e sem contorno possível do lado do site, o modo por rede foi removido; a pasta local funciona sem depender de rede alguma.

A estrutura completa do vault, os nomes de arquivo e a política de duplicados estão em `docs/obsidian-vault-organization.md`. Aqui ficam as regras de sincronização.

### Pastas: lista de permissão

- Entram na sincronização **somente** as pastas raiz `Cronologia` (alias legado `Cronologia Geral`), `História`, `Geografia`, `Personagens`, `Criaturas`, `Itens`, `Organizações` e `Campanhas` (`isSynchronizableRootFolder`). Uma pasta de mesmo nome em qualquer outro nível, por exemplo dentro de outro app que compartilhe o vault, nunca é lida como seção.
- `Runas Book` (e o antigo `Runas-Book`), `Runas DM`, `Outros Documentos`, `Templates`, `Notas`, `Bases`, `Assets`, `_Arquivo morto`, `Histórias` (legado) e áreas técnicas nunca são importadas **nem reescritas**. `listMarkdownFiles` só desce nas pastas permitidas: o Runas DM nem lê o resto do vault.
- Uma página já rastreada cujo `.md` está fora das pastas permitidas é **pulada** na exportação (sem escrever, sem backup, sem mover) e listada em "Páginas fora das categorias da Wiki" (`pagesOutsideAllowedFolders`), onde o mestre remove o registro do site uma a uma ou **todas de uma vez** (`removePagesOutsideAllowedFolders`). Só o registro sai; o `.md` nunca é tocado, e os ids viram lápides para que um backup antigo não os devolva.
- Foi a ausência dessa proteção que fez o Runas DM reescrever 145 notas do Livro Vermelho e gerar centenas de cópias em `Assets/Runas DM Backups`.

### Nomes de arquivo e pastas

- O nome do arquivo de uma nota nova é o **título exato** (`noteFileName`): acentos, vírgulas e parênteses ficam; `<>:"/\|?*#^[]` viram espaço; o texto é normalizado em NFC (o Obsidian também normaliza); espaços repetidos e pontos finais são removidos; no máximo 150 caracteres. Assim `[[Título]]` sempre encontra a nota.
- `Personagens` é uma seção **plana**: nenhuma subpasta de categoria. As tags ficam só no frontmatter.
- Nas outras seções da Wiki, a primeira tag define a única subpasta física; as demais tags ficam no frontmatter. Uma subpasta nunca contém outra.
- Em `Cronologia`, cada era mora na própria pasta (`Cronologia/<Era>/<Era>.md`); uma página de Cronologia que já tem tag fica na pasta da tag. Os acontecimentos não ficam em `Cronologia`: pertencem a uma história, em `História`.
- `História` é a única seção com subpasta por registro: cada história é uma pasta `História/<Nome da história>/` e cada acontecimento é um arquivo dentro dela. Nessa seção a subpasta nomeia a história, nunca uma categoria. A nota da história guarda a sequência em `runas_story_events` (ids, na ordem) e tem como corpo apenas os tópicos `- [[Acontecimento]]`; nada de "Páginas relacionadas", que só duplicaria os mesmos links. Um acontecimento criado direto pelo Obsidian dentro da pasta da história entra no fim da sequência na sincronização seguinte.
- Campanhas também são importadas. Quando o vault possui arquivos `.base`, novas páginas são organizadas em `Campanhas/<Nome da campanha>/Eventos e Missões`, `…/Anotações`, `…/Anotações/Sessões` ou `…/Encontros`, conforme o tipo — cada campanha em sua própria subpasta, para não misturar o conteúdo de aventuras diferentes. A pasta da campanha é reconhecida pela estrutura (`Campanhas/<campanha>/<tipo>/…`) mesmo quando o nome da pasta não casa com o título; o segmento que nomeia a campanha nunca vira tag da página.
- Páginas de campanha que o próprio Runas DM já havia gravado fora dessa estrutura (por exemplo, direto na raiz, de antes do vault ter arquivos `.base`) são reorganizadas automaticamente na sincronização seguinte; notas nativas do usuário nunca são movidas.
- Arquivos `.base` nunca são exibidos como páginas, mas ativam a organização por campanha.

### Campanhas

Uma campanha é identificada pelas propriedades `Campanha` ou `Obra de Origem` (wikilink, gravado pelo Obsidian como lista), pela própria nota "`<Nome> (Campanha)`" que representa a campanha, ou pelo `runas_campaign_id` já gravado no frontmatter. A nota-hub "`<Nome> (Campanha)`" nunca vira uma página rastreada — ela só estabelece a campanha — para que apagá-la direto pelo Obsidian não a traga de volta na sincronização seguinte; qualquer página que uma sincronização anterior a essa regra tenha rastreado a partir dela é removida (com lápide) na primeira sincronização depois da atualização.

### Um nome nunca perde colchetes

Campanhas e tags podem começar com `[` — por exemplo `[O&C] Lion Heart pt. II`. Uma falha antiga transformava esse nome em `O&C] Lion Heart pt. II`, criando uma campanha e uma pasta duplicadas e vazando o nome da campanha como tag. A regra agora é única e testada (`lib/frontmatter-values.ts`, `lib/bracket-safety.test.ts`):

- Um valor do frontmatter só é lista quando **não** está entre aspas e o primeiro `[` fecha no último caractere (`[a, b]`). Qualquer outro texto — `"[O&C] X"` entre aspas, `[O&C] X` sem aspas — é um valor único, com os colchetes intactos.
- Referências e tags nunca são divididas por vírgula nem têm `[`/`]` removidos por expressão regular: usam `referenceList`, `tagList` e `stringList`. Um teste estrutural proíbe `.replace(/^\[/…` e `.replace(/\]$/…` no código do app.
- Se um arquivo antigo já contém `O&C] X` e existe a campanha `[O&C] X`, o colchete é restaurado (`restoreStrippedBracket`) em vez de criar outra campanha.
- Vínculos aceitam colchetes no destino: `[[[O&C] X]]` (`WIKILINK_TARGET_SOURCE`).
- Tags de mesmo nome recebem ids únicos (`withUniqueTagIds`).

### Conteúdo das notas

- Notas apenas importadas mantêm o Markdown original byte a byte; ao editar uma página pelo site, propriedades do frontmatter que o modelo do Runas DM não conhece são preservadas na regravação. Uma nota nativa cujo texto começa com o resumo derivado dela mesma não o repete no corpo ao ser regravada (`bodyStartsWithSummary`); o resumo fica só no frontmatter.
- Callouts do Obsidian (`> [!tipo] Título` seguido de `> texto`) sobrevivem à edição pelo site: linhas `>` seguidas são uma única citação (`markdownToHtml` as agrupa com `<br>` e `htmlToMarkdown` as grava de volta contíguas), e uma linha em branco separa citações diferentes. Antes, cada linha virava uma citação, o callout se partia em dois blocos e o resumo achatado ficava repetido no corpo.
- Campos que só existem no site (anos, calendário, ícone e cor de uma era) não são zerados quando a nota é relida; uma era canônica que chega pela primeira vez sem anos recebe os de `UNIVERSE_ERAS`. As edições do mestre nesses campos só voltam pelo `.json`.
- Anexos gerados pelo editor ficam em `Assets` e são referenciados como `![[imagem.ext]]`. Colar uma imagem no editor usa o mesmo caminho: o binário da área de transferência entra como `data:` e vira arquivo em `Assets` na sincronização. Uma imagem remota sem binário na área de transferência não pode ser baixada (`connect-src` da CSP) nem exibida (`img-src`), então é colada como link em vez de virar um quadro quebrado; embeds do Obsidian são carregados dali para o cache local e exibidos com redimensionamento e alinhamento, sem enviar o binário ao D1.
- Antes de substituir uma nota divergente, a versão anterior é copiada para `Assets/Runas DM Backups`; conflitos simultâneos também geram uma cópia local independente. O nome da cópia usa o **hash do conteúdo**, não um carimbo de tempo: o mesmo conteúdo é o mesmo arquivo, e um laço futuro nunca gera centenas de cópias.
- Excluir uma página pelo site que já veio do vault também exclui o arquivo correspondente (com a mesma cópia de segurança antes) — sem isso, a nota intacta seria reimportada na sincronização seguinte.
- A integração pode ser completamente desativada nas configurações, impedindo leitura e escrita automáticas, inclusive dos arquivos de `Runas DM/`.

O token de backup fica em `sessionStorage` sob a mesma chave do Bestiário, então é informado uma vez por aba e vale para Bestiário, Campanhas e Wiki. Um `401` remove o token da sessão.

## Cronologia e apresentação de campanhas

- `createdAt` é a data real de criação da página. Na cronologia, `eventYear` é um inteiro do calendário fictício e aceita anos negativos e zero; nunca é inferido da data real. O valor gravado é sempre o ano canônico em C.E.: o mestre pode digitar em C.E. ou em Logi (`parseCalendarYear`), e a conversão usa `4.027 C.E. = 0 Logi`. `eraId` guarda a era, mas ela é deduzida do ano (`eraForYear`) a cada gravação e a cada leitura: o intervalo mais específico vence, uma era sem fim cobre tudo a partir do início, e a era gravada só prevalece quando o ano não classifica sozinho (`resolveEra`). As definições de eras ficam no snapshot local e no backup, com os limites documentados em `[O&C] História do Universo`; uma era canônica sem nenhum ano recebe os do documento (Alquimistas 1.489–3.122, Magos 3.122–3.888, Migrações 3.888–4.027 C.E.) e nunca tem um intervalo editado sobrescrito; Pré-Runas e Era das Runas não têm limites no documento e ficam em branco. Eventos antigos sem era ficam disponíveis em `Sem era definida`. As eras aparecem ordenadas pelo ano C.E. crescente (a Pré-Runas abre a lista; sem datas, por último). Uma data de era marcada em C.E. é exibida só em C.E.; uma marcada em Logi é exibida em duas linhas, Logi e C.E. (`eraRangeLines`). Uma migração única (`migrations` no estado) ajustou os anos das eras canônicas aos do documento; depois dela, o que o mestre edita nunca é sobrescrito.
- `Mais Recentes` e `Mais Antigas` ordenam a data da página (ou a criação se ausente). Na cronologia, ordenam o ano fictício dentro da era selecionada, deixando eventos sem ano por último. A cronologia reúne as páginas de Cronologia e os acontecimentos das Histórias: os dois são datados por `eraId` + `eventYear` (`isChronologyPage`). Missões também oferecem a ordenação narrativa por `Ordem`.
- Os vínculos de ordem das missões são derivados a cada leitura, limitados à mesma campanha e a etapas inteiras consecutivas. `2` se liga a `1`; `3.1` e `3.2` se ligam a `2`, sem ligação entre si; `4` se liga a ambos os ramos de `3`. Eles não são gravados em `linkedPageIds`, que continua representando vínculos explícitos. Gráfico, cartões e editor usam a mesma função de cálculo. `ordem`, `runas_era` e `ano_evento` acompanham a página no frontmatter do Obsidian.
- A aba `Estilo`, entre `Encontro` e `Gráfico`, altera a aparência da campanha selecionada. Fundo da página, caixas, botões, texto, destaque, imagem do cabeçalho e desfoque ficam em `CampaignRecord`. A normalização descarta cores antigas dos registros individuais, preservando suas imagens. Missões e eventos herdam o tema da campanha e mantêm a borda correspondente ao status. Esses campos de aparência são uma personalização exclusiva do site: nunca são gravados nas notas `.md` do Obsidian (nem no frontmatter das páginas nem em nota própria da campanha), mas fazem parte do backup e de `Runas DM/wiki-e-campanhas.json`.
