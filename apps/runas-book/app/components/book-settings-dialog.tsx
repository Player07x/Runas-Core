"use client"

import { useRef, useState } from "react"
import { Check, ImageOff, Upload, X } from "lucide-react"
import type { BookRecord } from "../lib/book-model"

async function compressCoverImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Imagem inválida"))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image()
    element.onload = () => resolve(element)
    element.onerror = () => reject(new Error("Imagem inválida"))
    element.src = source
  })
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight))
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL("image/jpeg", .85)
}

interface Props {
  book: BookRecord
  onSave: (patch: Pick<BookRecord, "title" | "subtitle" | "author" | "accent" | "coverImageDataUrl">) => void
  onClose: () => void
}

export function BookSettingsDialog({ book, onSave, onClose }: Props) {
  const [title, setTitle] = useState(book.title)
  const [subtitle, setSubtitle] = useState(book.subtitle)
  const [author, setAuthor] = useState(book.author)
  const [accent, setAccent] = useState(book.accent || "#7d97a6")
  const [cover, setCover] = useState(book.coverImageDataUrl)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleCoverFile(file: File | undefined) {
    if (!file || !file.type.startsWith("image/")) return
    setCover(await compressCoverImage(file))
  }

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card editor-modal book-settings-modal" onMouseDown={(event) => event.stopPropagation()}>
      <header><div><p className="eyebrow">Configurações do livro</p><h2>{book.title}</h2></div><button className="icon-link" onClick={onClose}><X size={18} /></button></header>

      <label>Título<input className="form-input" value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>Subtítulo<input className="form-input" value={subtitle} onChange={(event) => setSubtitle(event.target.value)} /></label>
      <label>Autor<input className="form-input" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Exibido na capa gerada e nos metadados da exportação" /></label>
      <label>Cor do livro<div className="book-settings-color-row"><input type="color" value={accent} onChange={(event) => setAccent(event.target.value)} /><span>{accent}</span></div></label>

      <div className="book-settings-cover">
        <span className="book-settings-cover-label">Capa</span>
        <div className="book-settings-cover-preview" style={cover ? { backgroundImage: `url(${cover})` } : { background: accent }}>
          {!cover && <div className="book-settings-cover-fallback"><strong>{title || "Sem título"}</strong>{author && <small>por {author}</small>}</div>}
        </div>
        <div className="book-settings-cover-actions">
          <button className="outline-action" onClick={() => fileInputRef.current?.click()}><Upload size={15} /> {cover ? "Trocar imagem" : "Enviar imagem"}</button>
          {cover && <button className="outline-action" onClick={() => setCover(undefined)}><ImageOff size={15} /> Usar capa automática</button>}
        </div>
        <p className="book-settings-cover-hint">Sem uma imagem, a exportação gera uma capa automática com a cor do livro e o título/autor.</p>
        <input ref={fileInputRef} hidden type="file" accept="image/*" onChange={(event) => { void handleCoverFile(event.target.files?.[0]); event.currentTarget.value = "" }} />
      </div>

      <div className="editor-actions">
        <button className="outline-action" onClick={onClose}><X size={15} /> Cancelar</button>
        <button className="primary-action" onClick={() => onSave({ title: title.trim() || book.title, subtitle, author, accent, coverImageDataUrl: cover })}><Check size={15} /> Salvar</button>
      </div>
    </section>
  </div>
}
