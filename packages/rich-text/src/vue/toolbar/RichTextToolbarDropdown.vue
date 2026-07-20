<script setup lang="ts">
import type { Editor } from '@tiptap/vue-3'
import type { DropdownOption } from 'naive-ui'
import { NButton, NDropdown } from 'naive-ui'
import { computed, h, onBeforeUnmount, onMounted, ref } from 'vue'
import { runRichTextAction } from '../../editor/action'
import {
  getActiveRichTextToolbarItem,
  isRichTextActionDisabled,
  type RichTextToolbarItem,
  type RichTextToolbarDropdownControl,
} from '../toolbar'
import { useRichTextToolbarLayer } from '../surface-coordinator'
import { createRichTextToolbarDropdownMenuId } from './dropdown-menu-id'

const props = withDefaults(
  defineProps<{
    control: RichTextToolbarDropdownControl
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const menuId = createRichTextToolbarDropdownMenuId()
const root = ref<HTMLElement | null>(null)
const show = ref(false)

function closeDropdown() {
  show.value = false
  toolbarLayer.release()
}

const toolbarLayer = useRichTextToolbarLayer(editor, closeDropdown)

function handleShow(nextShow: boolean) {
  if (nextShow) {
    toolbarLayer.claim()
    show.value = true
    return
  }

  closeDropdown()
}

function getMenuProps() {
  return { 'data-rich-text-toolbar-dropdown-menu': menuId }
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target

  if (
    !show.value ||
    event.isComposing ||
    event.key !== 'Escape' ||
    !(target instanceof Element) ||
    (root.value?.contains(target) !== true &&
      !editor.view.dom.contains(target) &&
      target.closest(`[data-rich-text-toolbar-dropdown-menu="${menuId}"]`) === null)
  ) {
    return
  }

  event.preventDefault()
  event.stopPropagation()
  closeDropdown()
  editor.commands.focus()
}

function isItemDisabled(item: RichTextToolbarItem) {
  return props.disabled || isRichTextActionDisabled(item.action, editor)
}

const activeItem = computed(
  () =>
    props.control.getActiveItem?.(editor, props.control.items) ??
    getActiveRichTextToolbarItem(editor, props.control.items),
)

const isActive = computed(() => activeItem.value !== undefined)

const isDisabled = computed(
  () => props.disabled || props.control.items.every((item) => isItemDisabled(item)),
)

const triggerLabel = computed(() => activeItem.value?.label ?? props.control.label)
const triggerIcon = computed(() => activeItem.value?.icon ?? props.control.icon)
const buttonType = computed(() => (isActive.value ? 'primary' : 'default'))

const options = computed<DropdownOption[]>(() =>
  props.control.items.map((item) => {
    const active = activeItem.value?.action.key === item.action.key

    return {
      key: item.action.key,
      label: item.label,
      disabled: isItemDisabled(item),
      icon: () =>
        h('span', {
          class: [item.icon, 'inline-block size-4', active ? 'text-primary' : undefined],
          'aria-hidden': 'true',
        }),
      props: {
        'data-test': `rich-text-${props.control.key}-${item.action.key}`,
        'data-active': active ? 'true' : undefined,
        'aria-pressed': item.action.isActive ? active : undefined,
      },
    }
  }),
)

function renderLabel(option: DropdownOption) {
  const active = activeItem.value?.action.key === option.key

  return h('span', { class: 'flex min-w-24 items-center justify-between gap-4' }, [
    h('span', option.label as string),
    active
      ? h('span', {
          class: 'i-[lucide--check] inline-block size-4 text-primary',
          'aria-hidden': 'true',
        })
      : null,
  ])
}

function handleSelect(key: string | number) {
  const item = props.control.items.find((item) => item.action.key === key)
  if (!item || isItemDisabled(item)) {
    return
  }

  if (runRichTextAction(editor, item.action)) {
    closeDropdown()
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown, true)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown, true)
})
</script>

<template>
  <div ref="root" class="contents" @keydown.capture="handleKeydown">
    <NDropdown
      trigger="click"
      :show="show"
      placement="bottom-start"
      :options="options"
      :render-label="renderLabel"
      :menu-props="getMenuProps"
      @update:show="handleShow"
      @select="handleSelect"
    >
      <NButton
        :data-test="`rich-text-${control.key}`"
        :data-active="isActive ? 'true' : undefined"
        :disabled="isDisabled"
        size="small"
        style="--n-padding: 0 6px"
        :type="buttonType"
        :secondary="isActive"
        :quaternary="!isActive"
        :title="triggerLabel"
        :aria-label="triggerLabel"
        :aria-pressed="isActive"
        aria-haspopup="menu"
        :aria-expanded="show"
        @mousedown.prevent
      >
        <span :class="triggerIcon" aria-hidden="true" />
        <span class="ml-0.5 i-[lucide--chevron-down] text-xs" aria-hidden="true" />
      </NButton>
    </NDropdown>
  </div>
</template>
