import { FormFieldError } from '../../../core/errors'

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super('通知公告不存在')
    this.name = 'AnnouncementNotFoundError'
  }
}

export class AnnouncementEmptyContentError extends FormFieldError<'contentJson'> {
  constructor() {
    super('请输入正文', 'contentJson')
  }
}

export class AnnouncementContentInvalidError extends FormFieldError<'contentJson'> {
  constructor() {
    super('正文格式无效', 'contentJson')
  }
}

export class AnnouncementDraftArchiveError extends Error {
  constructor() {
    super('草稿通知公告不能下线')
    this.name = 'AnnouncementDraftArchiveError'
  }
}
