/**
 * Imagem de token compartilhada pelo Runas Tools e pelo Runas DM: fundo
 * transparente, recortada em círculo ou mantida inteira no formato `Livre`.
 *
 * O token não tem borda. O contorno existia como enfeite do modo circular e
 * aparecia por cima da arte no mapa; quem quiser moldura desenha na própria
 * imagem. `ringColor` continua aceito e **ignorado** para não quebrar quem
 * ainda o envia.
 *
 * No formato `Livre` o recorte preserva a proporção da imagem: uma arte
 * 16:9 sai 16:9, não espremida num quadrado. O círculo continua quadrado,
 * porque é recortado em círculo.
 */

export const TOKEN_IMAGE_SIZE = 400
export const TOKEN_SHAPES = ["circle", "free"] as const
export type TokenShape = (typeof TOKEN_SHAPES)[number]

export interface TokenCrop {
  x: number
  y: number
  width: number
  height: number
  /** Lado do recorte quadrado. Igual a `width`; mantido para quem já lia `size`. */
  size: number
}

/** Nome antigo de {@link TokenCrop}, de quando todo recorte era quadrado. */
export type SquareCrop = TokenCrop

/**
 * Região da imagem mostrada no editor. `zoom` ≥ 1 aproxima; `offsetX` e
 * `offsetY` vão de -1 a 1 e deslizam o recorte até a borda da imagem.
 *
 * Em `circle` o recorte é o maior quadrado que cabe na imagem. Em `free` ele
 * tem a proporção da imagem, então enquadrar não corta os lados de uma arte
 * que não seja 1:1.
 */
export function tokenCrop(imageWidth: number, imageHeight: number, zoom: number, offsetX: number, offsetY: number, shape: TokenShape = "circle"): TokenCrop {
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  const factor = Math.max(1, zoom)
  const width = shape === "free" ? imageWidth / factor : Math.min(imageWidth, imageHeight) / factor
  const height = shape === "free" ? imageHeight / factor : width
  const maxX = (imageWidth - width) / 2
  const maxY = (imageHeight - height) / 2
  return { x: maxX + clamp(offsetX) * maxX, y: maxY + clamp(offsetY) * maxY, width, height, size: width }
}

export interface TokenImageOptions {
  image: CanvasImageSource
  crop: TokenCrop
  shape: TokenShape
  /** @deprecated O token não tem borda; o valor é ignorado. */
  ringColor?: string | null
  /** Maior lado da imagem final. */
  outputSize?: number
  /** Só para testes: cria o canvas. */
  createCanvas?: () => HTMLCanvasElement
}

/** Desenha o token e devolve um data URL WebP (ou PNG, se o navegador não gerar WebP). */
export function renderTokenImage({ image, crop, shape, outputSize = TOKEN_IMAGE_SIZE, createCanvas = () => document.createElement("canvas") }: TokenImageOptions): string {
  const cropWidth = crop.width || crop.size
  const cropHeight = crop.height || crop.size
  // O círculo é sempre quadrado; `Livre` mantém a proporção do recorte, com o
  // maior lado em `outputSize`.
  const ratio = shape === "free" && cropWidth > 0 && cropHeight > 0 ? cropWidth / cropHeight : 1
  const width = ratio >= 1 ? outputSize : Math.max(1, Math.round(outputSize * ratio))
  const height = ratio >= 1 ? Math.max(1, Math.round(outputSize / ratio)) : outputSize

  const canvas = createCanvas()
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível desenhar o token.")
  context.clearRect(0, 0, width, height)
  context.save()
  if (shape === "circle") {
    context.beginPath()
    context.arc(width / 2, height / 2, width / 2, 0, Math.PI * 2)
    context.closePath()
    context.clip()
  }
  context.drawImage(image, crop.x, crop.y, cropWidth, cropHeight, 0, 0, width, height)
  context.restore()
  const webp = canvas.toDataURL("image/webp", 0.9)
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png")
}
