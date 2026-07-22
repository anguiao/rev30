<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation } from '@pinia/colada'
import { NAlert, NButton, NEmpty, NTabPane, NTabs } from 'naive-ui'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  createRichTextDemoImageDataUrl,
  generateRichTextPreview,
  useRichTextCodeHighlight,
} from '../../../features/demos'
import { getErrorMessage } from '../../../utils/error'

function createEmptyDocument(): RichTextDocument {
  return {
    type: 'doc',
    content: [{ type: 'paragraph' }],
  }
}

const pageTitle = useAdminPageTitle('富文本')

const contentJson = ref<RichTextDocument>(createEmptyDocument())

const imageError = ref<string | null>(null)

const editorPreset = createAllRichTextEditorPreset({
  image: {
    async upload(file) {
      return { src: await createRichTextDemoImageDataUrl(file) }
    },
    onError(error) {
      imageError.value = getErrorMessage(error, '处理图片失败')
    },
  },
})

const {
  data: previewData,
  error: previewMutationError,
  isLoading: isPreviewing,
  ...previewMutation
} = useMutation({
  mutation: generateRichTextPreview,
})
watch(previewData, (result) => {
  if (result) {
    void highlightCode()
  }
})

const previewError = computed(
  () =>
    imageError.value ??
    (previewMutationError.value
      ? getErrorMessage(previewMutationError.value, '生成服务端预览失败')
      : null),
)

const previewContainer = ref<HTMLElement | null>(null)
const { highlightCode } = useRichTextCodeHighlight(previewContainer)

const formattedContentJson = computed(() =>
  previewData.value ? JSON.stringify(previewData.value.contentJson, null, 2) : '',
)

function updateContentJson(value: RichTextDocument) {
  contentJson.value = value
  imageError.value = null
  previewMutation.reset()
}

function clearContent() {
  updateContentJson(createEmptyDocument())
}

function generatePreview() {
  imageError.value = null
  previewMutation.mutate({ contentJson: contentJson.value })
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
      class="grid min-h-0 gap-5 xl:h-[calc(100vh-12rem)] xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)]"
    >
      <div class="flex min-h-0 min-w-0 flex-col gap-4 xl:h-full">
        <RichTextEditor
          :model-value="contentJson"
          :preset="editorPreset"
          :min-height="320"
          class="min-h-0 flex-1"
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
            :disabled="isPreviewing"
            @click="generatePreview"
          >
            服务端预览
          </NButton>
        </div>
      </div>

      <NTabs
        class="min-h-0 min-w-0 xl:h-full"
        pane-wrapper-class="min-h-0 flex-1"
        pane-class="box-border h-full min-h-0 overflow-auto"
        type="line"
        animated
        default-value="rendered"
      >
        <NTabPane name="rendered" tab="渲染" display-directive="show">
          <div
            v-if="previewData"
            ref="previewContainer"
            data-test="rich-text-demo-rendered"
            class="rich-text-demo-rendered prose prose-sm max-w-none dark:prose-invert"
            v-html="previewData.contentHtml"
          />
          <NEmpty v-else description="生成服务端预览后显示" class="py-16" />
        </NTabPane>
        <NTabPane name="json" tab="JSON">
          <NEmpty v-if="!previewData" description="生成服务端预览后显示" class="py-16" />
          <pre
            v-else
            data-test="rich-text-demo-json"
            class="rounded-ui bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
            >{{ formattedContentJson }}</pre>
        </NTabPane>
        <NTabPane name="html" tab="HTML">
          <NEmpty v-if="!previewData" description="生成服务端预览后显示" class="py-16" />
          <pre
            v-else
            data-test="rich-text-demo-html"
            class="rounded-ui bg-stone-100 p-3 text-xs break-all whitespace-pre-wrap dark:bg-zinc-950"
            >{{ previewData.contentHtml }}</pre>
        </NTabPane>
      </NTabs>
    </section>
  </main>
</template>
