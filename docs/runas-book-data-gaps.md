# Lacunas de catalogacao do Runas Book

Este registro acompanha a carga dos livros Branco, Vermelho, Azul e Sagas de Cronos. O texto das fontes está versionado no snapshot do Runas Book; esta página separa dados lidos das fontes de decisões necessárias para que a wiki e os downloads funcionem sem quebrar o modelo do `@runas/core`.

## Decisões de carga

- Os capítulos e páginas seguem os títulos do sumário de cada livro. O Livro Azul é exibido somente como **Livro Azul**, sem o número de versão no nome público.
- Cada página tem `id`, título, resumo, tipo (`Regra`, `Item`, `Habilidade`, `Magia` ou `Ficha`) e origem. Isso permite exportar registros sem transformar coleções do domínio em strings.
- Itens, habilidades, magias e fichas novas usam os tipos estruturados de `@runas/core`. Um download de ficha usa o envelope `{ version, character }` aceito pelo Runas Tools.
- As páginas da compilação de Sagas de Cronos têm origem nos canais/notas exportados. A pasta do Obsidian preserva a hierarquia `Runas Book/<livro>/<capítulo>/<página>.md`.

## Lacunas preservadas para revisão

| Fonte | Lacuna | Tratamento no site |
| --- | --- | --- |
| Livro Branco e Livro Vermelho | Sumários registram seções, mas nem sempre um registro individual de item, habilidade ou magia. | O texto da seção é carregado como página de regra; o DM pode abrir uma nova página estruturada quando a fonte trouxer um registro completo. |
| Livro Azul | Existem tabelas e subtítulos sem um campo de descrição uniforme. | O título e a página de origem são preservados; o conteúdo extraído fica editável no modo DM e recebe as fórmulas do `@runas/core` como precedência. |
| Sagas de Cronos | A compilação mistura JSON de mensagens, DOCX, planilha e notas; há mensagens sem metadados de regra. | O snapshot combina a edição revisada do livro de regras com os textos analíticos da pasta; a página recebe o tipo mais seguro, normalmente `Regra`, e as fórmulas do `@runas/cronos-core` prevalecem. |
| Sagas de Cronos | Vários itens (por exemplo Clava, Machadinha e Lança) não informam dano, características, requisito ou peso. | O registro é criado como `Item` com valores vazios e peso provisório `0`, marcado para revisão; nenhum dano foi inventado. |
| Sagas de Cronos | Elementos como Ar, Puro e Tóxico nem sempre trazem resistência, fraqueza e efeito completos. | A página fica editável e não injeta valores numéricos no núcleo compartilhado. |
| Sagas de Cronos | Fórmulas de deslocamento e morte têm versões conflitantes. | As decisões estão detalhadas em `Mudancas e lacunas de Sagas de Cronos.docx`; a edição revisada usa fórmulas com parênteses e limiares explícitos. |

## Próxima revisão recomendada

No Runas Book DM, abra as páginas marcadas como revisão, complete os campos da fonte e sincronize com o vault. Quando um valor alterar cálculo de ficha, teste ou dano, mova a regra para `packages/runas-core` antes de disponibilizar o download para os dois consumidores.
