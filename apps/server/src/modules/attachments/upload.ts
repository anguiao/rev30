import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import busboy from 'busboy'
import type { Busboy } from 'busboy'
import { AttachmentUploadRequestError } from './errors'
import { ATTACHMENT_MAX_SIZE_BYTES } from './policy'

export function handleAttachmentUpload<T>(
  request: Request,
  upload: (file: { body: AsyncIterable<Uint8Array>; originalName: string }) => Promise<T>,
) {
  if (!request.body) {
    throw new AttachmentUploadRequestError('请选择文件')
  }

  let parser: Busboy

  try {
    parser = busboy({
      headers: Object.fromEntries(request.headers),
      limits: {
        fileSize: ATTACHMENT_MAX_SIZE_BYTES + 1,
        fields: 0,
        files: 1,
        parts: 1,
      },
    })
  } catch {
    throw new AttachmentUploadRequestError('上传请求无效')
  }

  return new Promise<T>((resolve, reject) => {
    const requestStream = Readable.fromWeb(
      request.body as unknown as NodeReadableStream<Uint8Array>,
    )
    let settled = false
    let uploadPromise: Promise<T> | null = null

    function resolveOnce(value: T) {
      if (settled) {
        return
      }

      settled = true
      resolve(value)
    }

    function rejectOnce(error: unknown) {
      if (settled) {
        return
      }

      settled = true
      reject(error)
    }

    parser.on('file', (name, file, info) => {
      if (name !== 'file' || uploadPromise !== null) {
        file.resume()
        return
      }

      uploadPromise = upload({
        body: file as AsyncIterable<Uint8Array>,
        originalName: info.filename,
      })
      uploadPromise.catch(() => {
        file.resume()
      })
    })
    parser.on('error', () => rejectOnce(new AttachmentUploadRequestError('上传请求无效')))
    parser.on('close', () => {
      if (!uploadPromise) {
        rejectOnce(new AttachmentUploadRequestError('请选择文件'))
        return
      }

      uploadPromise.then(resolveOnce, rejectOnce)
    })
    requestStream.on('error', rejectOnce)
    requestStream.pipe(parser)
  })
}
