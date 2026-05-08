// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { useForm } from '@tanstack/vue-form'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { z } from 'zod'
import { formItemValidationProps, setServerFieldError } from '../../src/utils/form'

describe('form helpers', () => {
  it('maps field errors to Naive UI form item props', () => {
    expect(formItemValidationProps(['Required', 'Too short'])).toEqual({
      feedback: 'Required',
      validationStatus: 'error',
    })
    expect(formItemValidationProps([{ message: 'Too short' }])).toEqual({
      feedback: 'Too short',
      validationStatus: 'error',
    })
    expect(formItemValidationProps([], 'username already exists')).toEqual({
      feedback: 'username already exists',
      validationStatus: 'error',
    })
    expect(formItemValidationProps([])).toEqual({})
  })

  it('sets a server field error on a real TanStack Form instance', () => {
    let serverError: unknown
    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm({
            defaultValues: {
              username: '',
              nickname: '',
              password: '',
              confirmPassword: '',
              email: '',
              phone: '',
            },
          })

          form.setFieldValue('username', 'taken')
          setServerFieldError(form, 'username', 'username already exists')
          serverError = form.getFieldMeta('username')?.errorMap.onServer

          return () => null
        },
      }),
    )

    expect(serverError).toBe('username already exists')
    wrapper.unmount()
  })

  it('clears a server field error when the edited field validates again', async () => {
    let serverErrorAfterChange: unknown = 'not-cleared'
    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm({
            defaultValues: {
              username: '',
            },
            validators: {
              onChange: z.object({
                username: z.string().trim().min(1),
              }),
            },
          })

          form.setFieldValue('username', 'taken')
          setServerFieldError(form, 'username', 'username already exists')
          form.setFieldValue('username', 'ada')
          serverErrorAfterChange = form.getFieldMeta('username')?.errorMap.onServer

          return () => null
        },
      }),
    )

    expect(serverErrorAfterChange).toBeUndefined()
    wrapper.unmount()
  })
})
