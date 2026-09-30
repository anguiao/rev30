<script setup lang="ts">
import { NButton, NFormItem, NImage, NInput, NInputNumber, NText } from 'naive-ui'
import type { ImageCandidate } from './useImageDialogSession'

defineProps<{
  candidate: ImageCandidate
  disabled: boolean
}>()

const emit = defineEmits<{
  updateAlt: [value: string]
  updateWidth: [value: number | null]
  updateHeight: [value: number | null]
  resetSize: []
  retryRead: []
}>()
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div
      class="relative flex h-45 w-60 shrink-0 items-center justify-center self-center overflow-hidden"
    >
      <NImage
        v-if="candidate.previewSrc && candidate.readState !== 'error'"
        data-test="rich-text-image-preview"
        class="max-w-full"
        :img-props="{ class: 'block max-h-45 max-w-full object-contain' }"
        :src="candidate.previewSrc"
        :alt="candidate.alt"
      />
      <div
        v-if="candidate.readState === 'loading'"
        role="status"
        class="absolute inset-0 flex items-center justify-center text-sm"
      >
        图片读取中
      </div>
      <div
        v-else-if="candidate.readState === 'error'"
        class="flex flex-col items-center gap-2 text-sm"
        role="alert"
      >
        <span>图片读取失败</span>
        <NButton
          data-test="rich-text-image-retry"
          size="small"
          :disabled="disabled"
          @click="emit('retryRead')"
        >
          重试读取
        </NButton>
      </div>
      <span
        v-else-if="!candidate.previewSrc"
        class="text-sm text-(--rich-text-theme-muted-text-color)"
        >图片无法预览</span
      >
    </div>

    <div class="flex flex-col gap-3" @paste.stop>
      <NFormItem label="图片说明" :show-feedback="false">
        <NInput
          data-test="rich-text-image-alt"
          :disabled="disabled || candidate.readState !== 'ready'"
          :value="candidate.alt"
          @update:value="emit('updateAlt', $event)"
        />
      </NFormItem>
      <div class="grid grid-cols-2 gap-3">
        <NFormItem label="宽度（px）" :show-feedback="false">
          <NInputNumber
            data-test="rich-text-image-width"
            class="w-full"
            :disabled="disabled || candidate.readState !== 'ready'"
            :value="candidate.width"
            :min="1"
            :precision="0"
            @update:value="emit('updateWidth', $event)"
          />
        </NFormItem>
        <NFormItem label="高度（px）" :show-feedback="false">
          <NInputNumber
            data-test="rich-text-image-height"
            class="w-full"
            :disabled="disabled || candidate.readState !== 'ready'"
            :value="candidate.height"
            :min="1"
            :precision="0"
            @update:value="emit('updateHeight', $event)"
          />
        </NFormItem>
      </div>
      <div class="flex items-center justify-between gap-2">
        <NText depth="3" class="text-xs">尺寸按原始比例联动</NText>
        <NButton
          text
          type="primary"
          size="small"
          :disabled="disabled || candidate.readState !== 'ready'"
          @click="emit('resetSize')"
        >
          恢复原尺寸
        </NButton>
      </div>
    </div>
  </div>
</template>
