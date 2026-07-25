<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getSelectedCodeBlock, setCodeBlockLanguageAction } from '../editor'

interface CodeBlockLanguageControlProps {
  editor: Editor
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
  surface: 'toolbar' | 'quick-bar'
  disabled?: boolean
  showLabel?: boolean
}

const props = withDefaults(defineProps<CodeBlockLanguageControlProps>(), {
  disabled: false,
  showLabel: false,
})

const emit = defineEmits<{
  close: []
}>()

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const show = ref(false)

const currentCodeBlock = computed(() => getSelectedCodeBlock(editor))
const currentLanguage = computed(() => {
  const codeBlock = currentCodeBlock.value
  const language = codeBlock?.node.attrs.language

  if (!codeBlock) {
    return null
  }

  return typeof language === 'string' && language ? language : 'plaintext'
})
const currentOption = computed(
  () => props.languages.find((option) => option.value === currentLanguage.value) ?? null,
)
const isDisabled = computed(() => props.disabled || currentCodeBlock.value === null)
const buttonLabel = computed(() =>
  currentOption.value ? `代码语言：${currentOption.value.label}` : '代码语言',
)
const dataTestPrefix = computed(() =>
  props.surface === 'toolbar'
    ? 'rich-text-code-block-language'
    : 'rich-text-quick-bar-code-block-language',
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

function close() {
  if (!show.value) {
    return
  }

  show.value = false
  emit('close')
}

function cancel() {
  if (!show.value) {
    return
  }

  show.value = false
  editor.commands.focus()
}

function open() {
  if (isDisabled.value) {
    return
  }

  if (props.surface === 'quick-bar') {
    root.value?.querySelector<HTMLElement>(`[data-test="${dataTestPrefix.value}"]`)?.focus()
  }

  show.value = true
}

function handleShow(nextShow: boolean) {
  if (nextShow) {
    open()
  } else if (show.value) {
    close()
  }
}

function handleTriggerMousedown(event: MouseEvent) {
  if (props.surface === 'quick-bar') {
    event.preventDefault()
  }
}

function handleDocumentKeydown(event: KeyboardEvent) {
  const target = event.target

  if (
    !show.value ||
    event.isComposing ||
    event.key !== 'Escape' ||
    !(target instanceof Element) ||
    (root.value?.contains(target) !== true && !editor.view.dom.contains(target))
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  cancel()
}

function setLanguage(value: string | number) {
  const codeBlock = getSelectedCodeBlock(editor)
  const option = props.languages.find((language) => language.value === value)

  if (!codeBlock || !option) {
    close()
    return
  }

  const language = option.value === 'plaintext' ? null : option.value
  const handled = editor.commands.command(setCodeBlockLanguageAction.command(language))

  if (handled) {
    close()
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      close()
    }
  },
)

onMounted(() => {
  document.addEventListener('keydown', handleDocumentKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleDocumentKeydown, true)
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
      :to="false"
      :disabled="isDisabled"
      @update:show="handleShow"
      @select="setLanguage"
    >
      <NButton
        :data-test="dataTestPrefix"
        :data-rich-text-quick-bar-roving="surface === 'quick-bar' ? '' : undefined"
        :disabled="isDisabled"
        size="small"
        :style="surface === 'toolbar' ? '--n-padding: 0 4px' : undefined"
        :text="surface === 'quick-bar'"
        :quaternary="surface === 'toolbar'"
        :title="buttonLabel"
        :aria-label="buttonLabel"
        aria-haspopup="listbox"
        :aria-expanded="show"
        @mousedown="handleTriggerMousedown"
      >
        <span v-if="showLabel" class="mr-1 text-xs">{{ currentOption?.label ?? '纯文本' }}</span>
        <span class="i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
