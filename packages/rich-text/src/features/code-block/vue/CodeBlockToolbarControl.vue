<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { DropdownOption } from 'naive-ui'
import { NButton, NButtonGroup, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import { codeBlockAction, setCodeBlockLanguageAction } from '../editor'

interface CodeBlockToolbarControlProps extends RichTextToolbarControlInjectedProps {
  languages: readonly {
    readonly label: string
    readonly value: string
  }[]
}

const props = withDefaults(defineProps<CodeBlockToolbarControlProps>(), {
  disabled: false,
})

const editor = props.editor
const isActive = computed(() => editor?.isActive('codeBlock') ?? false)
const isDisabled = computed(
  () => props.disabled || !editor || !(codeBlockAction.canRun?.(editor) ?? true),
)

const isCaretInsideCodeBlock = computed(() => {
  if (!editor) {
    return false
  }

  const { selection } = editor.state

  return selection.empty && selection.$from.parent.type.name === 'codeBlock'
})

const currentLanguageOption = computed(() => {
  if (!editor || !isCaretInsideCodeBlock.value) {
    return null
  }

  const language = editor.getAttributes('codeBlock').language ?? 'plaintext'

  return props.languages.find((option) => option.value === language) ?? null
})
const languageButtonLabel = computed(() =>
  currentLanguageOption.value ? `代码语言：${currentLanguageOption.value.label}` : '代码语言',
)
const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

function toggleCodeBlock() {
  if (!isDisabled.value && editor) {
    codeBlockAction.run(editor)
  }
}

const isLanguageControlDisabled = computed(
  () => props.disabled || !editor || !isCaretInsideCodeBlock.value,
)
const options = computed<DropdownOption[]>(() =>
  props.languages.map((language) => {
    const active = currentLanguageOption.value?.value === language.value

    return {
      key: language.value,
      label: language.label,
      icon: () =>
        h('span', {
          class: ['inline-block size-4', active ? 'i-[lucide--check] text-primary' : undefined],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `rich-text-code-block-language-${language.value}`,
        'data-active': active ? 'true' : undefined,
        'aria-pressed': active,
      },
    }
  }),
)

function setLanguage(value: string) {
  const option = props.languages.find((language) => language.value === value)

  if (!editor || isLanguageControlDisabled.value || !option) {
    return
  }

  setCodeBlockLanguageAction.run(editor, option.value === 'plaintext' ? null : option.value)
}
</script>

<template>
  <NButtonGroup size="small">
    <NButton
      data-test="rich-text-code-block"
      :data-active="isActive ? 'true' : undefined"
      :disabled="isDisabled"
      style="--n-padding: 0 6px"
      :type="buttonType"
      :secondary="isActive"
      :quaternary="!isActive"
      title="代码块"
      aria-label="代码块"
      :aria-pressed="isActive"
      @click="toggleCodeBlock"
    >
      <span class="i-[lucide--square-code]" aria-hidden="true" />
    </NButton>

    <NDropdown
      trigger="click"
      placement="bottom-start"
      scrollable
      :options="options"
      :disabled="isLanguageControlDisabled"
      @select="setLanguage"
    >
      <NButton
        data-test="rich-text-code-block-language"
        :disabled="isLanguageControlDisabled"
        style="--n-padding: 0 4px"
        :type="buttonType"
        :secondary="isActive"
        :quaternary="!isActive"
        :title="languageButtonLabel"
        :aria-label="languageButtonLabel"
        @mousedown.prevent
      >
        <span class="i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </NButtonGroup>
</template>
