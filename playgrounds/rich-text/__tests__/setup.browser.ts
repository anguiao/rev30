import '../src/style.css'
import { afterAll, afterEach, beforeEach } from 'vitest'
import { THEME_STORAGE_KEY } from '../src/playground/useThemeMode'

const expectedPostcssBrowserExternalAccesses = new Set([
  'fs:fs.existsSync',
  'fs:fs.readFileSync',
  'path:path.dirname',
  'path:path.isAbsolute',
  'path:path.join',
  'path:path.relative',
  'path:path.resolve',
  'path:path.sep',
  'source-map-js:source-map-js.SourceMapConsumer',
  'source-map-js:source-map-js.SourceMapGenerator',
  'url:url.fileURLToPath',
  'url:url.pathToFileURL',
])
const browserExternalWarningPattern =
  /Module "([^"]+)" has been externalized for browser compatibility\. Cannot access "([^"]+)" in client code\./
const originalConsoleWarn = console.warn.bind(console)

console.warn = (...data) => {
  const match =
    typeof data[0] === 'string' ? browserExternalWarningPattern.exec(data[0]) : undefined

  if (match && expectedPostcssBrowserExternalAccesses.has(`${match[1]}:${match[2]}`)) {
    return
  }

  originalConsoleWarn(...data)
}

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

afterAll(() => {
  console.warn = originalConsoleWarn
})
