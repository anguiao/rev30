export class AttachmentUploadRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class AttachmentFileTooLargeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = new.target.name
  }
}

export class AttachmentTypeUnsupportedError extends Error {
  constructor() {
    super('不支持的文件类型')
    this.name = new.target.name
  }
}

export class AttachmentNotFoundError extends Error {
  constructor() {
    super('附件不存在')
    this.name = new.target.name
  }
}

export class AttachmentUploadUrlInvalidError extends Error {
  constructor() {
    super('上传链接已失效')
    this.name = new.target.name
  }
}

export class AttachmentUploadSessionInvalidError extends Error {
  constructor() {
    super('上传会话已失效')
    this.name = new.target.name
  }
}

export class AttachmentUploadSessionNotReadyError extends Error {
  constructor() {
    super('文件尚未上传')
    this.name = new.target.name
  }
}

export class AttachmentContentUrlInvalidError extends Error {
  constructor() {
    super('附件链接已失效')
    this.name = new.target.name
  }
}

export class AttachmentContentUrlUnsupportedError extends Error {
  constructor() {
    super('附件不支持短期读取链接')
    this.name = new.target.name
  }
}

export class AttachmentContentUnauthorizedError extends Error {
  constructor() {
    super('未授权')
    this.name = new.target.name
  }
}
