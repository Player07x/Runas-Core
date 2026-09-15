import type { MetadataRoute } from "next"

export const dynamic = "force-static"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Runas Book",
    short_name: "Runas Book",
    description: "Wiki e compêndio das regras de Runas.",
    start_url: ".",
    scope: ".",
    display: "standalone",
    background_color: "#0a0e12",
    theme_color: "#0a0e12",
    lang: "pt-BR",
    categories: ["games", "reference"],
    icons: [{ src: "/favicon.svg", sizes: "any", type: "image/svg+xml" }],
  }
}
