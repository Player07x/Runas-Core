import type { ReactNode } from "react"
import { Bold, Eraser, Italic, List, ListOrdered, Underline, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

// Estrutura visual compartilhada entre o editor TipTap e o seu marcador estático,
// para que a troca entre os dois não mude tamanho nem posição de nada na tela.

export interface RichTextEditorProps {
  label: string
  value: string
  onChange: (value: string) => void
  maxLength?: number
  className?: string
  readOnly?: boolean
}

export type RichTextToolName = "bold" | "italic" | "underline" | "bulletList" | "orderedList" | "clear"

export const richTextTools: { name: RichTextToolName; label: string; icon: LucideIcon }[] = [
  { name: "bold", label: "Negrito", icon: Bold },
  { name: "italic", label: "Itálico", icon: Italic },
  { name: "underline", label: "Sublinhado", icon: Underline },
  { name: "bulletList", label: "Lista", icon: List },
  { name: "orderedList", label: "Lista numerada", icon: ListOrdered },
  { name: "clear", label: "Limpar formatação", icon: Eraser },
]

export const RICH_TEXT_CONTENT_CLASS = "min-h-52 px-4 py-3 text-sm leading-relaxed text-foreground outline-none [&_p]:my-1.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"

const ALLOWED_TAGS = "p|br|strong|b|em|i|u|s|strike|code|pre|blockquote|h[1-6]|ul|ol|li|hr|a"

/** HTML exibido antes do editor carregar: somente as marcações do StarterKit, sem atributos. */
export function staticRichTextHtml(html: string): string {
  return html
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<(script|style|iframe|object|embed|template|textarea|title)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(new RegExp(`<(?!\\/?(?:${ALLOWED_TAGS})\\b)[^>]*>`, "gi"), "")
    .replace(new RegExp(`<(\\/?)(${ALLOWED_TAGS})\\b[^>]*>`, "gi"), "<$1$2>")
}

/** Quantidade de caracteres de texto, no mesmo critério do contador do editor. */
export function richTextLength(html: string): number {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&[a-z]+;|&#\d+;/gi, "x").length
}

export function RichTextFrame({ labelId, label, length, maxLength, readOnly, className, toolbar, children }: {
  labelId: string
  label: string
  length: number
  maxLength: number
  readOnly: boolean
  className?: string
  toolbar: ReactNode
  children: ReactNode
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3 px-2">
        <label id={labelId} className="text-sm font-medium text-muted-foreground">{label}</label>
        {!readOnly && <span className="text-[0.68rem] tabular-nums text-muted-foreground">{length}/{maxLength}</span>}
      </div>
      <div className="overflow-hidden rounded-[18px] border border-input bg-background/65 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25">
        {!readOnly && <div className="flex flex-wrap gap-1 border-b border-border/70 bg-muted/55 p-1.5">{toolbar}</div>}
        {children}
      </div>
    </div>
  )
}

export function RichTextToolButton({ label, icon: Icon, active, disabled, onClick }: { label: string; icon: LucideIcon; active: boolean; disabled: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-card hover:text-foreground disabled:opacity-40",
        active && "bg-card text-foreground shadow-sm",
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}

/** Conteúdo estático com as mesmas classes do ProseMirror, usado enquanto o TipTap não está pronto. */
export function StaticRichTextContent({ html, labelId, onActivate }: { html: string; labelId: string; onActivate?: () => void }) {
  return (
    <div>
      <div
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        aria-readonly={onActivate ? undefined : true}
        tabIndex={onActivate ? 0 : undefined}
        className={RICH_TEXT_CONTENT_CLASS}
        onPointerDown={onActivate}
        onFocus={onActivate}
        dangerouslySetInnerHTML={{ __html: staticRichTextHtml(html) }}
      />
    </div>
  )
}
