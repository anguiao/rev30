import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'
import { authRegisterSchema, type AuthRegisterInput } from '@rev30/shared'
import { setServerFieldError } from './form'
import { AuthRequestError, register } from './requests'
import { useAuthStore } from '../../stores/auth'

const authRegisterFormSchema = authRegisterSchema
  .extend({
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  })
type RegisterFormData = z.input<typeof authRegisterFormSchema>

function toRegisterInput(value: RegisterFormData): AuthRegisterInput {
  const { confirmPassword: _confirmPassword, ...input } = authRegisterFormSchema.parse(value)

  return input
}

export function useRegisterForm() {
  const router = useRouter()
  const auth = useAuthStore()
  const formError = ref<string | null>(null)

  const registerMutation = useMutation({
    mutation: (input: AuthRegisterInput) => register(input),
  })

  const form = useForm({
    defaultValues: {
      username: '',
      nickname: '',
      password: '',
      confirmPassword: '',
      email: '',
      phone: '',
    } as RegisterFormData,
    validators: {
      onSubmit: authRegisterFormSchema,
    },
    async onSubmit({ value }) {
      formError.value = null

      try {
        const input = toRegisterInput(value)
        const session = await registerMutation.mutateAsync(input)
        auth.setSession(session)
        await router.push('/')
      } catch (error) {
        if (error instanceof AuthRequestError && error.field !== undefined) {
          setServerFieldError(form, error.field, error.message)
          return
        }

        formError.value =
          error instanceof AuthRequestError && error.status === 409
            ? '注册信息已被占用'
            : '注册失败，请稍后再试'
      }
    },
  })

  const isSubmitting = computed(() => registerMutation.isLoading.value)

  return {
    form,
    formError,
    isSubmitting,
  }
}
