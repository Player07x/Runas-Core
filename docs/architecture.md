# Arquitetura

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

## Runas Tools

- Next.js com `output: "export"`.
- Independente de backend e com PWA.
- Consome e transpila o núcleo pelo workspace.
- O Cloudflare Pages publica somente `apps/runas-tools/out` em `runas-tools.pages.dev`.

## Runas DM

O editor mantém uma única instância de `Character` por ficha aberta. As telas Simplificada e Avançada são projeções de interface sobre essa mesma instância. Coleções de domínio (`skills`, `abilities`, `spells`, `inventory`, `bonds` e `notes`) continuam normalizadas em objetos com `id`; a interface compacta nunca cria campos alternativos de texto. JSONs antigos, múltiplos JSONs e ZIPs do Runas Tools passam por `@runas/core/lib/characterStorage` e `@runas/core/lib/galleryImport`, os mesmos módulos consumidos pelo Tools.

Toda edição passa por `synchronizeCharacterDerivedValues`. A função recalcula informações derivadas, carga, defesa e limites de recursos; combina resistências/fraquezas do elemento com as personalizadas; permite PV atual negativo; e limita PA/PE aos respectivos máximos. O teto de PE Temporário é o PE atual. Runas Tools e Runas DM consomem essa mesma função.

`Character.portraitDataUrl` é opcional e versionado desde a versão 18. O Runas DM reduz o arquivo a JPEG 512×512 antes de persistir, permitindo uso offline e sincronização pelo snapshot sem armazenar a imagem original.

Na Mesa, cada ator é uma cópia independente. Testes podem gastar Determinação ou Casualidade; usos acumulados de Determinação são reaplicados às rolagens seguintes de Casualidade. Itens vinculam sua perícia por `skillId`; magias usam `castingSkill`; e a aplicação de dano mantém as três camadas PA Extra → PA → PV, seus elementos, multiplicadores, quebra, RDF/RDM e MT. Toda rolagem de dano, inclusive a iniciada por equipamento, pertence ao atacante, seleciona explicitamente qualquer ator — inclusive ele mesmo — e cria primeiro uma simulação. `Dano causado` preserva o tipo e permite editar somente o valor; `Dano simulado` permite edição textual sob bloqueio e é recalculado ao ser bloqueado novamente. Apenas a confirmação explícita altera o alvo.

O inventário separa o estado de uso do papel defensivo: vários itens podem ter `usage: "equipped"`, mas somente um deles pode ter `equippedAsArmor: true`. `calculateEquippedArmorDefense` usa exclusivamente o RDF/RDM desse item nas calculadoras. Fichas anteriores à versão 20 migram a primeira armadura equipada para esse papel sem desequipar as demais.

A galeria do Runas Tools usa o limite de produto `GALLERY_MAX_CHARACTERS = 100`, derivado de 20 registros por página e 5 páginas. Persistência, importação individual/ZIP e interface consomem as mesmas constantes.

- Vinext/React publicado como Pages Function em `runas-dm.pages.dev`.
- Interface client-side para resposta imediata.
- IndexedDB salva bestiário, encontro e tabelas customizadas.
- `/api/backup` guarda o snapshot privado de fichas no D1.
- `/api/campaign-data` guarda o snapshot privado e normalizado de Campanhas e Wiki no D1; o estado primário continua no IndexedDB.
- A API local do Obsidian recebe Markdown diretamente do navegador, sem encaminhar sua chave para o Worker.
- O banco remoto não participa dos cálculos nem bloqueia o uso offline.
- As rotas reais do Runas DM usam navegação de documento por âncoras HTML. O Vinext beta não oferece transições RSC confiáveis em produção; por isso `next/link` e `useRouter` não podem controlar Bestiário, Mesa, Campanhas ou Wiki. A sessão recente fica no `sessionStorage`, e o estado `checking` nunca renderiza o formulário de login.

## Política para mudanças

1. Regra ou tabela comum deve ser alterada em `@runas/core`.
2. Adicione teste determinístico no núcleo.
3. Atualize interfaces somente para consumir o contrato.
4. Execute typecheck, testes, lint e build.
5. Ao mudar `Character`, aumente `CHARACTER_VERSION` e implemente migração.
