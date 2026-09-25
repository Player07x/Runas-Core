# Publicação da Runas Suite

## Topologia

```text
GitHub: Player07x/Runas-Core (monorepo)
├── apps/runas-tools → Cloudflare Pages (`runas-tools.pages.dev`)
├── apps/runas-dm    → Cloudflare Pages privado + D1
└── packages/runas-core → incorporado nos dois builds
```

Os dois aplicativos devem ser construídos a partir do mesmo commit. `@runas/core` não é publicado no npm e não é uma API remota: o workspace o incorpora em ambos os artefatos, preservando o modo offline.

## Runas Tools

`.github/workflows/deploy-pages.yml` instala a raiz do workspace, valida a suíte e publica somente `apps/runas-tools/out` no projeto Cloudflare Pages `runas-tools`. O workflow usa o segredo de repositório `CLOUDFLARE_API_TOKEN` e o mesmo Account ID da suíte.

## Runas DM

O endereço canônico é `https://runas-dm.pages.dev`. O Runas DM usa uma Pages Function compatível com Cloudflare Workers, binding lógico D1 `DB`, banco `runas-dm-backups` e migrações versionadas em `apps/runas-dm/drizzle`. O binding declara `migrations_dir: "./drizzle"` para que o Wrangler use a mesma pasta localmente e no GitHub Actions.

O build `npm run build:dm:pages` reúne o cliente Vinext e o Worker modular em `apps/runas-dm/dist/pages`. `wrangler.jsonc` contém apenas identificadores públicos e bindings; segredos ficam no Cloudflare ou no GitHub Actions.

`.github/workflows/deploy-runas-dm.yml` publica automaticamente o Runas DM após mudanças em `apps/runas-dm`, `packages/runas-core` ou arquivos de workspace. Ele exige o segredo de repositório `CLOUDFLARE_API_TOKEN`, limitado à publicação do Pages. Migrações automáticas são habilitadas quando o segredo opcional `CLOUDFLARE_D1_API_TOKEN`, com permissão de escrita no D1 desta conta, está configurado. Sem esse segundo segredo, o deploy continua e as migrações precisam ser aplicadas por uma sessão autorizada antes da publicação. O Account ID não é secreto e está fixado no workflow para reduzir configuração manual.

Variáveis de produção:

- `RUNAS_DM_BACKUP_TOKEN`: segredo; nunca registrar no Git, logs ou arquivos `.env` versionados.

Tabelas do backup versionado: `cloud_backups` e `cloud_backup_chunks` são criadas pelo próprio Worker na primeira gravação (`CREATE TABLE IF NOT EXISTS`, o mesmo precedente de `book_workspace_chunks`), **sem migração e sem depender do segredo `CLOUDFLARE_D1_API_TOKEN`**. As tabelas antigas `backup_snapshots` e `knowledge_snapshots` continuam no banco, somente para leitura: seu conteúdo aparece como a "versão 1" de cada backup e nunca é apagado. O backup guarda o Bestiário e Campanhas/Wiki; o `PUT` recusa mais de 32 MB (`413`).

O Cloudflare Access deve proteger `runas-dm.pages.dev`, com o proprietário e somente os e-mails explicitamente autorizados. A URL legada `runas-dm.player-7x.chatgpt.site` é contingência temporária; não deve ser divulgada como endereço canônico.

## Ordem de uma publicação

1. `npm ci` na raiz.
2. Testes e typecheck de `@runas/core`.
3. Lint e build dos dois consumidores.
4. Publicar Runas Tools no Cloudflare Pages.
5. Gerar/aplicar todas as migrações D1 antes de publicar código que dependa delas. O backup versionado não precisa de migração.
6. Publicar Runas DM no Cloudflare Pages com segredo e política de acesso já configurados.
7. Verificar as duas URLs e o modo offline.

Se uma publicação falhar, a versão anterior deve continuar ativa. Nunca publique um consumidor após falha nos testes do núcleo compartilhado.

## Preparação de novos dispositivos

O usuário abre o endereço autorizado, instala o aplicativo pela tela inicial e espera o indicador `Offline pronto`. Depois pode trabalhar sem rede; o botão Backup volta a funcionar quando a conexão retornar.

Um computador novo **não** deve tentar "salvar" antes de receber os dados: conecte o vault do Obsidian (a pasta `Runas DM/` restaura tudo sozinha num dispositivo vazio) ou use "Importar da nuvem". Um dispositivo vazio nunca envia backup, e um dispositivo que não recebeu a versão atual da nuvem não a sobrescreve.

**Publicar antes de padronizar o vault.** Versões antigas do Runas DM reintroduzem nomes sem colchetes (`O&C] …`) e reescrevem notas de outras pastas. Publique a versão corrigida antes de abrir no site um vault padronizado (`docs/obsidian-vault-organization.md`).

## Runas Book

O livro publicado fica no D1 `runas-dm-backups` (tabela `book_workspace_chunks`, criada pelo próprio `_worker.js`, JSON comprimido em blocos). `GET /api/book` é público; `PUT /api/book` exige a sessão da Área DM. O `localStorage` do navegador é apenas cache offline: a versão mais recente (`updatedAt`) vence. O binding está em `apps/runas-book/wrangler.jsonc`, por isso o deploy roda dentro de `apps/runas-book`.
