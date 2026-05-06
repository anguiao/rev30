<script setup lang="ts">
import { NResult } from 'naive-ui'

type ErrorPageStatus = '403' | '404' | '500'

defineProps<{
  status: ErrorPageStatus
  title: string
  description: string
}>()
</script>

<template>
  <main
    class="flex min-h-screen items-center justify-center bg-stone-50 px-6 py-12 text-stone-900 dark:bg-zinc-950 dark:text-zinc-100"
  >
    <NResult
      class="max-w-xl"
      :status="status"
      :title="title"
      :description="description"
      size="large"
    >
      <template v-if="$slots.footer" #footer>
        <slot name="footer" />
      </template>
    </NResult>
  </main>
</template>
