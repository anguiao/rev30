<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  markRichTextSurfaceTransactionCommand,
  restoreRichTextSelection,
  restoreRichTextSelectionCommand,
} from '../../../vue/selection'
import { insertImageAction, updateImageAction } from '../editor'
import type { RichTextImageInput } from '../shared'
import {
  getRichTextImageDialogController,
  isRichTextImageDialogTargetValid,
  type RichTextImageDialogSession,
} from './dialog-controller'
import ImageDialog from './ImageDialog.vue'

const props = withDefaults(
  defineProps<{
    editor: Editor
    disabled?: boolean
  }>(),
  {
    disabled: false,
  },
)

const editor = props.editor
const controller = getRichTextImageDialogController(editor)
const session = computed(() => controller.session.value)
const existingAttrs = computed(() =>
  session.value?.target.type === 'edit' ? session.value.target.attrs : undefined,
)

function close(activeSession: RichTextImageDialogSession, restoreSelection: boolean) {
  controller.close(activeSession)

  if (restoreSelection) {
    restoreRichTextSelection(editor, activeSession.target.selection)
  }
}

function cancel() {
  const activeSession = session.value

  if (activeSession) {
    close(activeSession, true)
  }
}

function handleConfirm(attrs: RichTextImageInput) {
  const activeSession = session.value

  if (!activeSession || !isRichTextImageDialogTargetValid(editor, activeSession.target)) {
    if (activeSession) {
      close(activeSession, false)
    }
    return
  }

  const { target } = activeSession
  const chain = editor.chain()

  if (target.type === 'insert-anchor') {
    chain.command(({ tr }) => {
      closeHistory(tr)
      return true
    })
  }

  if (target.type === 'insert-anchor') {
    chain.command(({ dispatch, tr }) => {
      if (dispatch) {
        tr.setSelection(TextSelection.create(tr.doc, target.anchor + 1))
      }

      return true
    })
  } else {
    chain.command(restoreRichTextSelectionCommand(target.selection))
  }

  const handled = chain
    .command(markRichTextSurfaceTransactionCommand(activeSession.owner))
    .command(
      target.type === 'edit' ? updateImageAction.command(attrs) : insertImageAction.command(attrs),
    )
    .run()

  if (handled) {
    close(activeSession, false)
  }
}

function handleError(error: unknown) {
  session.value?.options.onError?.(error)
}

function handleTransaction({ transaction }: { transaction: Transaction }) {
  const activeSession = session.value

  if (
    activeSession &&
    transaction.docChanged &&
    transaction.getMeta('richTextSurfaceTransaction') !== activeSession.owner
  ) {
    close(activeSession, false)
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    const activeSession = session.value

    if (disabled && activeSession) {
      close(activeSession, false)
    }
  },
)

onMounted(() => {
  editor.on('transaction', handleTransaction)
})

onBeforeUnmount(() => {
  editor.off('transaction', handleTransaction)
})
</script>

<template>
  <ImageDialog
    v-if="session"
    :show="true"
    :existing-attrs="existingAttrs"
    :upload="session.options.upload"
    @update:show="!$event && cancel()"
    @confirm="handleConfirm"
    @error="handleError"
  />
</template>
