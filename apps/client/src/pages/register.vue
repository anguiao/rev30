<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { AuthShell, formItemValidationProps, useRegisterForm } from '../features/auth'

const { form, formError, isSubmitting } = useRegisterForm()
</script>

<template>
  <AuthShell>
    <div class="mb-8">
      <h1 class="text-2xl font-medium tracking-tight text-stone-900 dark:text-zinc-100">注册</h1>
      <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">注册账号即可使用</p>
    </div>

    <NAlert v-if="formError" class="mb-6" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="flex flex-col gap-2" @submit.prevent="form.handleSubmit()">
      <div class="grid grid-cols-1 gap-x-4 md:grid-cols-2">
        <form.Field name="username" v-slot="{ field, state }">
          <NFormItem
            label="用户名"
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
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
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
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
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
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
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
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
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
          >
            <NInput
              data-test="register-email"
              :value="state.value ?? ''"
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
            v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
          >
            <NInput
              data-test="register-phone"
              :value="state.value ?? ''"
              autocomplete="tel"
              placeholder="可选"
              @blur="field.handleBlur"
              @update:value="field.handleChange"
            />
          </NFormItem>
        </form.Field>
      </div>

      <div class="pt-4">
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
      </div>
    </NForm>

    <div
      class="mt-8 flex items-center justify-center gap-2 text-sm text-stone-500 dark:text-zinc-500"
    >
      <span>已有账号？</span>
      <RouterLink
        class="font-medium text-stone-900 transition-colors hover:text-stone-600 dark:text-primary dark:hover:text-primary-hover"
        to="/login"
      >
        登录
      </RouterLink>
    </div>
  </AuthShell>
</template>
