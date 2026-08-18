import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { detectCfbf } from '@file-type/cfbf'
import { create as createContentDisposition } from 'content-disposition'
import { fileTypeStream } from 'file-type'
import { contentType } from 'mime-types'
import type { Logger } from 'pino'
import {
  ATTACHMENT_DISPOSITION_ATTACHMENT,
  ATTACHMENT_DISPOSITION_INLINE,
  type AttachmentDisposition,
  type AttachmentListQuery,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ATTACHMENT_READ_POLICY_SIGNED,
  type AttachmentUploadSessionCreateInput,
} from '@rev30/contracts'
import { addSeconds, millisecondsBetween, toIsoDateTime } from '@rev30/utils'
import type { Db } from '../../db'
import { readAuthConfig } from '../auth/config'
import { createAuthRepository } from '../auth/repository'
import { readNumberConfigValue } from '../system/configs/values'
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
  acceptAttachmentUploadType,
  getAttachmentFilenameType,
  resolveContentDisposition,
  validateAttachmentUploadSize,
} from './policy'
import { createAttachmentRepository } from './repository'
import {
  createAttachmentContentToken,
  createAttachmentUploadToken,
  verifyAttachmentContentToken,
  verifyAttachmentUploadToken,
} from './signing'
import {
  ATTACHMENT_UPLOAD_STORAGE_PREFIX,
  type AttachmentGetResult,
  createAttachmentStorage,
} from './storage'
import { limitAttachmentBodySize, toReadableStream } from './stream'

const fileTypeDetectors = [detectCfbf]

function padDatePart(value: number) {
  return String(value).padStart(2, '0')
}

function createUploadSessionStorageKey(uploadId: string, extension: string, createdAt: Date) {
  return [
    ATTACHMENT_UPLOAD_STORAGE_PREFIX,
    String(createdAt.getUTCFullYear()),
    padDatePart(createdAt.getUTCMonth() + 1),
    padDatePart(createdAt.getUTCDate()),
    `${uploadId}.${extension}`,
  ].join('/')
}

function createDownloadFilename(name: string) {
  return name.replace(/[\\/\p{C}]/gu, '_')
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
  const filename = createTypedDownloadFilename(input.filename, input.extension)

  return createContentDisposition(filename, { type: disposition })
}

function createContentResponse(
  row: AttachmentRow,
  stored: AttachmentGetResult,
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
  const authRepository = createAuthRepository(database)
  const config = readAttachmentConfig()
  const authConfig = readAuthConfig()
  const storage = createAttachmentStorage(config)
  const repository = createAttachmentRepository(database)

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
      const uploadSessionTtlSeconds = await readNumberConfigValue(
        database,
        'attachment.uploadSessionTtlSeconds',
      )
      const uploadId = randomUUID()
      const expiresAt = addSeconds(createdAt, uploadSessionTtlSeconds)
      const contentType = input.contentType?.trim()
      await repository.createUploadSession({
        id: uploadId,
        createdAt,
        cleanupPolicy: input.cleanupPolicy,
        createdBy: input.userId,
        expectedSize: input.size,
        expiresAt,
        originalName: input.originalName,
        readPolicy: input.readPolicy,
        state: 'pending',
        updatedAt: createdAt,
        usage: input.usage,
      })
      const token = createAttachmentUploadToken(
        {
          uploadId,
          expiresAt,
        },
        config.signingSecret,
      )

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

      if (!input.body) {
        throw new AttachmentUploadRequestError('请选择文件')
      }

      const session = await repository.claimPendingUploadSession(input.uploadId, requestedAt)

      if (!session) {
        throw new AttachmentUploadSessionInvalidError()
      }

      try {
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
          session.id,
          accepted.extension,
          session.createdAt,
        )

        const written = await storage.put({
          key: storageKey,
          body: limitAttachmentBodySize(body),
        })

        if (written.size !== session.expectedSize) {
          await storage.delete(storageKey)
          throw new AttachmentUploadRequestError('文件大小与上传会话不一致')
        }

        const storedAt = new Date()
        const stored = await repository.storeUploadSessionContent(session.id, {
          checksum: written.checksum,
          extension: accepted.extension,
          mimeType: accepted.mimeType,
          size: written.size,
          storageKey,
          storageProvider: storage.provider,
          storedAt,
        })

        if (!stored) {
          throw new AttachmentUploadSessionInvalidError()
        }
      } catch (error) {
        await repository.resetUploadingUploadSession(session.id, new Date())
        throw error
      }
    },

    async completeUploadSession(input: { uploadId: string; userId: string }) {
      const requestedAt = new Date()
      const session = await repository.findActiveUploadSession(input.uploadId, requestedAt)

      if (!session || session.createdBy !== input.userId) {
        throw new AttachmentUploadSessionInvalidError()
      }

      if (session.state !== 'stored') {
        throw new AttachmentUploadSessionNotReadyError()
      }

      const created = await repository.completeUploadSession(session.id, input.userId, requestedAt)

      if (!created) {
        throw new AttachmentUploadSessionInvalidError()
      }

      return toAttachment(created)
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

      const contentUrlTtlSeconds = await readNumberConfigValue(
        database,
        'attachment.contentUrlTtlSeconds',
      )
      const expiresAt = addSeconds(new Date(), contentUrlTtlSeconds)
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
        const user = await authRepository.findValidSessionUser(
          verified.sessionId,
          verified.userId,
          requestedAt,
        )

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

    async delete(id: string, requestLogger: Logger) {
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
        requestLogger.error(
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
