export function createFileList(files: readonly File[]): FileList {
  return Object.assign([...files], {
    item: (index: number) => files[index] ?? null,
  })
}

export function createClipboardEvent({
  text,
  html,
  files = [],
}: { text?: string; html?: string; files?: readonly File[] } = {}) {
  const clipboardData = new DataTransfer()

  // Keep string entries before files: happy-dom matches getData() by MIME type alone.
  clipboardData.setData('text/plain', text ?? '')
  clipboardData.setData('text/html', html ?? '')
  for (const file of files) clipboardData.items.add(file)

  // happy-dom returns an Array here and omits FileList.item().
  Object.defineProperty(clipboardData, 'files', { value: createFileList(files) })

  return new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData })
}
