"use client"

import { useEffect, useId, useState } from "react"
import CharacterCount from "@tiptap/extension-character-count"
import { EditorContent, useEditor, type Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { RICH_TEXT_CONTENT_CLASS, RichTextFrame, RichTextToolButton, StaticRichTextContent, richTextLength, richTextTools, type RichTextEditorProps, type RichTextToolName } from "./rich-text-frame"

export type { RichTextEditorProps } from "./rich-text-frame"

function isToolActive(editor: Editor | null, name: RichTextToolName): boolean {
  if (!editor || name === "clear") return false
  return editor.isActive(name)
}

function runTool(editor: Editor | null, name: RichTextToolName) {
  const chain = editor?.chain().focus()
  if (!chain) return
  if (name === "bold") chain.toggleBold().run()
  else if (name === "italic") chain.toggleItalic().run()
  else if (name === "underline") chain.toggleUnderline().run()
  else if (name === "bulletList") chain.toggleBulletList().run()
  else if (name === "orderedList") chain.toggleOrderedList().run()
  else chain.unsetAllMarks().clearNodes().run()
}

export function RichTextEditor({ label, value, onChange, maxLength = 1000, className, readOnly = false, autoFocus = false }: RichTextEditorProps & { autoFocus?: boolean }) {
  const id = useId()
  const [length, setLength] = useState(() => richTextLength(value))

  const editor = useEditor({
    extensions: [
      StarterKit,
      CharacterCount.configure({ limit: maxLength }),
    ],
    content: value,
    editable: !readOnly,
    autofocus: autoFocus && !readOnly ? "end" : false,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-labelledby": `${id}-label`,
        class: RICH_TEXT_CONTENT_CLASS,
      },
    },
    onCreate: ({ editor: currentEditor }) => {
      setLength(currentEditor.storage.characterCount.characters())
    },
    onUpdate: ({ editor: currentEditor }) => {
      setLength(currentEditor.storage.characterCount.characters())
      if (!readOnly) onChange(currentEditor.getHTML())
    },
  })

  useEffect(() => {
    if (!editor || editor.getHTML() === value) return
    editor.commands.setContent(value, { emitUpdate: false })
    setLength(editor.storage.characterCount.characters())
  }, [editor, value])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  return (
    <RichTextFrame
      labelId={`${id}-label`}
      label={label}
      length={length}
      maxLength={maxLength}
      readOnly={readOnly}
      className={className}
      toolbar={richTextTools.map((tool) => <RichTextToolButton key={tool.name} label={tool.label} icon={tool.icon} active={isToolActive(editor, tool.name)} disabled={!editor} onClick={() => runTool(editor, tool.name)} />)}
    >
      {/* Até o TipTap criar a instância, mostra o mesmo conteúdo com as mesmas classes (sem altura zero). */}
      {editor ? <EditorContent editor={editor} /> : <StaticRichTextContent html={value} labelId={`${id}-label`} />}
    </RichTextFrame>
  )
}
