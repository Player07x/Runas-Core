"use client"

import { useState } from "react"
import { createPortal } from "react-dom"
import Image from "next/image"
import { ImagePlus, Pencil, Trash2, UserRound, X } from "lucide-react"
import { ImageCropper } from "@/components/runic-cards/image-cropper"
import { Button } from "@/components/ui/button"

interface Props {
  value?: string
  onChange: (dataUrl: string | undefined) => void
}

export function CharacterPortraitEditor({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="w-full max-w-[12.5rem] self-start">
        <div className="group relative aspect-[2/3] w-full max-w-[12.5rem] overflow-hidden rounded-[22px] border border-border bg-gradient-to-b from-primary/15 via-panel to-panel text-panel-muted shadow-lg">
          {value ? <Image src={value} alt="Retrato do personagem" fill sizes="200px" unoptimized className="object-cover" /> : <button type="button" onClick={() => setOpen(true)} className="grid size-full place-items-center text-center transition hover:text-panel-foreground"><span><UserRound className="mx-auto size-14 opacity-75" /><span className="mt-3 inline-flex items-center gap-2 px-2 text-xs font-bold"><ImagePlus className="size-4" /> Adicionar retrato</span></span></button>}
          {value && <div className="absolute inset-x-0 bottom-0 flex justify-center gap-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent p-5 pt-16 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}><Pencil /> Editar</Button><Button type="button" size="sm" variant="destructive" onClick={() => onChange(undefined)}><Trash2 /> Remover</Button></div>}
        </div>
      </div>
      {open && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[120] overflow-y-auto bg-[#080a12]/98 p-3 backdrop-blur-md sm:p-4" role="presentation" onMouseDown={() => setOpen(false)}><section role="dialog" aria-modal="true" aria-label="Editar imagem do personagem" onMouseDown={(event) => event.stopPropagation()} className="mx-auto my-2 w-full max-w-4xl rounded-[26px] border border-border bg-card p-4 shadow-2xl sm:my-4 sm:p-6"><div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-xl font-bold text-card-foreground">Imagem do personagem</h2><p className="text-sm text-muted-foreground">Posicione e dimensione o retrato antes de aplicar.</p></div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar editor de imagem" className="grid size-10 place-items-center rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"><X className="size-5" /></button></div><ImageCropper currentImage={value ?? ""} onApply={(dataUrl) => { onChange(dataUrl); setOpen(false) }} title="Recorte do retrato" description="O recorte 2:3 ocupa toda a moldura da ficha e fica incorporado ao arquivo exportado." chooseLabel="Escolher retrato" applyLabel="Aplicar retrato" outputWidth={1200} outputHeight={1800} /></section></div>, document.body)}
    </>
  )
}
