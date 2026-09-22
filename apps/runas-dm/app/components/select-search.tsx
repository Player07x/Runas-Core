"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"

type OpenSelect = { element: HTMLSelectElement; label: string; rect: DOMRect; options: Array<{ value: string; label: string; disabled: boolean }> }

/** Acrescenta busca aos selects existentes sem alterar seus onChange e valores controlados. */
export function SelectSearch() {
  const [active, setActive] = useState<OpenSelect | null>(null)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function open(select: HTMLSelectElement) {
      if (select.disabled || select.multiple || select.size > 1) return
      const label = select.getAttribute("aria-label") || select.labels?.[0]?.querySelector("span")?.textContent?.trim() || select.labels?.[0]?.textContent?.trim() || "Selecionar item"
      setActive({ element: select, label, rect: select.getBoundingClientRect(), options: [...select.options].map((option) => ({ value: option.value, label: option.textContent?.trim() || option.value, disabled: option.disabled })) })
      setQuery("")
    }
    function pointer(event: PointerEvent) {
      const target = event.target
      if (!(target instanceof HTMLSelectElement)) return
      if (target.disabled || target.multiple || target.size > 1) return
      event.preventDefault()
      event.stopPropagation()
      open(target)
    }
    function keyboard(event: KeyboardEvent) {
      if (!(event.target instanceof HTMLSelectElement) || !["Enter", " ", "ArrowDown"].includes(event.key)) return
      event.preventDefault()
      open(event.target)
    }
    document.addEventListener("pointerdown", pointer, true)
    document.addEventListener("keydown", keyboard, true)
    return () => { document.removeEventListener("pointerdown", pointer, true); document.removeEventListener("keydown", keyboard, true) }
  }, [])

  useEffect(() => { if (active) inputRef.current?.focus() }, [active])
  useEffect(() => {
    if (!active) return
    function close() { setActive(null) }
    window.addEventListener("scroll", close, true)
    window.addEventListener("resize", close)
    return () => { window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close) }
  }, [active])

  if (!active) return null
  const normalized = query.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR")
  const visible = active.options.filter((option) => option.label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 100)
  const width = Math.max(240, Math.min(440, active.rect.width))
  const left = Math.max(8, Math.min(active.rect.left, window.innerWidth - width - 8))
  const top = active.rect.bottom + 328 < window.innerHeight ? active.rect.bottom + 5 : Math.max(8, active.rect.top - 325)
  function choose(value: string) {
    const select = active?.element
    if (!select || !select.isConnected) { setActive(null); return }
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set
    setter?.call(select, value)
    select.dispatchEvent(new Event("change", { bubbles: true }))
    setActive(null)
    select.focus()
  }
  return <div className="select-search-shield" onPointerDown={() => setActive(null)}><div className="select-search-popover" style={{ top, left, width }} role="dialog" aria-label={`Pesquisar em ${active.label}`} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setActive(null); active.element.focus() } else if (event.key === "Enter" && visible[0] && !visible[0].disabled) { event.preventDefault(); choose(visible[0].value) } }}><header><strong>{active.label}</strong><button type="button" aria-label="Fechar lista" onClick={() => setActive(null)}><X size={15} /></button></header><label><Search size={15} /><input ref={inputRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Pesquisar nesta lista" aria-label={`Pesquisar em ${active.label}`} /></label><div className="select-search-options" role="listbox">{visible.map((option, index) => <button type="button" role="option" aria-selected={option.value === active.element.value} disabled={option.disabled} key={`${option.value}-${index}`} onClick={() => choose(option.value)}>{option.label}</button>)}{visible.length === 0 && <p>Nenhum item encontrado.</p>}</div></div></div>
}
