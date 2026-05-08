<script setup lang="ts">
import { NButton } from 'naive-ui'

defineProps<{
  username: string
  temporaryPassword: string
}>()

const show = defineModel<boolean>('show', { required: true })

async function copyTemporaryPassword(temporaryPassword: string) {
  await navigator.clipboard.writeText(temporaryPassword)
}
</script>

<template>
  <div
    v-if="show"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900"
      data-test="temporary-password-dialog"
    >
      <div class="space-y-4">
        <div>
          <h2 class="text-lg font-semibold">临时密码</h2>
          <p class="mt-2 text-sm text-stone-600 dark:text-zinc-300">
            用户 {{ username }} 的临时密码只会显示一次。
          </p>
        </div>

        <div class="flex items-center gap-3">
          <input
            data-test="temporary-password"
            :value="temporaryPassword"
            readonly
            class="min-w-0 flex-1 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 font-mono text-sm text-stone-900 outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
          <NButton @click="copyTemporaryPassword(temporaryPassword)">复制</NButton>
        </div>

        <div class="flex justify-end">
          <NButton data-test="temporary-password-close" @click="show = false">关闭</NButton>
        </div>
      </div>
    </div>
  </div>
</template>
