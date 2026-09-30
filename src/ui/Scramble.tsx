import { useEffect, useState } from 'react'

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&$@*'

/** Decrypts `text` from random glyphs, left to right. */
export function Scramble({ text, delay = 0, speed = 28, className }: { text: string; delay?: number; speed?: number; className?: string }) {
  const [out, setOut] = useState(() => text.replace(/\S/g, ' '))

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setOut(text)
      return
    }
    let frame = 0
    let id = 0
    const start = window.setTimeout(() => {
      id = window.setInterval(() => {
        frame++
        const settled = Math.floor(frame / 2)
        setOut(
          text
            .split('')
            .map((ch, i) => {
              if (ch === ' ') return ' '
              if (i < settled) return ch
              if (i > settled + 8) return ' '
              return GLYPHS[Math.floor(Math.random() * GLYPHS.length)]
            })
            .join(''),
        )
        if (settled >= text.length) window.clearInterval(id)
      }, speed)
    }, delay)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(id)
    }
  }, [text, delay, speed])

  return (
    <span className={className} aria-label={text}>
      {out}
    </span>
  )
}
