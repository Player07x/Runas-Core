import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import type { Character } from "@runas/core/types/character"
import { createResourceEntity, escapeHtml, migrateContentHtml, plainBlockToHtml, type BookEntry, type BookEntryKind, type BookRecord, type BookResourceKind, type BookWorkspace } from "./book-model"
import { CORE_RULE_NOTES } from "./book-rule-notes"
import { extractSourceSection } from "./book-source-sections"

// Catálogo inicial dos livros. Roda apenas nos componentes de servidor durante o
// build estático: o navegador recebe o resultado pronto, sem o texto-fonte.

type ChapterSpec = [string, string, Array<[string, BookEntryKind | BookResourceKind, string, number?]>]

function createCharacterEntity(title: string): Character {
  const character = createEmptyCharacter()
  character.name = title || "Nova ficha"
  return character
}

function entry(id: string, chapterId: string, title: string, kind: BookEntryKind | BookResourceKind, summary: string, sourceFile: string, sourcePage?: number, content = ""): BookEntry {
  const isCharacterKind = kind === "character"
  const resource = kind === "item" || kind === "ability" || kind === "spell" ? { id: `${id}-resource`, kind, entity: createResourceEntity(kind, title) } : null
  const extracted = extractSourceSection(sourceFile, title)
  const coreNote = CORE_RULE_NOTES[title]
  const sourceLabel = `Fonte: ${sourceFile}${sourcePage ? `, p. ${sourcePage}` : ""}.`
  // `resource.entity.description` é um campo compartilhado com @runas/core (Runas Tools/DM) e continua texto
  // simples de propósito; só `BookEntry.content` (exclusivo do Runas Book) vira HTML formatado.
  const resolvedPlainContent = content || [
    sourceLabel,
    extracted,
    coreNote,
    !extracted && !coreNote ? summary : "",
  ].filter(Boolean).join("\n\n")
  if (resource) resource.entity.description = resolvedPlainContent
  const resolvedContentHtml = content ? migrateContentHtml(content) : [
    sourceFile ? `<p class="content-source"><em>${escapeHtml(sourceLabel)}</em></p>` : "",
    coreNote ? `<blockquote class="content-core-note">${plainBlockToHtml(coreNote)}</blockquote>` : "",
    extracted ? plainBlockToHtml(extracted) : (!extracted && !coreNote ? plainBlockToHtml(summary) : ""),
  ].filter(Boolean).join("")
  return {
    id,
    chapterId,
    title,
    kind: isCharacterKind ? "character" : "rule",
    summary,
    content: resolvedContentHtml,
    tags: [],
    sourceFile,
    sourcePage,
    entity: isCharacterKind ? createCharacterEntity(title) : null,
    resources: resource ? [resource] : [],
    updatedAt: Date.now(),
  }
}

function book(id: string, title: string, subtitle: string, accent: string, sourceFile: string, chapterSpecs: ChapterSpec[]): BookRecord {
  return { id, title, subtitle, accent, author: "", customPages: [], sourceFile, chapters: chapterSpecs.map(([chapterTitle, summary, entries], index) => {
    const chapterId = `${id}-chapter-${index + 1}`
    return { id: chapterId, title: chapterTitle, summary, bookId: id, order: index + 1, entries: entries.map(([title, kind, itemSummary, page], itemIndex) => entry(`${chapterId}-entry-${itemIndex + 1}`, chapterId, title, kind, itemSummary, sourceFile, page)) }
  }) }
}

