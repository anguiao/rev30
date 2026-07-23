<script setup lang="ts">
import type { RichTextToolbarControlProps } from '../../../vue/toolbar'
import type { InputInst } from 'naive-ui'
import { NButton, NCheckbox, NInput, NPopover } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import {
  closeSearchReplaceAction,
  getSearchReplaceState,
  goToNextSearchMatchAction,
  goToPreviousSearchMatchAction,
  openSearchReplaceAction,
  replaceAllSearchMatchesAction,
  replaceCurrentSearchMatchAction,
  setSearchCaseSensitiveAction,
  setSearchQueryAction,
} from '../editor'
import { useRichTextToolbarOverlay } from '../../../vue/overlay-state'

const props = withDefaults(defineProps<RichTextToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isEditable = ref(editor.isEditable)
const isDisabled = computed(() => props.disabled || !isEditable.value)

const searchState = shallowRef(getSearchReplaceState(editor))
const replacement = ref('')

const hasMatches = computed(() => searchState.value.matches.length > 0)
const matchPositionLabel = computed(() => {
  const total = searchState.value.matches.length

  return total === 0 ? '0/0' : `${searchState.value.currentIndex + 1}/${total}`
})

function closePanel(restoreEditorFocus = false) {
  runRichTextAction(editor, closeSearchReplaceAction)
  toolbarOverlay.close()

  if (restoreEditorFocus) {
    editor.commands.focus()
  }
}

const toolbarOverlay = useRichTextToolbarOverlay(() => closePanel(false))

function togglePanel() {
  if (searchState.value.isOpen) {
    closePanel(true)
    return
  }

  runRichTextAction(editor, openSearchReplaceAction)
}

function syncSearchState() {
  searchState.value = getSearchReplaceState(editor)
}

function handleEditorUpdate() {
  isEditable.value = editor.isEditable

  if (!isEditable.value && searchState.value.isOpen) {
    closePanel()
  }
}

handleEditorUpdate()
editor.on('transaction', syncSearchState)
editor.on('update', handleEditorUpdate)

onBeforeUnmount(() => {
  editor.off('transaction', syncSearchState)
  editor.off('update', handleEditorUpdate)
})

function setQuery(query: string) {
  runRichTextAction(editor, setSearchQueryAction, query)
}

function setCaseSensitive(caseSensitive: boolean) {
  runRichTextAction(editor, setSearchCaseSensitiveAction, caseSensitive)
}

function goToPreviousMatch() {
  runRichTextAction(editor, goToPreviousSearchMatchAction)
}

function goToNextMatch() {
  runRichTextAction(editor, goToNextSearchMatchAction)
}

function replaceCurrentMatch() {
  runRichTextAction(editor, replaceCurrentSearchMatchAction, replacement.value)
}

function replaceAllMatches() {
  runRichTextAction(editor, replaceAllSearchMatchesAction, replacement.value)
}

function handleQueryKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.shiftKey) {
    goToPreviousMatch()
    return
  }

  goToNextMatch()
}

function handleReplacementKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Enter') {
    return
  }

  event.preventDefault()
  event.stopPropagation()

  if (event.shiftKey) {
    goToPreviousMatch()
    return
  }

  replaceCurrentMatch()
}

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closePanel(true)
}

const searchInput = ref<InputInst | null>(null)
watch(
  () => searchState.value.isOpen,
  (isOpen) => {
    if (isOpen) {
      toolbarOverlay.open()
      void nextTick(() => searchInput.value?.focus())
    } else {
      toolbarOverlay.close()
    }
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && searchState.value.isOpen) {
      closePanel()
    }
  },
  { immediate: true },
)
</script>

