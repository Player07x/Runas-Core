const COVER_WIDTH = 1600
const COVER_HEIGHT = 2263 // proporção próxima de A4 retrato

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error("Não foi possível carregar a imagem de capa."))
    image.src = src
  })
}

function drawCoverFit(context: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight)
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight)
}

function wrapCenteredText(context: CanvasRenderingContext2D, text: string, centerX: number, centerY: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  let y = centerY - ((lines.length - 1) * lineHeight) / 2
  for (const currentLine of lines) {
    context.fillText(currentLine, centerX, y)
    y += lineHeight
  }
}

async function ensureNorseFontsReady() {
  if (typeof document === "undefined" || !("fonts" in document)) return
  try {
    await Promise.all([
      document.fonts.load('700 100px "Norse Bold"'),
      document.fonts.load('400 100px "Norse"'),
    ])
  } catch { /* segue com a fonte padrão se a Norse não carregar */ }
}

/**
 * Gera a capa do livro como um PNG (data URL) para reaproveitar o mesmo visual tanto no PDF quanto no DOCX,
 * sem depender de embutir fonte diretamente em cada formato de documento. Usa `coverImageDataUrl` quando o DM
 * cadastrou uma capa; senão pinta o fundo com `accent` e escreve título/autor em Norse Bold/Norse.
 */
export async function renderCoverImage(book: { title: string; author: string; accent: string; coverImageDataUrl?: string }): Promise<string> {
  const canvas = document.createElement("canvas")
  canvas.width = COVER_WIDTH
  canvas.height = COVER_HEIGHT
  const context = canvas.getContext("2d")
  if (!context) return ""

  if (book.coverImageDataUrl) {
    const image = await loadImage(book.coverImageDataUrl)
    drawCoverFit(context, image, COVER_WIDTH, COVER_HEIGHT)
    return canvas.toDataURL("image/jpeg", .9)
  }

  const accent = book.accent || "#7d97a6"
  context.fillStyle = accent
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT)
  const vignette = context.createRadialGradient(COVER_WIDTH / 2, COVER_HEIGHT * .38, COVER_HEIGHT * .12, COVER_WIDTH / 2, COVER_HEIGHT * .5, COVER_HEIGHT * .8)
  vignette.addColorStop(0, "rgba(255,255,255,.12)")
  vignette.addColorStop(1, "rgba(0,0,0,.4)")
  context.fillStyle = vignette
  context.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT)

  context.strokeStyle = "rgba(245,239,228,.55)"
  context.lineWidth = 3
  context.strokeRect(70, 70, COVER_WIDTH - 140, COVER_HEIGHT - 140)

  await ensureNorseFontsReady()
  context.textAlign = "center"
  context.fillStyle = "#f5efe4"
  context.font = `700 ${Math.round(COVER_WIDTH * .1)}px "Norse Bold", serif`
  wrapCenteredText(context, book.title, COVER_WIDTH / 2, COVER_HEIGHT * .46, COVER_WIDTH * .78, COVER_WIDTH * .105)

  context.font = `400 ${Math.round(COVER_WIDTH * .032)}px "Norse", serif`
  context.fillStyle = "rgba(245,239,228,.88)"
  context.fillText(book.author ? `por ${book.author}` : "Runas Suite", COVER_WIDTH / 2, COVER_HEIGHT * .58)

  // JPEG mantém o texto legível nessa resolução e evita um PNG de vários MB (gradiente com muitas cores
  // únicas comprime mal) inflando o PDF/DOCX gerado.
  return canvas.toDataURL("image/jpeg", .92)
}
