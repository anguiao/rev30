<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { AuthShell, formItemValidationProps, useLoginForm } from '../features/auth'

const { form, formError, isSubmitting } = useLoginForm()
</script>

<template>
  <AuthShell>
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-normal text-slate-950 dark:text-slate-100">
        登录 Rev30
      </h1>
      <p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
        使用你的账号进入工作台。
      </p>
    </div>

    <NAlert v-if="formError" class="mb-5" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="grid" @submit.prevent="form.handleSubmit()">
      <form.Field name="username" v-slot="{ field, state }">
        <NFormItem label="用户名" v-bind="formItemValidationProps(state.meta.errors)">
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
        <NFormItem label="密码" v-bind="formItemValidationProps(state.meta.errors)">
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

    <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
      还没有账号？
      <RouterLink
        class="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-slate-100"
        to="/register"
      >
        注册
      </RouterLink>
    </p>
  </AuthShell>
</template>
