<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h, nextTick, ref } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { getSelectedCodeBlock, setCodeBlockLanguageAction } from '../editor'
import { focusRichTextMenuItem, handleRichTextMenuKeydown } from '../../../vue/interactions/focus'

interface CodeBlockLanguageControlProps {
  editor: Editor
  disabled?: boolean
  showLabel?: boolean
}

const props = withDefaults(defineProps<CodeBlockLanguageControlProps>(), {
  disabled: false,
  showLabel: false,
})

const editor = props.editor
const root = ref<HTMLElement | null>(null)
const show = ref(false)

const languages = [
  { label: '纯文本', value: 'plaintext' },
  { label: 'TypeScript / JavaScript', value: 'typescript' },
  { label: 'HTML', value: 'xml' },
  { label: 'CSS', value: 'css' },
  { label: 'Java', value: 'java' },
  { label: 'Python', value: 'python' },
  { label: 'Rust', value: 'rust' },
  { label: 'JSON', value: 'json' },
  { label: 'SQL', value: 'sql' },
  { label: 'Markdown', value: 'markdown' },
  { label: 'YAML', value: 'yaml' },
  { label: 'Bash', value: 'bash' },
] as const

const currentCodeBlock = computed(() => getSelectedCodeBlock(editor.state.selection))
const isDisabled = computed(() => props.disabled || currentCodeBlock.value === null)

const currentLanguage = computed(() => {
  const codeBlock = currentCodeBlock.value

  if (!codeBlock) {
    return null
  }

  return codeBlock.node.attrs.language ?? 'plaintext'
})
const languageLabel = computed(
  () =>
    languages.find((option) => option.value === currentLanguage.value)?.label ??
    currentLanguage.value,
)
const buttonLabel = computed(() =>
  languageLabel.value ? `代码语言：${languageLabel.value}` : '代码语言',
)

const options = computed<DropdownOption[]>(() =>
  languages.map((language) => {
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
        'data-test': `rich-text-code-block-language-${language.value}`,
        role: 'menuitem',
        'data-active': active ? 'true' : undefined,
        'aria-pressed': active,
      },
    }
  }),
)

function handleShow(nextShow: boolean) {
  show.value = nextShow

  if (nextShow) {
    void nextTick(() => focusRichTextMenuItem(root.value, 'active'))
  }
}

function handleTriggerKeydown(event: KeyboardEvent) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    isDisabled.value ||
    !['ArrowDown', 'ArrowUp'].includes(event.key)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  show.value = true
  void nextTick(() =>
    focusRichTextMenuItem(root.value, event.key === 'ArrowUp' ? 'last' : 'active'),
  )
}

function handleEscape(event: KeyboardEvent) {
  if (event.defaultPrevented || !show.value || event.isComposing || event.key !== 'Escape') {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  show.value = false

  const triggerElement = root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item]')
  void nextTick(() => triggerElement?.focus())
}

function handleKeydown(event: KeyboardEvent) {
  if (show.value) {
    handleRichTextMenuKeydown(event, {
      trigger: root.value?.querySelector<HTMLElement>('[data-rich-text-toolbar-item]') ?? null,
      close: () => {
        show.value = false
      },
    })
  }

  handleEscape(event)
}

function handleSelect(value: string) {
  const option = languages.find((language) => language.value === value)

  if (!option) {
    return
  }

  const language = option.value === 'plaintext' ? null : option.value
  runRichTextAction(editor, setCodeBlockLanguageAction, language)
}
</script>

<template>
  <div ref="root" class="contents" @keydown.capture="handleKeydown">
    <NDropdown
      trigger="click"
      placement="bottom-start"
      scrollable
      :show="show"
      :options="options"
      :to="false"
      :menu-props="() => ({ role: 'menu', 'aria-label': '代码语言' })"
      :disabled="isDisabled"
      @update:show="handleShow"
      @select="handleSelect"
    >
      <NButton
        data-test="rich-text-code-block-language"
        data-rich-text-toolbar-item="code-block-language"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        quaternary
        :title="buttonLabel"
        :aria-label="buttonLabel"
        aria-haspopup="menu"
        :aria-expanded="show"
        @keydown="handleTriggerKeydown"
      >
        <span v-if="showLabel" class="mr-1 text-xs">{{ languageLabel }}</span>
        <span class="i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
