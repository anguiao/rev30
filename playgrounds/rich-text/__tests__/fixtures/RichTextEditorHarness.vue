<script setup lang="ts">
import { NConfigProvider, NGlobalStyle, lightTheme } from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import { RichTextEditor } from '@rev30/rich-text/vue'
import exampleImage from '../../src/assets/example-image.png?inline'
import { createDefaultDocument } from '../../src/playground/defaultDocument'
import { createPlaygroundPresets } from '../../src/playground/presets'
import { useDerivation } from '../../src/playground/useDerivation'
import '../../src/style.css'

const model = ref<RichTextDocument>(createDefaultDocument())
const blurCount = ref(0)
const imageError = ref<string | null>(null)
const selectionText = ref('')
const activeElement = ref('')
const narrowEditor = ref(false)
const presets = createPlaygroundPresets({
  onImageError(error) {
    imageError.value = error instanceof Error ? error.message : '读取图片失败'
  },
  onImageSuccess() {
    imageError.value = null
  },
})
const derivation = useDerivation(model, presets.serverPreset)
const renderedHtml = computed(() => derivation.result.value?.html ?? '')

function text(value: string, marks?: unknown[]) {
  return marks?.length
    ? { type: 'text' as const, text: value, marks }
    : { type: 'text' as const, text: value }
}

function paragraph(content: unknown[], textAlign: string | null = null) {
  return { type: 'paragraph' as const, attrs: { textAlign }, content }
}

function handleBlur() {
  blurCount.value += 1
}

function updateInteractionState() {
  selectionText.value = window.getSelection()?.toString() ?? ''
  const element = document.activeElement
  const dialog = element?.closest<HTMLElement>('[role="dialog"]')
  activeElement.value =
    element?.getAttribute('data-rich-text-toolbar-item') ??
    element?.getAttribute('data-test') ??
    element?.getAttribute('aria-label') ??
    (element?.tagName.toLowerCase() === 'input' ? 'input' : undefined) ??
    (dialog ? `dialog:${dialog.getAttribute('aria-label') ?? ''}` : undefined) ??
    (element?.getAttribute('contenteditable') === 'true'
      ? 'editor'
      : (element?.tagName.toLowerCase() ?? ''))
}

function resetShortDocument() {
  narrowEditor.value = false
  updateModel({ type: 'doc', content: [{ type: 'paragraph' }] })
}

function setPasteDocument() {
  narrowEditor.value = false
  updateModel({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '文档' }] }],
  })
}

function setCodeBlockDocument() {
  narrowEditor.value = false
  updateModel({
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const value = 1' }],
      },
    ],
  })
}

function createTableParagraph(text?: string) {
  return text === undefined
    ? { type: 'paragraph' as const, attrs: { textAlign: null } }
    : {
        type: 'paragraph' as const,
        attrs: { textAlign: null },
        content: [{ type: 'text' as const, text }],
      }
}

function createTableCell(type: 'tableCell' | 'tableHeader', text?: string) {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    content: [createTableParagraph(text)],
  }
}

function createTableRow(cells: ReturnType<typeof createTableCell>[]) {
  return { type: 'tableRow' as const, content: cells }
}

function setTableDocument() {
  narrowEditor.value = true
  updateModel({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          createTableRow(
            ['键', '值', '状态', '备注', '更新时间'].map((text) =>
              createTableCell('tableHeader', text),
            ),
          ),
          createTableRow(
            ['第一项', '第二项', undefined, undefined, undefined].map((text) =>
              createTableCell('tableCell', text),
            ),
          ),
        ],
      },
    ],
  })
}

function setImageDocument() {
  narrowEditor.value = false
  updateModel({ type: 'doc', content: [{ type: 'paragraph' }] })
}

function setElementPathDocument() {
  narrowEditor.value = false
  updateModel({
    type: 'doc',
    content: [
      paragraph([
        text('甲', [{ type: 'bold' }]),
        text('乙', [{ type: 'bold' }, { type: 'italic' }]),
        text('丙', [{ type: 'bold' }]),
      ]),
    ],
  })
}

function setImageSelectionDocument() {
  narrowEditor.value = false
  updateModel({
    type: 'doc',
    content: [
      {
        type: 'image',
        attrs: { src: exampleImage, alt: '路径图片', width: 320, height: null },
      },
      paragraph([]),
    ],
  })
}

function updateModel(value: RichTextDocument) {
  model.value = value
  derivation.schedule()
}

onMounted(() => {
  document.addEventListener('selectionchange', updateInteractionState)
  document.addEventListener('focusin', updateInteractionState)
  updateInteractionState()
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', updateInteractionState)
  document.removeEventListener('focusin', updateInteractionState)
})
</script>

<template>
  <NConfigProvider :theme="lightTheme">
    <NGlobalStyle />
    <button data-test="before-editor">编辑器前控件</button>
    <div class="flex gap-2">
      <button data-test="reset-short-document" @click="resetShortDocument">短文档</button>
      <button data-test="set-paste-document" @click="setPasteDocument">粘贴文档</button>
      <button data-test="set-code-block-document" @click="setCodeBlockDocument">代码块</button>
      <button data-test="set-table-document" @click="setTableDocument">表格</button>
      <button data-test="set-image-document" @click="setImageDocument">图片</button>
      <button data-test="set-element-path-document" @click="setElementPathDocument">
        路径文本
      </button>
      <button data-test="set-image-selection-document" @click="setImageSelectionDocument">
        路径图片
      </button>
    </div>
    <div
      class="h-[560px] overflow-auto"
      :class="narrowEditor ? 'w-[160px]' : 'w-[900px]'"
      data-test="editor-container"
    >
      <RichTextEditor
        :model-value="model"
        :preset="presets.editorPreset"
        :min-height="320"
        @blur="handleBlur"
        @update:model-value="updateModel"
      />
    </div>
    <button data-test="after-editor">编辑器后控件</button>
    <output data-test="model-json">{{ JSON.stringify(model) }}</output>
    <output data-test="blur-count">{{ blurCount }}</output>
    <output data-test="selection-text">{{ selectionText }}</output>
    <output data-test="active-element">{{ activeElement }}</output>
    <output data-test="derivation-status">{{ derivation.status }}</output>
    <div v-if="derivation.result" data-test="rendered-result" v-html="renderedHtml" />
    <output v-if="imageError" data-test="image-error">{{ imageError }}</output>
  </NConfigProvider>
</template>
