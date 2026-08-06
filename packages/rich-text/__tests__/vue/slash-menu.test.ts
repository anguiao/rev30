import { describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { defineRichTextPreset } from '../../src/core/preset'
import {
  canRunRichTextAction,
  defineRichTextAction,
  defineRichTextActionItem,
} from '../../src/editor/action'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature, paragraphActionItem } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { headingActionItems, headingEditorFeature } from '../../src/features/heading/editor'
import { headingFeature } from '../../src/features/heading/shared'
import { historyEditorFeature } from '../../src/features/history/editor'
import { historyFeature } from '../../src/features/history/shared'
import { imageActionItem, imageEditorFeature } from '../../src/features/image/editor'
import { imageFeature } from '../../src/features/image/shared'
import { createImagePickerHandler } from '../../src/features/image/vue'
import { tableActionItem, tableEditorFeature } from '../../src/features/table/editor'
import { tableFeature } from '../../src/features/table/shared'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import {
  canRunRichTextSlashCommand,
  defineRichTextSlashMenu,
  filterRichTextSlashMenu,
  richTextSlashCommand,
  runRichTextSlashCommand,
} from '../../src/vue/slash-menu'
import { createTestEditor } from '../helpers/editor'

const slashMenuPreset = defineRichTextPreset({
  key: 'slash-menu-test',
  features: [baseFeature, historyFeature, headingFeature, imageFeature],
})

const slashMenuEditorPreset = defineRichTextEditorPreset(slashMenuPreset, {
  editorFeatures: [
    baseEditorFeature,
    historyEditorFeature,
    headingEditorFeature,
    imageEditorFeature,
  ],
  interactionHandlers: [
    createImagePickerHandler({
      upload: async () => ({ src: '/uploads/image.png' }),
    }),
  ],
})

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions(slashMenuEditorPreset),
    content,
  })
}

const paragraphCommand = richTextSlashCommand(paragraphActionItem)
const headingCommand = richTextSlashCommand(headingActionItems[0])
const tableCommand = richTextSlashCommand(tableActionItem)
const imageCommand = richTextSlashCommand(imageActionItem)

function createGroups() {
  return defineRichTextSlashMenu([
    {
      key: 'basic',
      label: '基础块',
      commands: [paragraphCommand, headingCommand],
    },
    {
      key: 'list',
      label: '列表',
      commands: [],
    },
    {
      key: 'insert',
      label: '插入',
      commands: [imageCommand],
    },
  ])
}

