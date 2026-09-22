/**
 * Identificadores únicos da suíte.
 *
 * `crypto.randomUUID` só existe em contexto seguro. O site publicado é HTTPS e
 * `127.0.0.1` é exceção do navegador, mas o Runas Tools também é servido pelo
 * RunasVTT em `http://IP:porta` para o jogador da rede — e ali a função
 * simplesmente não existe. Chamá-la direto quebrava importar, salvar e criar
 * ficha com "crypto.randomUUID is not a function".
 *
 * `crypto.getRandomValues` continua disponível fora de contexto seguro, então
 * o identificador segue sendo um UUID v4 de verdade. O último recurso, sem
 * `crypto` algum (ambientes de teste antigos), é aleatório o bastante para ids
 * locais de uma única ficha.
 */

const byteToHex: string[] = []
for (let index = 0; index < 256; index += 1) byteToHex.push((index + 0x100).toString(16).slice(1))

function fromRandomValues(source: Crypto): string {
  const bytes = source.getRandomValues(new Uint8Array(16))
  // Versão 4 e variante RFC 4122.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  let text = ""
  for (let index = 0; index < 16; index += 1) {
    if (index === 4 || index === 6 || index === 8 || index === 10) text += "-"
    text += byteToHex[bytes[index]!]
  }
  return text
}

/** Um UUID v4, com ou sem contexto seguro. */
export function createId(): string {
  const source = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (source) {
    if (typeof source.randomUUID === "function") return source.randomUUID()
    if (typeof source.getRandomValues === "function") return fromRandomValues(source)
  }
  const random = () => Math.random().toString(16).slice(2).padStart(12, "0")
  return `${random().slice(0, 8)}-${random().slice(0, 4)}-4${random().slice(0, 3)}-a${random().slice(0, 3)}-${random().slice(0, 12)}`
}

/**
 * Um id legível por prefixo, para registros de uma coleção da ficha
 * (`item-…`, `spell-…`). O prefixo ajuda a depurar um JSON exportado.
 */
export function createPrefixedId(prefix: string): string {
  return `${prefix}-${createId()}`
}
