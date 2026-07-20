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
import { createImageBlockMenuCommand } from '../../src/features/image/vue'
import { imageFeature } from '../../src/features/image/shared'
import { getRichTextImageDialogController } from '../../src/features/image/vue/dialog-controller'
import { defineRichTextActionItem } from '../../src/vue/action-item'
import {
  canRunRichTextBlockMenuCommand,
  defineRichTextBlockMenu,
  filterRichTextBlockMenu,
  richTextBlockMenuAction,
  richTextBlockMenuUiCommand,
  runRichTextBlockMenuCommand,
} from '../../src/vue/block-menu'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'block-menu-test',
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

const paragraphCommand = richTextBlockMenuAction(paragraphActionItem, ['段落', 'paragraph', 'text'])
const headingCommand = richTextBlockMenuAction(headingToolbarItems[0], ['标题1', 'h1', 'heading1'])
const imageCommand = richTextBlockMenuUiCommand({
  feature: imageFeature,
  key: 'image',
  label: '图片',
  icon: 'i-[lucide--image]',
  keywords: ['image', 'img', 'picture'],
  run: () => true,
})

function createConfig() {
  return defineRichTextBlockMenu([
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

describe('rich text block menu model', () => {
  it('freezes groups, commands, and keywords and rejects duplicate keys', () => {
    const config = createConfig()

    expect(Object.isFrozen(config)).toBe(true)
    expect(Object.isFrozen(config.groups)).toBe(true)
    expect(Object.isFrozen(config.groups[0])).toBe(true)
    expect(Object.isFrozen(config.groups[0]?.commands)).toBe(true)
    expect(Object.isFrozen(paragraphCommand.keywords)).toBe(true)

    expect(() =>
      defineRichTextBlockMenu([
        { key: 'same', label: '一', commands: [paragraphCommand] },
        { key: 'same', label: '二', commands: [headingCommand] },
      ]),
    ).toThrow('duplicate group: "same"')

    expect(() =>
      defineRichTextBlockMenu([
        { key: 'one', label: '一', commands: [paragraphCommand] },
        { key: 'two', label: '二', commands: [paragraphCommand] },
      ]),
    ).toThrow('duplicate command: "paragraph"')
  })

  it('filters labels and fixed keywords by case-insensitive inclusion without reordering', () => {
    const config = createConfig()

    expect(filterRichTextBlockMenu(config, '')).toEqual(config.groups)
    expect(filterRichTextBlockMenu(config, '正')).toMatchObject([
      { key: 'basic', commands: [{ key: 'paragraph' }] },
    ])
    expect(filterRichTextBlockMenu(config, 'ADING')).toMatchObject([
      { key: 'basic', commands: [{ key: 'heading-1' }] },
    ])
    expect(filterRichTextBlockMenu(config, 'PIC')).toMatchObject([
      { key: 'insert', commands: [{ key: 'image' }] },
    ])
    expect(filterRichTextBlockMenu(config, 'zhengwen')).toEqual([])
  })

  it('deletes a slash query and runs an action in one transaction with one-step undo', () => {
    const editor = createEditor()
    const update = vi.fn()

    editor.commands.insertContent('/h1')
    editor.on('update', update)

    expect(
      runRichTextBlockMenuCommand(editor, headingCommand, {
        source: 'slash',
        queryRange: { from: 1, to: 4 },
      }),
    ).toBe(true)
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
    const emptyParagraphCommand = richTextBlockMenuAction(
      defineRichTextActionItem(emptyParagraphAction, {
        label: '空段落',
        icon: 'i-[lucide--pilcrow]',
      }),
      [],
    )
    const editor = createEditor('<p>/empty</p>')

    editor.commands.setTextSelection(7)

    expect(canRunRichTextAction(editor, emptyParagraphAction)).toBe(false)
    expect(
      canRunRichTextBlockMenuCommand(editor, emptyParagraphCommand, {
        source: 'slash',
        queryRange: { from: 1, to: 7 },
      }),
    ).toBe(true)
  })

  it('keeps the slash query when an action fails after its enabled simulation', () => {
    const simulatedOnlyAction = defineRichTextAction(baseFeature, {
      key: 'simulated-only',
      command:
        () =>
        ({ dispatch }) =>
          dispatch === undefined,
    })
    const simulatedOnlyCommand = richTextBlockMenuAction(
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

    const invocation = {
      source: 'slash' as const,
      queryRange: { from: 1, to: 6 },
    }

    expect(canRunRichTextBlockMenuCommand(editor, simulatedOnlyCommand, invocation)).toBe(true)
    expect(runRichTextBlockMenuCommand(editor, simulatedOnlyCommand, invocation)).toBe(false)
    expect(editor.getText()).toBe('/fail')
    expect(update).not.toHaveBeenCalled()
  })

  it('keeps the current plus selection when an action fails after simulation', () => {
    const simulatedOnlyAction = defineRichTextAction(baseFeature, {
      key: 'plus-simulated-only',
      command:
        () =>
        ({ dispatch }) =>
          dispatch === undefined,
    })
    const simulatedOnlyCommand = richTextBlockMenuAction(
      defineRichTextActionItem(simulatedOnlyAction, {
        label: '仅模拟',
        icon: 'i-[lucide--circle-dashed]',
      }),
      [],
    )
    const editor = createEditor('<p></p><p>other</p>')
    editor.commands.setTextSelection(4)
    const update = vi.fn()
    editor.on('update', update)

    const invocation = {
      source: 'plus' as const,
      anchor: 0,
    }

    expect(canRunRichTextBlockMenuCommand(editor, simulatedOnlyCommand, invocation)).toBe(true)
    expect(runRichTextBlockMenuCommand(editor, simulatedOnlyCommand, invocation)).toBe(false)
    expect(editor.state.selection).toMatchObject({ from: 4, to: 4 })
    expect(update).not.toHaveBeenCalled()
  })

  it('deletes a slash query before passing the verified empty paragraph anchor to a UI command', () => {
    const editor = createEditor()
    const run = vi.fn(() => true)
    const command = richTextBlockMenuUiCommand({
      ...imageCommand,
      run,
    })
    const update = vi.fn()

    editor.commands.insertContent('/图片')
    editor.on('update', update)

    expect(
      runRichTextBlockMenuCommand(editor, command, {
        source: 'slash',
        queryRange: { from: 1, to: 4 },
      }),
    ).toBe(true)
    expect(editor.getJSON()).toMatchObject({ content: [{ type: 'paragraph' }] })
    expect(update).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith({
      editor,
      source: 'slash',
      anchor: 0,
      queryRange: { from: 1, to: 4 },
    })

    expect(editor.commands.undo()).toBe(true)
    expect(editor.getText()).toBe('/图片')
  })

  it('passes a plus source anchor to UI commands without changing the document', () => {
    const editor = createEditor('<p></p><p>other</p>')
    editor.commands.setTextSelection(4)
    const run = vi.fn(() => {
      expect(editor.state.selection).toMatchObject({ from: 1, to: 1 })
      return true
    })
    const command = richTextBlockMenuUiCommand({
      ...imageCommand,
      run,
    })
    const update = vi.fn()

    editor.on('update', update)

    expect(
      runRichTextBlockMenuCommand(editor, command, {
        source: 'plus',
        anchor: 0,
      }),
    ).toBe(true)
    expect(run).toHaveBeenCalledWith({ editor, source: 'plus', anchor: 0 })
    expect(update).not.toHaveBeenCalled()
  })

  it('captures the fixed plus anchor as the image dialog cancellation target', () => {
    const editor = createEditor('<p></p><p>other</p>')
    editor.commands.setTextSelection(4)
    const command = createImageBlockMenuCommand({ upload: vi.fn() })

    expect(
      runRichTextBlockMenuCommand(editor, command, {
        source: 'plus',
        anchor: 0,
      }),
    ).toBe(true)
    expect(getRichTextImageDialogController(editor).session.value?.target.selection).toMatchObject({
      from: 1,
      to: 1,
    })
  })

  it('runs plus actions against the fixed empty paragraph anchor', () => {
    const editor = createEditor('<p></p><p>other</p>')
    editor.commands.setTextSelection(4)
    const invocation = {
      source: 'plus' as const,
      anchor: 0,
    }

    expect(canRunRichTextBlockMenuCommand(editor, headingCommand, invocation)).toBe(true)
    expect(runRichTextBlockMenuCommand(editor, headingCommand, invocation)).toBe(true)
    expect(editor.getJSON()).toMatchObject({
      content: [
        { type: 'heading', attrs: { level: 1 } },
        { type: 'paragraph', content: [{ type: 'text', text: 'other' }] },
      ],
    })
  })
})
