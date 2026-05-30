import { randomUUID } from 'node:crypto'
import { detectCfbf } from '@file-type/cfbf'
import { fileTypeStream } from 'file-type'
import { contentType } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
  type AttachmentUsage,
} from '@rev30/contracts'
import type { Db } from '../../db'
import { logger } from '../../runtime/logger'
import { readAttachmentConfig } from './config'
import { AttachmentNotFoundError } from './errors'
import { toAttachment } from './mapper'
import {
  resolveContentDisposition,
  resolveAttachmentFileType,
  validateAttachmentUploadMimeType,
} from './policy'
import { createAttachmentRepository } from './repository'
import { createAttachmentReadToken, verifyAttachmentReadToken } from './signing'
import { LocalAttachmentStorage } from './storage'
import { limitAttachmentBodySize, toReadableStream } from './stream'

const storageProvider = 'local'
const fileTypeDetectors = [detectCfbf]

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function createStorageKey(id: string, extension: string, now: Date) {
  return [
    String(now.getUTCFullYear()),
    padDatePart(now.getUTCMonth() + 1),
    padDatePart(now.getUTCDate()),
    `${id}.${extension}`,
  ].join('/')
}

function createDownloadFilename(name: string) {
  return name.replace(/["\r\n]/g, '_')
}

function createCacheControlHeader(expiresAt: Date, requestedAt: Date) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - requestedAt.getTime()) / 1000),
  )

  return `private, max-age=${Math.min(300, remainingSeconds)}`
}

function createContentDispositionHeader(disposition: AttachmentDisposition, filename: string) {
  return `${disposition}; filename="${createDownloadFilename(filename)}"`
}

export function createAttachmentService(database: Db) {
  const config = readAttachmentConfig()
  const storage = new LocalAttachmentStorage(config.storageDir)
  const repository = createAttachmentRepository(database)

  return {
    async upload(input: {
      body: AsyncIterable<Uint8Array>
      originalName: string
      usage: AttachmentUsage
      userId: string
    }) {
      const body = await fileTypeStream(toReadableStream(input.body), {
        customDetectors: fileTypeDetectors,
      })
      const detected = resolveAttachmentFileType(body.fileType, input.originalName)

      validateAttachmentUploadMimeType(detected.mimeType)

      const createdAt = new Date()
      const id = randomUUID()
      const storageKey = createStorageKey(id, detected.extension, createdAt)
      const written = await storage.put({
        key: storageKey,
        body: limitAttachmentBodySize(body),
      })

      try {
        return toAttachment(
          await repository.create({
            id,
            storageProvider,
            storageKey,
            originalName: input.originalName,
            mimeType: detected.mimeType,
            extension: detected.extension,
            size: written.size,
            usage: input.usage,
            checksum: written.checksum,
            createdBy: input.userId,
            createdAt,
          }),
        )
      } catch (error) {
        try {
          await storage.delete(storageKey)
        } catch (cleanupError) {
          logger.error(
            {
              err: cleanupError,
              storageKey,
            },
            'attachment upload cleanup failed',
          )
        }

        throw error
      }
    },

    async get(id: string) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      return toAttachment(row)
    },

    async createSignedUrl(
      id: string,
      input: {
        disposition?: AttachmentDisposition
      },
    ) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const expiresAt = new Date(Date.now() + config.signedUrlTtlSeconds * 1000)
      const disposition = input.disposition ?? ATTACHMENT_DISPOSITION_ATTACHMENT
      const token = createAttachmentReadToken(
        {
          attachmentId: id,
          disposition,
          expiresAt,
        },
        config.signingSecret,
      )
      return {
        url: `/api/attachments/${id}/content?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
      }
    },

    async readContent(id: string, token: string) {
      const requestedAt = new Date()
      const payload = verifyAttachmentReadToken(token, {
        attachmentId: id,
        now: requestedAt,
        secret: config.signingSecret,
      })
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const stored = await storage.get(row.storageKey)
      const disposition = resolveContentDisposition(payload.disposition, row.mimeType)
      const resolvedContentType = contentType(row.mimeType) || row.mimeType

      return {
        body: stored.body,
        headers: {
          'Cache-Control': createCacheControlHeader(payload.expiresAt, requestedAt),
          'Content-Disposition': createContentDispositionHeader(disposition, row.originalName),
          'Content-Length': String(stored.size),
          'Content-Type': resolvedContentType,
          'X-Content-Type-Options': 'nosniff',
        },
      }
    },

    async delete(id: string) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const deleted = await repository.softDelete(id, new Date())

      if (!deleted) {
        throw new AttachmentNotFoundError()
      }

      try {
        await storage.delete(deleted.storageKey)
      } catch (error) {
        logger.error(
          {
            attachmentId: id,
            err: error,
            storageKey: deleted.storageKey,
          },
          'attachment storage deletion failed',
        )
      }
    },
  }
}
