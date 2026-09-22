"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Circle, Crop, Square, X } from "lucide-react"
import { renderTokenImage, tokenCrop, type TokenShape } from "@runas/vtt-bridge"
import { useEscapeToClose } from "../lib/use-escape-to-close"

const TOKEN_SIZES = [0.5, 1, 2, 3, 4, 5] as const

/**
 * Editor do token da ficha: recorte quadrado, formato circular com borda ou
 * imagem livre (arte já recortada), e tamanho em células no RunasVTT. A
 * imagem sai em WebP/PNG com fundo transparente (`renderTokenImage`).
 */
export function TokenEditorDialog({ file, initialSize, onCancel, onConfirm }: { file: File; initialSize: number; onCancel: () => void; onConfirm: (tokenImageDataUrl: string, tokenSize: number) => void }) {
  useEscapeToClose(onCancel)
  // Data URL em vez de `blob:`: não há endereço a revogar, então a imagem
  // sobrevive à remontagem do componente (ex.: StrictMode no desenvolvimento).
  const [source, setSource] = useState<string | null>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [shape, setShape] = useState<TokenShape>("circle")
  const [size, setSize] = useState(initialSize)
  const [stageSize, setStageSize] = useState(320)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    let active = true
    const reader = new FileReader()
    reader.onload = () => { if (active && typeof reader.result === "string") setSource(reader.result) }
    reader.readAsDataURL(file)
    return () => { active = false }
  }, [file])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => setStageSize(entry?.contentRect.width || 320))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const width = image?.naturalWidth ?? 1
  const height = image?.naturalHeight ?? 1
  const crop = tokenCrop(width, height, zoom, offsetX, offsetY, shape)
  // O palco é quadrado e o recorte, no formato Livre, não é: a escala segue o
  // maior lado para a imagem inteira caber sem distorcer.
  const scale = stageSize / Math.max(crop.width, crop.height)
  const frameWidth = crop.width * scale
  const frameHeight = crop.height * scale
  const maxXPixels = ((width - crop.width) / 2) * scale
  const maxYPixels = ((height - crop.height) / 2) * scale
  const preview = useMemo(() => image ? renderTokenImage({ image, crop, shape, outputSize: 160 }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `crop` é derivado dos valores listados.
    [image, zoom, offsetX, offsetY, shape])

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    // Arrastar a imagem para a direita mostra a parte da esquerda.
    setOffsetX(maxXPixels ? Math.max(-1, Math.min(1, drag.offsetX - (event.clientX - drag.x) / maxXPixels)) : 0)
    setOffsetY(maxYPixels ? Math.max(-1, Math.min(1, drag.offsetY - (event.clientY - drag.y) / maxYPixels)) : 0)
  }

  function confirm() {
    if (!image) return
    onConfirm(renderTokenImage({ image, crop, shape }), size)
  }

  return <div className="modal-backdrop portrait-crop-backdrop" role="presentation">
    <section className="portrait-crop-modal token-editor-modal" role="dialog" aria-modal="true" aria-labelledby="token-editor-title">
      <header><div><p className="eyebrow">Token da ficha</p><h2 id="token-editor-title">Monte o token para o mapa</h2><p>Arraste a imagem para enquadrar. O fundo fora do token fica transparente.</p></div><button className="icon-button" onClick={onCancel} aria-label="Cancelar"><X size={20} /></button></header>
      <div className="portrait-crop-body">
        <div ref={stageRef} className={`portrait-crop-stage token-stage ${shape}`} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, offsetX, offsetY } }} onPointerMove={move} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
          <span className="token-frame" style={{ width: frameWidth, height: frameHeight }}>
          {source && <img src={source} alt="Imagem do token" draggable={false} onLoad={(event) => setImage(event.currentTarget)} style={{ top: 0, left: 0, translate: "none", width: width * scale, height: height * scale, transform: `translate(${-crop.x * scale}px, ${-crop.y * scale}px)` }} />}
          </span>
          <span aria-hidden="true" className="token-mask" style={{ width: frameWidth, height: frameHeight }} />
        </div>
        <div className="portrait-crop-controls">
          <div className="token-shape-switch" role="radiogroup" aria-label="Formato">
            <button role="radio" aria-checked={shape === "circle"} className={shape === "circle" ? "active" : ""} onClick={() => setShape("circle")}><Circle size={15} /> Círculo</button>
            <button role="radio" aria-checked={shape === "free"} className={shape === "free" ? "active" : ""} onClick={() => setShape("free")}><Square size={15} /> Livre</button>
          </div>
          <label><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
          <label><span>Horizontal</span><input type="range" min="-1" max="1" step="0.01" value={offsetX} disabled={maxXPixels === 0} onChange={(event) => setOffsetX(Number(event.target.value))} /></label>
          <label><span>Vertical</span><input type="range" min="-1" max="1" step="0.01" value={offsetY} disabled={maxYPixels === 0} onChange={(event) => setOffsetY(Number(event.target.value))} /></label>
          <p className="token-shape-hint">{shape === "circle" ? "O círculo recorta um quadrado da imagem." : "Livre mantém a proporção original da imagem."}</p>
          <label><span>Tamanho no mapa</span><select value={size} onChange={(event) => setSize(Number(event.target.value))}>{TOKEN_SIZES.map((cells) => <option key={cells} value={cells}>{cells === 0.5 ? "½ célula" : `${cells}×${cells} células`}</option>)}</select></label>
          {preview && <div className="token-preview"><span>Prévia</span><img src={preview} alt="Prévia do token" /></div>}
        </div>
      </div>
      <footer><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={!image} onClick={confirm}><Crop size={16} /> Usar token</button></footer>
    </section>
  </div>
}
