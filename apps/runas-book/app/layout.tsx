import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Runas Book",
  description: "A wiki viva das regras, itens, habilidades, magias e fichas de Runas.",
  icons: { icon: "/favicon.svg" },
}

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0e151b",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>
}
