# Organização do vault Ordem x Caos

Este documento é a **norma** do vault. O Runas DM grava exatamente esta estrutura e lê somente as pastas que ela reserva ao site; qualquer arquivo que não a respeite deve ser padronizado, realocado ou, se for cópia, removido pelo protocolo da última seção. As regras de sincronização (o que o site lê, reescreve e protege) estão em `docs/data-sync.md`.

## Estrutura padronizada

```text
Ordem x Caos/
├── Cronologia/                 seção da Wiki
│   └── <Era>/<Era>.md          uma pasta por era
├── História/                   seção da Wiki
│   ├── <História>.md           a nota da história (sequência em runas_story_events)
│   ├── <História>/             um arquivo por acontecimento da história
│   │   └── <Acontecimento>.md
│   └── Acontecimentos/         acontecimentos que ainda não pertencem a uma história
├── Geografia/                  seção da Wiki
│   └── <Categoria>/<Nota>.md   Assentamentos, Continentes, Mundos, Regiões, Territórios
├── Personagens/                seção da Wiki, PLANA
│   └── <Personagem>.md         sem subpastas
├── Criaturas/                  seção da Wiki
│   └── <Categoria>/<Nota>.md   Fauna e Monstros são tags/categorias
├── Itens/                      seção da Wiki
├── Organizações/               seção da Wiki
├── Campanhas/                  notas de campanha
│   └── <Campanha>/            título exato, colchetes incluídos
│       ├── Eventos e Missões/
│       ├── Anotações/          e Anotações/Sessões/
│       └── Encontros/
├── Assets/                     imagens e anexos
│   └── Runas DM Backups/       cópias de segurança de notas (ver "Backups")
├── Bases/                      arquivos .base e a nota de organização (não são páginas)
├── Templates/                  modelos do Obsidian (intocável)
├── Outros Documentos/          área particular, ignorada pelo Runas DM
├── Runas DM/                   dados do site (JSON) — ver data-sync.md
├── Runas Book/                 Livro Vermelho: outro aplicativo (intocável)
└── LEIA-ME Runas DM.md         orientação gerada pelo Runas DM
```

## Pastas da raiz

| Pasta | Dono | O Runas DM |
| - | - | - |
| `Cronologia`, `História`, `Geografia`, `Personagens`, `Criaturas`, `Itens`, `Organizações` | Wiki (as sete seções) | lê e grava |
| `Campanhas` | notas de campanha | lê e grava |
| `Assets` | anexos | grava imagens; `Runas DM Backups` é dele |
| `Bases`, `Templates`, `.obsidian` | Obsidian e o usuário | nunca lê como página, nunca reescreve |
| `Outros Documentos` | o usuário | ignora por inteiro |
| `Runas DM` | o Runas DM | dados do site (`.json`), `LEIA-ME.md` e `versoes/` |
| `Runas Book` | o app `@runas/book` | ignora por inteiro; **nunca** reescreve |

`Cronologia Geral` é um alias legado de `Cronologia`. `Histórias` (plural), `Notas` e `_Arquivo morto` são estruturas antigas: o site as ignora, e o protocolo abaixo as dissolve. Pastas de mesmo nome em outro nível (por exemplo `Runas Book/Personagens`) nunca contam como seção.

Não existe nota solta na raiz, a não ser `LEIA-ME Runas DM.md`.

## Nomes

- **Arquivo = título exato.** `Batalha de Méfise.md` guarda a página "Batalha de Méfise"; `[[Batalha de Méfise]]` sempre encontra a nota. Só saem do nome os caracteres que o sistema de arquivos ou os links não aceitam (`<>:"/\|?*#^[]` viram espaço); o texto é NFC; no máximo 150 caracteres. Nenhum arquivo em ASCII "simplificado".
- O título da nota (`# Título` e `runas_title`) é o mesmo texto do nome do arquivo.
- **Pasta de campanha = título exato da campanha**, incluindo os colchetes: `Campanhas/[O&C] Lion Heart pt. II/`. Uma pasta sem o colchete inicial é um erro de importação, não outra campanha.
- Pasta de era = título da era; pasta de história = título da história.
- Nunca dois arquivos com o mesmo título na mesma pasta.

## Seções da Wiki

- `Cronologia`: só eras, cada uma em `Cronologia/<Era>/<Era>.md`.
- `História`: cada história é uma nota `História/<Título>.md` **e** uma pasta `História/<Título>/` com um arquivo por acontecimento. O corpo da nota é apenas a lista `- [[Acontecimento]]`, na ordem; a sequência mora em `runas_story_events`. Uma página de História nunca é editada como texto. Acontecimentos sem história ficam em `História/Acontecimentos/`. Uma história não permanece com o título provisório `Nova história`: ela é renomeada pelo assunto.
- `Geografia`, `Criaturas`, `Itens`, `Organizações`: a primeira tag é a única subpasta física; nota sem tag fica direto na seção. Uma subpasta não contém outra. As demais tags ficam só no frontmatter. Nenhuma pasta se chama `Sem Tag`.
- `Personagens`: **plana**. As tags, por exemplo `runilita` ou `divindade`, ficam no frontmatter.

## Campanhas

