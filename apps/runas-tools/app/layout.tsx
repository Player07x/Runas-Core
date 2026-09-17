import type { Metadata, Viewport } from "next"
import { Geist } from "next/font/google"
import { Suspense } from "react"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { CharacterProvider } from "@/components/character/character-provider"
import { CharacterPanelProvider } from "@/components/character/character-panel"
import { AppHeader } from "@/components/layout/app-header"
import { ServiceWorkerRegistration } from "@/components/service-worker-registration"
import { RulesetProvider } from "@/components/rulesets/ruleset-provider"
import { CronosCharacterProvider } from "@/components/cronos/cronos-character-provider"
import { BRAND_FAVICON_DATA_URL } from "@/lib/brandImages"

const geistSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" })

export const metadata: Metadata = {
  title: "Runas Tools",
  description: "Uma coleção de ferramentas para facilitar partidas de Runas: Livro Azul.",
  generator: "v0.app",
  icons: {
    // Favicon embutido: sem requisição extra e sem o caminho relativo que quebrava nas subpáginas.
    icon: [{ url: BRAND_FAVICON_DATA_URL, type: "image/png", sizes: "48x48" }],
    apple: [{ url: "/icon-192.png", type: "image/png", sizes: "192x192" }],
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#1d2230" },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <ThemeProvider>
          <RulesetProvider>
            <CharacterProvider>
              <CronosCharacterProvider>
                <CharacterPanelProvider>
                  <Suspense fallback={null}>
                    <AppHeader />
                  </Suspense>
                  {children}
                </CharacterPanelProvider>
              </CronosCharacterProvider>
            </CharacterProvider>
          </RulesetProvider>
        </ThemeProvider>
        <ServiceWorkerRegistration />
      </body>
    </html>
  )
}
