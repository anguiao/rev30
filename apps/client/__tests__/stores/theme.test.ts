import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useThemeStore } from '../../src/stores/theme'
import { stubPreferredDark } from '../helpers/dom'
import { createTestPinia, disposeActiveTestPinia } from '../helpers/pinia'

const themeStorageKey = 'theme-mode'
const preferredDarkQuery = '(prefers-color-scheme: dark)'

function createPreferredColorScheme(initialDark: boolean) {
  let matches = initialDark
  const listeners = new Set<EventListenerOrEventListenerObject>()
  const addEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener !== null) listeners.add(listener)
    },
  )
  const removeEventListener = vi.fn(
    (_type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (listener !== null) listeners.delete(listener)
    },
  )
  const mediaQueryList = {
    get matches() {
      return matches
    },
    media: preferredDarkQuery,
    onchange: null,
    addEventListener,
    removeEventListener,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
  } as unknown as MediaQueryList
  const matchMedia = vi.fn((query: string) => {
    expect(query).toBe(preferredDarkQuery)
    return mediaQueryList
  })

  vi.stubGlobal('matchMedia', matchMedia)

  return {
    addEventListener,
    listenerCount: () => listeners.size,
    matchMedia,
    removeEventListener,
    setDark(nextMatches: boolean) {
      matches = nextMatches
      const event = { matches, media: preferredDarkQuery } as MediaQueryListEvent

      listeners.forEach((listener) => {
        if (typeof listener === 'function') {
          listener(event)
          return
        }

        listener.handleEvent(event)
      })
    },
  }
}

describe('theme store', () => {
  beforeEach(() => {
    stubPreferredDark(false)
  })

  it('loads and persists the selected theme mode across store instances', async () => {
    localStorage.setItem(themeStorageKey, 'dark')
    const firstStore = useThemeStore(createTestPinia())
    await nextTick()

    expect(firstStore.mode).toBe('dark')
    expect(firstStore.resolvedMode).toBe('dark')
    expect(firstStore.isDark).toBe(true)

    firstStore.setMode('light')
    await nextTick()

    expect(localStorage.getItem(themeStorageKey)).toBe('light')

    disposeActiveTestPinia()
    const restoredStore = useThemeStore(createTestPinia())

    expect(restoredStore.mode).toBe('light')
    expect(restoredStore.resolvedMode).toBe('light')
    expect(restoredStore.isDark).toBe(false)
  })

  it('supports light, dark, and system modes while only system follows preference changes', async () => {
    const preference = createPreferredColorScheme(false)
    const store = useThemeStore(createTestPinia())
    await nextTick()

    expect(store.mode).toBe('auto')
    expect(store.resolvedMode).toBe('light')
    expect(store.isDark).toBe(false)

    preference.setDark(true)
    await nextTick()

    expect(store.resolvedMode).toBe('dark')
    expect(store.isDark).toBe(true)

    store.setMode('light')
    await nextTick()
    preference.setDark(false)
    preference.setDark(true)
    await nextTick()

    expect(store.mode).toBe('light')
    expect(store.resolvedMode).toBe('light')
    expect(store.isDark).toBe(false)

    store.setMode('dark')
    await nextTick()
    preference.setDark(false)
    await nextTick()

    expect(store.mode).toBe('dark')
    expect(store.resolvedMode).toBe('dark')
    expect(store.isDark).toBe(true)

    store.setMode('auto')
    await nextTick()

    expect(store.mode).toBe('auto')
    expect(store.resolvedMode).toBe('light')
    expect(store.isDark).toBe(false)

    preference.setDark(true)
    await nextTick()

    expect(store.resolvedMode).toBe('dark')
    expect(store.isDark).toBe(true)
  })

  it('reuses one preference listener per store and removes it when Pinia is disposed', async () => {
    const preference = createPreferredColorScheme(false)
    const pinia = createTestPinia()
    const store = useThemeStore(pinia)

    expect(useThemeStore(pinia)).toBe(store)
    await nextTick()

    expect(preference.matchMedia).toHaveBeenCalledOnce()
    expect(preference.addEventListener).toHaveBeenCalledOnce()
    expect(preference.listenerCount()).toBe(1)

    disposeActiveTestPinia()
    await nextTick()

    expect(preference.removeEventListener).toHaveBeenCalledOnce()
    expect(preference.listenerCount()).toBe(0)

    useThemeStore(createTestPinia())
    await nextTick()

    expect(preference.matchMedia).toHaveBeenCalledTimes(2)
    expect(preference.addEventListener).toHaveBeenCalledTimes(2)
    expect(preference.listenerCount()).toBe(1)
  })
})
