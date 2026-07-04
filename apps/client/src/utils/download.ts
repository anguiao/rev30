import { saveAs } from 'file-saver'

export function saveFile(file: Blob, filename: string) {
  saveAs(file, filename)
}
