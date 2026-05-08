import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'
import { authRegisterSchema, type AuthRegisterInput } from '@rev30/shared'
import { AuthRequestError, register } from './requests'
import { useAuthStore } from '../../stores/auth'
import { setServerFieldError } from '../../utils/form'

const authRegisterFormSchema = authRegisterSchema
  .safeExtend({
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  })
type RegisterFormData = z.input<typeof authRegisterFormSchema>
const registerServerErrorFields = [
  'username',
  'nickname',
  'password',
  'confirmPassword',
  'email',
  'phone',
] as const
type RegisterServerErrorField = (typeof registerServerErrorFields)[number]

function toRegisterInput(value: RegisterFormData): AuthRegisterInput {
  const { confirmPassword: _confirmPassword, ...input } = authRegisterFormSchema.parse(value)

  return input
}

function isRegisterServerErrorField(field: string): field is RegisterServerErrorField {
  return registerServerErrorFields.includes(field as RegisterServerErrorField)
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
        if (
          error instanceof AuthRequestError &&
          error.field !== undefined &&
          isRegisterServerErrorField(error.field)
        ) {
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
