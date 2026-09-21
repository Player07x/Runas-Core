"use client"

import { Component, type ReactNode } from "react"

/**
 * Limite de erro para as partes carregadas sob demanda (`next/dynamic`).
 *
 * Sem ele, um `import()` que falha — tipicamente sem rede, com o arquivo
 * ainda fora do cache do service worker — sobe até o erro global do Next e
 * derruba o aplicativo inteiro na tela "This page couldn't load". Aqui a
 * falha fica contida na parte que não carregou, e o usuário tenta de novo
 * sem perder nada do que já estava aberto.
 */

interface Props {
  children: ReactNode
  /** O que não carregou, para a mensagem: "a ficha", "a calculadora". */
  label: string
}

interface State {
  failed: boolean
  attempt: number
}

export class LazyBoundary extends Component<Props, State> {
  state: State = { failed: false, attempt: 0 }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true }
  }

  private retry = () => {
    this.setState((current) => ({ failed: false, attempt: current.attempt + 1 }))
  }

  render() {
    if (!this.state.failed) return <div key={this.state.attempt}>{this.props.children}</div>
    const offline = typeof navigator !== "undefined" && navigator.onLine === false
    return (
      <div role="alert" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/55 p-4">
        <div className="w-full max-w-md rounded-[22px] border border-border bg-card p-6 text-center shadow-2xl">
          <h2 className="text-lg font-bold text-foreground">Não foi possível carregar {this.props.label}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {offline
              ? "Você está sem conexão e esta parte ainda não estava salva neste dispositivo. Conecte-se uma vez para guardá-la; depois ela abre offline."
              : "O carregamento falhou. Tente de novo — o que você já tinha aberto continua salvo."}
          </p>
          <button type="button" onClick={this.retry} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground">
            Tentar de novo
          </button>
        </div>
      </div>
    )
  }
}
