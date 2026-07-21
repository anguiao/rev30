let nextSlashCommandInstanceId = 0

export function createRichTextSlashCommandInstanceId() {
  nextSlashCommandInstanceId += 1
  return nextSlashCommandInstanceId
}
