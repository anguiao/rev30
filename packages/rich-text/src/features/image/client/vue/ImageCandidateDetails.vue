<script setup lang="ts">
import { NButton, NFormItem, NImage, NInput, NInputNumber } from 'naive-ui'
import type { ImageCandidate } from './useImageCandidates'

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
      class="flex min-h-36 items-center justify-center rounded-(--rich-text-theme-border-radius) bg-(--rich-text-theme-input-color)"
    >
      <NImage
        v-if="candidate.previewSrc && candidate.readState !== 'error'"
        data-test="rich-text-image-preview"
        class="max-w-full"
        :img-props="{ class: 'block max-h-52 max-w-full object-contain' }"
        :src="candidate.previewSrc"
        :alt="candidate.alt"
      />
      <span v-else class="text-sm text-(--rich-text-theme-muted-text-color)">图片无法预览</span>
    </div>

    <div v-if="candidate.readState === 'loading'" role="status" class="text-sm">图片读取中</div>
    <div
      v-if="candidate.readState === 'error'"
      class="flex items-center gap-2 text-sm"
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

    <div class="flex flex-col gap-3" @paste.stop>
      <NFormItem label="图片说明">
        <NInput
          data-test="rich-text-image-alt"
          :disabled="disabled || candidate.readState !== 'ready'"
          :value="candidate.alt"
          @update:value="emit('updateAlt', $event)"
        />
      </NFormItem>
      <div class="grid grid-cols-2 gap-3">
        <NFormItem label="宽度（px）">
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
        <NFormItem label="高度（px）">
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
      <NButton
        size="small"
        :disabled="disabled || candidate.readState !== 'ready'"
        @click="emit('resetSize')"
      >
        恢复原尺寸
      </NButton>
    </div>
  </div>
</template>
