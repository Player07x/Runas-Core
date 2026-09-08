/** React's delegated wheel listener is passive; use a local non-passive listener. */
export function bindGraphWheel(target: EventTarget, onZoom: (event: WheelEvent) => void): () => void {
  const listener = (event: Event) => {
    event.preventDefault()
    event.stopPropagation()
    onZoom(event as WheelEvent)
  }
  target.addEventListener("wheel", listener, { passive: false })
  return () => target.removeEventListener("wheel", listener)
}
