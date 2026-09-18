/**
 * Imagem de token compartilhada pelo Runas Tools e pelo Runas DM: um
 * quadrado com fundo transparente, recortado em círculo (com borda
 * opcional) ou mantido inteiro, para arte que já vem recortada.
 */

export const TOKEN_IMAGE_SIZE = 400
export const TOKEN_SHAPES = ["circle", "free"] as const
export type TokenShape = (typeof TOKEN_SHAPES)[number]

export interface SquareCrop {
  x: number
  y: number
  size: number
}

/**
 * Quadrado da imagem mostrado no editor. `zoom` ≥ 1 aproxima; `offsetX` e
 * `offsetY` vão de -1 a 1 e deslizam o quadrado até a borda da imagem.
 */
export function tokenCrop(imageWidth: number, imageHeight: number, zoom: number, offsetX: number, offsetY: number): SquareCrop {
  const side = Math.min(imageWidth, imageHeight) / Math.max(1, zoom)
  const clamp = (value: number) => Math.max(-1, Math.min(1, value))
  const maxX = (imageWidth - side) / 2
  const maxY = (imageHeight - side) / 2
  return { x: maxX + clamp(offsetX) * maxX, y: maxY + clamp(offsetY) * maxY, size: side }
}

export interface TokenImageOptions {
  image: CanvasImageSource
  crop: SquareCrop
  shape: TokenShape
  /** Cor da borda (`#rrggbb`) no formato circular; `null` sem borda. */
  ringColor: string | null
  outputSize?: number
  /** Só para testes: cria o canvas. */
  createCanvas?: () => HTMLCanvasElement
}

/** Desenha o token e devolve um data URL WebP (ou PNG, se o navegador não gerar WebP). */
export function renderTokenImage({ image, crop, shape, ringColor, outputSize = TOKEN_IMAGE_SIZE, createCanvas = () => document.createElement("canvas") }: TokenImageOptions): string {
  const canvas = createCanvas()
  canvas.width = outputSize
  canvas.height = outputSize
  const context = canvas.getContext("2d")
  if (!context) throw new Error("Não foi possível desenhar o token.")
  const center = outputSize / 2
  const ringWidth = ringColor && shape === "circle" ? Math.round(outputSize * 0.05) : 0
  context.clearRect(0, 0, outputSize, outputSize)
  context.save()
  if (shape === "circle") {
    context.beginPath()
    context.arc(center, center, center - ringWidth / 2, 0, Math.PI * 2)
    context.closePath()
    context.clip()
  }
  context.drawImage(image, crop.x, crop.y, crop.size, crop.size, 0, 0, outputSize, outputSize)
  context.restore()
  if (ringWidth > 0 && ringColor) {
    context.beginPath()
    context.arc(center, center, center - ringWidth / 2, 0, Math.PI * 2)
    context.lineWidth = ringWidth
    context.strokeStyle = ringColor
    context.stroke()
  }
  const webp = canvas.toDataURL("image/webp", 0.9)
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png")
}
