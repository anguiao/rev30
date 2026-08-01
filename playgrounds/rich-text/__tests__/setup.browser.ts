import '../src/style.css'
import { afterEach, beforeEach } from 'vitest'

let animationResetStyle: HTMLStyleElement | null = null

beforeEach(() => {
  animationResetStyle = document.createElement('style')
  animationResetStyle.textContent =
    '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }'
  document.head.append(animationResetStyle)
})

afterEach(() => {
  animationResetStyle?.remove()
  animationResetStyle = null
})
