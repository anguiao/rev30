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
      :max="CUSTOM_ICON_KEYWORDS_MAX_ITEMS"
      :input-props="{ placeholder: '输入关键词后按回车' }"
    />
    <NButton data-test="icon-keywords-clear" text type="primary" @click="clearKeywords">
      清空关键词
    </NButton>
  </div>
</template>
