"use client"

import { useEffect } from "react"

// Modais podem aparecer aninhados (por exemplo, editar um item dentro da
// ficha avançada já aberta). Uma pilha garante que Esc feche apenas o diálogo
// mais recente, em vez de fechar todos os níveis de uma vez.
const stack: Array<() => void> = []

/** Fecha o diálogo com Esc, dando ao teclado a mesma saída que clicar fora já oferece. */
export function useEscapeToClose(onClose: () => void) {
  useEffect(() => {
    stack.push(onClose)
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && stack[stack.length - 1] === onClose) onClose()
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      window.removeEventListener("keydown", handleKeyDown)
      const index = stack.lastIndexOf(onClose)
      if (index !== -1) stack.splice(index, 1)
    }
  }, [onClose])
}
