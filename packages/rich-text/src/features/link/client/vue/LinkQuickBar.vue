<script setup lang="ts">
import type { RichTextQuickBarComponentProps } from '../../../../client/vue/quick-bar'
import { NButton } from 'naive-ui'
import { computed } from 'vue'
import { resolveLinkRange } from '../range'
import LinkControl from './LinkControl.vue'

const props = defineProps<RichTextQuickBarComponentProps>()

const editor = props.editor
const range = computed(() => resolveLinkRange(editor))
</script>

<template>
  <div class="contents">
    <NButton
      tag="a"
      data-test="rich-text-quick-bar-link-open"
      data-rich-text-toolbar-item="link-open"
      :href="range?.href"
      target="_blank"
      rel="noopener noreferrer"
      size="small"
      style="--n-padding: 0 6px"
      quaternary
      title="新窗口打开链接"
      aria-label="新窗口打开链接"
    >
      <span class="i-[lucide--external-link]" aria-hidden="true" />
    </NButton>

    <LinkControl :editor="editor">
      <template #trigger="{ disabled, show }">
        <NButton
          data-test="rich-text-quick-bar-link-edit"
          data-rich-text-toolbar-item="link-edit"
          :disabled="disabled"
          size="small"
          style="--n-padding: 0 6px"
          :type="show ? 'primary' : 'default'"
          :secondary="show"
          :quaternary="!show"
          title="编辑链接"
          aria-label="编辑链接"
          aria-haspopup="dialog"
          :aria-expanded="show"
        >
          <span class="i-[lucide--pencil]" aria-hidden="true" />
        </NButton>
      </template>
    </LinkControl>
  </div>
</template>
