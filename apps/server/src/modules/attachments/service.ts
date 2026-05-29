import { randomUUID } from 'node:crypto'
import { contentType } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
  type AttachmentUsage,
} from '@rev30/contracts'
import type { Db } from '../../db'
import { logger } from '../../runtime/logger'
import type { AttachmentConfig } from './config'
import { readAttachmentConfig } from './config'
import { AttachmentNotFoundError } from './errors'
import { toAttachment } from './mapper'
import {
  detectAttachmentFileType,
  resolveContentDisposition,
  validateAttachmentUpload,
} from './policy'
import { createAttachmentRepository } from './repository'
import { createAttachmentReadToken, verifyAttachmentReadToken } from './signing'
import { LocalAttachmentStorage, type AttachmentStorage } from './storage'

const storageProvider = 'local'
const detectionPrefixBytes = 4100

type ServiceOptions = {
  config?: AttachmentConfig
  now?: () => Date
  storage?: AttachmentStorage
}

export type AttachmentAccessSubject = {
  isAdmin: boolean
  userId: string
}

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

async function readDetectionPrefix(file: File) {
  return new Uint8Array(await file.slice(0, detectionPrefixBytes).arrayBuffer())
}

function createDownloadFilename(name: string) {
  return name.replace(/["\r\n]/g, '_')
}

function createContentDispositionHeader(disposition: AttachmentDisposition, filename: string) {
  return `${disposition}; filename="${createDownloadFilename(filename)}"`
}

function assertCanAccessAttachment(row: { createdBy: string }, subject: AttachmentAccessSubject) {
  if (!subject.isAdmin && row.createdBy !== subject.userId) {
    throw new AttachmentNotFoundError()
  }
}

function createCacheControlHeader(expiresAt: Date, requestedAt: Date) {
  const remainingSeconds = Math.max(
    0,
    Math.floor((expiresAt.getTime() - requestedAt.getTime()) / 1000),
  )

  return `private, max-age=${Math.min(300, remainingSeconds)}`
}

export function createAttachmentService(database: Db, options: ServiceOptions = {}) {
  const config = options.config ?? readAttachmentConfig()
  const now = options.now ?? (() => new Date())
  const storage = options.storage ?? new LocalAttachmentStorage(config.storageDir)
  const repository = createAttachmentRepository(database)

  return {
    async upload(input: { file: File; usage: AttachmentUsage; userId: string }) {
      const detected = await detectAttachmentFileType(
        await readDetectionPrefix(input.file),
        input.file.name,
      )

      validateAttachmentUpload({
        usage: input.usage,
        mimeType: detected.mimeType,
        size: input.file.size,
      })

      const createdAt = now()
      const id = randomUUID()
      const storageKey = createStorageKey(id, detected.extension, createdAt)
      const written = await storage.put({
        key: storageKey,
        body: input.file.stream() as ReadableStream<Uint8Array>,
        expectedSize: input.file.size,
      })

      try {
        return toAttachment(
          await repository.create({
            id,
            storageProvider,
            storageKey,
            originalName: input.file.name,
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

    async get(id: string, subject: AttachmentAccessSubject) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      assertCanAccessAttachment(row, subject)

      return toAttachment(row)
    },

    async createSignedUrl(
      id: string,
      input: {
        disposition?: AttachmentDisposition
        origin: string
        subject: AttachmentAccessSubject
      },
    ) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      assertCanAccessAttachment(row, input.subject)

      const expiresAt = new Date(now().getTime() + config.signedUrlTtlSeconds * 1000)
      const disposition = input.disposition ?? ATTACHMENT_DISPOSITION_ATTACHMENT
      const token = createAttachmentReadToken(
        {
          attachmentId: id,
          disposition,
          expiresAt,
        },
        config.signingSecret,
      )
      const origin = new URL(input.origin).origin

      return {
        url: `${origin}/api/attachments/${id}/content?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
      }
    },

    async readContent(id: string, token: string) {
      const requestedAt = now()
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

    async delete(id: string, subject: AttachmentAccessSubject) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      assertCanAccessAttachment(row, subject)

      const deleted = await repository.softDelete(id, now())

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
