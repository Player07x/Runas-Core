# Runas DM

Bestiário particular e mesa rápida do sistema Runas.

## Execução local

Na raiz da suíte:

```bash
npm install
npm run dev:dm
```

O estado principal é salvo no IndexedDB do navegador. Exportar JSON continua disponível mesmo sem backend.

## Instalação offline

A opção `Instalar Runas DM` aparece somente no Bestiário. Depois que a tela indicar `Offline pronto`, fichas, mesa, testes e dano funcionam sem conexão. Backup e sincronização permanecem operações online e nunca são armazenados pelo service worker.

Consulte `../../docs/offline-pwa.md` para as regras de cache e validação.

## Backup D1

1. Use a base Cloudflare D1 `runas-dm-backups` e o binding `DB` de `wrangler.jsonc`.
2. Aplique as migrações em `drizzle/` na ordem registrada pelo Drizzle.
3. Copie `.dev.vars.example` para `.dev.vars` somente no ambiente local e defina um token forte.
4. Em produção, cadastre `RUNAS_DM_BACKUP_TOKEN` como secret do Worker.
5. Proteja o site inteiro com Cloudflare Access antes de compartilhar o link.

O navegador pede o token uma vez por sessão por meio de um campo compatível com o gerenciador de senhas. O aplicativo mantém o segredo apenas em `sessionStorage`; quando o usuário aceita salvá-lo, a persistência e o autopreenchimento ficam sob proteção do navegador. `Backup` combina as fichas locais com as já armazenadas e faz a versão local vencer conflitos por nome, raça e elemento. `Sincronizar` faz a versão remota vencer os mesmos conflitos sem apagar fichas que existem somente no navegador. Consulte `../../docs/deployment.md` para publicação, segredo e acesso privado.

O backup na nuvem é **versionado** e guarda só o Bestiário (fichas e tabelas de maestria; a Mesa não entra) e Campanhas/Wiki. Cada gravação informa a versão que o dispositivo conhece: se a nuvem já mudou, ou se o envio apagaria dados demais, o servidor recusa (`409`) e nada é sobrescrito. As tabelas `cloud_backups` e `cloud_backup_chunks` são criadas sob demanda, sem migração; as tabelas antigas viram a "versão 1" somente leitura. Ver `../../docs/data-sync.md`.

## Campanhas, Wiki e Obsidian

`/campaigns` e `/wiki` compartilham um arquivo local-first independente das fichas. O conteúdo é salvo no IndexedDB e abre sem login. O mesmo token de backup do Bestiário, informado pelo menu `⋯`, ativa o envio automático para um snapshot privado do D1; sem ele, tudo continua apenas local. O preview em `localhost` usa somente o armazenamento local.

Encontros não são páginas de texto: cada encontro salva apenas nome, data, tags, notas breves do mestre e uma composição de fichas do Bestiário com quantidades. A ação de abrir na Mesa cria cópias independentes desse conjunto e leva as notas junto.

A integração com o Obsidian usa a **pasta local** do vault (File System Access API do Chrome/Edge, sem plugin e sem rede). A sincronização gera Markdown com frontmatter e links `[[Wiki]]` só nas sete seções da Wiki e em `Campanhas`, e a alternativa ZIP não precisa de acesso à pasta.

Tudo o que as notas não guardam — estilo e organizador das campanhas, tags com ícone e cor, eras com anos, exclusões, preferências de interface e o Bestiário — é gravado em `Runas DM/` dentro do vault (`wiki-e-campanhas.json`, `bestiario.json`, `versoes/`). Ao conectar o vault num computador novo, esses dados voltam sozinhos. A estrutura e os nomes das notas seguem `../../docs/obsidian-vault-organization.md`.

## Cloudflare Pages

O endereço canônico de produção é `https://runas-dm.pages.dev`.

```bash
npm run build:pages
npm run deploy:pages
```

`scripts/prepare-pages.mjs` transforma o build modular do Vinext no Advanced Mode do Pages sem copiar a configuração placeholder do ambiente local. O workflow `../../.github/workflows/deploy-runas-dm.yml` repete esse processo automaticamente no GitHub.

## Decisões importantes

As regras compartilhadas não ficam neste aplicativo. Consulte a raiz `AGENTS.md` e `docs/` antes de alterar cálculos ou formatos de ficha.

- Simplificada e Avançada editam a mesma instância completa de `Character`.
- Imagens são reduzidas localmente, salvas dentro da ficha e funcionam offline.
- O inventário simplificado mantém o resumo compacto e abre a edição do equipamento sob demanda.
- A Mesa oferece rolagem de dano e teste por equipamento, conjuração, gasto de Determinação/Casualidade e simulação editável antes de aplicar dano.
- Resistências e fraquezas herdadas do elemento vêm de `@runas/core/data/elements` e são combinadas com entradas personalizadas.
