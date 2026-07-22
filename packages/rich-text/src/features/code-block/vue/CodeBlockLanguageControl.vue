<script setup lang="ts">
import type { RichTextQuickbarInjectedProps } from '../../../vue/quickbar'
import { getRichTextQuickbarLayerId } from '../../../vue/quickbar'
import {
  markRichTextSurfaceTransactionCommand,
  restoreRichTextSelection,
  restoreRichTextSelectionCommand,
  useRichTextTargetInvalidation,
} from '../../../vue/selection'
import {
  type RichTextOverlayCloseReason,
  useRichTextToolbarOverlay,
} from '../../../vue/overlay-state'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { setCodeBlockLanguageAction } from '../editor'
import {
  getRichTextCodeBlockLanguage,
  isRichTextCodeBlockTargetValid,
  resolveRichTextCodeBlockTarget,
  type RichTextCodeBlockTarget,
} from '../target'
import { createCodeBlockLanguageMenuId } from './language-menu-id'

interface CodeBlockLanguageControlProps extends RichTextQuickbarInjectedProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
  surface: 'toolbar' | 'quickbar'
  showLabel?: boolean
}

const props = withDefaults(defineProps<CodeBlockLanguageControlProps>(), {
  disabled: false,
  showLabel: false,
})

const emit = defineEmits<{
  close: [reason: RichTextOverlayCloseReason]
}>()

const editor = props.editor
const owner = Symbol('rich-text-code-block-language')
const layerId = getRichTextQuickbarLayerId(editor)
const menuId = createCodeBlockLanguageMenuId()
const root = ref<HTMLElement | null>(null)
const show = ref(false)
const fixedTarget = ref<RichTextCodeBlockTarget | null>(null)
const toolbarOverlay = useRichTextToolbarOverlay(() => close('outside'))

const currentTarget = computed(() => fixedTarget.value ?? resolveRichTextCodeBlockTarget(editor))
const currentLanguage = computed(() =>
  currentTarget.value ? getRichTextCodeBlockLanguage(currentTarget.value) : null,
)
const currentOption = computed(
  () => props.languages.find((option) => option.value === currentLanguage.value) ?? null,
)
const isDisabled = computed(() => props.disabled || currentTarget.value === null)
const buttonLabel = computed(() =>
  currentOption.value ? `代码语言：${currentOption.value.label}` : '代码语言',
)
const dataTestPrefix = computed(() =>
  props.surface === 'toolbar'
    ? 'rich-text-code-block-language'
    : 'rich-text-quickbar-code-block-language',
)

const options = computed<DropdownOption[]>(() =>
  props.languages.map((language) => {
    const active = currentLanguage.value === language.value

    return {
      key: language.value,
      label: language.label,
      icon: () =>
        h('span', {
          class: [
            'inline-block size-4',
            active ? 'i-[lucide--check] text-(--rich-text-theme-primary-color)' : undefined,
          ],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `${dataTestPrefix.value}-${language.value}`,
        'data-active': active ? 'true' : undefined,
        'aria-pressed': active,
      },
    }
  }),
)

function close(reason: RichTextOverlayCloseReason) {
  if (!show.value && !fixedTarget.value) {
    return
  }

  const target = fixedTarget.value
  show.value = false
  fixedTarget.value = null

  if (props.surface === 'toolbar') {
    toolbarOverlay.close()
  }

  if (reason === 'cancel' && target) {
    restoreRichTextSelection(editor, target.selection)
  }

  emit('close', reason)
}

function open() {
  if (isDisabled.value) {
    return
  }

  const target = resolveRichTextCodeBlockTarget(editor)

  if (!target) {
    return
  }

  fixedTarget.value = target

  if (props.surface === 'toolbar') {
    toolbarOverlay.open()
  } else {
    root.value?.querySelector<HTMLElement>(`[data-test="${dataTestPrefix.value}"]`)?.focus()
  }

  show.value = true
}

function handleShow(nextShow: boolean) {
  if (nextShow) {
    open()
  } else if (show.value) {
    close('outside')
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  const target = event.target

  if (
    !show.value ||
    event.isComposing ||
    event.key !== 'Escape' ||
    !(target instanceof Element) ||
    (root.value?.contains(target) !== true &&
      !editor.view.dom.contains(target) &&
      target.closest(`[data-rich-text-code-block-language-menu="${menuId}"]`) === null)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  close('cancel')
}

function getMenuProps() {
  return {
    'data-rich-text-code-block-language-menu': menuId,
    ...(props.surface === 'quickbar'
      ? { 'data-rich-text-quickbar-subinterface': layerId }
      : undefined),
  }
}

function setLanguage(value: string | number) {
  const target = fixedTarget.value ?? resolveRichTextCodeBlockTarget(editor)
  const option = props.languages.find((language) => language.value === value)

  if (!target || !option || !isRichTextCodeBlockTargetValid(editor, target)) {
    close('invalidated')
    return
  }

  const language = option.value === 'plaintext' ? null : option.value
  const handled = editor
    .chain()
    .command(restoreRichTextSelectionCommand(target.selection))
    .command(markRichTextSurfaceTransactionCommand(owner))
    .command(setCodeBlockLanguageAction.command(language))
    .command(restoreRichTextSelectionCommand(target.selection))
    .focus()
    .run()

  if (handled) {
    close('outside')
  }
}

useRichTextTargetInvalidation(
  editor,
  owner,
  () => show.value,
  () => close('invalidated'),
)

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      close('invalidated')
    }
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown, true)
})

defineExpose({
  close,
  focusInitialControl: () => false,
})
</script>

<template>
  <div ref="root" class="contents">
    <NDropdown
      trigger="click"
      placement="bottom-start"
      scrollable
      :show="show"
      :options="options"
      :to="toolbarOverlay.target.value"
      :menu-props="getMenuProps"
      :disabled="isDisabled"
      @update:show="handleShow"
      @select="setLanguage"
    >
      <NButton
        :data-test="dataTestPrefix"
        :data-rich-text-quickbar-roving="surface === 'quickbar' ? '' : undefined"
        :disabled="isDisabled"
        size="small"
        :style="surface === 'toolbar' ? '--n-padding: 0 4px' : undefined"
        :text="surface === 'quickbar'"
        :quaternary="surface === 'toolbar'"
        :title="buttonLabel"
        :aria-label="buttonLabel"
        aria-haspopup="listbox"
        :aria-expanded="show"
        @mousedown.prevent
      >
        <span v-if="showLabel" class="mr-1 text-xs">{{ currentOption?.label ?? '纯文本' }}</span>
        <span class="i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
