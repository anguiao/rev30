// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { useForm } from '@tanstack/vue-form'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
  fieldFeedback,
  loginDefaultValues,
  registerDefaultValues,
  setServerFieldError,
} from '../../src/auth/forms'

describe('auth form helpers', () => {
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
