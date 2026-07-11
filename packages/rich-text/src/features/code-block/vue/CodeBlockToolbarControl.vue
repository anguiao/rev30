<script setup lang="ts">
import type { RichTextToolbarControlInjectedProps } from '../../../vue/toolbar'
import type { CodeBlockLanguageOption } from '../languages'
import type { DropdownDividerOption, DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h } from 'vue'
import { codeBlockAction, setCodeBlockLanguageAction } from '../editor'
import { normalizeCodeBlockLanguage } from '../languages'

interface CodeBlockToolbarControlProps extends RichTextToolbarControlInjectedProps {
  languages: readonly CodeBlockLanguageOption[]
}

const props = withDefaults(defineProps<CodeBlockToolbarControlProps>(), {
  disabled: false,
})

const automaticKey = 'code-block-auto'
const paragraphKey = 'code-block-paragraph'
const languageKeyPrefix = 'code-block-language-'

const isActive = computed(() => props.editor?.isActive('codeBlock') ?? false)
const isDisabled = computed(
  () => props.disabled || !props.editor || !(codeBlockAction.canRun?.(props.editor) ?? true),
)

const currentLanguage = computed(() =>
  normalizeCodeBlockLanguage(props.editor?.getAttributes('codeBlock').language),
)
const currentLanguageLabel = computed(
  () =>
    props.languages.find((language) => language.value === currentLanguage.value)?.label ??
    '自动检测',
)
const selectedKey = computed(() => {
  if (!isActive.value) {
    return null
  }

  return currentLanguage.value === null
    ? automaticKey
    : `${languageKeyPrefix}${currentLanguage.value}`
})
const triggerLabel = computed(() =>
  isActive.value ? `代码块：${currentLanguageLabel.value}` : '代码块',
)

function renderSelectionIcon(selected: boolean) {
  return () =>
    h('span', {
      class: ['inline-block size-4', selected ? 'i-[lucide--check] text-primary' : undefined],
      'aria-hidden': 'true',
    })
}

const options = computed<(DropdownOption | DropdownDividerOption)[]>(() => [
  {
    key: automaticKey,
    label: '自动检测',
    icon: renderSelectionIcon(selectedKey.value === automaticKey),
    props: {
      'data-test': 'rich-text-code-block-auto',
      'data-active': selectedKey.value === automaticKey ? 'true' : undefined,
      'aria-pressed': selectedKey.value === automaticKey,
    },
  },
  ...props.languages.map((language) => {
    const key = `${languageKeyPrefix}${language.value}`

    return {
      key,
      label: language.label,
      icon: renderSelectionIcon(selectedKey.value === key),
      props: {
        'data-test': key.replace('code-block-', 'rich-text-code-block-'),
        'data-active': selectedKey.value === key ? 'true' : undefined,
        'aria-pressed': selectedKey.value === key,
      },
    }
  }),
  ...(isActive.value
    ? [
        { key: 'code-block-divider', type: 'divider' as const },
        {
          key: paragraphKey,
          label: '转为正文',
          icon: () =>
            h('span', {
              class: 'i-[lucide--pilcrow] inline-block size-4',
              'aria-hidden': 'true',
            }),
          props: {
            'data-test': 'rich-text-code-block-paragraph',
            'aria-pressed': false,
          },
        },
      ]
    : []),
])

function handleSelect(key: string | number) {
  if (isDisabled.value || !props.editor) {
    return
  }

  if (key === paragraphKey) {
    codeBlockAction.run(props.editor)
    return
  }

  if (key === automaticKey) {
    setCodeBlockLanguageAction.run(props.editor, null)
    return
  }

  const language = props.languages.find(
    (option) => `${languageKeyPrefix}${option.value}` === key,
  )?.value

  if (language) {
    setCodeBlockLanguageAction.run(props.editor, language)
  }
}
</script>

<template>
  <NDropdown
    trigger="click"
    placement="bottom-start"
    :options="options"
    :disabled="isDisabled"
    @select="handleSelect"
  >
    <NButton
      data-test="rich-text-code-block"
      :data-active="isActive ? 'true' : undefined"
      :disabled="isDisabled"
      size="small"
      style="--n-padding: 0 6px"
      :type="isActive ? 'primary' : 'default'"
      :secondary="isActive"
      :quaternary="!isActive"
      :title="triggerLabel"
      :aria-label="triggerLabel"
      :aria-pressed="isActive"
      @mousedown.prevent
    >
      <span class="i-[lucide--square-code]" aria-hidden="true" />
      <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
    </NButton>
  </NDropdown>
</template>
