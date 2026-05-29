import { FormFieldError } from '../../core/errors'

export class AttachmentMissingFileError extends FormFieldError<'file'> {
  constructor() {
    super('请选择文件', 'file')
  }
}

export class AttachmentInvalidUsageError extends FormFieldError<'usage'> {
  constructor() {
    super('上传用途无效', 'usage')
  }
}

export class AttachmentFileTooLargeError extends FormFieldError<'file'> {
  constructor(message: string) {
    super(message, 'file')
  }
}

export class AttachmentTypeUnsupportedError extends FormFieldError<'file'> {
  constructor() {
    super('不支持的文件类型', 'file')
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
