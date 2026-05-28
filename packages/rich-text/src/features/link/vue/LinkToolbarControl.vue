<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import { NButton, NInput, NPopover } from 'naive-ui'
import { computed, onBeforeUnmount, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    editor: Editor | null
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const allowedProtocols = new Set(['http:', 'https:', 'mailto:', 'tel:'])
const editorStateVersion = ref(0)
const showPopover = ref(false)
const url = ref('')

const isDisabled = computed(() => props.disabled || !props.editor)
const currentHref = computed(() => {
  editorStateVersion.value

  const href = props.editor?.getAttributes('link').href

  return typeof href === 'string' ? href : ''
})
const isActive = computed(() => {
  editorStateVersion.value

  return props.editor?.isActive('link') ?? false
})

const normalizedInputHref = computed(() => normalizeHref(url.value))
const normalizedOpenHref = computed(() => normalizeHref(url.value || currentHref.value))
const inputStatusProps = computed(() =>
  url.value.trim() !== '' && !isInputHrefAllowed.value ? { status: 'error' as const } : {},
)
const isInputHrefAllowed = computed(
  () => normalizedInputHref.value !== '' && isAllowedHref(normalizedInputHref.value),
)
const canApply = computed(
  () => !isDisabled.value && (normalizedInputHref.value === '' || isInputHrefAllowed.value),
)
const canOpen = computed(
  () =>
    !isDisabled.value &&
    normalizedOpenHref.value !== '' &&
    isAllowedHref(normalizedOpenHref.value),
)

let detachEditorListeners: (() => void) | undefined

function syncEditorState() {
  editorStateVersion.value += 1
}

function bindEditor(editor: Editor | null) {
  detachEditorListeners?.()
  detachEditorListeners = undefined

  if (!editor) {
    syncEditorState()
    return
  }

  editor.on('transaction', syncEditorState)
  editor.on('selectionUpdate', syncEditorState)

  detachEditorListeners = () => {
    editor.off('transaction', syncEditorState)
    editor.off('selectionUpdate', syncEditorState)
  }

  syncEditorState()
}

watch(
  () => props.editor,
  (editor) => {
    bindEditor(editor)
  },
  { immediate: true },
)

watch([showPopover, currentHref], ([show, href]) => {
  if (show) {
    url.value = href
  }
})

onBeforeUnmount(() => {
  detachEditorListeners?.()
})

function normalizeHref(value: string) {
  const href = value.trim()

  if (!href) {
    return ''
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(href)) {
    return href
  }

  return `https://${href}`
}

function isAllowedHref(href: string) {
  try {
    return allowedProtocols.has(new URL(href).protocol)
  } catch {
    return false
  }
}

function applyLink() {
  if (!canApply.value || !props.editor) {
    return
  }

  if (normalizedInputHref.value === '') {
    props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
    url.value = ''
    return
  }

  props.editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: normalizedInputHref.value })
    .run()
  url.value = normalizedInputHref.value
}

function removeLink() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  url.value = ''
}

function openLink() {
  if (!canOpen.value) {
    return
  }

  window.open(normalizedOpenHref.value, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <NPopover v-model:show="showPopover" trigger="click" placement="bottom-start" :disabled="isDisabled">
    <template #trigger>
      <NButton
        data-test="rich-text-link"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="isActive ? 'primary' : 'default'"
        :secondary="isActive"
        :quaternary="!isActive"
        title="链接"
        aria-label="链接"
        :aria-pressed="isActive"
        @mousedown.prevent
      >
        <span class="i-[lucide--link]" aria-hidden="true" />
      </NButton>
    </template>

    <div class="flex items-center gap-1 p-1">
      <NInput
        v-model:value="url"
        data-test="rich-text-link-url"
        size="small"
        placeholder="https://example.com"
        v-bind="inputStatusProps"
        @keydown.enter.prevent="applyLink"
      >
        <template #suffix>
          <NButton
            data-test="rich-text-link-apply"
            text
            :disabled="!canApply"
            title="应用链接"
            aria-label="应用链接"
            @mousedown.prevent
            @click="applyLink"
          >
            <span class="i-[lucide--check]" aria-hidden="true" />
          </NButton>
        </template>
      </NInput>

      <NButton
        data-test="rich-text-link-open"
        size="small"
        quaternary
        :disabled="!canOpen"
        title="新窗口打开链接"
        aria-label="新窗口打开链接"
        @mousedown.prevent
        @click="openLink"
      >
        <span class="i-[lucide--external-link]" aria-hidden="true" />
      </NButton>

      <NButton
        v-if="isActive"
        data-test="rich-text-link-remove"
        size="small"
        quaternary
        title="移除链接"
        aria-label="移除链接"
        @mousedown.prevent
        @click="removeLink"
      >
        <span class="i-[lucide--unlink]" aria-hidden="true" />
      </NButton>
    </div>
  </NPopover>
</template>
