"use client"

import { lazy, Suspense, useEffect, useId, useState } from "react"
import { afterPageLoad } from "@/lib/afterPageLoad"
import { RichTextFrame, RichTextToolButton, StaticRichTextContent, richTextLength, richTextTools, type RichTextEditorProps } from "./rich-text-frame"

// O TipTap/ProseMirror (~120 KB comprimidos) não entra no carregamento inicial da
// página: o quadro estático aparece na hora e o editor é baixado quando o navegador
// termina de carregar — ou imediatamente, se a pessoa tocar no campo antes disso.
const loadRichTextEditor = () => import("./rich-text-editor")
const RichTextEditor = lazy(() => loadRichTextEditor().then((module) => ({ default: module.RichTextEditor })))

function StaticRichTextEditor({ label, value, maxLength = 1000, className, readOnly = false, onActivate }: RichTextEditorProps & { onActivate?: () => void }) {
  const id = useId()
  return (
    <RichTextFrame
      labelId={`${id}-label`}
      label={label}
      length={richTextLength(value)}
      maxLength={maxLength}
      readOnly={readOnly}
      className={className}
      toolbar={richTextTools.map((tool) => <RichTextToolButton key={tool.name} label={tool.label} icon={tool.icon} active={false} disabled />)}
    >
      <StaticRichTextContent html={value} labelId={`${id}-label`} onActivate={readOnly ? undefined : onActivate} />
    </RichTextFrame>
  )
}

export function DeferredRichTextEditor(props: RichTextEditorProps) {
  const [mode, setMode] = useState<"static" | "idle" | "interaction">("static")

  useEffect(() => {
    if (mode !== "static") return
    return afterPageLoad(() => setMode((current) => current === "static" ? "idle" : current))
  }, [mode])

  const activate = () => setMode((current) => current === "static" ? "interaction" : current)
  const placeholder = <StaticRichTextEditor {...props} onActivate={activate} />
  if (mode === "static") return placeholder
  return (
    <Suspense fallback={placeholder}>
      <RichTextEditor {...props} autoFocus={mode === "interaction"} />
    </Suspense>
  )
}
