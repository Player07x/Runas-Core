"use client"

import { useEffect, useRef } from "react"

type IdleWindow = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number
  cancelIdleCallback?: (handle: number) => void
}

const SAVE_DELAY_MS = 400
const IDLE_TIMEOUT_MS = 2000

/**
 * Grava `value` como JSON em `localStorage` depois que a interface já respondeu:
 * edições em sequência viram uma única gravação, feita quando o navegador está
 * ocioso. Ao ocultar ou fechar a página, a gravação pendente acontece na hora.
 */
export function useDeferredLocalStorage<T>(key: string, value: T, enabled: boolean, onError: (error: unknown) => void) {
  const pendingRef = useRef<{ value: T } | null>(null)
  const savedRef = useRef<T | null>(null)
  const onErrorRef = useRef(onError)
  const flushRef = useRef<() => void>(() => {})

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    function flush() {
      const pending = pendingRef.current
      pendingRef.current = null
      if (!pending || savedRef.current === pending.value) return
      try {
        localStorage.setItem(key, JSON.stringify(pending.value))
        savedRef.current = pending.value
      } catch (error) {
        onErrorRef.current(error)
      }
    }
    function flushWhenHidden() {
      if (document.visibilityState === "hidden") flush()
    }
    flushRef.current = flush
    document.addEventListener("visibilitychange", flushWhenHidden)
    window.addEventListener("pagehide", flush)
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden)
      window.removeEventListener("pagehide", flush)
      flush()
    }
  }, [key])

  useEffect(() => {
    if (!enabled) return
    pendingRef.current = { value }
    const idleWindow = window as IdleWindow
    let idleHandle: number | null = null
    const timer = window.setTimeout(() => {
      if (idleWindow.requestIdleCallback) idleHandle = idleWindow.requestIdleCallback(() => flushRef.current(), { timeout: IDLE_TIMEOUT_MS })
      else flushRef.current()
    }, SAVE_DELAY_MS)
    return () => {
      window.clearTimeout(timer)
      if (idleHandle !== null) idleWindow.cancelIdleCallback?.(idleHandle)
    }
  }, [enabled, value])
}
