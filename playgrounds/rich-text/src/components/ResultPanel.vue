<script setup lang="ts">
import hljs from 'highlight.js/lib/common'
import { NAlert, NEmpty, NTabPane, NTabs } from 'naive-ui'
import { computed, nextTick, useTemplateRef, watch } from 'vue'
import { RichTextContentInvalidError } from '@rev30/rich-text/server'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import type { DerivedRichTextContent, DerivationStatus } from '../playground/useDerivation'
import { redactImageDataUrls } from '../playground/image'

const props = defineProps<{
  result: DerivedRichTextContent | null
  status: DerivationStatus
  error: unknown
  imageError: string | null
}>()

const renderedContainer = useTemplateRef<HTMLElement>('renderedContainer')

const formattedJson = computed(() =>
  props.result ? redactImageDataUrls(JSON.stringify(props.result.json, null, 2)) : '',
)
const formattedHtml = computed(() => (props.result ? redactImageDataUrls(props.result.html) : ''))
const errorMessage = computed(() => {
  if (props.status !== 'error') {
    return null
  }

  if (props.error instanceof RichTextContentInvalidError) {
    return '富文本内容无效'
  }

  return '生成富文本结果失败'
})

async function highlightCode() {
  await nextTick()

  for (const code of renderedContainer.value?.querySelectorAll<HTMLElement>('pre code') ?? []) {
    const languageClass = [...code.classList].find((name) => name.startsWith('language-'))
    const language = languageClass?.slice('language-'.length)

    if (language && hljs.getLanguage(language)) {
      hljs.highlightElement(code)
    }
  }
}

watch(
  () => props.result?.html,
  () => {
    void highlightCode()
  },
  { flush: 'post', immediate: true },
)
</script>

<template>
  <section aria-labelledby="result-panel-title" class="flex min-h-0 min-w-0 flex-col gap-3">
    <h2 id="result-panel-title" class="text-base font-semibold">派生结果</h2>

    <NAlert v-if="imageError" type="error" :show-icon="false" data-test="image-error">
      {{ imageError }}
    </NAlert>
    <NAlert v-if="status === 'error'" type="error" :show-icon="false" data-test="derivation-error">
      {{ errorMessage }}
    </NAlert>

    <NTabs
      class="min-h-0 min-w-0 flex-1"
      pane-wrapper-class="min-h-0 flex-1"
      pane-class="box-border h-full min-h-0 overflow-auto"
      type="line"
      default-value="rendered"
      data-test="result-tabs"
    >
      <NTabPane name="rendered" tab="渲染" display-directive="show">
        <NEmpty v-if="!result" description="暂无可显示的派生结果" class="py-16" />
        <div
          v-else
          ref="renderedContainer"
          data-test="rendered-result"
          class="rich-text-content rich-text-content--sm rich-text-result"
          v-html="result.html"
        />
      </NTabPane>
      <NTabPane name="json" tab="JSON">
        <NEmpty v-if="!result" description="暂无可显示的派生结果" class="py-16" />
        <template v-else>
          <p class="mb-2 text-xs text-stone-500 dark:text-zinc-400">
            图片 data URL 只显示省略 payload 的副本。
          </p>
          <pre
            data-test="json-result"
            class="overflow-auto rounded-(--n-border-radius) bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
            >{{ formattedJson }}</pre>
        </template>
      </NTabPane>
      <NTabPane name="html" tab="HTML">
        <NEmpty v-if="!result" description="暂无可显示的派生结果" class="py-16" />
        <template v-else>
          <p class="mb-2 text-xs text-stone-500 dark:text-zinc-400">
            图片 data URL 只显示省略 payload 的副本。
          </p>
          <pre
            data-test="html-result"
            class="overflow-auto rounded-(--n-border-radius) bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
            >{{ formattedHtml }}</pre>
        </template>
      </NTabPane>
    </NTabs>
  </section>
</template>
