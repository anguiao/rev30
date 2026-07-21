import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { canRunRichTextAction, defineRichTextAction } from '../../src/editor/action'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { paragraphActionItem } from '../../src/features/base/vue'
import { headingEditorFeature } from '../../src/features/heading/editor'
import { headingFeature } from '../../src/features/heading/shared'
import { headingToolbarItems } from '../../src/features/heading/vue'
import { historyEditorFeature } from '../../src/features/history/editor'
import { historyFeature } from '../../src/features/history/shared'
import { createImageSlashCommand } from '../../src/features/image/vue'
import { getRichTextImageDialogController } from '../../src/features/image/vue/dialog-controller'
import { defineRichTextActionItem } from '../../src/vue/action-item'
import {
  canRunRichTextSlashCommand,
  defineRichTextSlashCommand,
  filterRichTextSlashCommands,
  richTextSlashCommandAction,
  runRichTextSlashCommand,
} from '../../src/vue/slash-command'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-command-test',
  features: [baseFeature, historyFeature, headingFeature],
})

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature, historyEditorFeature, headingEditorFeature],
    }),
    content,
  })
}

const paragraphCommand = richTextSlashCommandAction(paragraphActionItem, [
  '段落',
  'paragraph',
  'text',
])
const headingCommand = richTextSlashCommandAction(headingToolbarItems[0], [
  '标题1',
  'h1',
  'heading1',
])
const imageCommand = createImageSlashCommand({ upload: vi.fn() })

function createConfig() {
  return defineRichTextSlashCommand([
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

describe('rich text slash command model', () => {
  it('freezes groups, commands, and keywords and rejects duplicate keys', () => {
    const config = createConfig()

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.groups)).toBe(true)
    expect(Object.isFrozen(config.groups[0])).toBe(true)
    expect(Object.isFrozen(config.groups[0]?.commands)).toBe(true)
    expect(Object.isFrozen(paragraphCommand.keywords)).toBe(true)

    expect(() =>
      defineRichTextSlashCommand([
        { key: 'same', label: '一', commands: [paragraphCommand] },
        { key: 'same', label: '二', commands: [headingCommand] },
      ]),
    ).toThrow('duplicate group: "same"')

    expect(() =>
      defineRichTextSlashCommand([
        { key: 'one', label: '一', commands: [paragraphCommand] },
        { key: 'two', label: '二', commands: [paragraphCommand] },
      ]),
    ).toThrow('duplicate command: "paragraph"')
  })

  it('filters labels and fixed keywords by case-insensitive inclusion without reordering', () => {
    const config = createConfig()

    expect(filterRichTextSlashCommands(config, '')).toEqual(config.groups)
    expect(filterRichTextSlashCommands(config, '正')).toMatchObject([
      { key: 'basic', commands: [{ key: 'paragraph' }] },
    ])
    expect(filterRichTextSlashCommands(config, 'ADING')).toMatchObject([
      { key: 'basic', commands: [{ key: 'heading-1' }] },
    ])
    expect(filterRichTextSlashCommands(config, 'PIC')).toMatchObject([
      { key: 'insert', commands: [{ key: 'image' }] },
    ])
    expect(filterRichTextSlashCommands(config, 'zhengwen')).toEqual([])
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
      command:
        () =>
        ({ tr }) =>
          tr.doc.textContent === '',
    })
    const emptyParagraphCommand = richTextSlashCommandAction(
      defineRichTextActionItem(emptyParagraphAction, {
        label: '空段落',
        icon: 'i-[lucide--pilcrow]',
      }),
      [],
    )
    const editor = createEditor('<p>/empty</p>')

    editor.commands.setTextSelection(7)

    expect(canRunRichTextAction(editor, emptyParagraphAction)).toBe(false)
    expect(canRunRichTextSlashCommand(editor, emptyParagraphCommand, { from: 1, to: 7 })).toBe(true)
  })

  it('keeps the slash query when an action fails after its enabled simulation', () => {
    const simulatedOnlyAction = defineRichTextAction(baseFeature, {
      key: 'simulated-only',
      command:
        () =>
        ({ dispatch }) =>
          dispatch === undefined,
    })
    const simulatedOnlyCommand = richTextSlashCommandAction(
      defineRichTextActionItem(simulatedOnlyAction, {
        label: '仅模拟',
        icon: 'i-[lucide--circle-dashed]',
      }),
      [],
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

  it('deletes an image query before opening the dialog against the empty paragraph anchor', () => {
    const editor = createEditor()
    const update = vi.fn()

    editor.commands.insertContent('/图片')
    editor.on('update', update)

    expect(runRichTextSlashCommand(editor, imageCommand, { from: 1, to: 4 })).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
    expect(update).toHaveBeenCalledOnce()
    expect(getRichTextImageDialogController(editor).session.value?.target).toMatchObject({
      type: 'insert-anchor',
      anchor: 0,
    })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })
})
