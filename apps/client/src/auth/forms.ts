import type { AnyFieldMetaBase, DeepKeys, Updater } from '@tanstack/vue-form'

export const loginDefaultValues = {
  username: '',
  password: '',
}

export const registerDefaultValues = {
  username: '',
  nickname: '',
  password: '',
  confirmPassword: '',
  email: '',
  phone: '',
}

export function fieldFeedback(errors: unknown[]) {
  const [firstError] = errors

  return firstError === undefined ? undefined : String(firstError)
}

const defaultFieldMetaBase: AnyFieldMetaBase = {
  isTouched: false,
  isBlurred: false,
  isDirty: false,
  isValidating: false,
  errorMap: {},
  errorSourceMap: {},
}

type ServerErrorForm<TFormData, TField extends DeepKeys<TFormData>> = {
  setFieldMeta: (field: TField, updater: Updater<AnyFieldMetaBase>) => void
}

export function setServerFieldError<TFormData, TField extends DeepKeys<TFormData>>(
  form: ServerErrorForm<TFormData, TField>,
  field: TField,
  message: string,
) {
  form.setFieldMeta(field, (meta: AnyFieldMetaBase | undefined) => {
    const nextMeta = meta ?? defaultFieldMetaBase

    return {
      ...nextMeta,
      errorMap: {
        ...nextMeta.errorMap,
        onServer: message,
      },
    }
  })
}
