"use client"
import { useState } from "react"
import type { KnowledgeTag } from "../lib/knowledge-model"
export function TagEditor({ tag, onSave }: { tag?: Partial<KnowledgeTag>; onSave: (value: Pick<KnowledgeTag, "name" | "icon" | "color">) => void }) {
  const [name, setName] = useState(tag?.name ?? ""); const [icon, setIcon] = useState(tag?.icon ?? "Tag"); const [color, setColor] = useState(tag?.color ?? "#87909b")
  return <form className="knowledge-toolbar" onSubmit={(event) => { event.preventDefault(); onSave({ name, icon, color }) }}><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nome da tag" required /><input value={icon} onChange={(event) => setIcon(event.target.value)} placeholder="Ícone Lucide" /><input type="color" value={color} onChange={(event) => setColor(event.target.value)} /><button className="primary-button">Salvar</button></form>
}

