import { BookApp } from "../components/book-app"
import { createSeedWorkspace } from "../lib/book-seed"
import { bookViewBootstrapScript } from "../lib/book-view-bootstrap"

export default function BookDmPage() {
  const seed = createSeedWorkspace()
  return <>
    <script dangerouslySetInnerHTML={{ __html: bookViewBootstrapScript(seed) }} />
    <BookApp mode="dm" seed={seed} />
  </>
}
