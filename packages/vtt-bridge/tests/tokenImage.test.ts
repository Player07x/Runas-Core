import { describe, expect, it, vi } from "vitest"
import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import { renderTokenImage, tokenCrop, toVttCharacter } from "../src/index"

function fakeCanvas(webpSupported: boolean) {
  const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), closePath: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), stroke: vi.fn(), lineWidth: 0, strokeStyle: "" }
  const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: (type: string) => type === "image/webp" && webpSupported ? "data:image/webp;base64,AA" : "data:image/png;base64,AA" }
  return { canvas: canvas as unknown as HTMLCanvasElement, context }
}

describe("tokenCrop", () => {
  it("no círculo, usa o maior quadrado centralizado e desliza até a borda", () => {
    expect(tokenCrop(800, 400, 1, 0, 0)).toEqual({ x: 200, y: 0, width: 400, height: 400, size: 400 })
    expect(tokenCrop(800, 400, 1, 1, 0)).toEqual({ x: 400, y: 0, width: 400, height: 400, size: 400 })
    expect(tokenCrop(800, 400, 2, -1, -1)).toEqual({ x: 0, y: 0, width: 200, height: 200, size: 200 })
    expect(tokenCrop(400, 400, 0.5, 5, 5)).toEqual({ x: 0, y: 0, width: 400, height: 400, size: 400 })
  })

  /** Uma arte 16:9 não pode ser espremida num quadrado só para virar token. */
  it("no formato livre, preserva a proporção da imagem", () => {
    expect(tokenCrop(800, 400, 1, 0, 0, "free")).toEqual({ x: 0, y: 0, width: 800, height: 400, size: 800 })
    expect(tokenCrop(800, 400, 2, 0, 0, "free")).toEqual({ x: 200, y: 100, width: 400, height: 200, size: 400 })
    expect(tokenCrop(300, 900, 1, 0, 0, "free")).toEqual({ x: 0, y: 0, width: 300, height: 900, size: 300 })
  })
})

describe("renderTokenImage", () => {
  it("recorta em círculo, sai quadrado e prefere WebP", () => {
    const { canvas, context } = fakeCanvas(true)
    const url = renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 10, y: 20, width: 300, height: 300, size: 300 }, shape: "circle", createCanvas: () => canvas })
    expect(url.startsWith("data:image/webp")).toBe(true)
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(400)
    expect(context.clip).toHaveBeenCalledOnce()
    expect(context.drawImage).toHaveBeenCalledWith({}, 10, 20, 300, 300, 0, 0, 400, 400)
  })

  /** O token não tem borda: nem no círculo, nem no livre, nem quando alguém ainda envia `ringColor`. */
  it("nunca desenha borda, mesmo recebendo ringColor", () => {
    const { canvas, context } = fakeCanvas(true)
    renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 0, y: 0, width: 300, height: 300, size: 300 }, shape: "circle", ringColor: "#c76561", createCanvas: () => canvas })
    expect(context.stroke).not.toHaveBeenCalled()
    expect(context.strokeStyle).toBe("")
  })

  it("no formato livre, mantém a proporção do recorte na imagem final", () => {
    const { canvas, context } = fakeCanvas(false)
    const url = renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 0, y: 0, width: 800, height: 400, size: 800 }, shape: "free", createCanvas: () => canvas })
    expect(url.startsWith("data:image/png")).toBe(true)
    expect(context.clip).not.toHaveBeenCalled()
    expect(canvas.width).toBe(400)
    expect(canvas.height).toBe(200)
    expect(context.drawImage).toHaveBeenCalledWith({}, 0, 0, 800, 400, 0, 0, 400, 200)
  })

  it("no formato livre em pé, o maior lado é que fica com o tamanho final", () => {
    const { canvas } = fakeCanvas(true)
    renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 0, y: 0, width: 300, height: 900, size: 300 }, shape: "free", createCanvas: () => canvas })
    expect(canvas.width).toBe(133)
    expect(canvas.height).toBe(400)
  })
})

describe("toVttCharacter com token", () => {
  it("prefere o token ao retrato e envia o tamanho", () => {
    const character = createEmptyCharacter()
    character.portraitDataUrl = "data:image/jpeg;base64,RETRATO"
    expect(toVttCharacter(character, "dm").tokenImage).toBe("data:image/jpeg;base64,RETRATO")
    character.tokenImageDataUrl = "data:image/webp;base64,TOKEN"
    character.tokenSize = 2
    const item = toVttCharacter(character, "dm")
    expect(item.tokenImage).toBe("data:image/webp;base64,TOKEN")
    expect(item.tokenSize).toBe(2)
  })
})
