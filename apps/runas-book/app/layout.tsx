import type { Metadata, Viewport } from "next"
import "./globals.css"

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
  return <html lang="pt-BR">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Metal+Mania&display=swap" rel="stylesheet" />
    </head>
    <body>{children}</body>
  </html>
}
