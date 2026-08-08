<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import { canRunRichTextAction, runRichTextAction } from '../../../../client/editor/action'
import { useRichTextDropdownTrigger } from '../../../../client/vue/interactions/dropdown'
import { getSelectedCodeBlock, setCodeBlockLanguageAction } from '../editor'

interface CodeBlockLanguageControlProps {
  editor: Editor
  disabled?: boolean
}

const props = withDefaults(defineProps<CodeBlockLanguageControlProps>(), {
  disabled: false,
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
const currentLanguage = computed(() => currentCodeBlock.value?.node.attrs.language ?? 'plaintext')
const languageLabel = computed(
  () =>
    languages.find((option) => option.value === currentLanguage.value)?.label ??
    currentLanguage.value,
)

function canSetLanguage(value: string) {
  if (props.disabled) {
    return false
  }

  if (currentCodeBlock.value !== null) {
    return true
  }

  const language = value === 'plaintext' ? null : value
  return canRunRichTextAction(editor, setCodeBlockLanguageAction, language)
}

const options = computed<DropdownOption[]>(() =>
  languages.map((language) => {
    const active = currentCodeBlock.value !== null && currentLanguage.value === language.value
    const disabled = !canSetLanguage(language.value)

    return {
      key: language.value,
      label: language.label,
      disabled,
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
        'aria-pressed': active,
        'aria-disabled': disabled ? 'true' : undefined,
        onMousedown: (event) => event.preventDefault(),
      },
    }
  }),
)

const isDisabled = computed(() => options.value.every((option) => option.disabled))
const { show, handleTriggerKeydown } = useRichTextDropdownTrigger(isDisabled)

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
      <slot
        name="trigger"
        :active="currentCodeBlock !== null"
        :disabled="isDisabled"
        :show="show"
        :language-label="languageLabel"
        :handle-keydown="handleTriggerKeydown"
      />
    </NDropdown>
  </div>
</template>
