/** Shares the latest printed card with the 3D prop so it shows your ID. */
type Listener = (card: HTMLCanvasElement) => void

let latest: HTMLCanvasElement | null = null
const listeners = new Set<Listener>()

export const cardStore = {
  get: () => latest,
  set(card: HTMLCanvasElement) {
    latest = card
    listeners.forEach((l) => l(card))
  },
  subscribe(l: Listener) {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
}