const blueChapters: ChapterSpec[] = [
  ["Introdução", "Visão geral do sistema, dados e primeiros passos.", [["Estatísticas", "rule", "Atributos, recursos e valores derivados.", 5], ["Combate Lite", "rule", "Ações, defesas e danos em uma leitura rápida.", 5], ["Tamanho", "rule", "Modificador de tamanho e escalas.", 7], ["Capacidade de Carga", "rule", "Limites de carga e capacidade mágica.", 7]]],
  ["Personagem", "Construção de personagens, raças, ofícios e classes.", [["Raças", "rule", "Opções de espécie para personagens.", 9], ["Ofício", "rule", "Vagabundo, andarilho e estudioso.", 10], ["Classe", "rule", "Reforço, ampliação e invocação.", 10], ["Habilidades de Classe", "ability", "Caminhos, táticas, conjurações e especializações.", 11]]],
  ["Elementos", "Afinidades, efeitos, fusões e anulações elementais.", [["Fusões Elementais", "rule", "Combinações e propriedades de elementos.", 13], ["Efeitos Elementais", "rule", "Efeitos básicos e de fusão.", 13], ["Elementos Iniciais", "rule", "Escolha e aplicação do elemento inicial.", 15]]],
  ["Divinismo", "Carma, alinhamento e divindades.", [["Carma e Alinhamento", "rule", "Eixos de Ordem e Caos.", 16], ["Divindades e Cultos", "rule", "Tabela de divindades e cultos.", 17]]],
  ["Perícias", "Perícias por grupo e técnicas.", [["Lista de Perícias", "rule", "Perícias de armas, ofícios, sociais e mágicas.", 19], ["Técnicas", "ability", "Técnicas aprendidas por personagens.", 21]]],
  ["Legado", "Evolução do legado e vínculos.", [["Evolução do Legado", "rule", "Progressão e pontos de legado.", 23], ["Vínculo", "rule", "Qualidade e efeitos de vínculos.", 24]]],
  ["Árvore de Maestria", "Afinidade, níveis e melhorias.", [["Evolução", "rule", "Pontos de essência e evolução.", 25], ["Melhorias de Classe", "ability", "Melhorias por classe.", 25]]],
  ["Magias", "Regras de conjuração e repertórios mágicos.", [["Magias Arcanas", "spell", "Magias arcanas e testes.", 28], ["Magias Elementais", "spell", "Magias ligadas aos elementos.", 29], ["Magias Espirituais", "spell", "Oração estelar e profanação abissal.", 30]]],
  ["Equipamentos", "Armas, escudos, armaduras e materiais.", [["Armas Corpo a Corpo", "item", "Equipamentos de combate próximo.", 31], ["Escudos", "item", "Escudos e suas propriedades.", 32], ["Armaduras", "item", "Proteções e valores defensivos.", 32]]],
  ["Materiais e Criações", "Materiais e regras de fabricação.", [["Couro e Tecido", "rule", "Materiais flexíveis.", 35], ["Madeira", "rule", "Propriedades e usos da madeira.", 35], ["Pedras e Minerais", "rule", "Materiais minerais.", 35]]],
  ["Itens Mágicos", "Armaduras mágicas, artefatos e encantamentos.", [["Armaduras Mágicas", "item", "Lista de armaduras mágicas.", 38], ["Artefatos", "item", "Itens únicos e artefatos.", 39]]],
  ["Talha de Runas", "Criação de runas e seus usos.", [["Talha de Runas", "rule", "Processo de talhar uma runa.", 41]]],
  ["Runos", "Criaturas elementais do cenário.", [["Runos", "character", "Fichas e conceitos de runos.", 42]]],
]

