<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import { NButton, NInput, NPopover } from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { normalizeLinkHref } from '../href'

const props = withDefaults(defineProps<RichTextToolbarControlInjectedProps>(), {
  disabled: false,
})

const isDisabled = computed(() => props.disabled || !props.editor)
const isActive = computed(() => props.editor?.isActive('link') ?? false)

const isEditorFocused = computed(() => {
  const editor = props.editor

  if (!editor) {
    return false
  }

  return Boolean(editor.state) && editor.isFocused
})

const showPopover = ref(false)
const popoverMode = ref<'create' | 'edit'>('create')

const url = ref('')
const dismissedHref = ref<string | null>(null)

const currentHref = computed(() => {
  const href = props.editor?.getAttributes('link').href

  return typeof href === 'string' ? href : ''
})

const inputHrefState = computed(() => {
  const rawHref = url.value.trim()
  const normalizedHref = normalizeLinkHref(rawHref)

  return {
    rawHref,
    normalizedHref,
    isEmpty: rawHref === '',
    isAllowed: normalizedHref !== '',
  }
})

const inputStatusProps = computed(() =>
  !inputHrefState.value.isEmpty && !inputHrefState.value.isAllowed
    ? { status: 'error' as const }
    : {},
)
const canApply = computed(
  () => !isDisabled.value && (inputHrefState.value.isEmpty || inputHrefState.value.isAllowed),
)
const canOpen = computed(() => !isDisabled.value && inputHrefState.value.isAllowed)
const canRemove = computed(() => popoverMode.value === 'edit')

watch(
  [currentHref, isDisabled, isEditorFocused],
  ([href, disabled, focused]) => {
    if (disabled || !href) {
      showPopover.value = false
      popoverMode.value = 'create'
      dismissedHref.value = null
      return
    }

    if (focused && href !== dismissedHref.value) {
      url.value = href
      popoverMode.value = 'edit'
      showPopover.value = true
    }
  },
  { immediate: true },
)

function closePopover() {
  if (currentHref.value) {
    dismissedHref.value = currentHref.value
  }

  showPopover.value = false
  popoverMode.value = 'create'
}

function togglePopover() {
  if (isDisabled.value) {
    return
  }

  if (showPopover.value) {
    closePopover()
    return
  }

  dismissedHref.value = null
  url.value = currentHref.value
  popoverMode.value = currentHref.value ? 'edit' : 'create'
  showPopover.value = true
}

function applyLink() {
  if (!canApply.value || !props.editor) {
    return
  }

  if (inputHrefState.value.isEmpty) {
    props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
    url.value = ''
    popoverMode.value = 'create'
    return
  }

  props.editor
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: inputHrefState.value.normalizedHref })
    .run()
  url.value = inputHrefState.value.normalizedHref
}

function removeLink() {
  if (isDisabled.value || !props.editor) {
    return
  }

  props.editor.chain().focus().extendMarkRange('link').unsetLink().run()
  url.value = ''
  popoverMode.value = 'create'
}

function openLink() {
  if (!canOpen.value) {
    return
  }

  window.open(inputHrefState.value.normalizedHref, '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <NPopover
    :show="showPopover"
    trigger="manual"
    placement="bottom"
    :disabled="isDisabled"
    @clickoutside="closePopover"
  >
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
        @click="togglePopover"
      >
        <span class="i-[lucide--link]" aria-hidden="true" />
      </NButton>
    </template>

    <div class="flex items-center gap-1">
      <NInput
        v-model:value="url"
        data-test="rich-text-link-url"
        size="small"
        placeholder="https://example.com"
        v-bind="inputStatusProps"
        @keydown.enter.prevent="applyLink"
        class="mr-1"
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
            <span class="i-[lucide--corner-down-left]" aria-hidden="true" />
          </NButton>
        </template>
      </NInput>

      <NButton
        data-test="rich-text-link-open"
        size="small"
        style="--n-padding: 0 6px"
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
        v-if="canRemove"
        data-test="rich-text-link-remove"
        size="small"
        style="--n-padding: 0 6px"
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
