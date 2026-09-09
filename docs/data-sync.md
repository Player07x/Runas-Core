# Persistência, backup e offline

## Fonte primária

O Runas DM é local-first. IndexedDB guarda fichas, encontro, tabelas customizadas, versão e data da alteração. Isso mantém a mesa utilizável sem conexão e evita latência.

## Backup remoto

O D1 armazena snapshots JSON privados para fichas e para o arquivo de campanhas/wiki. Os endpoints exigem:

1. Cloudflare Access protegendo toda a aplicação;
2. `RUNAS_DM_BACKUP_TOKEN` como secret do Worker;
3. `Authorization: Bearer <token>`.

Campanhas e Wiki também exigem `RUNAS_DM_CAMPAIGN_PASSWORD`. Após validar as duas credenciais, o servidor emite uma sessão HttpOnly, SameSite=Strict e limitada a 12 horas. As credenciais não entram no IndexedDB.

O token fica somente em `sessionStorage`; não entra no bundle, IndexedDB ou Git.

Antes de publicar, aplique todas as migrações registradas em `apps/runas-dm/drizzle` ao D1. A configuração versionada do Pages usa o binding `DB`; nunca duplique esse binding no artefato gerado pelo Vinext.

## Conflitos

O snapshot possui `updatedAt`. A sincronização informa a data remota e pede confirmação antes de mesclar as fichas. A identidade de uma ficha é composta por nome, raça e elemento, comparados sem diferença de caixa e ignorando espaços excedentes.

- Ao criar o backup, a ficha local substitui a remota com a mesma identidade; fichas exclusivas dos dois lados continuam no snapshot.
- Ao sincronizar, a ficha remota substitui a local com a mesma identidade; fichas exclusivas dos dois lados continuam no navegador.
- A sincronização preserva o identificador local da ficha substituída para não quebrar cópias já anexadas à mesa.

## PWA

Runas Tools e Runas DM possuem manifesto, ícones e service worker. O service worker armazena o shell e assets versionados; os dados continuam no IndexedDB. O backup falha de forma não bloqueante sem rede. Regras completas em `docs/offline-pwa.md`.

## Obsidian

A sincronização do arquivo de campanhas/wiki é bidirecional e acontece diretamente no navegador. Antes de gravar, o Runas DM percorre os arquivos Markdown, importa notas novas ou modificadas e resolve vínculos `[[Página]]`; em seguida, grava as alterações do site. A sincronização automática repete essa leitura ao entrar, ao voltar para a aba, a cada 30 segundos enquanto ela estiver visível e depois de salvar uma página.

Há duas formas de acesso:

1. **Pasta local:** usa a File System Access API para selecionar um vault existente ou criar uma nova pasta pelo seletor do navegador. O acesso funciona mesmo com o Obsidian fechado. O Runas DM cria somente os recursos ausentes: `Assets`, `.obsidian/app.json` configurado para anexos em `Assets` e um arquivo de orientação. Configurações e documentos existentes nunca são substituídos durante essa preparação.
2. **API do Obsidian:** usa a API REST local do vault aberto. Por segurança, aceita somente HTTPS nos hosts de loopback `127.0.0.1`, `localhost` ou `::1`, sem credenciais, referenciador ou redirecionamentos HTTP. A chave fica somente no `sessionStorage`; o D1 e o servidor do Runas DM nunca a recebem. A pasta opcional é relativa à raiz do vault; vazia significa a própria raiz. Ao publicar em um domínio público (como `runas-dm.pages.dev`), o Chrome aplica a política de *Private Network Access* a essa chamada; o plugin Local REST API não responde ao preflight correspondente, então o navegador bloqueia a conexão mesmo com o certificado já aceito manualmente, sem gerar aviso de CSP. Isso é uma limitação do plugin, não do Runas DM — prefira **Pasta local** quando o vault estiver acessível no mesmo dispositivo.

