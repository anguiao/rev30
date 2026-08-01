import 'vitest/internal/browser'

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    setClipboard(value: string): Promise<void>
  }
}
