let nextRichTextBlockMenuInstanceId = 0

export function createRichTextBlockMenuInstanceId() {
  nextRichTextBlockMenuInstanceId += 1
  return nextRichTextBlockMenuInstanceId
}
