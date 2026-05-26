export class MyAnnouncementNotFoundError extends Error {
  constructor() {
    super('通知公告不存在')
    this.name = 'MyAnnouncementNotFoundError'
  }
}