describe('rich text slash menu model', () => {
  it('rejects duplicate group and command keys', () => {
    expect(() =>
      defineRichTextSlashMenu([
        { key: 'same', label: '一', commands: [paragraphCommand] },
        { key: 'same', label: '二', commands: [headingCommand] },
      ]),
    ).toThrow('duplicate group: "same"')

    expect(() =>
      defineRichTextSlashMenu([
        { key: 'one', label: '一', commands: [paragraphCommand] },
        { key: 'two', label: '二', commands: [paragraphCommand] },
      ]),
    ).toThrow('duplicate command: "paragraph"')
  })

  it('filters labels, keys, and feature keywords by case-insensitive inclusion without reordering', () => {
    const groups = createGroups()

    expect(filterRichTextSlashMenu(groups, '')).toBe(groups)
    expect(filterRichTextSlashMenu(groups, '正')).toMatchObject([
      { key: 'basic', commands: [{ key: 'paragraph' }] },
    ])
    expect(filterRichTextSlashMenu(groups, 'PARA')).toMatchObject([
      { key: 'basic', commands: [{ key: 'paragraph' }] },
    ])
    expect(filterRichTextSlashMenu(groups, 'h1')).toMatchObject([
      { key: 'basic', commands: [{ key: 'heading-1' }] },
    ])
    expect(filterRichTextSlashMenu(groups, 'ADING')).toMatchObject([
      { key: 'basic', commands: [{ key: 'heading-1' }] },
    ])
    expect(filterRichTextSlashMenu(groups, 'PIC')).toMatchObject([
      { key: 'insert', commands: [{ key: 'image' }] },
    ])
    expect(filterRichTextSlashMenu(groups, 'zhengwen')).toEqual([])
  })

  it('deletes a slash query and runs an action in one transaction with one-step undo', () => {
    const editor = createEditor()
    const update = vi.fn()

    editor.commands.insertContent('/h1')
    editor.on('update', update)

    expect(runRichTextSlashCommand(editor, headingCommand, { from: 1, to: 4 })).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [{ type: 'heading', attrs: { level: 1 } }],
    })
    expect(update).toHaveBeenCalledOnce()

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '/h1' }],
        },
      ],
    })
  })

  it('simulates slash enabled state after deleting the query', () => {
    const emptyParagraphAction = defineRichTextAction(baseFeature, {
      key: 'empty-paragraph-only',
      command: ({ tr }) => tr.doc.textContent === '',
    })
    const emptyParagraphCommand = richTextSlashCommand(
      defineRichTextActionItem(emptyParagraphAction, {
        label: '空段落',
        icon: 'i-[lucide--pilcrow]',
      }),
    )
    const editor = createEditor('<p>/empty</p>')

    editor.commands.setTextSelection(7)

    expect(canRunRichTextAction(editor, emptyParagraphAction)).toBe(false)
    expect(canRunRichTextSlashCommand(editor, emptyParagraphCommand, { from: 1, to: 7 })).toBe(true)
  })

  it('keeps the slash query when an action fails after its enabled simulation', () => {
    const simulatedOnlyAction = defineRichTextAction(baseFeature, {
      key: 'simulated-only',
      command: ({ dispatch }) => dispatch === undefined,
    })
    const simulatedOnlyCommand = richTextSlashCommand(
      defineRichTextActionItem(simulatedOnlyAction, {
        label: '仅模拟',
        icon: 'i-[lucide--circle-dashed]',
      }),
    )
    const editor = createEditor('<p>/fail</p>')
    const update = vi.fn()

    editor.commands.setTextSelection(6)
    editor.on('update', update)

    const queryRange = { from: 1, to: 6 }

    expect(canRunRichTextSlashCommand(editor, simulatedOnlyCommand, queryRange)).toBe(true)
    expect(runRichTextSlashCommand(editor, simulatedOnlyCommand, queryRange)).toBe(false)
    expect(editor.getText()).toBe('/fail')
    expect(update).not.toHaveBeenCalled()
  })

  it('deletes an image query before opening the insert dialog', async () => {
    const editor = createEditor()
    const update = vi.fn()

    editor.commands.insertContent('/图片')
    editor.on('update', update)

    const queryRange = { from: 1, to: 4 }

    expect(canRunRichTextSlashCommand(editor, imageCommand, queryRange)).toBe(true)
    expect(document.querySelector('[data-test="rich-text-image-cancel"]')).toBeNull()

    expect(runRichTextSlashCommand(editor, imageCommand, queryRange)).toBe(true)
    await flushPromises()

    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
    expect(update).toHaveBeenCalledOnce()
    expect(document.querySelector('[data-test="rich-text-image-cancel"]')).not.toBeNull()

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('inserts a fixed 3x3 table in one transaction and restores the slash query with one undo', () => {
    const tablePreset = defineRichTextPreset({
      key: 'table-slash-test',
      features: [baseFeature, historyFeature, tableFeature],
    })
    const editor = createTestEditor({
      extensions: collectRichTextEditorExtensions({
        ...tablePreset,
        editorFeatures: [baseEditorFeature, historyEditorFeature, tableEditorFeature],
      }),
      content: '<p>/表格</p>',
    })
    const update = vi.fn()
    editor.on('update', update)

    expect(runRichTextSlashCommand(editor, tableCommand, { from: 1, to: 4 })).toBe(true)
    expect(update).toHaveBeenCalledOnce()
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'table' }] })
    expect(editor.state.doc.firstChild?.childCount).toBe(3)
    expect(editor.state.doc.firstChild?.firstChild?.childCount).toBe(3)

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/表格')
  })
})
