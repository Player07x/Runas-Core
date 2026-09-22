# Organização do vault Ordem x Caos

## Estrutura padronizada

```text
Ordem x Caos/
├── Cronologia/
│   ├── Acontecimentos Globais/
│   └── Acontecimentos Regionais/
├── História/
├── Geografia/
│   ├── Assentamentos/
│   ├── Continentes/
│   ├── Mundos/
│   ├── Regiões/
│   └── Territórios/
├── Personagens/
│   ├── Divindades/
│   └── Runilitas/
├── Criaturas/
├── Itens/
├── Organizações/
├── Assets/
└── Bases/
```

As sete primeiras pastas são as seções da Wiki: Cronologia, Geografia,
Personagens, Criaturas, Itens e Organizações, além de História quando houver
notas próprias. Uma subpasta representa uma categoria física e não pode conter
outra subpasta. O Runas DM grava tags no frontmatter; ainda lê `categorias:` de
notas antigas e preserva o caminho existente.

`Assets` guarda imagens e demais anexos. `Bases` guarda arquivos `.base` do Obsidian e este documento. As áreas `Templates`, `Notas`, `Histórias` e `Campanhas` são particulares e não são importadas pela Wiki do Runas DM.

## Migração realizada

- `Cronologia Geral` foi renomeada para `Cronologia`, sem alterar os sete documentos existentes.
- `Geografia` foi preservada com 39 documentos e cinco categorias.
- `Personagens` foi preservada com 54 documentos e duas categorias.
- `Fauna` e `Monstros` foram fundidas em `Criaturas`; a origem permanece como
  tag `Fauna` ou `Monstros`. `Itens` e `Organizações` recebem conteúdo futuro.
- `Assets`, `Bases`, `.obsidian` e todas as áreas excluídas foram preservadas.
- Nenhum documento foi sobrescrito ou excluído.

## Comportamento do Runas DM

Ao importar, o site aceita somente as pastas raiz permitidas e deduz a seção
pela pasta principal; a subpasta vira tag. Ao criar uma página, grava dentro da
pasta da seção e usa a primeira tag como subpasta. Páginas já importadas de
fora da lista aparecem para remoção explícita e não têm o `.md` apagado. As
notas de uma campanha sempre ficam sob `Campanhas/<campanha>/`, incluindo
Missões, Eventos, Encontros e Notas. Imagens `![[...]]` são procuradas em
`Assets`, guardadas apenas no cache local do navegador e exibidas no editor
com os mesmos controles de tamanho, alinhamento e fluxo de texto das imagens
enviadas pelo site.
