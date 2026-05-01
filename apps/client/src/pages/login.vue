<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authLoginSchema, type AuthLoginInput } from '@rev30/shared'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AuthShell from '../components/AuthShell.vue'
import { fieldFeedback, loginDefaultValues } from '../auth/forms'
import { AuthRequestError, login } from '../auth/requests'
import { useAuthStore } from '../stores/auth'

type LoginField = keyof AuthLoginInput

const router = useRouter()
const auth = useAuthStore()
const formError = ref<string | null>(null)

const loginMutation = useMutation({
  mutation: (input: AuthLoginInput) => login(input),
})

const form = useForm({
  defaultValues: loginDefaultValues,
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

function fieldMessage(name: LoginField, errors: unknown[]) {
  const firstMessage = fieldFeedback(errors.map(formatValidationError))

  if (firstMessage === undefined) {
    return undefined
  }

  return name === 'username' ? '请输入用户名' : '密码至少需要 8 位'
}

function formItemProps(name: LoginField, errors: unknown[]) {
  const feedback = fieldMessage(name, errors)

  return feedback === undefined ? {} : { feedback, validationStatus: 'error' as const }
}

function formatValidationError(error: unknown) {
  return typeof error === 'object' && error !== null && 'message' in error
    ? (error as { message: unknown }).message
    : error
}
</script>

<template>
  <AuthShell>
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-normal text-slate-950">登录 Rev30</h1>
      <p class="mt-3 text-sm leading-6 text-slate-500">使用你的账号进入工作台。</p>
    </div>

    <NAlert v-if="formError" class="mb-5" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="grid gap-1" @submit.prevent="form.handleSubmit()">
      <form.Field name="username" v-slot="{ field, state }">
        <NFormItem
          label="用户名"
          v-bind="formItemProps('username', state.meta.errors)"
        >
          <NInput
            data-test="login-username"
            :value="state.value"
            autocomplete="username"
            placeholder="请输入用户名"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="password" v-slot="{ field, state }">
        <NFormItem
          label="密码"
          v-bind="formItemProps('password', state.meta.errors)"
        >
          <NInput
            data-test="login-password"
            :value="state.value"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
            placeholder="请输入密码"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <NButton
        data-test="login-submit"
        type="primary"
        size="large"
        attr-type="submit"
        block
        :loading="isSubmitting"
      >
        登录
      </NButton>
    </NForm>

    <p class="mt-6 text-center text-sm text-slate-500">
      还没有账号？
      <RouterLink class="font-medium text-slate-950 underline-offset-4 hover:underline" to="/register">
        注册
      </RouterLink>
    </p>
  </AuthShell>
</template>