`Campanhas/<Campanha>/` contém apenas as subpastas `Eventos e Missões`, `Anotações` (com `Sessões`) e `Encontros`. Toda nota de campanha carrega `campanha:` com o título exato, colchetes incluídos, e nunca usa o nome da campanha como tag. Uma pasta `Campanhas/Anotações` na raiz de `Campanhas`, sem campanha, não existe.

## Frontmatter

- Notas do site começam com `runas: true`, `runas_id`, `runas_scope`, `runas_kind`, `runas_title`, `runas_summary`… (o conjunto que `pageToMarkdown` escreve), cada chave **uma única vez**.
- Propriedades que o site não conhece (as do usuário, como `Tipo`, `Obra de Origem`, `Data`) são preservadas.
- Tags: valores curtos e úteis (`Sessões`, `Anotações`, `Eventos e Missões`, o tipo da nota). Nunca o nome da campanha, nunca fragmentos de outro campo (`Eventos e Missões"] …`), nunca `Sem Tag`.
- Notas nativas (escritas à mão no Obsidian, sem `runas_id`) **nunca têm o conteúdo alterado** por padronização: só podem mudar de lugar quando a pasta está errada.
- Aparência da campanha (cores, imagem do cabeçalho) nunca vai para uma nota.

## Duplicados e conflitos

- Identidade de uma nota, nesta ordem: `runas_id`, título normalizado, corpo idêntico.
- Uma cópia "(cópia local em conflito)" só é removida se **todo** o seu texto (menos o próprio título e a imagem gerada com esse nome) já existe na nota mantida. Se é a única, ela vira a nota canônica e é renomeada.
- Pastas duplicadas (`Cronologia Geral` + `Cronologia`, `Histórias` + `Outros Documentos`) são fundidas; pastas vazias são removidas.
- Imagens idênticas byte a byte são consolidadas em uma, com os `![[…]]` reescritos.
- **Remover = mover para a Lixeira do sistema.** Nada é apagado de forma definitiva, e a Lixeira nunca é esvaziada pelo protocolo.

## Backups (`Assets/Runas DM Backups`)

Antes de substituir uma nota divergente ou excluir uma nota pelo site, o Runas DM guarda a versão anterior aqui. O nome usa o hash do conteúdo, então o mesmo conteúdo é o mesmo arquivo. Uma cópia só pode ser removida quando é **redundante**: idêntica a uma nota viva, idêntica a outra cópia, ou com todas as linhas já presentes numa nota mantida. Cópia com conteúdo único fica, e é listada no relatório.

## Outros Documentos

Área particular: rascunhos, `.docx`, `.mermaid`, brainstorms e tudo o que não pertence a uma seção. O Runas DM não lê nem grava aqui. É também o destino de qualquer documento sem lugar na estrutura, em vez de ser apagado.

## Protocolo de padronização

Aplica-se a todo vault que já foi tocado por versões antigas do Runas DM. É rígido: todo documento afetado pelo site **deve** ficar conforme esta norma; o que não faz sentido no contexto da pasta é realocado para a pasta certa ou, sendo cópia, removido.

**Pré-condições.** Existe backup do vault (zip íntegro). O Obsidian e o Runas DM estão fechados. A ferramenta roda primeiro em `--dry-run`, que só produz o manifesto.

| # | Regra |
| - | - |
| P1 | Inventário: SHA-256, tamanho e **uma** classe para cada arquivo. Arquivo sem classe interrompe o protocolo. |
| P2 | `Runas Book/` é do Livro Vermelho: notas reescritas pelo Runas DM voltam ao conteúdo original (o do backup mais recente do mesmo caminho). |
| P3 | Raiz canônica; fusões e remoção de pastas vazias (`rmdir`); permissões corrigidas. |
| P4 | Campanhas: pasta = título exato; `campanha:` corrigido; tags limpas. |
| P5 | Wiki: era em pasta própria; história como nota + pasta; `Personagens` plana. |
| P6 | Duplicados: identidade por `runas_id`, título, corpo; conflitos só removidos se redundantes. |
| P7 | Notas do site: chaves duplicadas removidas, resumo repetido no corpo removido, H1 = título, arquivo = título. Notas nativas: conteúdo intacto. |
| P8 | `Assets/Runas DM Backups`: só as cópias comprovadamente redundantes vão à Lixeira; as de conteúdo único ficam. |
| P9 | Imagens duplicadas consolidadas; anexos órfãos listados, nunca removidos. |
| P10 | Soltos: para `Outros Documentos`; arquivos vazios para a Lixeira; `LEIA-ME` e nota de organização regenerados. |
| P11 | Intocáveis: `.obsidian/**`, `Bases/*.base`, `Templates/*`. |
| P12 | **Verificação obrigatória**: (a) todo arquivo original está mantido, movido, reescrito ou na Lixeira; (b) nenhum texto único foi perdido; (c) wikilinks e embeds resolvidos não diminuíram; (d) reexecutar dá zero ações; (e) uma simulação da sincronização do Runas DM, só de leitura, dá 0 escritas e 0 backups. |
| P13 | Relatório em `Runas DM/Relatório de padronização.md` e manifesto JSON (ação, origem, destino, motivo, sha256) em `Runas DM/versoes/`. |

**Ordem de publicação.** Publique a versão corrigida do Runas DM **antes** de abrir o vault padronizado no site: versões antigas reintroduzem `O&C] …` e as demais bagunças.
