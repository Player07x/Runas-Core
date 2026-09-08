"use client"

import { useRef, useState } from "react"

export function KnowledgeImagePicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  async function importImage(file: File) {
    const current = ++sequence.current
    setBusy(true)
    setError("")
    let bitmap: ImageBitmap | undefined
    try {
      if (!file.type.startsWith("image/")) throw new Error("Selecione um arquivo de imagem.")
      bitmap = await createImageBitmap(file)
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement("canvas")
      canvas.width = Math.max(1, Math.round(bitmap.width * scale))
      canvas.height = Math.max(1, Math.round(bitmap.height * scale))
      const context = canvas.getContext("2d")
      if (!context) throw new Error("Não foi possível processar a imagem.")
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      if (current === sequence.current) onChange(canvas.toDataURL("image/webp", 0.85))
    } catch (cause) {
      if (current === sequence.current) setError(cause instanceof Error ? cause.message : "Não foi possível importar a imagem.")
    } finally {
      bitmap?.close()
      if (current === sequence.current) setBusy(false)
    }
  }
  return <div className="knowledge-image-picker">
    {value && <img src={value} alt="Imagem selecionada" />}
    <label className="secondary-button">{busy ? "Importando…" : "Importar imagem"}<input type="file" accept="image/*" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void importImage(file) }} /></label>
    {value && <button className="secondary-button" onClick={() => { sequence.current += 1; setBusy(false); onChange("") }}>Remover imagem</button>}
    {error && <p role="alert">{error}</p>}
  </div>
}
