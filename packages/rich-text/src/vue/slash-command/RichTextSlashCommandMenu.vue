<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { onBeforeUnmount, onMounted, watch } from 'vue'
import {
  exitRichTextSlashCommand,
  registerRichTextSlashCommandRenderer,
  type RichTextSlashCommandSuggestionProps,
} from '../../features/slash-command/editor'
import type { RichTextSlashCommandConfig } from '../slash-command'
import { createRichTextSlashCommandInstanceId } from './instance-id'
import RichTextSlashCommandList from './RichTextSlashCommandList.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor
    config: RichTextSlashCommandConfig
    appendTo: HTMLElement
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

interface CommandListExposed {
  readonly activeOptionId?: string
  onKeyDown: (event: KeyboardEvent) => boolean
}

const id = createRichTextSlashCommandInstanceId()
const listboxId = `rich-text-slash-command-${id}`

let unregisterRenderer: (() => void) | undefined
let renderer: VueRenderer | undefined
let unmountRenderer: (() => void) | undefined
let editorElement: HTMLElement | undefined
let previousEditorAria:
  | {
      controls: string | null
      expanded: string | null
      activeDescendant: string | null
    }
  | undefined

function restoreAttribute(name: string, value: string | null) {
  if (!editorElement) {
    return
  }

  if (value === null) {
    editorElement.removeAttribute(name)
  } else {
    editorElement.setAttribute(name, value)
  }
}

function setAriaActive() {
  if (!editorElement) {
    return
  }

  previousEditorAria = {
    controls: editorElement.getAttribute('aria-controls'),
    expanded: editorElement.getAttribute('aria-expanded'),
    activeDescendant: editorElement.getAttribute('aria-activedescendant'),
  }

  editorElement.setAttribute('aria-controls', listboxId)
  editorElement.setAttribute('aria-expanded', 'true')
  editorElement.removeAttribute('aria-activedescendant')
}

function updateActiveDescendant(optionId: string | undefined) {
  if (!editorElement) {
    return
  }

  if (optionId) {
    editorElement.setAttribute('aria-activedescendant', optionId)
  } else {
    editorElement.removeAttribute('aria-activedescendant')
  }
}

function restoreAria() {
  if (!previousEditorAria) {
    return
  }

  if (!editorElement) {
    previousEditorAria = undefined
    return
  }

  if (editorElement.getAttribute('aria-controls') === listboxId) {
    restoreAttribute('aria-controls', previousEditorAria.controls)
    restoreAttribute('aria-expanded', previousEditorAria.expanded)
    restoreAttribute('aria-activedescendant', previousEditorAria.activeDescendant)
  }

  previousEditorAria = undefined
}

function destroyRenderer() {
  unmountRenderer?.()
  unmountRenderer = undefined
  renderer?.destroy()
  renderer = undefined
  restoreAria()
}

function startRenderer(suggestion: RichTextSlashCommandSuggestionProps) {
  destroyRenderer()
  setAriaActive()

  renderer = new VueRenderer(RichTextSlashCommandList, {
    editor: props.editor,
    props: {
      editor: props.editor,
      config: props.config,
      listboxId,
      query: suggestion.query,
      queryRange: suggestion.range,
      onActiveChange: updateActiveDescendant,
      onTab: () => exitRichTextSlashCommand(props.editor),
    },
  })

  const element = renderer.element

  if (!(element instanceof HTMLElement)) {
    throw new Error('Rich text slash command list did not render an HTML element')
  }

  props.appendTo.append(element)
  unmountRenderer = suggestion.mount(element)
}

function updateRenderer(suggestion: RichTextSlashCommandSuggestionProps) {
  renderer?.updateProps({
    query: suggestion.query,
    queryRange: suggestion.range,
  })
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.isComposing || props.editor.view.composing) {
    return false
  }

  return (renderer?.ref as CommandListExposed | undefined)?.onKeyDown(event) ?? false
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      exitRichTextSlashCommand(props.editor)
    }
  },
)

onMounted(() => {
  editorElement = props.editor.view.dom
  unregisterRenderer = registerRichTextSlashCommandRenderer(props.editor, {
    onStart: startRenderer,
    onUpdate: updateRenderer,
    onExit: destroyRenderer,
    onKeyDown: ({ event }) => handleKeyDown(event),
  })
})

onBeforeUnmount(() => {
  exitRichTextSlashCommand(props.editor)
  unregisterRenderer?.()
  destroyRenderer()
  editorElement = undefined
})
</script>

<template />
