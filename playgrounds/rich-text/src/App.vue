<script setup lang="ts">
import { computed, ref } from 'vue'
import { darkTheme, NConfigProvider, NGlobalStyle, NSelect, zhCN } from 'naive-ui'
import type { RichTextDocument } from '@rev30/rich-text/schema'
import EditorPanel from './components/EditorPanel.vue'
import ResultPanel from './components/ResultPanel.vue'
import { createDefaultDocument } from './playground/defaultDocument'
import { createPlaygroundPresets } from './playground/presets'
import { useDerivation } from './playground/useDerivation'
import { themeModeOptions, useThemeMode } from './playground/useThemeMode'

const theme = useThemeMode()
const document = ref<RichTextDocument>(createDefaultDocument())
const imageError = ref<string | null>(null)
const presets = createPlaygroundPresets({
  onImageError(error) {
    imageError.value = error instanceof Error ? error.message : '读取图片失败'
  },
  onImageSuccess() {
    imageError.value = null
  },
})
const derivation = useDerivation(document, presets.serverPreset)
const naiveTheme = computed(() => (theme.isDark.value ? darkTheme : null))

function updateDocument(value: RichTextDocument) {
  document.value = value
  derivation.schedule()
}

function restoreExample() {
  imageError.value = null
  derivation.deriveImmediately()
}
</script>

<template>
  <NConfigProvider :locale="zhCN" :theme="naiveTheme">
    <NGlobalStyle />
    <main
      class="mx-auto flex h-dvh max-w-[1800px] flex-col gap-6 overflow-hidden px-5 py-6 lg:px-8"
    >
      <header class="flex flex-wrap items-start justify-between gap-4">
        <h1 class="text-2xl font-semibold tracking-tight">Rich Text Playground</h1>
        <div class="w-32 shrink-0">
          <NSelect
            aria-label="主题"
            data-test="theme-mode"
            :value="theme.mode.value"
            :options="themeModeOptions"
            size="small"
            @update:value="theme.setMode"
          />
        </div>
      </header>

      <div
        class="grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(22rem,2fr)] xl:grid-rows-[minmax(0,1fr)]"
      >
        <EditorPanel
          :model-value="document"
          :preset="presets.editorPreset"
          @update:model-value="updateDocument"
          @restore="restoreExample"
        />
        <ResultPanel
          :result="derivation.result.value"
          :status="derivation.status.value"
          :error="derivation.error.value"
          :image-error="imageError"
        />
      </div>
    </main>
  </NConfigProvider>
</template>
