"use client"

import { useEffect, useRef, useState } from "react"
import { Crop, X } from "lucide-react"
import { useEscapeToClose } from "../lib/use-escape-to-close"

interface ImageSize { width: number; height: number }

export function PortraitCropDialog({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (dataUrl: string) => void }) {
  useEscapeToClose(onCancel)
  const [source] = useState(() => URL.createObjectURL(file))
  const [imageSize, setImageSize] = useState<ImageSize>({ width: 1, height: 1 })
  const [zoom, setZoom] = useState(1)
  const [offsetX, setOffsetX] = useState(0)
  const [offsetY, setOffsetY] = useState(0)
  const [cropSize, setCropSize] = useState(320)
  const imageRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ x: number; y: number; offsetX: number; offsetY: number } | null>(null)

  useEffect(() => {
    return () => URL.revokeObjectURL(source)
  }, [source])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => setCropSize(entry?.contentRect.width || 320))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  const baseScale = Math.max(cropSize / imageSize.width, cropSize / imageSize.height)
  const renderedWidth = imageSize.width * baseScale * zoom
  const renderedHeight = imageSize.height * baseScale * zoom
  const maxX = Math.max(0, (renderedWidth - cropSize) / 2)
  const maxY = Math.max(0, (renderedHeight - cropSize) / 2)
  const x = offsetX * maxX
  const y = offsetY * maxY

  function confirmCrop() {
    const image = imageRef.current
    if (!image) return
    const size = 512
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext("2d")
    if (!context) return
    const outputScale = size / cropSize
    context.drawImage(image, (cropSize - renderedWidth) / 2 * outputScale + x * outputScale, (cropSize - renderedHeight) / 2 * outputScale + y * outputScale, renderedWidth * outputScale, renderedHeight * outputScale)
    onConfirm(canvas.toDataURL("image/jpeg", 0.84))
  }

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    const nextX = maxX ? drag.offsetX + (event.clientX - drag.x) / maxX : 0
    const nextY = maxY ? drag.offsetY + (event.clientY - drag.y) / maxY : 0
    setOffsetX(Math.max(-1, Math.min(1, nextX)))
    setOffsetY(Math.max(-1, Math.min(1, nextY)))
  }

  return <div className="modal-backdrop portrait-crop-backdrop" role="presentation">
    <section className="portrait-crop-modal" role="dialog" aria-modal="true" aria-labelledby="portrait-crop-title">
      <header><div><p className="eyebrow">Imagem da ficha</p><h2 id="portrait-crop-title">Recorte e enquadre o retrato</h2><p>Arraste a imagem ou use os controles de ajuste.</p></div><button className="icon-button" onClick={onCancel} aria-label="Cancelar recorte"><X size={20} /></button></header>
      <div className="portrait-crop-body">
        <div ref={stageRef} className="portrait-crop-stage" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragRef.current = { x: event.clientX, y: event.clientY, offsetX, offsetY } }} onPointerMove={move} onPointerUp={() => { dragRef.current = null }} onPointerCancel={() => { dragRef.current = null }}>
          {source && <img ref={imageRef} src={source} alt="Prévia do recorte" draggable={false} onLoad={(event) => setImageSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })} style={{ width: renderedWidth, height: renderedHeight, transform: `translate(${x}px, ${y}px)` }} />}
          <span aria-hidden="true" />
        </div>
        <div className="portrait-crop-controls"><label><span>Zoom</span><input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label><label><span>Horizontal</span><input type="range" min="-1" max="1" step="0.01" value={offsetX} disabled={maxX === 0} onChange={(event) => setOffsetX(Number(event.target.value))} /></label><label><span>Vertical</span><input type="range" min="-1" max="1" step="0.01" value={offsetY} disabled={maxY === 0} onChange={(event) => setOffsetY(Number(event.target.value))} /></label></div>
      </div>
      <footer><button className="secondary-button" onClick={onCancel}>Cancelar</button><button className="primary-button" onClick={confirmCrop}><Crop size={16} /> Usar recorte</button></footer>
    </section>
  </div>
}