const redChapters: ChapterSpec[] = [
  ["Começando Rápido", "Resumo para começar uma aventura.", [["Passo a Passo", "rule", "Dados, criação de ficha e primeiros testes.", 4], ["Dados", "rule", "Uso de d6 e 2d10.", 4], ["Criando uma Ficha", "character", "Estrutura básica de uma ficha.", 4]]],
  ["Início", "Atributos, status e testes de habilidade.", [["Atributos", "rule", "Primários e secundários.", 6], ["Status", "rule", "PV, PA, PE, fadiga e defesas.", 6], ["Testes de Habilidade", "rule", "Regra geral para testes.", 7]]],
  ["Avançado", "Inventário, condições, doenças e recuperação.", [["Modificador de Tamanho", "rule", "MT e impacto nas fichas.", 10], ["Inventário", "rule", "Estado e carga de itens.", 10], ["Condições", "rule", "Condições e efeitos.", 11]]],
  ["Espécie", "Runilitas e opções de espécie.", [["Runilitas", "rule", "Conceito e identidade dos povos.", 14], ["Espécies", "rule", "Características de espécie.", 14]]],
  ["Trabalho e Profissões", "Ofícios e recursos iniciais.", [["Lista de Trabalhos e Profissões", "rule", "Profissões disponíveis.", 17], ["Caçador", "rule", "Profissão de exploração e combate.", 38], ["Estudioso", "rule", "Profissão de conhecimento.", 40]]],
  ["Perícias", "Pontos, compra e lista de perícias.", [["Pontos de Perícias", "rule", "Aquisição e melhoria.", 20], ["Lista de Perícias", "rule", "Perícias de sobrevivência, furtividade, sociais e mágicas.", 21]]],
  ["Classe", "Caminhos, especializações e habilidades.", [["Reforço", "ability", "Classe focada em aprimoramento.", 24], ["Ampliação", "ability", "Classe focada em táticas.", 24], ["Invocação", "ability", "Classe focada em invocações.", 25], ["Especialização", "ability", "Escolhas de especialização.", 27]]],
  ["Árvore de Maestria", "Evolução e melhorias de personagem.", [["Subindo de Nível", "rule", "Progressão de nível.", 31], ["Melhoria de Personagem", "rule", "Investimento em atributos e recursos.", 32]]],
  ["Combate", "Turnos, manobras, defesa e dano.", [["Turnos e Rodadas", "rule", "Estrutura de uma cena de combate.", 36], ["Manobras de Combate", "ability", "Ações completas e rápidas.", 37], ["Danos", "rule", "Resistência e aplicação de dano.", 40]]],
  ["Itens e Equipamentos", "Equipamentos comuns e utilitários.", [["Armas", "item", "Armas e propriedades.", 42], ["Armaduras", "item", "Armaduras e proteção.", 46], ["Escudos", "item", "Escudos e bloqueio.", 47], ["Ferramentas", "item", "Ferramentas e criação.", 48]]],
  ["Itens Mágicos", "Focos, poções, materiais e encantamentos.", [["Focos Mágicos", "item", "Focos para conjuração.", 51], ["Poções e Elixires", "item", "Consumíveis mágicos.", 51], ["Encantamentos", "ability", "Efeitos aplicados a equipamentos.", 54], ["Runas Mágicas", "item", "Runas e módulos.", 60]]],
  ["Magias", "Conjuração, afinidade e listas de magias.", [["Regra Geral de Conjuração", "rule", "Manter magia, concentração e custo.", 63], ["Magias Elementais", "spell", "Magias dos elementos.", 64], ["Magias Arcanas", "spell", "Magias arcanas.", 86], ["Magias Divinas", "spell", "Magias divinas.", 92], ["Magias de Maldição", "spell", "Maldições e efeitos.", 96]]],
  ["Vínculos", "Maldições, estilos de luta e vínculos narrativos.", [["Maldições", "ability", "Vínculos de maldição.", 101], ["Estilos de Luta", "ability", "Vínculos marciais.", 102]]],
  ["Recompensas", "Dificuldades, sorte e tesouros.", [["Baú Aleatório", "item", "Recompensas de exploração.", 104], ["Moedas Lunares", "item", "Economia e recompensas.", 104]]],
]

