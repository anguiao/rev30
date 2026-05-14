<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { AuthShell, useLoginForm } from '../features/auth'
import { formItemValidationProps } from '../utils/form'

const { form, formError, isSubmitting } = useLoginForm()
</script>

<template>
  <AuthShell>
    <div class="mb-8">
      <h1 class="text-2xl font-medium tracking-tight text-stone-900 dark:text-zinc-100">登录</h1>
      <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">请输入您的账号密码</p>
    </div>

    <NAlert v-if="formError" class="mb-6" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="flex flex-col gap-4" @submit.prevent="form.handleSubmit()">
      <form.Field name="username" v-slot="{ field, state }">
        <NFormItem label="用户名" v-bind="formItemValidationProps(state.meta)">
          <NInput
            data-test="login-username"
            :value="state.value"
            autocomplete="username"
            placeholder="请输入用户名"
            size="large"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <form.Field name="password" v-slot="{ field, state }">
        <NFormItem label="密码" v-bind="formItemValidationProps(state.meta)">
          <NInput
            data-test="login-password"
            :value="state.value"
            type="password"
            show-password-on="click"
            autocomplete="current-password"
            placeholder="请输入密码"
            size="large"
            @blur="field.handleBlur"
            @update:value="field.handleChange"
          />
        </NFormItem>
      </form.Field>

      <div class="pt-2">
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
      </div>
    </NForm>

    <p class="mt-8 text-center text-sm text-stone-500 dark:text-zinc-500">
      如需注册账号，请联系管理员。
    </p>
  </AuthShell>
</template>
