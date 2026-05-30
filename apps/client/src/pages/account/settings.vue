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
} from '@rev30/contracts'
import { NAlert, NButton, NForm, NFormItem, NInput, useMessage } from 'naive-ui'
import { omit, pick } from 'lodash-es'
import {
  AuthRequestError,
  getAuthErrorMessage,
  updateMyPassword,
  updateMyProfile,
} from '../../features/auth'
import { UserAvatarUpload } from '../../features/users'
import AdminLayout from '../../components/admin/AdminLayout.vue'
import { useAuthStore } from '../../stores/auth'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const authPasswordUpdateFormSchema = authPasswordUpdateSchema
  .safeExtend({
    confirmPassword: z.string(),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ['confirmPassword'],
    message: '两次输入的密码不一致',
  })
type AuthPasswordUpdateFormInput = z.input<typeof authPasswordUpdateFormSchema>

const message = useMessage()

const auth = useAuthStore()
const currentUser = computed(() => auth.user!)

const profileFormError = ref<string | null>(null)

const { isLoading: isProfileSubmitting, ...profileMutation } = useMutation({
  mutation: (input: AuthProfileUpdateInput) => updateMyProfile(input),
})

const profileForm = useForm({
  defaultValues: pick(currentUser.value, [
    'nickname',
    'avatarId',
    'email',
    'phone',
  ]) as AuthProfileUpdateInput,
  validators: {
    onChange: authProfileUpdateSchema,
    onSubmit: authProfileUpdateSchema,
  },
  async onSubmit({ value }) {
    profileFormError.value = null

    try {
      const input = authProfileUpdateSchema.parse(value)
      const user = await profileMutation.mutateAsync(input)
      auth.setUser(user)

      profileForm.reset(pick(user, ['nickname', 'avatarId', 'email', 'phone']))
      message.success('保存个人信息成功')
    } catch (error) {
      if (
        error instanceof AuthRequestError &&
        setServerFieldError(profileForm, error.field, error.message)
      ) {
        return
      }

      profileFormError.value = getAuthErrorMessage(error, '保存个人信息失败')
    }
  },
})

function handleAvatarUploadError(error: unknown) {
  profileFormError.value = getAuthErrorMessage(error, '上传头像失败')
}

function handleAvatarUploaded(avatarId: string, handleChange: (value: string | null) => void) {
  profileFormError.value = null
  handleChange(avatarId)
}

const passwordFormError = ref<string | null>(null)

const { isLoading: isPasswordSubmitting, ...passwordMutation } = useMutation({
  mutation: (input: AuthPasswordUpdateInput) => updateMyPassword(input),
})

const passwordForm = useForm({
  defaultValues: {
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  } as AuthPasswordUpdateFormInput,
  validators: {
    onChange: authPasswordUpdateFormSchema,
    onSubmit: authPasswordUpdateFormSchema,
  },
  async onSubmit({ value }) {
    passwordFormError.value = null

    try {
      const input = omit(authPasswordUpdateFormSchema.parse(value), 'confirmPassword')
      await passwordMutation.mutateAsync(input)

      passwordForm.reset()
      message.success('修改密码成功')
    } catch (error) {
      if (
        error instanceof AuthRequestError &&
        error.status === 400 &&
        setServerFieldError(passwordForm, error.field, error.message)
      ) {
        return
      }

      passwordFormError.value = getAuthErrorMessage(error, '修改密码失败')
    }
  },
})
</script>

<template>
  <AdminLayout>
    <div class="mx-auto w-full max-w-5xl space-y-5">
      <header>
        <h1 class="text-xl font-semibold text-stone-900 dark:text-zinc-100">个人设置</h1>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">管理个人信息和登录密码</p>
      </header>

      <section
        class="rounded-ui border border-stone-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div class="grid grid-cols-1 xl:grid-cols-2">
          <div class="pb-8 xl:pr-8 xl:pb-0">
            <div class="mb-6">
              <h2 class="text-lg font-medium text-stone-900 dark:text-zinc-100">个人信息</h2>
              <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">更新昵称、邮箱和手机号</p>
            </div>

            <NAlert v-if="profileFormError" class="mb-4" type="error" :show-icon="false">
              {{ profileFormError }}
            </NAlert>

            <NForm data-test="account-profile-form" @submit.prevent="profileForm.handleSubmit()">
              <div class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                <div class="space-y-0">
                  <NFormItem label="用户名">
                    <NInput
                      data-test="account-profile-username"
                      :value="currentUser.username"
                      autocomplete="username"
                      disabled
                    />
                  </NFormItem>

                  <profileForm.Field name="nickname" v-slot="{ field, state }">
                    <NFormItem label="昵称" v-bind="formItemValidationProps(state.meta)">
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
                </div>

                <profileForm.Field name="avatarId" v-slot="{ field, state }">
                  <div class="flex justify-start pt-2 md:justify-end">
                    <UserAvatarUpload
                      data-test="account-avatar-upload"
                      :avatar-id="state.value ?? null"
                      :nickname="profileForm.state.values.nickname"
                      :username="currentUser.username"
                      :size="80"
                      @uploaded="(avatarId) => handleAvatarUploaded(avatarId, field.handleChange)"
                      @error="handleAvatarUploadError"
                    />
                  </div>
                </profileForm.Field>
              </div>

              <profileForm.Field name="email" v-slot="{ field, state }">
                <NFormItem label="邮箱" v-bind="formItemValidationProps(state.meta)">
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
                <NFormItem label="手机号" v-bind="formItemValidationProps(state.meta)">
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
                  保存信息
                </NButton>
              </div>
            </NForm>
          </div>

          <div
            class="border-t border-stone-200 pt-8 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-8 dark:border-zinc-800"
          >
            <div class="mb-6">
              <h2 class="text-lg font-medium text-stone-900 dark:text-zinc-100">修改密码</h2>
              <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
                修改后当前设备保持登录，其他设备需使用新密码重新登录
              </p>
            </div>

            <NAlert v-if="passwordFormError" class="mb-4" type="error" :show-icon="false">
              {{ passwordFormError }}
            </NAlert>

            <NForm data-test="account-password-form" @submit.prevent="passwordForm.handleSubmit()">
              <passwordForm.Field name="currentPassword" v-slot="{ field, state }">
                <NFormItem label="当前密码" v-bind="formItemValidationProps(state.meta)">
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
                <NFormItem label="新密码" v-bind="formItemValidationProps(state.meta)">
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
                <NFormItem label="确认新密码" v-bind="formItemValidationProps(state.meta)">
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
          </div>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>
