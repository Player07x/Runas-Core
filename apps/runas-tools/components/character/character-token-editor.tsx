"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { Circle, ImagePlus, Square, Trash2, X } from "lucide-react"
import { renderTokenImage, tokenCrop, type TokenShape } from "@runas/vtt-bridge"
import { Button } from "@/components/ui/button"

const TOKEN_SIZES = [0.5, 1, 2, 3, 4, 5] as const
const sizeLabel = (cells: number) => cells === 0.5 ? "½ célula" : `${cells}×${cells} células`

interface Props {
  image?: string
  size: number
  onChange: (value: { tokenImageDataUrl?: string; tokenSize: number }) => void
}

/**
 * Token da ficha para o mapa do RunasVTT: imagem com fundo transparente e
 * tamanho em células. O mesmo campo existe na ficha avançada do Runas DM.
 */
export function CharacterTokenEditor({ image, size, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  return (
    <div className="flex w-full max-w-[12.5rem] flex-col gap-2 rounded-[18px] border border-border bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full bg-[repeating-conic-gradient(#0000000f_0_25%,transparent_0_50%)] bg-[length:12px_12px]">
          {image ? <Image src={image} alt="Token do personagem" width={48} height={48} unoptimized className="size-full object-contain" /> : <span className="text-xs text-muted-foreground">Token</span>}
        </span>
        <div className="min-w-0 text-xs leading-snug text-muted-foreground"><strong className="block text-sm text-foreground">Token</strong>{image ? "Usado no mapa." : "Sem token, usa o retrato."}</div>
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="secondary" className="flex-1" onClick={() => input.current?.click()}><ImagePlus /> {image ? "Trocar" : "Escolher"}</Button>
        {image && <Button type="button" size="icon-sm" variant="destructive" aria-label="Remover token" title="Remover token" onClick={() => onChange({ tokenImageDataUrl: undefined, tokenSize: size })}><Trash2 /></Button>}
      </div>
      <label className="grid gap-1 text-xs text-muted-foreground">Tamanho no mapa
        <select value={TOKEN_SIZES.includes(size as typeof TOKEN_SIZES[number]) ? size : 1} onChange={(event) => onChange({ tokenImageDataUrl: image, tokenSize: Number(event.target.value) })} className="h-9 rounded-xl border border-input bg-background px-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring/40">
          {TOKEN_SIZES.map((cells) => <option key={cells} value={cells}>{sizeLabel(cells)}</option>)}
        </select>
      </label>
      <input ref={input} type="file" accept="image/*" hidden onChange={(event) => { const next = event.target.files?.[0]; if (next?.type.startsWith("image/")) setFile(next); event.currentTarget.value = "" }} />
      {file && typeof document !== "undefined" && createPortal(<TokenDialog file={file} initialSize={size} onCancel={() => setFile(null)} onConfirm={(tokenImageDataUrl, tokenSize) => { onChange({ tokenImageDataUrl, tokenSize }); setFile(null) }} />, document.body)}
    </div>
  )
}

function TokenDialog({ file, initialSize, onCancel, onConfirm }: { file: File; initialSize: number; onCancel: () => void; onConfirm: (image: string, size: number) => void }) {
  // Data URL em vez de `blob:`: não há endereço a revogar, então a imagem
  // sobrevive à remontagem do componente (ex.: StrictMode no desenvolvimento).
  const [source, setSource] = useState<string | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [shape, setShape] = useState<TokenShape>("circle")
  const [size, setSize] = useState(initialSize)
  const stageSize = 300
  const drag = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    let active = true
    const reader = new FileReader()
    reader.onload = () => { if (active && typeof reader.result === "string") setSource(reader.result) }
    reader.readAsDataURL(file)
    return () => { active = false }
  }, [file])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onCancel() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  const width = image?.naturalWidth ?? 1
  const height = image?.naturalHeight ?? 1
  const crop = tokenCrop(width, height, zoom, offsetX, offsetY, shape)
  // O palco é quadrado; o recorte, não. A escala segue o maior lado para a
  // imagem inteira caber sem distorcer no formato Livre.
  const scale = stageSize / Math.max(crop.width, crop.height)
  const frameWidth = crop.width * scale
  const frameHeight = crop.height * scale
  const maxX = ((width - crop.width) / 2) * scale
  const maxY = ((height - crop.height) / 2) * scale
  const preview = useMemo(() => image ? renderTokenImage({ image, crop, shape, outputSize: 160 }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `crop` é derivado dos valores listados.
    [image, zoom, offsetX, offsetY, shape])

  return <div className="fixed inset-0 z-[120] overflow-y-auto bg-[#080a12]/98 p-3 backdrop-blur-md sm:p-4" role="presentation" onMouseDown={onCancel}>
    <section role="dialog" aria-modal="true" aria-label="Editar token do personagem" onMouseDown={(event) => event.stopPropagation()} className="mx-auto my-2 w-full max-w-3xl rounded-[26px] border border-border bg-card p-4 shadow-2xl sm:my-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div><h2 className="text-xl font-bold text-card-foreground">Token do personagem</h2><p className="text-sm text-muted-foreground">Arraste a imagem para enquadrar. O fundo fora do token fica transparente no mapa do RunasVTT.</p></div>
        <button type="button" onClick={onCancel} aria-label="Fechar editor de token" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button>
      </div>
      <div className="grid gap-6 sm:grid-cols-[300px_minmax(0,1fr)]">
        <div className="relative size-[300px] cursor-grab touch-none select-none overflow-hidden rounded-2xl bg-[#090b0c] active:cursor-grabbing"
          onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, y: event.clientY, offsetX, offsetY } }}
          onPointerMove={(event) => {
            const current = drag.current
            if (!current) return
            setOffsetX(maxX ? Math.max(-1, Math.min(1, current.offsetX - (event.clientX - current.x) / maxX)) : 0)
            setOffsetY(maxY ? Math.max(-1, Math.min(1, current.offsetY - (event.clientY - current.y) / maxY)) : 0)
          }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          {/* O recorte precisa do elemento real (tamanho natural e desenho no canvas). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="absolute left-1/2 top-1/2 overflow-hidden" style={{ width: frameWidth, height: frameHeight, transform: "translate(-50%, -50%)" }}>
            {source && <img src={source} alt="Imagem do token" draggable={false} onLoad={(event) => setImage(event.currentTarget)} className="pointer-events-none absolute left-0 top-0 max-w-none" style={{ width: width * scale, height: height * scale, transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px)` }} />}
          </span>
          <span aria-hidden="true" className={`pointer-events-none absolute left-1/2 top-1/2 border border-white/50 ${shape === "circle" ? "rounded-full shadow-[0_0_0_999px_rgb(8_10_18/0.62)]" : "rounded-2xl"}`} style={{ width: frameWidth, height: frameHeight, transform: "translate(-50%, -50%)" }} />
        </div>
        <div className="grid content-start gap-4 text-sm">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Formato">
            <Button type="button" variant={shape === "circle" ? "default" : "outline"} role="radio" aria-checked={shape === "circle"} onClick={() => setShape("circle")}><Circle /> Círculo</Button>
            <Button type="button" variant={shape === "free" ? "default" : "outline"} role="radio" aria-checked={shape === "free"} onClick={() => setShape("free")}><Square /> Livre</Button>
          </div>
          <label className="grid gap-1 text-muted-foreground">Zoom<input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <label className="grid gap-1 text-muted-foreground">Horizontal<input type="range" min="-1" max="1" step="0.01" value={offsetX} disabled={maxX === 0} onChange={(event) => setOffsetX(Number(event.target.value))} /></label>
          <label className="grid gap-1 text-muted-foreground">Vertical<input type="range" min="-1" max="1" step="0.01" value={offsetY} disabled={maxY === 0} onChange={(event) => setOffsetY(Number(event.target.value))} /></label>
          <p className="text-xs leading-relaxed text-muted-foreground">{shape === "circle" ? "O círculo recorta um quadrado da imagem." : "Livre mantém a proporção original da imagem, em qualquer formato."}</p>
          <label className="grid gap-1 text-muted-foreground">Tamanho no mapa
            <select value={size} onChange={(event) => setSize(Number(event.target.value))} className="h-10 rounded-xl border border-input bg-background px-2 text-foreground">{TOKEN_SIZES.map((cells) => <option key={cells} value={cells}>{sizeLabel(cells)}</option>)}</select>
          </label>
          {preview && <div className="flex items-center gap-3 text-muted-foreground"><Image src={preview} alt="Prévia do token" width={96} height={96} unoptimized className="size-24 rounded-xl bg-[repeating-conic-gradient(#0000001a_0_25%,transparent_0_50%)] bg-[length:16px_16px]" /> Prévia</div>}
          <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button><Button type="button" disabled={!image} onClick={() => { if (image) onConfirm(renderTokenImage({ image, crop, shape }), size) }}>Aplicar token</Button></div>
        </div>
      </div>
    </section>
  </div>
}