<template>
  <NPopover
    :show="searchState.isOpen"
    trigger="manual"
    placement="top-start"
    :to="toolbarOverlay.target.value"
    :disabled="isDisabled"
    @clickoutside="closePanel()"
  >
    <template #trigger>
      <NButton
        data-test="rich-text-search-replace"
        :data-active="searchState.isOpen ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="searchState.isOpen ? 'primary' : 'default'"
        :secondary="searchState.isOpen"
        :quaternary="!searchState.isOpen"
        title="查找和替换"
        aria-label="查找和替换"
        aria-keyshortcuts="Control+F Meta+F"
        aria-haspopup="dialog"
        :aria-expanded="searchState.isOpen"
        :aria-pressed="searchState.isOpen"
        @mousedown.prevent
        @click="togglePanel"
      >
        <span class="i-[lucide--search]" aria-hidden="true" />
      </NButton>
    </template>

    <div
      data-test="rich-text-search-replace-panel"
      class="w-96 space-y-2"
      role="dialog"
      aria-label="查找和替换"
      @keydown="handlePanelKeydown"
    >
      <div class="flex items-center gap-1">
        <NInput
          ref="searchInput"
          :value="searchState.query"
          data-test="rich-text-search-query"
          size="small"
          clearable
          placeholder="查找"
          aria-label="查找"
          @update:value="setQuery"
          @keydown="handleQueryKeydown"
        />

        <span
          data-test="rich-text-search-match-position"
          class="min-w-10 text-center text-xs text-(--rich-text-theme-muted-text-color) tabular-nums"
          :aria-label="`匹配位置：${matchPositionLabel}`"
          aria-live="polite"
        >
          {{ matchPositionLabel }}
        </span>

        <NButton
          data-test="rich-text-search-previous"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :disabled="!hasMatches"
          title="上一处"
          aria-label="上一处"
          @mousedown.prevent
          @click="goToPreviousMatch"
        >
          <span class="i-[lucide--chevron-up]" aria-hidden="true" />
        </NButton>

        <NButton
          data-test="rich-text-search-next"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          :disabled="!hasMatches"
          title="下一处"
          aria-label="下一处"
          @mousedown.prevent
          @click="goToNextMatch"
        >
          <span class="i-[lucide--chevron-down]" aria-hidden="true" />
        </NButton>

        <NButton
          data-test="rich-text-search-close"
          size="small"
          style="--n-padding: 0 6px"
          quaternary
          title="关闭"
          aria-label="关闭查找和替换"
          @mousedown.prevent
          @click="closePanel(true)"
        >
          <span class="i-[lucide--x]" aria-hidden="true" />
        </NButton>
      </div>

      <div class="flex items-center gap-1">
        <NInput
          v-model:value="replacement"
          data-test="rich-text-search-replacement"
          size="small"
          placeholder="替换为"
          aria-label="替换为"
          @keydown="handleReplacementKeydown"
        />

        <NButton
          data-test="rich-text-search-replace-current"
          size="small"
          :disabled="searchState.currentIndex < 0"
          @mousedown.prevent
          @click="replaceCurrentMatch"
        >
          替换
        </NButton>

        <NButton
          data-test="rich-text-search-replace-all"
          size="small"
          :disabled="!hasMatches"
          @mousedown.prevent
          @click="replaceAllMatches"
        >
          全部替换
        </NButton>
      </div>

      <NCheckbox
        :checked="searchState.caseSensitive"
        data-test="rich-text-search-case-sensitive"
        @update:checked="setCaseSensitive"
      >
        区分大小写
      </NCheckbox>
    </div>
  </NPopover>
</template>

<style>
.ProseMirror .rich-text-search-match {
  border-radius: 2px;
  background-color: var(--rich-text-theme-primary-muted-color);
}

.ProseMirror .rich-text-search-match-current,
.ProseMirror .rich-text-search-match.rich-text-search-match-current.selection {
  background-color: color-mix(in srgb, var(--rich-text-theme-primary-color) 36%, transparent);
  box-shadow: inset 0 0 0 1px var(--rich-text-theme-primary-color);
}
</style>
