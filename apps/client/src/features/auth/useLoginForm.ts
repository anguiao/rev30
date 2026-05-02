import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authLoginSchema } from '@rev30/shared'
import { AuthRequestError, login } from './requests'
import { useAuthStore } from '../../stores/auth'
import type { z } from 'zod'

type LoginInput = z.input<typeof authLoginSchema>

export function useLoginForm() {
  const router = useRouter()
  const auth = useAuthStore()
  const formError = ref<string | null>(null)

  const loginMutation = useMutation({
    mutation: (input: LoginInput) => login(input),
  })

  const form = useForm({
    defaultValues: {
      username: '',
      password: '',
    } as LoginInput,
    validators: {
      onSubmit: authLoginSchema,
    },
    async onSubmit({ value }) {
      formError.value = null

      try {
        const session = await loginMutation.mutateAsync(value)
        auth.setSession(session)
        await router.push('/')
      } catch (error) {
        formError.value =
          error instanceof AuthRequestError && error.status === 401
            ? '用户名或密码错误'
            : '登录失败，请稍后再试'
      }
    },
  })

  const isSubmitting = computed(() => loginMutation.isLoading.value)

  return {
    form,
    formError,
    isSubmitting,
  }
}
