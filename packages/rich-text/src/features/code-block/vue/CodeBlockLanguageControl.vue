<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import { runRichTextAction } from '../../../editor/action'
import { useRichTextDropdownTrigger } from '../../../vue/interactions/dropdown'
import { getSelectedCodeBlock, setCodeBlockLanguageAction } from '../editor'

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
const { show, handleTriggerKeydown } = useRichTextDropdownTrigger(isDisabled)

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
  <div class="contents">
    <NDropdown
      v-model:show="show"
      trigger="click"
      placement="bottom-start"
      scrollable
      :options="options"
      :to="false"
      :menu-props="() => ({ role: 'menu', 'aria-label': '代码语言' })"
      :disabled="isDisabled"
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
