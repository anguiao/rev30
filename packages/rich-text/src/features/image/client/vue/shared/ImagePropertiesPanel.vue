<script setup lang="ts">
import { NButton, NFormItem, NImage, NInput, NInputNumber, NText } from 'naive-ui'
import { computed } from 'vue'
import { isValidSize, type ImageDraftState } from './draft'

const props = defineProps<{
  image: ImageDraftState
  disabled: boolean
}>()

const emit = defineEmits<{
  updateAlt: [value: string]
  updateWidth: [value: number | null]
  updateHeight: [value: number | null]
  resetSize: []
  retryRead: []
}>()

const isDisabled = computed(() => props.disabled || props.image.readState !== 'ready')
const isWidthInvalid = computed(
  () => props.image.readState === 'ready' && !isValidSize(props.image.width),
)
const isHeightInvalid = computed(
  () => props.image.readState === 'ready' && !isValidSize(props.image.height),
)
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <div
      class="relative flex h-45 w-60 shrink-0 items-center justify-center self-center overflow-hidden"
    >
      <NImage
        v-if="image.readState !== 'error'"
        data-test="rich-text-image-preview"
        class="max-w-full"
        :img-props="{ class: 'block max-h-45 max-w-full object-contain' }"
        :src="image.previewSrc"
        :alt="image.alt"
      />
      <div
        v-if="image.readState === 'loading'"
        role="status"
        class="absolute inset-0 flex items-center justify-center text-sm"
      >
        图片读取中
      </div>
      <div
        v-else-if="image.readState === 'error'"
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
    </div>

    <div class="flex flex-col gap-3" @paste.stop>
      <NFormItem label="图片说明" :show-feedback="false">
        <NInput
          data-test="rich-text-image-alt"
          data-rich-text-image-focus
          :disabled="isDisabled"
          :value="image.alt"
          @update:value="emit('updateAlt', $event)"
        />
      </NFormItem>
      <div class="grid grid-cols-2 items-start gap-3">
        <NFormItem
          label="宽度（px）"
          :show-feedback="isWidthInvalid"
          v-bind="isWidthInvalid ? { validationStatus: 'error' } : {}"
          feedback="请输入大于 0 的整数"
        >
          <NInputNumber
            data-test="rich-text-image-width"
            class="w-full"
            :disabled="isDisabled"
            :value="image.width"
            :min="1"
            :precision="0"
            @update:value="emit('updateWidth', $event)"
          />
        </NFormItem>
        <NFormItem
          label="高度（px）"
          :show-feedback="isHeightInvalid"
          v-bind="isHeightInvalid ? { validationStatus: 'error' } : {}"
          feedback="请输入大于 0 的整数"
        >
          <NInputNumber
            data-test="rich-text-image-height"
            class="w-full"
            :disabled="isDisabled"
            :value="image.height"
            :min="1"
            :precision="0"
            @update:value="emit('updateHeight', $event)"
          />
        </NFormItem>
      </div>
      <div class="flex items-center justify-between gap-2">
        <NText depth="3" class="text-xs">尺寸按原始比例联动</NText>
        <NButton text type="primary" size="small" :disabled="isDisabled" @click="emit('resetSize')">
          恢复原尺寸
        </NButton>
      </div>
    </div>
  </div>
</template>
