import '../src/style.css'
import { afterEach, beforeEach } from 'vitest'
import { THEME_STORAGE_KEY } from '../src/playground/useThemeMode'

let animationResetStyle: HTMLStyleElement | null = null

function resetThemeState() {
  localStorage.removeItem(THEME_STORAGE_KEY)
  document.documentElement.classList.remove('dark')
}

beforeEach(() => {
  resetThemeState()
  animationResetStyle = document.createElement('style')
  animationResetStyle.textContent =
    '*, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }'
  document.head.append(animationResetStyle)
})

afterEach(() => {
  animationResetStyle?.remove()
  animationResetStyle = null
  resetThemeState()
})
