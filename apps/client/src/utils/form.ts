import type { AnyFormApi } from '@tanstack/vue-form'

function flattenValidationErrors(errors: unknown[]): unknown[] {
  return errors.flatMap((error) =>
    Array.isArray(error) ? flattenValidationErrors(error) : [error],
  )
}

function validationErrorMessage(error: unknown) {
  if (typeof error === 'string') {
    return error
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }

  return error === undefined ? undefined : String(error)
}

export function formItemValidationProps(errors: unknown[], serverError?: unknown) {
  const firstError = flattenValidationErrors(errors).find((error) => error !== undefined)
  const validationFeedback =
    typeof serverError === 'string' ? serverError : validationErrorMessage(firstError)

  return validationFeedback === undefined
    ? {}
    : { feedback: validationFeedback, validationStatus: 'error' as const }
}

export function setServerFieldError<TForm extends AnyFormApi>(
  form: TForm,
  field: string | undefined,
  message: string,
) {
  if (field === undefined || !Object.hasOwn(form.state.values, field)) {
    return false
  }

  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: {
      ...meta.errorMap,
      onServer: message,
    },
    errorSourceMap: {
      ...meta.errorSourceMap,
      onServer: 'form',
    },
  }))

  return true
}
