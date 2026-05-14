import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authLoginSchema, type AuthLoginInput } from '@rev30/shared'
import { AuthRequestError, login } from './requests'
import { resolveRedirectTarget } from '../../router/redirect'
import { useAuthStore } from '../../stores/auth'

export function useLoginForm() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()

  const formError = ref<string | null>(null)

  const { isLoading: isSubmitting, ...loginMutation } = useMutation({
    mutation: (input: AuthLoginInput) => login(input),
  })

  const form = useForm({
    defaultValues: {
      username: '',
      password: '',
    } as AuthLoginInput,
    validators: {
      onChange: authLoginSchema,
      onSubmit: authLoginSchema,
    },
    async onSubmit({ value }) {
      formError.value = null

      try {
        const input = authLoginSchema.parse(value)
        const session = await loginMutation.mutateAsync(input)
        auth.setSession(session)
        await router.push(resolveRedirectTarget(route.query.redirect))
      } catch (error) {
        formError.value =
          error instanceof AuthRequestError && error.status === 401
            ? '用户名或密码错误'
            : error instanceof AuthRequestError && error.status === 429
              ? error.message
            : '登录失败，请稍后再试'
      }
    },
  })

  return {
    form,
    formError,
    isSubmitting,
  }
}
