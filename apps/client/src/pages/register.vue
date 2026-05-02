<script setup lang="ts">
import { NAlert, NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { AuthShell, formItemValidationProps, useRegisterForm } from '../features/auth'

const { form, formError, isSubmitting } = useRegisterForm()
</script>

<template>
  <AuthShell>
    <div class="mb-8">
      <h1 class="text-3xl font-semibold tracking-normal text-slate-950 dark:text-slate-100">
        注册 Rev30
      </h1>
      <p class="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
        创建账号后直接进入工作台。
      </p>
    </div>

    <NAlert v-if="formError" class="mb-5" type="error" :show-icon="false">
      {{ formError }}
    </NAlert>

    <NForm class="grid" @submit.prevent="form.handleSubmit()">
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

    <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
      已有账号？
      <RouterLink
        class="font-medium text-slate-950 underline-offset-4 hover:underline dark:text-slate-100"
        to="/login"
      >
        登录
      </RouterLink>
    </p>
  </AuthShell>
</template>
