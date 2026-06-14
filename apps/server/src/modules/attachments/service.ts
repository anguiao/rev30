import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { detectCfbf } from '@file-type/cfbf'
import { fileTypeStream } from 'file-type'
import { contentType } from 'mime-types'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  type AttachmentDisposition,
  type AttachmentListQuery,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  type AttachmentUploadSessionCreateInput,
} from '@rev30/contracts'
import { addSeconds, isExpiredAt, millisecondsBetween, toIsoDateTime } from '@rev30/utils'
import type { Db } from '../../db'
import { logger } from '../../runtime/logger'
import { readAuthConfig } from '../auth/config'
import { verifyAttachmentAccessToken } from './access-token'
import { readAttachmentConfig } from './config'
import {
  AttachmentContentUnauthorizedError,
  AttachmentContentUrlInvalidError,
  AttachmentContentUrlUnsupportedError,
  AttachmentNotFoundError,
  AttachmentUploadRequestError,
  AttachmentUploadSessionInvalidError,
  AttachmentUploadSessionNotReadyError,
} from './errors'
import { type AttachmentRow, toAttachment, toAttachmentListItem } from './mapper'
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
    storageKey: string
    storedAt: Date
  }

type UploadSession = AttachmentUploadSessionCreateInput & {
  createdAt: Date
  expiresAt: Date
  uploadId: string
  storedContent?: StoredUploadContent
  userId: string
}

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function createUploadSessionStorageKey(uploadId: string, extension: string, createdAt: Date) {
  return [
    'uploads',
    String(createdAt.getUTCFullYear()),
    padDatePart(createdAt.getUTCMonth() + 1),
    padDatePart(createdAt.getUTCDate()),
    `${uploadId}.${extension}`,
  ].join('/')
}

function createDownloadFilename(name: string) {
  return name.replace(/["\r\n]/g, '_')
}

function createTypedDownloadFilename(name: string, extension: string) {
  const filename = createDownloadFilename(name)
  const currentExtension = extname(filename)

  if (currentExtension.replace(/^\./, '').toLowerCase() === extension) {
    return filename
  }

  const basename = currentExtension ? filename.slice(0, -currentExtension.length) : filename

  return `${basename}.${extension}`
}

function createCacheControlHeader(expiresAt: Date, requestedAt: Date) {
  const remainingSeconds = Math.max(
    0,
    Math.floor(millisecondsBetween(expiresAt, requestedAt) / 1000),
  )

  return `private, max-age=${Math.min(300, remainingSeconds)}`
}

function createContentDispositionHeader(
  disposition: AttachmentDisposition,
  input: {
    extension: string
    filename: string
  },
) {
  return `${disposition}; filename="${createTypedDownloadFilename(input.filename, input.extension)}"`
}

function createContentResponse(
  row: AttachmentRow,
  stored: Awaited<ReturnType<LocalAttachmentStorage['get']>>,
  input: {
    cacheControl: string
    disposition: AttachmentDisposition
  },
) {
  const disposition = resolveContentDisposition(input.disposition, row.mimeType)

  return {
    body: stored.body,
    headers: {
      'Cache-Control': input.cacheControl,
      'Content-Disposition': createContentDispositionHeader(disposition, {
        extension: row.extension,
        filename: row.originalName,
      }),
      'Content-Length': String(stored.size),
      'Content-Type': contentType(row.mimeType) || row.mimeType,
      'X-Content-Type-Options': 'nosniff',
    },
  }
}

export function createAttachmentService(database: Db) {
  const config = readAttachmentConfig()
  const authConfig = readAuthConfig()
  const storage = new LocalAttachmentStorage(config.storageDir)
  const repository = createAttachmentRepository(database)
  const uploadSessions = new Map<string, UploadSession>()

  function getActiveUploadSession(uploadId: string, now: Date) {
    const session = uploadSessions.get(uploadId)

    if (!session || isExpiredAt(session.expiresAt, now)) {
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
      const expiresAt = addSeconds(createdAt, config.uploadSessionTtlSeconds)
      const contentType = input.contentType?.trim()
      const session: UploadSession = {
        ...(contentType ? { contentType } : {}),
        createdAt,
        expiresAt,
        originalName: input.originalName,
        readPolicy: input.readPolicy,
        size: input.size,
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
          expiresAt: toIsoDateTime(expiresAt),
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
        getAttachmentFilenameType(session.originalName),
        body.fileType
          ? {
              extension: body.fileType.ext,
              mimeType: body.fileType.mime,
            }
          : null,
      )
      const storageKey = createUploadSessionStorageKey(
        session.uploadId,
        accepted.extension,
        session.createdAt,
      )

      const written = await storage.put({
        key: storageKey,
        body: limitAttachmentBodySize(body),
      })

      if (written.size !== session.size) {
        await storage.delete(storageKey)
        throw new AttachmentUploadRequestError('文件大小与上传会话不一致')
      }

      session.storedContent = {
        checksum: written.checksum,
        extension: accepted.extension,
        mimeType: accepted.mimeType,
        size: written.size,
        storageKey,
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
          storageProvider,
          storageKey: session.storedContent.storageKey,
          originalName: session.originalName,
          mimeType: session.storedContent.mimeType,
          extension: session.storedContent.extension,
          size: session.storedContent.size,
          usage: session.usage,
          readPolicy: session.readPolicy,
          checksum: session.storedContent.checksum,
          createdBy: session.userId,
          createdAt: session.storedContent.storedAt,
        })

        uploadSessions.delete(session.uploadId)

        return toAttachment(created)
      } catch (error) {
        uploadSessions.delete(session.uploadId)

        try {
          await storage.delete(session.storedContent.storageKey)
        } catch (cleanupError) {
          logger.error(
            {
              err: cleanupError,
              storageKey: session.storedContent.storageKey,
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

      if (row.readPolicy !== ATTACHMENT_READ_POLICY_SIGNED) {
        throw new AttachmentContentUrlUnsupportedError()
      }

      const expiresAt = addSeconds(new Date(), config.contentUrlTtlSeconds)
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
          expiresAt: toIsoDateTime(expiresAt),
        },
      }
    },

    async readContent(
      id: string,
      input: {
        attachmentReadToken?: string | undefined
        signedToken?: string | undefined
      },
    ) {
      const requestedAt = new Date()
      const row = await repository.findActiveById(id)

      if (!row) {
        throw new AttachmentNotFoundError()
      }

      if (row.readPolicy === ATTACHMENT_READ_POLICY_AUTHENTICATED) {
        if (!input.attachmentReadToken) {
          throw new AttachmentContentUnauthorizedError()
        }

        const verified = await verifyAttachmentAccessToken(input.attachmentReadToken, authConfig)
        const user = await repository.findActiveUserById(verified.userId)

        if (!user) {
          throw new AttachmentContentUnauthorizedError()
        }

        const stored = await storage.get(row.storageKey)

        return createContentResponse(row, stored, {
          cacheControl: 'private, max-age=300',
          disposition: ATTACHMENT_DISPOSITION_INLINE,
        })
      }

      if (!input.signedToken) {
        throw new AttachmentContentUrlInvalidError()
      }

      const payload = verifyAttachmentContentToken(input.signedToken, {
        attachmentId: id,
        now: requestedAt,
        secret: config.signingSecret,
      })
      const stored = await storage.get(row.storageKey)

      return createContentResponse(row, stored, {
        cacheControl: createCacheControlHeader(payload.expiresAt, requestedAt),
        disposition: payload.disposition,
      })
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
