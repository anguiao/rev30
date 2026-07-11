<script setup lang="ts">
import { computed, ref } from 'vue'
import { NAlert, NButton, NEmpty, NTabPane, NTabs } from 'naive-ui'
import type { RichTextDemoPreviewResponse, TiptapDocument } from '@rev30/contracts'
import { hasRichTextContent } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  createRichTextDemoImageDataUrl,
  previewRichTextDemo,
  useRichTextCodeHighlight,
} from '../../../features/demos'
import { getErrorMessage } from '../../../utils/error'

function createEmptyDocument(): TiptapDocument {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}

const pageTitle = useAdminPageTitle('富文本')

const contentJson = ref<TiptapDocument>(createEmptyDocument())

const editorPreset = createAllRichTextEditorPreset({
  image: {
    async upload(file) {
      return { src: await createRichTextDemoImageDataUrl(file) }
    },
    onError(error) {
      previewError.value = getErrorMessage(error, '处理图片失败')
    },
  },
})

function updateContentJson(value: TiptapDocument) {
  contentJson.value = value
  previewResult.value = null
  previewError.value = null
}

function clearContent() {
  updateContentJson(createEmptyDocument())
}

const previewResult = ref<RichTextDemoPreviewResponse | null>(null)
const previewError = ref<string | null>(null)
const isPreviewing = ref(false)
const previewContainer = ref<HTMLElement | null>(null)
const { highlightCode } = useRichTextCodeHighlight(previewContainer)

const canPreview = computed(() => !isPreviewing.value && hasRichTextContent(contentJson.value))
const formattedContentJson = computed(() =>
  previewResult.value === null ? '' : JSON.stringify(previewResult.value.contentJson, null, 2),
)

async function generatePreview() {
  if (!canPreview.value) {
    return
  }

  isPreviewing.value = true
  previewError.value = null

  try {
    previewResult.value = await previewRichTextDemo({ contentJson: contentJson.value })
    await highlightCode()
  } catch (error) {
    previewResult.value = null
    previewError.value = getErrorMessage(error, '生成服务端预览失败')
  } finally {
    isPreviewing.value = false
  }
}
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">完整富文本能力演示。</p>
    </header>

    <NAlert v-if="previewError" type="error" :show-icon="false" data-test="rich-text-demo-error">
      {{ previewError }}
    </NAlert>

    <section
      class="space-y-4 rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <RichTextEditor
        :model-value="contentJson"
        :preset="editorPreset"
        :min-height="320"
        @update:model-value="updateContentJson"
      />

      <div class="flex flex-wrap justify-end gap-2">
        <NButton data-test="rich-text-demo-clear" :disabled="isPreviewing" @click="clearContent">
          清空
        </NButton>
        <NButton
          v-can="'demo:rich-text:preview'"
          data-test="rich-text-demo-preview"
          type="primary"
          :loading="isPreviewing"
          :disabled="!canPreview"
          @click="generatePreview"
        >
          服务端预览
        </NButton>
      </div>
    </section>

    <section class="grid gap-5 xl:grid-cols-2">
      <div
        class="min-h-72 rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 class="mb-4 font-medium">渲染结果</h2>
        <div
          v-if="previewResult"
          ref="previewContainer"
          data-test="rich-text-demo-rendered"
          class="rich-text-demo-rendered prose prose-sm max-w-none dark:prose-invert"
          v-html="previewResult.contentHtml"
        />
        <NEmpty v-else description="生成服务端预览后显示" class="py-16" />
      </div>

      <div
        class="min-h-72 rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
      >
        <h2 class="mb-2 font-medium">派生结果</h2>
        <NTabs type="line" animated>
          <NTabPane name="json" tab="JSON">
            <pre
              data-test="rich-text-demo-json"
              class="max-h-96 overflow-auto rounded-ui bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
              >{{ formattedContentJson || '生成服务端预览后显示' }}</pre>
          </NTabPane>
          <NTabPane name="html" tab="HTML">
            <pre
              data-test="rich-text-demo-html"
              class="max-h-96 overflow-auto rounded-ui bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
              >{{ previewResult?.contentHtml || '生成服务端预览后显示' }}</pre>
          </NTabPane>
          <NTabPane name="text" tab="纯文本">
            <pre
              data-test="rich-text-demo-text"
              class="max-h-96 overflow-auto rounded-ui bg-stone-100 p-3 text-sm whitespace-pre-wrap dark:bg-zinc-950"
              >{{ previewResult?.contentText || '生成服务端预览后显示' }}</pre>
          </NTabPane>
        </NTabs>
      </div>
    </section>
  </main>
</template>

<style scoped>
.rich-text-demo-rendered :deep(pre code.hljs) {
  padding: 0;
  background: transparent;
}
</style>
