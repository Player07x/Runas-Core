import type { BookWorkspace } from "./book-model"

export const BOOK_STORAGE_KEY = "runas-book.workspace.v1"
export const BOOK_PENDING_ATTRIBUTE = "data-book-pending"

/**
 * Script executado antes da primeira pintura. O HTML estático mostra o primeiro
 * tópico do primeiro livro; quando o endereço (#/…) ou o livro salvo levam a
 * outra tela, o conteúdo fica oculto até o React montar a tela certa, em vez de
 * aparecer e depois ser trocado (deslocamento de layout).
 */
export function bookViewBootstrapScript(seed: BookWorkspace): string {
  const firstBook = seed.books[0]
  const config = JSON.stringify({
    attribute: BOOK_PENDING_ATTRIBUTE,
    storageKey: BOOK_STORAGE_KEY,
    bookId: firstBook?.id ?? "",
    chapterId: firstBook?.chapters[0]?.id ?? "",
  })
  return `(function(c){try{
var pending=false,hashDefault=false,hash=location.hash.replace(/^#\\/?/,"");
if(hash){var parts=hash.split("/").filter(Boolean).map(decodeURIComponent);hashDefault=parts.length===2&&parts[0]===c.bookId&&parts[1]===c.chapterId;pending=!hashDefault}
if(!pending){var raw=localStorage.getItem(c.storageKey);if(raw){
var read=function(re){var m=re.exec(raw);return m?JSON.parse('"'+m[1]+'"'):null};
if(hashDefault){pending=raw.indexOf('"id":'+JSON.stringify(c.chapterId))<0}
else{var selected=read(/"selectedBookId":"((?:[^"\\\\]|\\\\.)*)"/);pending=read(/"books":\\[\\{"id":"((?:[^"\\\\]|\\\\.)*)"/)!==c.bookId||read(/"chapters":\\[\\{"id":"((?:[^"\\\\]|\\\\.)*)"/)!==c.chapterId||(selected!==null&&selected!==c.bookId)}
}}
if(pending)document.documentElement.setAttribute(c.attribute,"")
}catch(e){}})(${config})`
}