const whiteChapters: ChapterSpec[] = [
  ["Sobre o Mundo", "Runilis, seus continentes e os runos.", [["Como Jogar", "rule", "Introdução ao RPG e ao cenário.", 7], ["Criação Rápida de Ficha", "character", "Entrada rápida para novos jogadores.", 8]]],
  ["Personagens", "Atributos, espécies, ofícios e classes.", [["Atributos", "rule", "Fundamentos da ficha.", 10], ["Humano", "rule", "Características de humanos.", 22], ["Fauno", "rule", "Características de faunos.", 24], ["Elemental", "rule", "Características de elementais.", 25], ["Elfo", "rule", "Características de elfos.", 26], ["Fada", "rule", "Características de fadas.", 27], ["Autômato", "rule", "Características de autômatos.", 29], ["Fractus", "rule", "Características de fractus.", 30], ["Goblinóide", "rule", "Características de goblinóides.", 32], ["Gigante", "rule", "Características de gigantes.", 33], ["Anjo", "rule", "Características de anjos.", 35], ["Corrompido", "rule", "Características de corrompidos.", 36]]],
  ["Elementos", "Elementos, efeitos e domínios.", [["Os Elementos", "rule", "Afinidades e efeitos elementais.", 44], ["Ambientes Elementais", "rule", "Ambientes e domínio.", 46], ["Fusão Elemental", "rule", "Combinação de elementos.", 48]]],
  ["Classes", "Reforço, ampliação, invocação e especialização.", [["Reforço", "ability", "Classe de reforço.", 51], ["Ampliação", "ability", "Classe de ampliação.", 53], ["Invocação", "ability", "Classe de invocação.", 55], ["Aflição", "ability", "Habilidades de aflição.", 57], ["Summun", "ability", "Especialização avançada.", 59]]],
  ["Perícias", "Lista, técnicas e aquisição.", [["Lista de Perícias", "rule", "Perícias do sistema.", 71], ["Técnicas", "ability", "Técnicas e treinamento.", 74]]],
  ["Combate", "Turnos, testes, manobras e dano.", [["Tipos de Dano", "rule", "Danos físicos, mágicos e especiais.", 76], ["Turnos de Combate", "rule", "Organização do combate.", 78], ["Defesas", "rule", "Defesas e deslocamento.", 79]]],
  ["Equipamentos", "Equipamentos comuns, mágicos e de cristal.", [["Equipamentos Comuns", "item", "Armas e proteção.", 82], ["Equipamentos Mágicos", "item", "Equipamentos com efeitos.", 87], ["Equipamentos de Cristal", "item", "Equipamentos especiais.", 100], ["Materiais", "rule", "Materiais e criação.", 101]]],
  ["Criação", "Itens, transmutação, perícias e magia.", [["Criando Itens", "item", "Regras de criação.", 108], ["Transmutação", "rule", "Transformação de materiais.", 110], ["Aprendendo Magias", "spell", "Aquisição de magias.", 111]]],
  ["Magias", "Tipos, custos, dano e repertórios.", [["O que é Magia", "rule", "Fundamentos da magia.", 113], ["Conjuração", "rule", "Teste e custo de conjuração.", 113], ["Magias Elementais", "spell", "Magias elementais.", 116], ["Magias Arcanas", "spell", "Magias arcanas.", 138], ["Magias Divinas", "spell", "Magias divinas.", 142], ["Magias Profanas", "spell", "Magias profanas.", 148], ["Magias Amaldiçoadas", "spell", "Magias amaldiçoadas.", 150], ["Magias Tecnológicas", "spell", "Magias tecnológicas.", 155]]],
  ["Runos e Mundo", "Criaturas, história e divindades.", [["Criação de Runos", "character", "Criação e balanceamento de runos.", 160], ["Mundo de Runilis", "rule", "História e regiões.", 168], ["Divindades", "rule", "Divindades e cultos.", 169]]],
]

