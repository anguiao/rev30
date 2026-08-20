export class OperationLogNotFoundError extends Error {
  constructor() {
    super('操作日志不存在')
    this.name = 'OperationLogNotFoundError'
  }
}
