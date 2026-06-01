import { randomUUID } from 'node:crypto'
import { detectCfbf } from '@file-type/cfbf'
import { fileTypeStream } from 'file-type'
import { contentType } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  type AttachmentDisposition,
  type AttachmentListQuery,
  type AttachmentUploadSessionCreateInput,
} from '@rev30/contracts'
import type { Db } from '../../db'
import { logger } from '../../runtime/logger'
import { readAttachmentConfig } from './config'
import {
  AttachmentNotFoundError,
  AttachmentUploadRequestError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
} from './errors'
import { toAttachment, toAttachmentListItem } from './mapper'
import {
  type AttachmentFileType,
  acceptAttachmentUploadType,
  resolveContentDisposition,
  getAttachmentFilenameType,
  validateAttachmentUploadSize,
} from './policy'
import { createAttachmentRepository } from './repository'
import {
  createAttachmentContentToken,
  createAttachmentUploadToken,
  verifyAttachmentContentToken,
  verifyAttachmentUploadToken,
} from './signing'
import { LocalAttachmentStorage, type AttachmentPutResult } from './storage'
import { limitAttachmentBodySize, toReadableStream } from './stream'

const storageProvider = 'local'
const fileTypeDetectors = [detectCfbf]

type StoredUploadContent = AttachmentFileType &
  AttachmentPutResult & {
    storedAt: Date
  }

type UploadSession = AttachmentUploadSessionCreateInput & {
  createdAt: Date
  expiresAt: Date
  filenameType: AttachmentFileType
  storageKey: string
  uploadId: string
  storedContent?: StoredUploadContent
  userId: string
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function createUploadSessionStorageKey(uploadId: string, extension: string, now: Date) {
  return [
    'uploads',
    String(now.getUTCFullYear()),
    padDatePart(now.getUTCMonth() + 1),
    padDatePart(now.getUTCDate()),
    `${uploadId}.${extension}`,
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

function isExpired(expiresAt: Date, now: Date) {
  return expiresAt.getTime() <= now.getTime()
}

export function createAttachmentService(database: Db) {
  const config = readAttachmentConfig()
  const storage = new LocalAttachmentStorage(config.storageDir)
  const repository = createAttachmentRepository(database)
  const uploadSessions = new Map<string, UploadSession>()

  function getActiveUploadSession(uploadId: string, now: Date) {
    const session = uploadSessions.get(uploadId)

    if (!session || isExpired(session.expiresAt, now)) {
      if (session) {
        uploadSessions.delete(uploadId)
      }

      throw new AttachmentUploadSessionInvalidError()
    }

    return session
  }

  return {
    async list(query: AttachmentListQuery) {
      const result = await repository.list(query)

      return {
        ...result,
        list: result.list.map(toAttachmentListItem),
      }
    },

    async createUploadSession(input: AttachmentUploadSessionCreateInput & { userId: string }) {
      validateAttachmentUploadSize(input.size)

      const createdAt = new Date()
      const uploadId = randomUUID()
      const expiresAt = new Date(createdAt.getTime() + config.uploadSessionTtlSeconds * 1000)
      const contentType = input.contentType?.trim()
      const filenameType = getAttachmentFilenameType(input.originalName)
      const storageKey = createUploadSessionStorageKey(uploadId, filenameType.extension, createdAt)
      const session: UploadSession = {
        ...(contentType ? { contentType } : {}),
        createdAt,
        expiresAt,
        filenameType,
        originalName: input.originalName,
        size: input.size,
        storageKey,
        uploadId,
        usage: input.usage,
        userId: input.userId,
      }
      const token = createAttachmentUploadToken(
        {
          uploadId,
          expiresAt,
        },
        config.signingSecret,
      )

      uploadSessions.set(uploadId, session)

      return {
        uploadId,
        request: {
          url: `/api/attachments/uploads/${uploadId}/content?token=${encodeURIComponent(token)}`,
          method: 'PUT' as const,
          headers: contentType ? { 'Content-Type': contentType } : {},
          expiresAt: expiresAt.toISOString(),
        },
      }
    },

    async uploadSessionContent(input: {
      body: AsyncIterable<Uint8Array> | null
      token: string
      uploadId: string
    }) {
      const requestedAt = new Date()

      verifyAttachmentUploadToken(input.token, {
        now: requestedAt,
        secret: config.signingSecret,
        uploadId: input.uploadId,
      })

      const session = getActiveUploadSession(input.uploadId, requestedAt)

      if (!input.body) {
        throw new AttachmentUploadRequestError('请选择文件')
      }

      const body = await fileTypeStream(toReadableStream(input.body), {
        customDetectors: fileTypeDetectors,
      })
      const accepted = acceptAttachmentUploadType(
        session.filenameType,
        body.fileType
          ? {
              extension: body.fileType.ext,
              mimeType: body.fileType.mime,
            }
          : null,
      )

      const written = await storage.put({
        key: session.storageKey,
        body: limitAttachmentBodySize(body),
      })

      if (written.size !== session.size) {
        await storage.delete(session.storageKey)
        throw new AttachmentUploadRequestError('文件大小与上传会话不一致')
      }

      session.storedContent = {
        checksum: written.checksum,
        extension: accepted.extension,
        mimeType: accepted.mimeType,
        size: written.size,
        storedAt: new Date(),
      }
    },

    async completeUploadSession(input: { uploadId: string; userId: string }) {
      const session = getActiveUploadSession(input.uploadId, new Date())

      if (session.userId !== input.userId) {
        throw new AttachmentUploadSessionInvalidError()
      }

      if (!session.storedContent) {
        throw new AttachmentUploadSessionNotReadyError()
      }

      try {
        const created = await repository.create({
          id: session.uploadId,
          storageProvider,
          storageKey: session.storageKey,
          originalName: session.originalName,
          mimeType: session.storedContent.mimeType,
          extension: session.storedContent.extension,
          size: session.storedContent.size,
          usage: session.usage,
          checksum: session.storedContent.checksum,
          createdBy: session.userId,
          createdAt: session.storedContent.storedAt,
        })

        uploadSessions.delete(session.uploadId)

        return toAttachment(created)
      } catch (error) {
        uploadSessions.delete(session.uploadId)

        try {
          await storage.delete(session.storageKey)
        } catch (cleanupError) {
          logger.error(
            {
              err: cleanupError,
              storageKey: session.storageKey,
            },
            'attachment upload session cleanup failed',
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

    async createContentUrl(
      id: string,
      input: {
        disposition?: AttachmentDisposition
      },
    ) {
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      const expiresAt = new Date(Date.now() + config.contentUrlTtlSeconds * 1000)
      const disposition = input.disposition ?? ATTACHMENT_DISPOSITION_ATTACHMENT
      const token = createAttachmentContentToken(
        {
          attachmentId: id,
          disposition,
          expiresAt,
        },
        config.signingSecret,
      )
      return {
        request: {
          url: `/api/attachments/${id}/content?token=${encodeURIComponent(token)}`,
          method: 'GET' as const,
          headers: {},
          expiresAt: expiresAt.toISOString(),
        },
      }
    },

    async readContent(id: string, token: string) {
      const requestedAt = new Date()
      const payload = verifyAttachmentContentToken(token, {
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
