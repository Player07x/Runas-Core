import type { Metadata, Viewport } from "next"
import { Metal_Mania } from "next/font/google"
import "./globals.css"

// Fonte baixada no build e servida pelo próprio site, com pré-carregamento e
// fallback de métricas ajustadas (sem CSS externo bloqueando a renderização).
const metalMania = Metal_Mania({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-metal-mania" })

export const metadata: Metadata = {
  title: "Runas Book",
  description: "A wiki viva das regras, itens, habilidades, magias e fichas de Runas.",
  icons: { icon: "/favicon.svg" },
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0a0e12",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // O script de inicialização da página pode marcar <html> antes da hidratação.
  return <html lang="pt-BR" className={metalMania.variable} suppressHydrationWarning>
    <body>{children}</body>
  </html>
}
