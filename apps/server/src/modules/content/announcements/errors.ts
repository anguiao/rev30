import { FormFieldError } from '../../../core/errors'

export class AnnouncementNotFoundError extends Error {
  constructor() {
    super('通知公告不存在')
    this.name = 'AnnouncementNotFoundError'
  }
}

export class AnnouncementContentInvalidError extends FormFieldError<'contentJson'> {
  constructor() {
    super('正文格式无效', 'contentJson')
  }
}

export class AnnouncementVisibilityTargetRequiredError extends FormFieldError<'targets'> {
  constructor() {
    super('请选择可见对象', 'targets')
  }
}

export class AnnouncementInvalidTargetError extends FormFieldError<'targets'> {
  constructor() {
    super('可见对象无效', 'targets')
  }
}

export class AnnouncementDraftArchiveError extends Error {
  constructor() {
    super('草稿通知公告不能下线')
    this.name = 'AnnouncementDraftArchiveError'
  }
}
