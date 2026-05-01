// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { useForm, type AnyFieldMetaBase, type DeepKeys, type Updater } from '@tanstack/vue-form'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
  fieldFeedback,
  loginDefaultValues,
  registerDefaultValues,
  setServerFieldError,
} from './forms'

describe('auth form helpers', () => {
  const fieldMetaBase: AnyFieldMetaBase = {
    isTouched: false,
    isBlurred: false,
    isDirty: false,
    isValidating: false,
    errorMap: {},
    errorSourceMap: {},
  }

  it('provides empty login and register defaults', () => {
    expect(loginDefaultValues).toEqual({
      username: '',
      password: '',
    })
    expect(registerDefaultValues).toEqual({
      username: '',
      nickname: '',
      password: '',
      confirmPassword: '',
      email: '',
      phone: '',
    })
  })

  it('returns the first displayable field error', () => {
    expect(fieldFeedback(['Required', 'Too short'])).toBe('Required')
    expect(fieldFeedback([])).toBeUndefined()
  })

  it('sets a server field error through TanStack Form metadata', () => {
    const calls: unknown[] = []
    const form = {
      setFieldMeta: <TField extends DeepKeys<typeof registerDefaultValues>>(
        field: TField,
        updater: Updater<AnyFieldMetaBase>,
      ) => {
        const nextMeta = typeof updater === 'function' ? updater(fieldMetaBase) : updater
        calls.push([field, nextMeta])
      },
    }

    setServerFieldError(form, 'username', 'username already exists')

    expect(calls).toEqual([
      [
        'username',
        {
          ...fieldMetaBase,
          errorMap: {
            onServer: 'username already exists',
          },
        },
      ],
    ])
  })

  it('sets a server field error on a real TanStack Form instance', () => {
    let serverError: unknown
    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm({
            defaultValues: registerDefaultValues,
          })

          setServerFieldError(form, 'username', 'username already exists')
          serverError = form.getFieldMeta('username')?.errorMap.onServer

          return () => null
        },
      }),
    )

    expect(serverError).toBe('username already exists')
    wrapper.unmount()
  })
})
