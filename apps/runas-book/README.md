# Runas Book

Wiki de regras da suíte Runas, com catálogo por livro/capítulo, exportação estruturada para fichas e área DM local-first.

O catálogo inicial contém as páginas preenchidas a partir dos PDFs do Livro Branco e Vermelho, do DOCX do Livro Azul e da compilação de Sagas de Cronos. O snapshot textual fica em `app/lib/book-sources.ts`, permitindo que a wiki continue offline-first; o modo DM sincroniza páginas em uma pasta local do Obsidian em `Runas Book/<livro>/<capítulo>`.

As páginas de regra preservam a origem e, quando a fonte diverge de uma fórmula implementada, exibem a regra efetiva do núcleo como precedência. O Livro Azul usa os cálculos e tipos de dano de `@runas/core`; Cronos usa os atributos, elementos, Sincronia e Fama de `@runas/cronos-core`.

## Desempenho

- O catálogo inicial é gerado no build (`app/lib/book-seed.ts`, usado só pelas páginas de servidor); o navegador não recebe `book-sources.ts`. Páginas salvas sem conteúdo carregam a fonte sob demanda (`legacy-content.ts`).
- O workspace é gravado no `localStorage` depois que a interface responde (`use-deferred-local-storage.ts`) e na hora ao ocultar/fechar a aba.
- Editores, diálogos da área DM e os exportadores PDF/DOCX são carregados sob demanda.
- `book-view-bootstrap.ts` oculta o conteúdo estático antes da primeira pintura quando o endereço (#/…) ou o livro salvo levam a outra tela, evitando deslocamento de layout.
- Não use `@import 'tailwindcss'` aqui: sem PostCSS, o Turbopack embute o compilador do Tailwind no JavaScript do cliente.
