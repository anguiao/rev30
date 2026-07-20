<script setup lang="ts">
import { NButton, NInput } from 'naive-ui'

const props = withDefaults(
  defineProps<{
    modelValue: string
    invalid?: boolean
    canApply?: boolean
    canOpen?: boolean
    canRemove?: boolean
    autofocus?: boolean
  }>(),
  {
    invalid: false,
    canApply: true,
    canOpen: false,
    canRemove: false,
    autofocus: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  apply: []
  open: []
  remove: []
  cancel: []
}>()

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    emit('apply')
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    emit('cancel')
  }
}
</script>

<template>
  <div class="flex items-center gap-1" role="group" aria-label="编辑链接">
    <NInput
      :value="modelValue"
      data-test="rich-text-link-url"
      size="small"
      placeholder="https://example.com"
      :autofocus="autofocus"
      v-bind="props.invalid ? { status: 'error' as const } : {}"
      class="mr-1"
      aria-label="链接地址"
      @update:value="emit('update:modelValue', $event)"
      @keydown="handleKeydown"
    >
      <template #suffix>
        <NButton
          data-test="rich-text-link-apply"
          text
          :disabled="!canApply"
          title="应用链接"
          aria-label="应用链接"
          @mousedown.prevent
          @click="emit('apply')"
        >
          <span class="i-[lucide--corner-down-left]" aria-hidden="true" />
        </NButton>
      </template>
    </NInput>

    <NButton
      data-test="rich-text-link-open"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      :disabled="!canOpen"
      title="新窗口打开链接"
      aria-label="新窗口打开链接"
      @mousedown.prevent
      @click="emit('open')"
    >
      <span class="i-[lucide--external-link]" aria-hidden="true" />
    </NButton>

    <NButton
      v-if="canRemove"
      data-test="rich-text-link-remove"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="移除链接"
      aria-label="移除链接"
      @mousedown.prevent
      @click="emit('remove')"
    >
      <span class="i-[lucide--unlink]" aria-hidden="true" />
    </NButton>

    <NButton
      data-test="rich-text-link-cancel"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="取消"
      aria-label="取消编辑链接"
      @mousedown.prevent
      @click="emit('cancel')"
    >
      <span class="i-[lucide--x]" aria-hidden="true" />
    </NButton>
  </div>
</template>