const cronosChapters: ChapterSpec[] = [
  ["Início", "Introdução ao ciclo de vida, sincronia, memória e fama.", [["Bem-vindo a Cronos", "rule", "Apresentação do mundo e do Esquecimento."], ["Regras Gerais", "rule", "Atributos, status, testes, morte e renascimento."], ["Regras de Combate", "rule", "Ações, defesa, dano e condições."], ["Regras de Magias", "spell", "Magia, mana, elementos e conjuração."], ["Regras de Sincronia", "rule", "Evolução do vínculo com o novo corpo."], ["Tipos de Dano", "rule", "Categorias e aplicação de dano."], ["Regras de Fama", "rule", "Fama, títulos e consequências narrativas."], ["Esquecidos", "rule", "Almas apagadas pelo Esquecimento."]]],
  ["Personagens", "Fichas, memórias, títulos e arquétipos.", [["Ficha de teste", "character", "Modelo de ficha da primeira edição."], ["Memória", "ability", "Poderes trazidos da vida anterior."], ["Títulos", "ability", "Recompensas por feitos e reputação."], ["Arsenal de Ciel", "item", "Armas e equipamentos de referência."]]],
  ["Raças", "Povos e corpos disponíveis para reencarnação.", [["Humano", "rule", "Raça base de Cronos."], ["Anão", "rule", "Povo subterrâneo e artesanal."], ["Elfo Lunar", "rule", "Povo ligado à noite e à magia."], ["Elfo Solar", "rule", "Povo ligado à luz."], ["Bestial", "rule", "Híbridos de fauna e runilitas."], ["Colosso", "rule", "Corpos de escala excepcional."], ["Dopple", "rule", "Metamorfos e identidades mutáveis."], ["Serafins", "rule", "Povo de herança celestial."], ["Slime", "rule", "Corpos amorfos e adaptáveis."]]],
  ["Elementos", "Afinidades elementais de Cronos.", [["Água", "rule", "Elemento de fluxo e adaptação."], ["Ar", "rule", "Elemento de movimento e alcance."], ["Cristal", "rule", "Elemento de estrutura e reflexão."], ["Fogo", "rule", "Elemento de calor e combustão."], ["Gelo", "rule", "Elemento de contenção e frio."], ["Luz", "rule", "Elemento de claridade e revelação."], ["Metal", "rule", "Elemento de resistência e forja."], ["Natureza", "rule", "Elemento de vida e crescimento."], ["Pedra", "rule", "Elemento de massa e estabilidade."], ["Puro", "rule", "Elemento sem afinidade derivada."], ["Raio", "rule", "Elemento de descarga e velocidade."], ["Sombra", "rule", "Elemento de ocultação."], ["Tóxico", "rule", "Elemento de veneno e desgaste."]]],
  ["Fauna", "Catálogo de criaturas mágicas por família.", [["Lupinos", "character", "Fauna com traços de lobo."], ["Dracônicos", "character", "Fauna de herança dracônica."], ["Elementais", "character", "Criaturas formadas por elementos."], ["Feéricos", "character", "Criaturas ligadas ao mundo feérico."], ["Espectrais", "character", "Criaturas de natureza incorpórea."], ["Quiméricos", "character", "Misturas de famílias e formas."], ["Abissais", "character", "Criaturas associadas ao abismo."]]],
  ["Geologia", "Cristais, metais e rochas de Cronos.", [["Cristais", "item", "Cristais e seus usos."], ["Metais", "item", "Metais e propriedades."], ["Rochas", "item", "Rochas e materiais de construção."]]],
  ["Mundo", "Regiões, mares e cosmologia.", [["Cronos", "rule", "O mundo central e seu ciclo."], ["Arus", "rule", "Região de referência."], ["Indus", "rule", "Território de tradições e disciplina."], ["Inridus", "rule", "Império e capital One."], ["Wintec", "rule", "Região e cultura."], ["Primalia", "rule", "Terras ligadas à fauna."], ["Mar Vulcânico", "rule", "Ambiente marítimo e vulcânico."], ["Mar do Silêncio", "rule", "Oceano de perigos e lendas."], ["Inexistência", "rule", "Plano ligado ao apagamento."]]],
  ["Cronologia", "Eras e acontecimentos de Cronos.", [["O Presente do Criador", "rule", "A origem do ciclo atual."], ["A Grande Guerra Peneira", "rule", "Conflito formador das eras."], ["Era da Descoberta", "rule", "Expansão e descobertas."], ["O Grande Luto", "rule", "Marco de ruptura histórica."], ["Era da Restauração", "rule", "Reconstrução após o luto."], ["Era dos Aventureiros", "rule", "Período de exploração e guildas."]]],
  ["Deuses e Santos", "Entidades, santos e princípios de Cronos.", [["O Criador", "rule", "Entidade associada à origem."], ["Divindade do Tempo", "rule", "Guardiã do tempo."], ["Entidade da Verdade", "rule", "Princípio da verdade."], ["Santa da Morte", "rule", "Passagem e encerramento."], ["Santa da Fauna", "rule", "Vida selvagem e vínculos."], ["Santo das Máquinas", "rule", "Engenharia e criação."], ["Santo do Comércio", "rule", "Trocas e prosperidade."], ["Santidade dos Monstros", "rule", "Direito e liberdade dos monstros."]]],
]

export function createSeedWorkspace(): BookWorkspace {
  const books = [
    book("livro-branco", "Runas · Livro Branco", "Coleção Cromática · 1ª edição", "#cfd6d1", "Runas - Livro Branco.pdf", whiteChapters),
    book("livro-vermelho", "Runas · Livro Vermelho", "Livro de regras e expansão", "#a35b52", "Runas - Livro Vermelho.pdf", redChapters),
    book("livro-azul", "Livro Azul", "Livro de referência", "#7d97a6", "[O&C] Livro Azul (v.2.0.).docx", blueChapters),
    book("sagas-de-cronos", "Sagas de Cronos", "1ª Edição · sistema em adaptação", "#8f7fa8", "Compilação de RPG/Cronos", cronosChapters),
  ]
  return { version: 1, books, selectedBookId: null, updatedAt: Date.now() }
}
