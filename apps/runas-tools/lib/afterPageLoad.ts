type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

/**
 * Agenda trabalho não essencial (editores e fontes decorativas) para depois do
 * evento `load`, de uma pequena margem e de um intervalo ocioso — assim ele não
 * disputa rede nem CPU com a primeira pintura. Devolve a função de cancelamento.
 */
export function afterPageLoad(callback: () => void, delayMs = 1200): () => void {
  const idleWindow = window as IdleWindow
  let cancelled = false
  let timer: number | undefined
  let idleHandle: number | undefined

  const run = () => { if (!cancelled) callback() }
  const schedule = () => {
    timer = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(run, { timeout: 2000 })
      else run()
    }, delayMs)
  }

  if (document.readyState === "complete") schedule()
  else window.addEventListener("load", schedule, { once: true })

  return () => {
    cancelled = true
    window.removeEventListener("load", schedule)
    if (timer !== undefined) window.clearTimeout(timer)
    if (idleHandle !== undefined) idleWindow.cancelIdleCallback?.(idleHandle)
  }
}
