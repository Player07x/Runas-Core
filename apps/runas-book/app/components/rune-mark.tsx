const RUNE_PATH = "M 88.0,6.0 L 72.0,17.0 L 60.0,42.0 L 40.0,70.0 L 21.0,105.0 L 6.0,178.0 L 7.0,255.0 L 29.0,328.0 L 40.0,411.0 L 51.0,422.0 L 73.0,407.0 L 123.0,358.0 L 127.0,358.0 L 165.0,328.0 L 197.0,288.0 L 197.0,271.0 L 191.0,242.0 L 159.0,138.0 L 130.0,73.0 Z M 61.0,118.0 L 78.0,117.0 L 83.0,122.0 L 100.0,147.0 L 117.0,183.0 L 117.0,187.0 L 122.0,192.0 L 131.0,241.0 L 132.0,268.0 L 134.0,276.0 L 130.0,279.0 L 113.0,280.0 L 110.0,277.0 L 108.0,214.0 L 93.0,178.0 L 93.0,173.0 L 82.0,157.0 L 80.0,157.0 L 78.0,181.0 L 81.0,278.0 L 79.0,280.0 L 63.0,281.0 L 58.0,277.0 L 61.0,211.0 L 61.0,137.0 L 59.0,120.0 Z"

/** A runa central da capa de "Runas · Livro Branco", extraída e vetorizada como marca do site. */
export function RuneMark({ size = 20, className }: { size?: number; className?: string }) {
  const style = className ? undefined : { width: size, height: size * (429 / 204) }
  return <svg className={className} style={style} viewBox="0 0 204 429" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path fillRule="evenodd" d={RUNE_PATH} /></svg>
}
