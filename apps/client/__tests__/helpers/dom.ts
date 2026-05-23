import { vi } from 'vitest'

export function resetThemeDom() {
  localStorage.clear()
  document.documentElement.className = ''
  document.documentElement.style.colorScheme = ''
}

export function stubPreferredDark(matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  )
}
