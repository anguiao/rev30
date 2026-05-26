<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButtonGroup } from 'naive-ui'
import { computed } from 'vue'
import type { RichTextToolbarItem, RichTextToolbarLayout } from '../core/toolbar'
import RichTextToolbarButton from './RichTextToolbarButton.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor | null
    items: Map<string, RichTextToolbarItem>
    layout: RichTextToolbarLayout
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const groups = computed(() =>
  props.layout.groups
    .map((group) => ({
      key: group.key,
      items: group.items
        .map((itemKey) => props.items.get(itemKey))
        .filter((item): item is RichTextToolbarItem => item !== undefined),
    }))
    .filter((group) => group.items.length > 0),
)
</script>

<template>
  <template v-for="(group, index) in groups" :key="group.key">
    <NButtonGroup
      data-test="rich-text-toolbar-group"
      size="small"
      :class="index === 0 ? undefined : 'border-l border-(--app-input-divider-color) pl-1'"
    >
      <RichTextToolbarButton
        v-for="item in group.items"
        :key="item.key"
        :item="item"
        :editor="editor"
        :disabled="disabled"
      />
    </NButtonGroup>
  </template>
</template>
