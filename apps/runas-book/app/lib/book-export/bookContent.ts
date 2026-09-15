import type { BookChapter, BookCustomPage, BookRecord } from "../book-model"

export function sortedChapters(book: BookRecord): BookChapter[] {
  return [...book.chapters].sort((left, right) => left.order - right.order)
}

export function sortedCustomPages(book: BookRecord): BookCustomPage[] {
  return [...book.customPages].sort((left, right) => left.order - right.order)
}

export const CARD_KIND_LABEL: Record<"character" | "item" | "ability" | "spell", string> = {
  character: "Ficha",
  item: "Item",
  ability: "Habilidade",
  spell: "Magia",
}
