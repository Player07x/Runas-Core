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
- `RUNAS_DM_CAMPAIGN_PASSWORD`: segredo adicional das rotas de Campanhas e Wiki.

O Cloudflare Access deve proteger `runas-dm.pages.dev`, com o proprietário e somente os e-mails explicitamente autorizados. A URL legada `runas-dm.player-7x.chatgpt.site` é contingência temporária; não deve ser divulgada como endereço canônico.

## Ordem de uma publicação

1. `npm ci` na raiz.
2. Testes e typecheck de `@runas/core`.
3. Lint e build dos dois consumidores.
4. Publicar Runas Tools no Cloudflare Pages.
5. Gerar/aplicar todas as migrações D1 antes de publicar código que dependa delas, incluindo o snapshot de campanhas/wiki.
6. Publicar Runas DM no Cloudflare Pages com segredo e política de acesso já configurados.
7. Verificar as duas URLs e o modo offline.

Se uma publicação falhar, a versão anterior deve continuar ativa. Nunca publique um consumidor após falha nos testes do núcleo compartilhado.

## Preparação de novos dispositivos

O usuário abre o endereço autorizado, instala o aplicativo pela tela inicial e espera o indicador `Offline pronto`. Depois pode trabalhar sem rede; o botão Backup volta a funcionar quando a conexão retornar.
