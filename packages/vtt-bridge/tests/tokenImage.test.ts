import { describe, expect, it, vi } from "vitest"
import { createEmptyCharacter } from "@runas/core/lib/characterStorage"
import { renderTokenImage, tokenCrop, toVttCharacter } from "../src/index"

function fakeCanvas(webpSupported: boolean) {
  const context = { clearRect: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), closePath: vi.fn(), clip: vi.fn(), drawImage: vi.fn(), stroke: vi.fn(), lineWidth: 0, strokeStyle: "" }
  const canvas = { width: 0, height: 0, getContext: () => context, toDataURL: (type: string) => type === "image/webp" && webpSupported ? "data:image/webp;base64,AA" : "data:image/png;base64,AA" }
  return { canvas: canvas as unknown as HTMLCanvasElement, context }
}

describe("tokenCrop", () => {
  it("usa o maior quadrado centralizado e desliza até a borda", () => {
    expect(tokenCrop(800, 400, 1, 0, 0)).toEqual({ x: 200, y: 0, size: 400 })
    expect(tokenCrop(800, 400, 1, 1, 0)).toEqual({ x: 400, y: 0, size: 400 })
    expect(tokenCrop(800, 400, 2, -1, -1)).toEqual({ x: 0, y: 0, size: 200 })
    expect(tokenCrop(400, 400, 0.5, 5, 5)).toEqual({ x: 0, y: 0, size: 400 })
  })
})

describe("renderTokenImage", () => {
  it("recorta em círculo, desenha a borda e prefere WebP", () => {
    const { canvas, context } = fakeCanvas(true)
    const url = renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 10, y: 20, size: 300 }, shape: "circle", ringColor: "#c76561", createCanvas: () => canvas })
    expect(url.startsWith("data:image/webp")).toBe(true)
    expect(canvas.width).toBe(400)
    expect(context.clip).toHaveBeenCalledOnce()
    expect(context.drawImage).toHaveBeenCalledWith({}, 10, 20, 300, 300, 0, 0, 400, 400)
    expect(context.stroke).toHaveBeenCalledOnce()
    expect(context.strokeStyle).toBe("#c76561")
  })

  it("formato livre não recorta nem desenha borda; sem WebP, usa PNG", () => {
    const { canvas, context } = fakeCanvas(false)
    const url = renderTokenImage({ image: {} as CanvasImageSource, crop: { x: 0, y: 0, size: 100 }, shape: "free", ringColor: "#ffffff", createCanvas: () => canvas })
    expect(url.startsWith("data:image/png")).toBe(true)
    expect(context.clip).not.toHaveBeenCalled()
    expect(context.stroke).not.toHaveBeenCalled()
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
