<script setup lang="ts">
import { computed, ref } from 'vue'
import { useMutation } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'
import {
  authPasswordUpdateSchema,
  authProfileUpdateSchema,
  type AuthPasswordUpdateInput,
  type AuthProfileUpdateInput,
  type User,
} from '@rev30/shared'
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import {
  AuthRequestError,
  getAuthErrorMessage,
  updateMyPassword,
  updateMyProfile,
} from '../../features/auth'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useAuthStore } from '../../stores/auth'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const passwordFormSchema = authPasswordUpdateSchema
  .safeExtend({
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  })

type ProfileFormData = z.input<typeof authProfileUpdateSchema>
type PasswordFormData = z.input<typeof passwordFormSchema>

const auth = useAuthStore()

const currentUser = computed(() => auth.user as User)
const profileFormError = ref<string | null>(null)
const passwordFormError = ref<string | null>(null)

const profileMutation = useMutation({
  mutation: (input: AuthProfileUpdateInput) => updateMyProfile(input),
})

const passwordMutation = useMutation({
  mutation: (input: AuthPasswordUpdateInput) => updateMyPassword(input),
})

function toProfileFormValues(user: User): ProfileFormData {
  return {
    nickname: user.nickname,
    email: user.email,
    phone: user.phone,
  }
}

const profileForm = useForm({
  defaultValues: toProfileFormValues(currentUser.value),
  validators: {
    onSubmit: authProfileUpdateSchema,
  },
  async onSubmit({ value }) {
    profileFormError.value = null

    try {
      const input = authProfileUpdateSchema.parse(value)
      const user = await profileMutation.mutateAsync(input)
      auth.setUser(user)
      profileForm.reset(toProfileFormValues(user))
    } catch (error) {
      if (error instanceof AuthRequestError && error.field !== undefined) {
        setServerFieldError(profileForm, error.field, error.message)
        return
      }

      profileFormError.value = getAuthErrorMessage(error, '保存资料失败')
    }
  },
})

const passwordForm = useForm({
  defaultValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  } as PasswordFormData,
  validators: {
    onSubmit: passwordFormSchema,
  },
  async onSubmit({ value }) {
    passwordFormError.value = null

    try {
      const { confirmPassword: _confirmPassword, ...input } = passwordFormSchema.parse(value)
      await passwordMutation.mutateAsync(input)
      passwordForm.reset()
    } catch (error) {
      if (
        error instanceof AuthRequestError &&
        error.status === 400 &&
        error.field === 'currentPassword'
      ) {
        setServerFieldError(passwordForm, 'currentPassword', error.message)
        return
      }

      passwordFormError.value = getAuthErrorMessage(error, '修改密码失败')
    }
  },
})

const isProfileSubmitting = computed(() => profileMutation.isLoading.value)
const isPasswordSubmitting = computed(() => passwordMutation.isLoading.value)
</script>

<template>
  <AdminLayout>
    <div class="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <section class="rounded-lg border border-stone-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 class="text-2xl font-semibold text-stone-900 dark:text-zinc-100">个人设置</h1>
            <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">
              用户名 {{ currentUser.username }} 不可修改
            </p>
          </div>
          <div class="text-sm text-stone-500 dark:text-zinc-400">
            <p data-test="account-current-nickname" class="font-medium text-stone-900 dark:text-zinc-100">
              {{ currentUser.nickname }}
            </p>
            <p data-test="account-current-username">{{ currentUser.username }}</p>
          </div>
        </div>
      </section>

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section
          class="rounded-lg border border-stone-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div class="mb-6">
            <h2 class="text-lg font-medium text-stone-900 dark:text-zinc-100">基础资料</h2>
            <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
              更新昵称、邮箱和手机号
            </p>
          </div>

          <NAlert v-if="profileFormError" class="mb-4" type="error" :show-icon="false">
            {{ profileFormError }}
          </NAlert>

          <NForm
            data-test="account-profile-form"
            class="flex flex-col gap-2"
            @submit.prevent="profileForm.handleSubmit()"
          >
            <profileForm.Field name="nickname" v-slot="{ field, state }">
              <NFormItem
                label="昵称"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-profile-nickname"
                  :value="state.value"
                  autocomplete="name"
                  placeholder="请输入昵称"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </profileForm.Field>

            <profileForm.Field name="email" v-slot="{ field, state }">
              <NFormItem
                label="邮箱"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-profile-email"
                  :value="state.value ?? ''"
                  autocomplete="email"
                  placeholder="可选"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </profileForm.Field>

            <profileForm.Field name="phone" v-slot="{ field, state }">
              <NFormItem
                label="手机号"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-profile-phone"
                  :value="state.value ?? ''"
                  autocomplete="tel"
                  placeholder="可选"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </profileForm.Field>

            <div class="pt-4">
              <NButton
                data-test="account-profile-submit"
                type="primary"
                attr-type="submit"
                :loading="isProfileSubmitting"
              >
                保存资料
              </NButton>
            </div>
          </NForm>
        </section>

        <section
          class="rounded-lg border border-stone-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
        >
          <div class="mb-6">
            <h2 class="text-lg font-medium text-stone-900 dark:text-zinc-100">修改密码</h2>
            <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
              密码修改后请使用新密码重新登录
            </p>
          </div>

          <NAlert v-if="passwordFormError" class="mb-4" type="error" :show-icon="false">
            {{ passwordFormError }}
          </NAlert>

          <NForm
            data-test="account-password-form"
            class="flex flex-col gap-2"
            @submit.prevent="passwordForm.handleSubmit()"
          >
            <passwordForm.Field name="currentPassword" v-slot="{ field, state }">
              <NFormItem
                label="当前密码"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-password-current"
                  :value="state.value"
                  type="password"
                  show-password-on="click"
                  autocomplete="current-password"
                  placeholder="请输入当前密码"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </passwordForm.Field>

            <passwordForm.Field name="newPassword" v-slot="{ field, state }">
              <NFormItem
                label="新密码"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-password-new"
                  :value="state.value"
                  type="password"
                  show-password-on="click"
                  autocomplete="new-password"
                  placeholder="至少 8 位"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </passwordForm.Field>

            <passwordForm.Field name="confirmPassword" v-slot="{ field, state }">
              <NFormItem
                label="确认新密码"
                v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
              >
                <NInput
                  data-test="account-password-confirm"
                  :value="state.value"
                  type="password"
                  show-password-on="click"
                  autocomplete="new-password"
                  placeholder="请再次输入新密码"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </passwordForm.Field>

            <div class="pt-4">
              <NButton
                data-test="account-password-submit"
                type="primary"
                attr-type="submit"
                :loading="isPasswordSubmitting"
              >
                更新密码
              </NButton>
            </div>
          </NForm>
        </section>
      </div>
    </div>
  </AdminLayout>
</template>
