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

export class AttachmentSignedUrlInvalidError extends Error {
  constructor() {
    super('附件链接已失效')
    this.name = new.target.name
  }
}
