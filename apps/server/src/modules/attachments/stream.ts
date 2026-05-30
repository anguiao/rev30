import { Readable } from 'node:stream'
import { validateAttachmentUploadSize } from './policy'

export function toReadableStream(body: AsyncIterable<Uint8Array>) {
  return Readable.toWeb(Readable.from(body)) as ReadableStream<Uint8Array>
}

export async function* limitAttachmentBodySize(body: AsyncIterable<Uint8Array>) {
  let size = 0

  for await (const chunk of body) {
    size += chunk.byteLength
    validateAttachmentUploadSize(size)
    yield chunk
  }
}
