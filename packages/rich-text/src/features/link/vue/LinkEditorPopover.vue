<script setup lang="ts">
import { NButton, NInput, NPopover } from 'naive-ui'
import type { RichTextOverlayCloseReason } from '../../../vue/overlay-state'

const props = withDefaults(
  defineProps<{
    show: boolean
    showOpen: boolean
    to: HTMLElement | false
    modelValue: string
    disabled?: boolean
    invalid?: boolean
    canApply?: boolean
    canOpen?: boolean
    canRemove?: boolean
    quickbarLayerId?: string | undefined
  }>(),
  {
    disabled: false,
    invalid: false,
    canApply: true,
    canOpen: false,
    canRemove: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  apply: []
  open: []
  remove: []
  close: [reason: RichTextOverlayCloseReason]
}>()

function handleInputKeydown(event: KeyboardEvent) {
  if (event.isComposing) {
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    emit('apply')
  }
}

function handleFormKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  emit('close', 'cancel')
}
</script>

<template>
  <NPopover
    :show="show"
    trigger="manual"
    placement="bottom"
    :to="to"
    :disabled="disabled"
    @clickoutside="emit('close', 'outside')"
  >
    <template #trigger>
      <slot name="trigger" />
    </template>

    <div
      v-if="show"
      :data-rich-text-quickbar-subinterface="quickbarLayerId"
      class="flex items-center gap-1"
      role="group"
      aria-label="编辑链接"
      @keydown="handleFormKeydown"
    >
      <NInput
        :value="modelValue"
        data-test="rich-text-link-url"
        size="small"
        placeholder="https://example.com"
        autofocus
        v-bind="props.invalid ? { status: 'error' as const } : {}"
        class="mr-1"
        aria-label="链接地址"
        @update:value="emit('update:modelValue', $event)"
        @keydown="handleInputKeydown"
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
        v-if="showOpen"
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
        @click="emit('close', 'cancel')"
      >
        <span class="i-[lucide--x]" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
