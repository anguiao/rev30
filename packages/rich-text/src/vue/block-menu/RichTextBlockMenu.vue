<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { VueRenderer } from '@tiptap/vue-3'
import { FloatingMenu } from '@tiptap/vue-3/menus'
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  exitRichTextSlashCommand,
  registerRichTextSlashCommandRenderer,
  type RichTextSlashCommandSuggestionProps,
} from '../../features/block-command/editor'
import {
  isEmptyTopLevelParagraphAnchor,
  resolveEmptyTopLevelParagraphAnchor,
  richTextBlockMenuPluginKey,
  type RichTextBlockMenuConfig,
} from '../block-menu'
import { excludeRichTextMenuWrapperFromTabOrder } from '../menu-wrapper'
import RichTextBlockCommandList from './RichTextBlockCommandList.vue'
import { createRichTextBlockMenuInstanceId } from './instance-id'

const props = withDefaults(
  defineProps<{
    editor: Editor
    config: RichTextBlockMenuConfig
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

interface RichTextBlockCommandListExposed {
  readonly activeOptionId?: string
  onKeyDown: (event: KeyboardEvent) => boolean
}

const id = createRichTextBlockMenuInstanceId()
const plusListboxId = `rich-text-block-menu-${id}`
const slashListboxId = `rich-text-slash-command-${id}`
const menuRoot = ref<HTMLElement>()
const plusCommandList = ref<InstanceType<typeof RichTextBlockCommandList>>()
const plusOpen = ref(false)
const plusAnchor = ref<number>()

let unregisterSlashRenderer: (() => void) | undefined
let slashRenderer: VueRenderer | undefined
let unmountSlashRenderer: (() => void) | undefined
let editorElement: HTMLElement | undefined
let previousEditorAria:
  | {
      controls: string | null
      expanded: string | null
      activeDescendant: string | null
    }
  | undefined
let stopMenuWrapperTabIndexSync: (() => void) | undefined

const floatingMenuOptions = {
  placement: 'left-start' as const,
  offset: { mainAxis: 8 },
  flip: {},
  shift: { padding: 8 },
}

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

function setSlashAriaActive() {
  if (!editorElement) {
    return
  }

  previousEditorAria = {
    controls: editorElement.getAttribute('aria-controls'),
    expanded: editorElement.getAttribute('aria-expanded'),
    activeDescendant: editorElement.getAttribute('aria-activedescendant'),
  }

  editorElement.setAttribute('aria-controls', slashListboxId)
  editorElement.setAttribute('aria-expanded', 'true')
  editorElement.removeAttribute('aria-activedescendant')
}

function updateSlashActiveDescendant(optionId: string | undefined) {
  if (!editorElement) {
    return
  }

  if (optionId) {
    editorElement.setAttribute('aria-activedescendant', optionId)
  } else {
    editorElement.removeAttribute('aria-activedescendant')
  }
}

function restoreSlashAria() {
  if (!previousEditorAria) {
    return
  }

  if (!editorElement) {
    previousEditorAria = undefined
    return
  }

  if (editorElement.getAttribute('aria-controls') === slashListboxId) {
    restoreAttribute('aria-controls', previousEditorAria.controls)
    restoreAttribute('aria-expanded', previousEditorAria.expanded)
    restoreAttribute('aria-activedescendant', previousEditorAria.activeDescendant)
  }

  previousEditorAria = undefined
}

function destroySlashRenderer() {
  unmountSlashRenderer?.()
  unmountSlashRenderer = undefined
  slashRenderer?.destroy()
  slashRenderer = undefined
  restoreSlashAria()
}

function startSlashRenderer(suggestion: RichTextSlashCommandSuggestionProps) {
  destroySlashRenderer()
  setSlashAriaActive()

  slashRenderer = new VueRenderer(RichTextBlockCommandList, {
    editor: props.editor,
    props: {
      editor: props.editor,
      config: props.config,
      source: 'slash',
      listboxId: slashListboxId,
      query: suggestion.query,
      queryRange: suggestion.range,
      onActiveChange: updateSlashActiveDescendant,
      onClose: (reason: 'escape' | 'tab') => {
        if (reason === 'tab') {
          exitRichTextSlashCommand(props.editor)
        }
      },
    },
  })

  const element = slashRenderer.element

  if (!(element instanceof HTMLElement)) {
    throw new Error('Rich text slash command list did not render an HTML element')
  }

  unmountSlashRenderer = suggestion.mount(element)
}

function updateSlashRenderer(suggestion: RichTextSlashCommandSuggestionProps) {
  slashRenderer?.updateProps({
    query: suggestion.query,
    queryRange: suggestion.range,
  })
}

function handleSlashKeyDown(event: KeyboardEvent) {
  if (event.isComposing || props.editor.view.composing) {
    return false
  }

  return (
    (slashRenderer?.ref as RichTextBlockCommandListExposed | undefined)?.onKeyDown(event) ?? false
  )
}

function shouldShowPlusMenu({ view }: { view: Editor['view'] }) {
  if (props.disabled || !props.editor.isEditable) {
    return false
  }

  if (plusOpen.value) {
    return (
      plusAnchor.value !== undefined &&
      isEmptyTopLevelParagraphAnchor(props.editor, plusAnchor.value)
    )
  }

  return view.hasFocus() && resolveEmptyTopLevelParagraphAnchor(props.editor) !== undefined
}

function openPlusMenu() {
  const anchor = resolveEmptyTopLevelParagraphAnchor(props.editor)

  if (anchor === undefined) {
    return
  }

  plusAnchor.value = anchor
  plusOpen.value = true
  nextTick(() => plusCommandList.value?.focus())
}

function closePlusMenu(reason?: 'escape' | 'tab' | 'outside' | 'invalid' | 'executed') {
  const anchor = plusAnchor.value

  plusOpen.value = false
  plusAnchor.value = undefined

  if (
    reason === 'escape' &&
    anchor !== undefined &&
    isEmptyTopLevelParagraphAnchor(props.editor, anchor)
  ) {
    props.editor
      .chain()
      .setTextSelection(anchor + 1)
      .focus()
      .run()
  }
}

function handlePlusClose(reason: 'escape' | 'tab') {
  closePlusMenu(reason)
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (plusOpen.value && event.target instanceof Node && !menuRoot.value?.contains(event.target)) {
    closePlusMenu('outside')
  }
}

function handleEditorTransaction() {
  if (
    plusOpen.value &&
    (plusAnchor.value === undefined ||
      !isEmptyTopLevelParagraphAnchor(props.editor, plusAnchor.value))
  ) {
    closePlusMenu('invalid')
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      closePlusMenu('invalid')
      props.editor.view.dispatch(props.editor.state.tr.setMeta(richTextBlockMenuPluginKey, 'hide'))
      exitRichTextSlashCommand(props.editor)
    }
  },
)

watch(menuRoot, (element) => {
  stopMenuWrapperTabIndexSync?.()
  stopMenuWrapperTabIndexSync = undefined

  if (element) {
    void nextTick(() => {
      if (menuRoot.value === element) {
        stopMenuWrapperTabIndexSync = excludeRichTextMenuWrapperFromTabOrder(element)
      }
    })
  }
})

onMounted(() => {
  editorElement = props.editor.view.dom
  unregisterSlashRenderer = registerRichTextSlashCommandRenderer(props.editor, {
    onStart: startSlashRenderer,
    onUpdate: updateSlashRenderer,
    onExit: destroySlashRenderer,
    onKeyDown: ({ event }) => handleSlashKeyDown(event),
  })

  props.editor.on('transaction', handleEditorTransaction)
  document.addEventListener('pointerdown', handleDocumentPointerDown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
  props.editor.off('transaction', handleEditorTransaction)
  exitRichTextSlashCommand(props.editor)
  unregisterSlashRenderer?.()
  destroySlashRenderer()
  stopMenuWrapperTabIndexSync?.()
  stopMenuWrapperTabIndexSync = undefined
  editorElement = undefined
})
</script>

<template>
  <FloatingMenu
    :editor="editor"
    :plugin-key="richTextBlockMenuPluginKey"
    :options="floatingMenuOptions"
    :should-show="shouldShowPlusMenu"
  >
    <div ref="menuRoot" class="flex items-start gap-2">
      <button
        data-test="rich-text-block-menu-trigger"
        class="flex size-11 shrink-0 items-center justify-center rounded-ui border border-input-border bg-input text-lg shadow-lg transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        type="button"
        aria-label="打开块命令"
        aria-haspopup="listbox"
        :aria-controls="plusOpen ? plusListboxId : undefined"
        :aria-expanded="plusOpen"
        @click="plusOpen ? closePlusMenu('outside') : openPlusMenu()"
      >
        <span class="i-[lucide--plus] size-5" aria-hidden="true" />
      </button>

      <RichTextBlockCommandList
        v-if="plusOpen && plusAnchor !== undefined"
        ref="plusCommandList"
        :editor="editor"
        :config="config"
        source="plus"
        :listbox-id="plusListboxId"
        :anchor="plusAnchor"
        @close="handlePlusClose"
        @executed="closePlusMenu('executed')"
      />
    </div>
  </FloatingMenu>
</template>
