import { describe, expect, it } from 'vitest'
import { useForm, type AnyFieldMeta } from '@tanstack/vue-form'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { z } from 'zod'
import { NFormItem, NInput } from 'naive-ui'
import {
  formItemValidationProps,
  setServerFieldError,
  type FieldValidationMeta,
} from '../../src/utils/form'

function createFieldMeta(overrides: Partial<FieldValidationMeta> = {}): FieldValidationMeta {
  return {
    isTouched: false,
    isBlurred: false,
    errors: [],
    errorMap: {},
    ...overrides,
  }
}

function getFormItemFeedback(wrapper: VueWrapper, label: string) {
  const formItem = wrapper
    .findAllComponents(NFormItem)
    .find((componentWrapper) => componentWrapper.props('label') === label)

  expect(formItem).toBeDefined()

  return formItem!.props('feedback')
}

type FieldSlotProps = {
  field: {
    handleBlur: () => void
    handleChange: (value: string) => void
  }
  state: {
    value: string
    meta: AnyFieldMeta
  }
}

describe('form helpers', () => {
  it('maps touched or blurred field errors to Naive UI form item props', () => {
    expect(
      formItemValidationProps(createFieldMeta({ errors: ['Required'], isTouched: true })),
    ).toEqual({
      feedback: 'Required',
      validationStatus: 'error',
    })
    expect(
      formItemValidationProps(
        createFieldMeta({ errors: [{ message: 'Too short' }], isBlurred: true }),
      ),
    ).toEqual({
      feedback: 'Too short',
      validationStatus: 'error',
    })
  })

  it('hides client field errors before the field is touched or blurred', () => {
    expect(formItemValidationProps(createFieldMeta({ errors: ['Required', 'Too short'] }))).toEqual(
      {},
    )
  })

  it('shows server field errors before the field is touched or blurred', () => {
    expect(
      formItemValidationProps(
        createFieldMeta({ errorMap: { onServer: 'username already exists' } }),
      ),
    ).toEqual({
      feedback: 'username already exists',
      validationStatus: 'error',
    })
  })

  it('maps the first flattened client field error', () => {
    expect(
      formItemValidationProps(
        createFieldMeta({
          errors: [[undefined, 'Required'], 'Too short'],
          isTouched: true,
        }),
      ),
    ).toEqual({
      feedback: 'Required',
      validationStatus: 'error',
    })
  })

  it('hides unsupported client field error shapes', () => {
    expect(
      formItemValidationProps(
        createFieldMeta({ errors: [{ reason: 'Required' }], isTouched: true }),
      ),
    ).toEqual({})
    expect(
      formItemValidationProps(createFieldMeta({ errors: [{ message: 123 }], isTouched: true })),
    ).toEqual({})
  })

  it('shows on-change feedback only after a field is touched', async () => {
    const schema = z.object({
      username: z.string().trim().min(1, '请输入用户名'),
      password: z.string().min(8, '密码至少需要 8 位'),
    })
    const wrapper = mount(
      defineComponent({
        setup() {
          const form = useForm({
            defaultValues: {
              username: '',
              password: '',
            },
            validators: {
              onChange: schema,
              onSubmit: schema,
            },
          })

          function renderField(name: 'username' | 'password', label: string) {
            return h(
              form.Field,
              { name },
              {
                default: ({ field, state }: FieldSlotProps) =>
                  h(
                    NFormItem,
                    {
                      label,
                      ...formItemValidationProps(state.meta),
                    },
                    {
                      default: () =>
                        h(NInput, {
                          'data-test': name,
                          value: state.value,
                          onBlur: field.handleBlur,
                          'onUpdate:value': field.handleChange,
                        }),
                    },
                  ),
              },
            )
          }

          return () =>
            h(
              'form',
              {
                onSubmit: (event: Event) => {
                  event.preventDefault()
                  void form.handleSubmit()
                },
              },
              [renderField('username', '用户名'), renderField('password', '密码')],
            )
        },
      }),
    )

    await wrapper.find('[data-test="password"] input').setValue('short')
    await flushPromises()

    expect(getFormItemFeedback(wrapper, '密码')).toBe('密码至少需要 8 位')
    expect(getFormItemFeedback(wrapper, '用户名')).toBeUndefined()

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(getFormItemFeedback(wrapper, '用户名')).toBe('请输入用户名')
    wrapper.unmount()
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
