import { FormFieldError } from '../../../core/errors'

export class ConfigInvalidValueError extends FormFieldError<'customValue'> {
  constructor(message: string) {
    super(message, 'customValue')
  }
}

export class ConfigNotFoundError extends Error {
  constructor() {
    super('配置不存在')
    this.name = 'ConfigNotFoundError'
  }
}
