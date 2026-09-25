<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Regras obrigatórias da Runas Suite

Antes de alterar qualquer parte desta suíte, leia integralmente:

1. `docs/product-rules.md`
2. `docs/architecture.md`
3. `docs/design-system.md`
4. `docs/data-sync.md`

Ao mexer na sincronização com o vault do Obsidian ou na estrutura de pastas do Runas DM, leia também `docs/obsidian-vault-organization.md`.

## Restrições que não podem ser quebradas

- `apps/runas-tools` continua um site estático (`output: "export"`) e offline-first.
- Cálculos de ficha, testes, dano e tabelas compartilhadas pertencem a `packages/runas-core`.
- Nenhum aplicativo deve copiar uma regra que já exista no núcleo. Altere o núcleo e valide os dois consumidores.
- As interfaces podem ser diferentes; somente o domínio é compartilhado.
- O Runas DM prioriza simplicidade e velocidade. Galeria, testes, dano e encontro funcionam sem navegação desnecessária.
- Toda ação rápida mantém os controles `Modificador` e `Avançado` na própria tela.
- A galeria sempre resume a ficha. O modal oferece `Simplificada` e `Avançada`.
- `Simplificada` e `Avançada` editam a mesma instância de `Character`. Perícias, habilidades, magias, ataques e itens devem permanecer registros estruturados identificados por `id`; nunca use strings ou arrays paralelos para representá-los na simplificada.
- A ficha avançada deve expor todos os campos de domínio do modelo compartilhado. A simplificada pode apenas ocultar o que não faz parte de seu recorte rápido.
- A ficha avançada do Runas DM mantém paridade funcional e de organização com as seções da ficha do Runas Tools. Informações, Estatísticas, Perícias, Vínculos, Habilidades, Inventário, Magias e Anotações devem ser comparadas com seus componentes equivalentes em `apps/runas-tools/components/character` antes de qualquer mudança. No DM, alteram-se tema, cores e remoção dos botões de rolar/conjurar; não se substituem tabelas, resumos ou janelas de registro por cartões genéricos expansíveis.
- Toda mudança estrutural em uma seção da ficha do Runas Tools exige revisar a seção correspondente em `apps/runas-dm/app/components/advanced-sheet-editor.tsx` no mesmo trabalho. Migração e normalização do formato `Character` pertencem exclusivamente a `packages/runas-core/src/lib/characterStorage.ts`.
- O estado primário do Runas DM é local (IndexedDB). O D1 é backup privado e nunca é requisito de uso.
- **Depois de um backup nada pode ter sido perdido.** O backup do Runas DM (nuvem e vault) guarda somente Bestiário, Campanhas e Wiki; nunca a Mesa, o Livro Vermelho nem notas fora das pastas permitidas. Toda gravação na nuvem passa por `apps/runas-dm/app/lib/cloud-backup.ts` (versão-base, trava de encolhimento): nenhum componente faz `fetch("/api/…")` nem `PUT` direto, e `navigation-safety.test.ts` protege o contrato. Um dispositivo sem dado algum do mestre nunca grava backup.
- Os dados do site que as notas não guardam (estilo e organizador das campanhas, tags com ícone e cor, eras com anos, exclusões, preferências de interface, Bestiário) vivem também em `Runas DM/*.json` no vault (`lib/vault-data.ts`). Nunca sobrescreva um arquivo cuja revisão este navegador não conhece e nunca grave um dispositivo virgem. Mudar o formato exige incrementar `VAULT_DATA_VERSION` e manter a leitura das versões anteriores.
- **Um nome nunca perde colchetes.** Campanhas e tags como `[O&C] Lion Heart` passam por `lib/frontmatter-values.ts` (`referenceList`, `tagList`, `stringList`). Nunca use `.replace(/^\[/…` nem `.replace(/\]$/…` em nomes; `bracket-safety.test.ts` bloqueia.
- A sincronização com o vault só lê e escreve nas sete seções da Wiki e em `Campanhas`. `Runas Book`, `Outros Documentos`, `Templates` e `Bases` nunca viram página nem são reescritas; `Runas DM` só recebe os arquivos de dados e `Assets` só recebe anexos e `Runas DM Backups`. O arquivo de uma nota nova tem o título exato como nome, e `Personagens` é plana. A norma completa está em `docs/obsidian-vault-organization.md`.
- Endpoints de backup exigem token secreto no servidor e hospedagem privada.
- O endereço canônico do Runas DM é `https://runas-dm.pages.dev`; mantenha o Cloudflare Access e o workflow dedicado antes de substituir uma publicação.
- O Runas DM não limita fichas ou cópias. A galeria do Runas Tools aceita até 100 fichas, paginadas em 20 por página (máximo de 5 páginas), conforme decisão explícita de produto.
- A importação do Runas DM aceita uma ficha JSON, vários JSON selecionados simultaneamente e o ZIP JSON exportado pela galeria do Runas Tools.
- Uma página de História da Wiki nunca é editada como texto: `contentHtml` é derivado de `storyEventIds` por `withStoryEvents`. Alterar a sequência, o corpo ou o `.md` de uma História passa por essa função.
- Na Wiki, `kind: "event"` chama-se **Acontecimento** e não tem status; `Evento` continua sendo o registro de campanha. Use `pageKindLabel(kind, scope)` para rotular.
- A Wiki usa sete seções fixas (`Cronologia`, `História`, `Geografia`, `Personagens`, `Criaturas`, `Itens`, `Organizações`); agrupamentos internos são `KnowledgeTag`. Em Campanhas, use as páginas principais História, Mundo, Aventura, Notas, Estilo e Gráfico.
- Páginas do Mundo continuam no escopo Wiki e são vinculadas por `CampaignRecord.worldPageIds`; remover o vínculo nunca remove a página. O Organizador fica em `CampaignRecord.organizer` e não é exportado para o Obsidian.
- O Gráfico deve usar `filterKnowledgeGraphPages`: Wiki cobre apenas as sete seções; campanha inclui missões, eventos, encontros, histórias vinculadas e Mundo, excluindo notas, estilo e organizador.
- Mudanças compartilhadas exigem teste no `@runas/core`, typecheck e build dos dois aplicativos.
- Os dois aplicativos são PWAs. A opção de instalação existe somente nas telas iniciais e nenhum fluxo principal pode depender da rede.
- Service workers nunca armazenam `/api/backup`, autenticação ou respostas do Cloudflare Access/Sites.
- No Runas DM publicado por Vinext, navegação entre rotas reais usa âncoras HTML e carregamento de documento. Não substitua os links de Bestiário, Mesa, Campanhas ou Wiki por `next/link`/`useRouter`: as transições RSC do Vinext beta quebram após deploys. `navigation-safety.test.ts` protege esse contrato.
- O nome do cache do service worker do Runas DM recebe o identificador do build em `scripts/prepare-pages.mjs`. Nunca volte a usar uma versão manual fixa nem armazene payloads RSC.
- Leia `docs/offline-pwa.md` antes de alterar cache, manifesto, IndexedDB ou instalação.
- Leia `docs/deployment.md` antes de alterar workflows, bindings, migrações, segredos ou acesso de produção.
