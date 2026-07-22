<script setup lang="ts">
import type { Editor, Range } from '@tiptap/core'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  canRunRichTextSlashCommand,
  filterRichTextSlashCommands,
  runRichTextSlashCommand,
  type RichTextSlashCommand,
  type RichTextSlashCommandConfig,
} from '../slash-command'

const props = withDefaults(
  defineProps<{
    editor: Editor
    config: RichTextSlashCommandConfig
    listboxId: string
    query?: string
    queryRange: Range
  }>(),
  {
    query: '',
  },
)

const emit = defineEmits<{
  tab: []
  'active-change': [optionId: string | undefined]
}>()

const editorRevision = ref(0)
const activeKey = ref<string>()

const groups = computed(() => {
  void editorRevision.value
  return filterRichTextSlashCommands(props.config, props.query)
})

const commands = computed(() => groups.value.flatMap((group) => group.commands))

function isCommandEnabled(command: RichTextSlashCommand) {
  return canRunRichTextSlashCommand(props.editor, command, props.queryRange)
}

const enabledCommands = computed(() => commands.value.filter(isCommandEnabled))

function getOptionId(commandKey: string) {
  return `${props.listboxId}-option-${encodeURIComponent(commandKey)}`
}

const activeOptionId = computed(() =>
  activeKey.value === undefined ? undefined : getOptionId(activeKey.value),
)

function resetActiveCommand() {
  activeKey.value = enabledCommands.value[0]?.key
}

watch(
  () => props.query,
  () => resetActiveCommand(),
  { immediate: true },
)

watch(
  () => enabledCommands.value.map((command) => command.key).join('\0'),
  () => {
    if (!enabledCommands.value.some((command) => command.key === activeKey.value)) {
      resetActiveCommand()
    }
  },
  { immediate: true },
)

watch(activeOptionId, (optionId) => emit('active-change', optionId), { immediate: true })

function handleEditorTransaction() {
  editorRevision.value += 1
}

onMounted(() => props.editor.on('transaction', handleEditorTransaction))
onBeforeUnmount(() => props.editor.off('transaction', handleEditorTransaction))

function executeCommand(command: RichTextSlashCommand) {
  if (!isCommandEnabled(command)) {
    return false
  }

  return runRichTextSlashCommand(props.editor, command, props.queryRange)
}

function moveActiveCommand(offset: -1 | 1) {
  if (!enabledCommands.value.length) {
    return
  }

  const currentIndex = enabledCommands.value.findIndex((command) => command.key === activeKey.value)
  const nextIndex =
    currentIndex === -1
      ? offset === 1
        ? 0
        : enabledCommands.value.length - 1
      : (currentIndex + offset + enabledCommands.value.length) % enabledCommands.value.length

  activeKey.value = enabledCommands.value[nextIndex]?.key
  document.getElementById(activeOptionId.value ?? '')?.scrollIntoView({ block: 'nearest' })
}

function onKeyDown(event: KeyboardEvent) {
  if (event.isComposing || props.editor.view.composing) {
    return false
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    moveActiveCommand(event.key === 'ArrowDown' ? 1 : -1)
    return true
  }

  if (event.key === 'Enter') {
    const command = commands.value.find((item) => item.key === activeKey.value)

    if (!command) {
      return false
    }

    event.preventDefault()
    executeCommand(command)
    return true
  }

  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault()
    return true
  }

  if (event.key === 'Tab') {
    emit('tab')
    return false
  }

  return false
}

defineExpose({
  activeOptionId,
  onKeyDown,
})
</script>

<template>
  <div
    :id="listboxId"
    data-test="rich-text-slash-command-list"
    class="pointer-events-auto max-h-80 min-w-64 overflow-y-auto rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-input-color) p-1 shadow-lg outline-none"
    role="listbox"
    aria-label="Slash 命令"
  >
    <template v-if="groups.length">
      <section
        v-for="group in groups"
        :key="group.key"
        class="mb-1 border-b border-(--rich-text-theme-input-border-color) pb-1 last:mb-0 last:border-b-0 last:pb-0"
        role="presentation"
      >
        <div class="px-2 py-1 text-xs opacity-60" role="presentation">
          {{ group.label }}
        </div>

        <div
          v-for="command in group.commands"
          :id="getOptionId(command.key)"
          :key="command.key"
          :data-test="`rich-text-slash-command-${command.key}`"
          class="flex min-h-9 items-center gap-2 rounded-(--rich-text-theme-border-radius) px-2 py-1.5 text-sm transition-colors"
          :class="[
            isCommandEnabled(command) ? 'cursor-pointer' : 'cursor-not-allowed opacity-50',
            activeKey === command.key
              ? 'bg-(--rich-text-theme-primary-muted-color) text-(--rich-text-theme-primary-color)'
              : '',
          ]"
          role="option"
          :aria-selected="activeKey === command.key"
          :aria-disabled="!isCommandEnabled(command)"
          @mousedown.prevent
          @click="executeCommand(command)"
          @mouseenter="isCommandEnabled(command) && (activeKey = command.key)"
        >
          <span :class="[command.icon, 'size-4 shrink-0']" aria-hidden="true" />
          <span>{{ command.label }}</span>
        </div>
      </section>
    </template>

    <div v-else class="px-3 py-6 text-center text-sm opacity-60" role="presentation">
      无匹配命令
    </div>
  </div>
</template>
