import type { AnyFieldMeta, AnyFormApi } from '@tanstack/vue-form'

export type FieldValidationMeta = Pick<
  AnyFieldMeta,
  'isTouched' | 'isBlurred' | 'errors' | 'errorMap'
>

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
    const message = (error as { message: unknown }).message

    return typeof message === 'string' ? message : undefined
  }

  return undefined
}

export function formItemValidationFeedback(meta: FieldValidationMeta) {
  const firstError =
    meta.isTouched || meta.isBlurred
      ? flattenValidationErrors(meta.errors).find((error) => error !== undefined)
      : undefined

  return typeof meta.errorMap.onServer === 'string'
    ? meta.errorMap.onServer
    : validationErrorMessage(firstError)
}

export function formItemValidationProps(meta: FieldValidationMeta) {
  const validationFeedback = formItemValidationFeedback(meta)

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