Páginas novas da Wiki ficam nas pastas `Cronologia`, `Geografia`, `Personagens`, `Fauna`, `Monstros` e `Itens`; a pasta principal é a fonte de verdade da seção, a primeira categoria define a única subpasta física e categorias adicionais ficam no frontmatter. Campanhas também são importadas e, quando o vault possui arquivos `.base`, novas páginas são organizadas em `Campanhas/<Nome da campanha>/Eventos e Missões`, `Campanhas/<Nome da campanha>/Anotações`, `Campanhas/<Nome da campanha>/Anotações/Sessões` ou `Campanhas/<Nome da campanha>/Encontros`, conforme o tipo — cada campanha em sua própria subpasta, para não misturar o conteúdo de aventuras diferentes. Páginas de campanha que o próprio Runas DM já havia gravado fora dessa estrutura (por exemplo, direto na raiz, de antes do vault ter arquivos `.base`) são reorganizadas automaticamente na sincronização seguinte; notas nativas do usuário nunca são movidas. `Templates`, `Notas`, `Histórias`, `Bases` e áreas técnicas não entram na importação da Wiki; arquivos `.base` nunca são exibidos como páginas, mas ativam essa organização. Uma campanha é identificada pelas propriedades `Campanha` ou `Obra de Origem` (wikilink, gravado pelo Obsidian como lista), pela própria nota "`<Nome> (Campanha)`" que representa a campanha, ou pelo `runas_campaign_id` já gravado no frontmatter; o segmento da subpasta que nomeia a campanha nunca vira categoria da página. Notas apenas importadas mantêm o Markdown original byte a byte; ao editar uma página pelo site, propriedades do frontmatter que o modelo do Runas DM não conhece são preservadas na regravação. Anexos gerados pelo editor ficam em `Assets` e são referenciados como `![[imagem.ext]]`; embeds do Obsidian são carregados dali para o cache local e exibidos com redimensionamento e alinhamento, sem enviar o binário ao D1. Antes de substituir uma nota divergente, a versão anterior é copiada para `Assets/Runas DM Backups`; conflitos simultâneos também geram uma cópia local independente. A integração pode ser completamente desativada nas configurações, impedindo leitura e escrita automáticas.

O estado da autenticação da área privada é reaproveitado entre Wiki e Campanhas. Uma nova validação só acontece após dez minutos sem interação, evitando a tela de login durante a navegação interna.

## Cronologia e apresentação de campanhas

- `createdAt` é a data real de criação da página. Na cronologia, `eventYear` é um inteiro do calendário fictício e aceita anos negativos e zero; nunca é inferido da data real. `eraId` seleciona a era. As definições de eras ficam no snapshot local e no backup, com os limites documentados em `[O&C] História do Universo`; limites ausentes permanecem em branco e podem ser editados. Eventos antigos sem era ficam disponíveis em `Sem era definida`.
- `Mais Recentes` e `Mais Antigas` ordenam a data da página (ou a criação se ausente). Na cronologia, ordenam o ano fictício dentro da era selecionada, deixando eventos sem ano por último. Missões também oferecem a ordenação narrativa por `Ordem`.
- Os vínculos de ordem das missões são derivados a cada leitura, limitados à mesma campanha e a etapas inteiras consecutivas. `2` se liga a `1`; `3.1` e `3.2` se ligam a `2`, sem ligação entre si; `4` se liga a ambos os ramos de `3`. Eles não são gravados em `linkedPageIds`, que continua representando vínculos explícitos. Gráfico, cartões e editor usam a mesma função de cálculo. `ordem`, `runas_era` e `ano_evento` acompanham a página no frontmatter do Obsidian.
- A aba `Estilo`, entre `Encontro` e `Gráfico`, altera a aparência da campanha selecionada. Fundo da página, caixas, botões, texto, destaque, imagem do cabeçalho e desfoque ficam em `CampaignRecord`. A normalização descarta cores antigas dos registros individuais, preservando suas imagens. Missões e eventos herdam o tema da campanha e mantêm a borda correspondente ao status.
