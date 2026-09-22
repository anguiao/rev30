<script setup lang="ts">
import { NButton, NDynamicTags } from 'naive-ui'
import { CUSTOM_ICON_KEYWORDS_MAX_ITEMS } from '@rev30/contracts'

const model = defineModel<string[]>({ required: true })

const emit = defineEmits<{
  clear: []
}>()

function clearKeywords() {
  model.value = []
  emit('clear')
}
</script>

<template>
  <div data-test="icon-keywords-input" class="space-y-2">
    <NDynamicTags
      v-model:value="model"
      class="[&>div]:max-w-full"
      :max="CUSTOM_ICON_KEYWORDS_MAX_ITEMS"
      :theme-overrides="{ inputWidth: '180px' }"
      tag-class="max-w-full [&_.n-tag\_\_content]:truncate"
      input-class="max-w-full"
      :input-props="{ placeholder: '输入关键词后按回车' }"
    >
      <template #trigger="{ activate, disabled }">
        <NButton dashed size="small" :disabled="disabled" aria-label="添加关键词" @click="activate">
          <template #icon><span class="i-[lucide--plus]" aria-hidden="true" /></template>
        </NButton>
      </template>
    </NDynamicTags>
    <NButton data-test="icon-keywords-clear" text type="primary" @click="clearKeywords">
      清空关键词
    </NButton>
  </div>
</template>
