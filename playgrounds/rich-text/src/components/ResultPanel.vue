<script setup lang="ts">
import hljs from 'highlight.js/lib/common'
import githubDarkThemeCss from 'highlight.js/styles/github-dark.css?raw'
import githubThemeCss from 'highlight.js/styles/github.css?raw'
import { NAlert, NEmpty, NTabPane, NTabs, NTag } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { RichTextContentInvalidError } from '@rev30/rich-text/server'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import type { DerivedRichTextContent, DerivationStatus } from '../playground/useDerivation'
import { redactImageDataUrls } from '../playground/image'

const props = defineProps<{
  result: DerivedRichTextContent | null
  status: DerivationStatus
  revision: number
  resultRevision: number | null
  error: unknown
  imageError: string | null
  isDark: boolean
}>()

const renderedContainer = useTemplateRef<HTMLElement>('renderedContainer')
const highlightThemeStyle = ref<HTMLStyleElement | null>(null)

function updateHighlightTheme(isDark: boolean) {
  if (highlightThemeStyle.value === null) {
    const style = document.createElement('style')
    style.id = 'rich-text-playground-highlight-theme'
    document.head.append(style)
    highlightThemeStyle.value = style
  }

  highlightThemeStyle.value.textContent = isDark ? githubDarkThemeCss : githubThemeCss
}

watch(() => props.isDark, updateHighlightTheme, { immediate: true })

onBeforeUnmount(() => {
  highlightThemeStyle.value?.remove()
})

const formattedJson = computed(() =>
  props.result ? redactImageDataUrls(JSON.stringify(props.result.json, null, 2)) : '',
)
const formattedHtml = computed(() => (props.result ? redactImageDataUrls(props.result.html) : ''))
const hasStaleResult = computed(
  () =>
    props.result !== null &&
    props.resultRevision !== null &&
    props.resultRevision !== props.revision,
)
const errorMessage = computed(() => {
  if (props.status !== 'error') {
    return null
  }

  if (props.error instanceof RichTextContentInvalidError) {
    return '富文本内容无效'
  }

  return '生成富文本结果失败'
})
const statusLabel = computed(() => {
  if (props.status === 'pending') {
    return '同步中'
  }

  if (props.status === 'error') {
    return '派生失败'
  }

  return '已同步'
})
const statusType = computed(() => {
  if (props.status === 'error') {
    return 'error'
  }

  if (props.status === 'pending') {
    return 'warning'
  }

  return 'success'
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
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 id="result-panel-title" class="text-base font-semibold">派生结果</h2>
        <p class="text-sm text-stone-500 dark:text-zinc-400">
          真实 server all preset 的校验、清洗和渲染。
        </p>
      </div>
      <NTag :type="statusType" size="small" data-test="derivation-status">{{ statusLabel }}</NTag>
    </div>

    <NAlert
      v-if="status === 'pending'"
      type="warning"
      :show-icon="false"
      data-test="pending-result"
    >
      内容已修改，正在同步；暂时保留上一次成功结果。
    </NAlert>
    <NAlert v-if="imageError" type="error" :show-icon="false" data-test="image-error">
      {{ imageError }}
    </NAlert>
    <NAlert v-if="status === 'error'" type="error" :show-icon="false" data-test="derivation-error">
      {{ errorMessage }}<template v-if="result !== null">。保留的结果不是当前内容。</template>
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
          class="rich-text-result prose prose-sm max-w-none dark:prose-invert"
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

    <p v-if="hasStaleResult" class="text-xs text-amber-700 dark:text-amber-300">
      当前显示的结果对应旧 revision，不能代表最新内容。
    </p>
  </section>
</template>
