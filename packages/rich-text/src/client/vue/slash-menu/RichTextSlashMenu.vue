<script setup lang="ts">
import type { SuggestionProps } from '@tiptap/suggestion'
import type { Editor } from '@tiptap/vue-3'
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  useId,
  useTemplateRef,
  watch,
} from 'vue'
import { exitRichTextSlashMenu, registerRichTextSlashMenu } from './plugin'
import {
  canRunRichTextSlashCommand,
  filterRichTextSlashMenu,
  runRichTextSlashCommand,
  type RichTextSlashCommand,
  type RichTextSlashMenuGroup,
} from '.'

const props = defineProps<{
  editor: Editor
  slashMenu: readonly RichTextSlashMenuGroup[]
  appendTo: HTMLElement
}>()

const listboxId = `rich-text-slash-menu-${useId()}`

const root = useTemplateRef<HTMLElement>('root')

const suggestion = shallowRef<SuggestionProps>()

let unregisterSlashMenu: (() => void) | undefined

onMounted(() => {
  unregisterSlashMenu = registerRichTextSlashMenu(
    props.editor,
    {
      onStart: (nextSuggestion) => {
        suggestion.value = nextSuggestion
      },
      onUpdate: (nextSuggestion) => {
        suggestion.value = nextSuggestion
      },
      onExit: () => {
        suggestion.value = undefined
      },
      onKeyDown: ({ event }) => handleKeydown(event),
    },
    props.appendTo,
  )
})

onBeforeUnmount(() => unregisterSlashMenu?.())

const filteredGroups = computed(() =>
  suggestion.value ? filterRichTextSlashMenu(props.slashMenu, suggestion.value.query) : [],
)
const enabledCommands = computed(() => {
  const queryRange = suggestion.value?.range

  return queryRange
    ? filteredGroups.value
        .flatMap((group) => group.commands)
        .filter((command) => canRunRichTextSlashCommand(props.editor, command, queryRange))
    : []
})

function executeCommand(command: RichTextSlashCommand) {
  runRichTextSlashCommand(props.editor, command, suggestion.value!.range)
}

function isCommandEnabled(command: RichTextSlashCommand) {
  return enabledCommands.value.includes(command)
}

const activeKey = ref<string>()

function getOptionId(commandKey: string) {
  return `${listboxId}-option-${encodeURIComponent(commandKey)}`
}

function moveActiveCommand(offset: -1 | 1) {
  const commands = enabledCommands.value
  const currentIndex = commands.findIndex((command) => command.key === activeKey.value)
  const nextCommand = commands[(currentIndex + offset + commands.length) % commands.length]!

  activeKey.value = nextCommand.key
  document.getElementById(getOptionId(nextCommand.key))?.scrollIntoView({ block: 'nearest' })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing || props.editor.view.composing) {
    return false
  }

  if (event.key === 'Tab') {
    exitRichTextSlashMenu(props.editor)
    return false
  }

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!enabledCommands.value.length) {
      return false
    }

    event.preventDefault()
    moveActiveCommand(event.key === 'ArrowDown' ? 1 : -1)
    return true
  }

  if (event.key === 'Enter') {
    const command = enabledCommands.value.find((command) => command.key === activeKey.value)

    if (!command) {
      return false
    }

    event.preventDefault()
    executeCommand(command)
    return true
  }

  return false
}

watch(enabledCommands, (commands) => {
  if (!commands.some((command) => command.key === activeKey.value)) {
    activeKey.value = commands[0]?.key
  }
})

function restoreAttribute(name: string, value: string | null) {
  const editorRoot = props.editor.view.dom

  if (value === null) {
    editorRoot.removeAttribute(name)
  } else {
    editorRoot.setAttribute(name, value)
  }
}

function updateActiveDescendant(commandKey: string | undefined) {
  const editorRoot = props.editor.view.dom

  if (commandKey) {
    editorRoot.setAttribute('aria-activedescendant', getOptionId(commandKey))
  } else {
    editorRoot.removeAttribute('aria-activedescendant')
  }
}

watch(
  root,
  (element, _, onCleanup) => {
    if (!element) {
      return
    }

    const editorRoot = props.editor.view.dom
    const controls = editorRoot.getAttribute('aria-controls')
    const expanded = editorRoot.getAttribute('aria-expanded')
    const activeDescendant = editorRoot.getAttribute('aria-activedescendant')

    editorRoot.setAttribute('aria-controls', listboxId)
    editorRoot.setAttribute('aria-expanded', 'true')
    updateActiveDescendant(activeKey.value)

    const unmount = suggestion.value!.mount(element)

    onCleanup(() => {
      unmount()
      restoreAttribute('aria-controls', controls)
      restoreAttribute('aria-expanded', expanded)
      restoreAttribute('aria-activedescendant', activeDescendant)
    })
  },
  { flush: 'post' },
)

watch(activeKey, (commandKey) => {
  if (root.value) {
    updateActiveDescendant(commandKey)
  }
})
</script>

<template>
  <Teleport :to="appendTo">
    <div
      v-if="suggestion"
      :id="listboxId"
      ref="root"
      data-test="rich-text-slash-menu"
      class="pointer-events-auto max-h-80 min-w-64 overflow-y-auto rounded-(--rich-text-theme-border-radius) border border-(--rich-text-theme-input-border-color) bg-(--rich-text-theme-popover-color) p-1 shadow-lg outline-none"
      role="listbox"
      aria-label="Slash 命令"
    >
      <template v-if="filteredGroups.length">
        <section
          v-for="group in filteredGroups"
          :key="group.key"
          class="mb-1 border-b border-stone-200 pb-1 last:mb-0 last:border-b-0 last:pb-0 dark:border-zinc-500/60"
          role="presentation"
        >
          <div class="px-2 py-1 text-xs opacity-60" role="presentation">
            {{ group.label }}
          </div>

          <div
            v-for="command in group.commands"
            :id="getOptionId(command.key)"
            :key="command.key"
            :data-test="`rich-text-slash-menu-${command.key}`"
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
            @click="isCommandEnabled(command) && executeCommand(command)"
            @mousemove="isCommandEnabled(command) && (activeKey = command.key)"
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
  </Teleport>
</template>
