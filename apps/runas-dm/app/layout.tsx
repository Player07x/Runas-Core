import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { ServiceWorkerRegistration } from "./components/service-worker-registration"
import { SelectSearch } from "./components/select-search"
import { THEME_STORAGE_KEY } from "./lib/ui-preferences"

const geist = Geist({ variable: "--font-sans", subsets: ["latin"] })
const geistMono = Geist_Mono({ variable: "--font-mono", subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Runas DM",
  description: "Bestiário e ferramentas integradas para mestres do sistema Runas.",
  icons: {
    icon: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
  },
}

// Aplica o tema salvo antes da primeira pintura, para qualquer rota (Bestiário,
// Mesa, Campanhas ou Wiki) — sem isso, cada página precisaria repetir a leitura
// do localStorage em seu próprio efeito e ainda assim piscaria o tema escuro
// padrão por um instante.
const themeInitScript = `try{document.documentElement.dataset.theme=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="light"?"light":"dark"}catch(e){}`

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR" data-theme="dark" suppressHydrationWarning><body className={`${geist.variable} ${geistMono.variable}`}><script dangerouslySetInnerHTML={{ __html: themeInitScript }} />{children}<ServiceWorkerRegistration /><SelectSearch /></body></html>
}
