import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { useDialog } from 'naive-ui'
import { authLoginSchema, type AuthLoginInput } from '@rev30/contracts'
import { login } from './requests'
import { resolveRedirectTarget } from '../../router/redirect'
import { useAuthStore } from '../../stores/auth'
import { getErrorMessage } from '../../utils/error'

export function useLoginForm() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const dialog = useDialog()

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

        if (session.mustChangePassword) {
          dialog.warning({
            title: '建议修改密码',
            content: '当前使用临时密码，建议及时修改。',
            positiveText: '去修改',
            negativeText: '稍后',
            onPositiveClick: async () => {
              await router.push('/account/settings')
            },
          })
        }
      } catch (error) {
        formError.value = getErrorMessage(error, '登录失败，请稍后再试')
      }
    },
  })

  return {
    form,
    formError,
    isSubmitting,
  }
}
