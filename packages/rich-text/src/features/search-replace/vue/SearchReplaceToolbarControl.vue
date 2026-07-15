<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { InputInst } from 'naive-ui'
import { NButton, NCheckbox, NInput, NPopover } from 'naive-ui'
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  closeSearchReplaceAction,
  getSearchReplaceState,
  goToNextSearchMatchAction,
  goToPreviousSearchMatchAction,
  openSearchReplaceAction,
  replaceAllSearchMatchesAction,
  replaceCurrentSearchMatchAction,
  setSearchReplaceCaseSensitiveAction,
  setSearchReplaceQueryAction,
} from '../editor'
import type { RichTextSearchReplaceState } from '../editor'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const editor = props.editor
const searchInput = ref<InputInst | null>(null)
const replacement = ref('')
const isEditable = ref(editor?.isEditable ?? false)
const searchState = shallowRef<RichTextSearchReplaceState>(
  editor
    ? getSearchReplaceState(editor)
    : {
        active: false,
        query: '',
        caseSensitive: false,
        matches: [],
        currentIndex: -1,
      },
)

const isUnavailable = computed(() => props.disabled || !editor || !isEditable.value)
const hasMatches = computed(() => searchState.value.matches.length > 0)
const hasActiveMatch = computed(
  () =>
    searchState.value.currentIndex >= 0 &&
    searchState.value.currentIndex < searchState.value.matches.length,
)
const matchPositionLabel = computed(() => {
  const total = searchState.value.matches.length

  return total === 0 ? '0/0' : `${searchState.value.currentIndex + 1}/${total}`
})
const canOpenPanel = computed(() => {
  return !isUnavailable.value && !!editor && (openSearchReplaceAction.canRun?.(editor) ?? true)
})
const isTriggerDisabled = computed(
  () => isUnavailable.value || (!searchState.value.active && !canOpenPanel.value),
)

function focusSearchInput() {
  void nextTick(() => searchInput.value?.focus())
}

function syncSearchState() {
  if (editor) {
    searchState.value = getSearchReplaceState(editor)
  }
}

function handleEditorUpdate() {
  isEditable.value = editor?.isEditable ?? false

  if (editor && !editor.isEditable && getSearchReplaceState(editor).active) {
    closeSearchReplaceAction.run(editor)
  }
}

handleEditorUpdate()
editor?.on('transaction', syncSearchState)
editor?.on('update', handleEditorUpdate)

watch(
  [() => searchState.value.active, searchInput],
  ([active, input]) => {
    if (active && input) {
      focusSearchInput()
    }
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled && searchState.value.active && editor) {
      closeSearchReplaceAction.run(editor)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  editor?.off('transaction', syncSearchState)
  editor?.off('update', handleEditorUpdate)
})

function openPanel() {
  if (!canOpenPanel.value || !editor) {
    return
  }

  openSearchReplaceAction.run(editor)
}

function closePanel(restoreEditorFocus = false) {
  if (!editor) {
    return
  }

  closeSearchReplaceAction.run(editor)

  if (restoreEditorFocus) {
    editor.commands.focus()
  }
}

function togglePanel() {
  if (searchState.value.active) {
    closePanel(true)
    return
  }

  openPanel()
}

function setQuery(query: string) {
  if (editor) {
    setSearchReplaceQueryAction.run(editor, query)
  }
}

function setCaseSensitive(caseSensitive: boolean) {
  if (editor) {
    setSearchReplaceCaseSensitiveAction.run(editor, caseSensitive)
  }
}

function goToPreviousMatch() {
  if (hasMatches.value && editor) {
    goToPreviousSearchMatchAction.run(editor)
    focusSearchInput()
  }
}

function goToNextMatch() {
  if (hasMatches.value && editor) {
    goToNextSearchMatchAction.run(editor)
    focusSearchInput()
  }
}

function replaceCurrentMatch() {
  if (!isUnavailable.value && hasActiveMatch.value && editor) {
    replaceCurrentSearchMatchAction.run(editor, replacement.value)
  }
}

function replaceAllMatches() {
  if (!isUnavailable.value && hasMatches.value && editor) {
    replaceAllSearchMatchesAction.run(editor, replacement.value)
  }
}

function handleInputKeydown(event: KeyboardEvent) {
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

function handlePanelKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closePanel(true)
}
</script>

<template>
  <NPopover
    :show="searchState.active"
    trigger="manual"
    placement="bottom-start"
    :disabled="isTriggerDisabled"
    @clickoutside="closePanel()"
  >
    <template #trigger>
      <NButton
        data-test="rich-text-search-replace"
        :data-active="searchState.active ? 'true' : undefined"
        :disabled="isTriggerDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="searchState.active ? 'primary' : 'default'"
        :secondary="searchState.active"
        :quaternary="!searchState.active"
        title="查找和替换"
        aria-label="查找和替换"
        aria-keyshortcuts="Control+F Meta+F"
        aria-haspopup="dialog"
        :aria-expanded="searchState.active"
        :aria-pressed="searchState.active"
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
          @keydown="handleInputKeydown"
        />

        <span
          data-test="rich-text-search-match-position"
          class="text-text-3 min-w-10 text-center text-xs tabular-nums"
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
          @keydown="handleInputKeydown"
        />

        <NButton
          data-test="rich-text-search-replace-current"
          size="small"
          :disabled="!hasActiveMatch"
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
  background-color: color-mix(in srgb, var(--app-primary-color) 16%, transparent);
}

.ProseMirror .rich-text-search-match-current {
  background-color: color-mix(in srgb, var(--app-primary-color) 36%, transparent);
  box-shadow: inset 0 0 0 1px var(--app-primary-color);
}
</style>
