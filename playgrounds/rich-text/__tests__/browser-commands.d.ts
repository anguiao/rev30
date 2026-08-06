import 'vitest/internal/browser'

interface MouseDragPoint {
  readonly selector: string
  readonly x: number
  readonly y: number
}

declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    dragMouse(source: MouseDragPoint, target: MouseDragPoint): Promise<void>
    setClipboard(value: string): Promise<void>
  }
}
