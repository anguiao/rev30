<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { authRegisterSchema, type AuthRegisterInput } from '@rev30/shared'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import AuthShell from '../components/AuthShell.vue'
import { fieldFeedback, registerDefaultValues, setServerFieldError } from '../auth/forms'
import { AuthRequestError, register } from '../auth/requests'
import { useAuthStore } from '../stores/auth'

type RegisterFormValues = typeof registerDefaultValues
type RegisterField = keyof typeof registerDefaultValues

const router = useRouter()
const auth = useAuthStore()
const formError = ref<string | null>(null)

const registerMutation = useMutation({
  mutation: (input: AuthRegisterInput) => register(input),
})

const form = useForm({
  defaultValues: registerDefaultValues,
  validators: {
    onSubmit: ({ value }) => {
      const result = authRegisterSchema.safeParse(toRegisterInput(value))
      const fields: Record<string, string> = {}

      if (!result.success) {
        Object.assign(
          fields,
          Object.fromEntries(
            result.error.issues
              .filter((issue) => issue.path.length > 0)
              .map((issue) => [issue.path.join('.'), issue.message]),
          ),
        )
      }

      if (value.password !== value.confirmPassword) {
        fields.confirmPassword = 'Password confirmation does not match'
      }

      return Object.keys(fields).length === 0 ? undefined : { fields }
    },
  },
  async onSubmit({ value }) {
    formError.value = null

    try {
      const input = authRegisterSchema.parse(toRegisterInput(value))
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

const validationMessages: Record<RegisterField, string> = {
  username: '请输入用户名',
  nickname: '请输入昵称',
  password: '密码至少需要 8 位',
  confirmPassword: '两次输入的密码不一致',
  email: '请输入邮箱',
  phone: '请输入手机号',
}

function toRegisterInput(value: RegisterFormValues) {
  const { confirmPassword: _confirmPassword, ...input } = value

  return input
}

function fieldMessage(name: RegisterField, errors: unknown[], serverError: unknown) {
  if (typeof serverError === 'string') {
    return serverError
  }

  const firstMessage = fieldFeedback(errors.map(formatValidationError))

  return firstMessage === undefined ? undefined : validationMessages[name]
}

function formItemProps(name: RegisterField, errors: unknown[], serverError: unknown) {
  const feedback = fieldMessage(name, errors, serverError)

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
      <h1 class="text-3xl font-semibold tracking-normal text-slate-950">注册 Rev30</h1>
      <p class="mt-3 text-sm leading-6 text-slate-500">创建账号后直接进入工作台。</p>
    </div>

    <NAlert v-if="formError" class="mb-5" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="grid gap-1" @submit.prevent="form.handleSubmit()">
      <form.Field name="username" v-slot="{ field, state }">
        <NFormItem
          label="用户名"
          v-bind="formItemProps('username', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-username"
            :value="state.value"
            autocomplete="username"
            placeholder="请输入用户名"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="nickname" v-slot="{ field, state }">
        <NFormItem
          label="昵称"
          v-bind="formItemProps('nickname', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-nickname"
            :value="state.value"
            autocomplete="name"
            placeholder="请输入昵称"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="password" v-slot="{ field, state }">
        <NFormItem
          label="密码"
          v-bind="formItemProps('password', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-password"
            :value="state.value"
            type="password"
            show-password-on="click"
            autocomplete="new-password"
            placeholder="至少 8 位"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="confirmPassword" v-slot="{ field, state }">
        <NFormItem
          label="确认密码"
          v-bind="formItemProps('confirmPassword', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-confirm-password"
            :value="state.value"
            type="password"
            show-password-on="click"
            autocomplete="new-password"
            placeholder="请再次输入密码"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="email" v-slot="{ field, state }">
        <NFormItem
          label="邮箱"
          v-bind="formItemProps('email', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-email"
            :value="state.value"
            autocomplete="email"
            placeholder="可选"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="phone" v-slot="{ field, state }">
        <NFormItem
          label="手机号"
          v-bind="formItemProps('phone', state.meta.errors, state.meta.errorMap.onServer)"
        >
          <NInput
            data-test="register-phone"
            :value="state.value"
            autocomplete="tel"
            placeholder="可选"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <NButton
        data-test="register-submit"
        type="primary"
        size="large"
        attr-type="submit"
        block
        :loading="isSubmitting"
      >
        注册
      </NButton>
    </NForm>

    <p class="mt-6 text-center text-sm text-slate-500">
      已有账号？
      <RouterLink class="font-medium text-slate-950 underline-offset-4 hover:underline" to="/login">
        登录
      </RouterLink>
    </p>
  </AuthShell>
</template>
