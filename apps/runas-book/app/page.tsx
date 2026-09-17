import { BookApp } from "./components/book-app"
import { createSeedWorkspace } from "./lib/book-seed"
import { bookViewBootstrapScript } from "./lib/book-view-bootstrap"

export default function BookHomePage() {
  // O catálogo é montado no build; o navegador recebe só o resultado.
  const seed = createSeedWorkspace()
  return <>
    <script dangerouslySetInnerHTML={{ __html: bookViewBootstrapScript(seed) }} />
    <BookApp mode="public" seed={seed} />
  </>
}
