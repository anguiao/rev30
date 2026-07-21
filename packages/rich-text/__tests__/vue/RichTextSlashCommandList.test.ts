import { mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import {
  defineRichTextSlashCommand,
  richTextSlashUiCommand,
  type RichTextSlashUiCommand,
  type RichTextSlashUiCommandContext,
} from '../../src/vue/slash-command'
import RichTextSlashCommandList from '../../src/vue/slash-command/RichTextSlashCommandList.vue'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'slash-command-list-test',
  features: [baseFeature],
})

function createEditor(content = '<p></p>') {
  return createTestEditor({
    extensions: collectRichTextEditorExtensions({
      ...preset,
      editorFeatures: [baseEditorFeature],
    }),
    content,
  })
}

function createUiCommand(
  key: string,
  options: {
    enabled?: boolean
    run?: (context: RichTextSlashUiCommandContext) => boolean
    keywords?: readonly string[]
  } = {},
) {
  return richTextSlashUiCommand({
    feature: baseFeature,
    key,
    label: key,
    icon: 'i-[lucide--pilcrow]',
    keywords: options.keywords ?? [],
    isEnabled: () => options.enabled ?? true,
    run: options.run ?? (() => true),
  })
}

function createConfig(commands: readonly RichTextSlashUiCommand[]) {
  return defineRichTextSlashCommand([
    { key: 'first-group', label: '第一组', commands: commands.slice(0, 2) },
    { key: 'second-group', label: '第二组', commands: commands.slice(2) },
  ])
}

function dispatchKey(wrapper: VueWrapper, key: string) {
  const event = new KeyboardEvent('keydown', { key, cancelable: true })
  const handled = (
    wrapper.vm as unknown as { onKeyDown: (event: KeyboardEvent) => boolean }
  ).onKeyDown(event)

  return { event, handled }
}

function expectActiveCommand(wrapper: VueWrapper, key: string) {
  expect(
    wrapper.get(`[data-test="rich-text-slash-command-${key}"]`).attributes('aria-selected'),
  ).toBe('true')
}

describe('RichTextSlashCommandList', () => {
  it('selects the first enabled command and cycles across groups while skipping disabled commands', async () => {
    const editor = createEditor('<p>/</p>')
    editor.commands.setTextSelection(2)
    const commands = [
      createUiCommand('disabled', { enabled: false }),
      createUiCommand('second'),
      createUiCommand('third'),
    ]
    const wrapper = mount(RichTextSlashCommandList, {
      props: {
        editor,
        config: createConfig(commands),
        listboxId: 'slash-list',
        queryRange: { from: 1, to: 2 },
      },
    })

    expectActiveCommand(wrapper, 'second')
    expect(
      wrapper.get('[data-test="rich-text-slash-command-disabled"]').attributes(),
    ).toMatchObject({
      'aria-disabled': 'true',
      'aria-selected': 'false',
    })

    dispatchKey(wrapper, 'ArrowDown')
    await wrapper.vm.$nextTick()
    expectActiveCommand(wrapper, 'third')

    dispatchKey(wrapper, 'ArrowDown')
    await wrapper.vm.$nextTick()
    expectActiveCommand(wrapper, 'second')

    dispatchKey(wrapper, 'ArrowUp')
    await wrapper.vm.$nextTick()
    expectActiveCommand(wrapper, 'third')
  })

  it('hides empty groups and resets the active command when the query changes', async () => {
    const editor = createEditor('<p>/</p>')
    editor.commands.setTextSelection(2)
    const wrapper = mount(RichTextSlashCommandList, {
      props: {
        editor,
        config: createConfig([
          createUiCommand('first', { keywords: ['alpha'] }),
          createUiCommand('second', { keywords: ['beta'] }),
          createUiCommand('third', { keywords: ['gamma'] }),
        ]),
        listboxId: 'filtered-list',
        queryRange: { from: 1, to: 2 },
      },
    })

    dispatchKey(wrapper, 'ArrowDown')
    await wrapper.vm.$nextTick()
    expectActiveCommand(wrapper, 'second')

    editor.commands.setContent('<p>/GAM</p>')
    editor.commands.setTextSelection(5)
    await wrapper.setProps({ query: 'GAM', queryRange: { from: 1, to: 5 } })

    expect(wrapper.findAll('section')).toHaveLength(1)
    expect(wrapper.get('section').text()).toContain('第二组')
    expectActiveCommand(wrapper, 'third')
  })

  it('does not execute disabled or failed commands', async () => {
    const editor = createEditor('<p>/</p>')
    editor.commands.setTextSelection(2)
    const disabledRun = vi.fn(() => true)
    const failedRun = vi.fn(() => false)
    const wrapper = mount(RichTextSlashCommandList, {
      props: {
        editor,
        config: createConfig([
          createUiCommand('disabled', { enabled: false, run: disabledRun }),
          createUiCommand('failed', { run: failedRun }),
        ]),
        listboxId: 'failure-list',
        queryRange: { from: 1, to: 2 },
      },
    })

    await wrapper.get('[data-test="rich-text-slash-command-disabled"]').trigger('click')
    expect(disabledRun).not.toHaveBeenCalled()

    await wrapper.get('[data-test="rich-text-slash-command-failed"]').trigger('click')
    expect(failedRun).toHaveBeenCalledOnce()
  })

  it('lets Enter pass through when no command matches', () => {
    const allDisabledConfig = createConfig([createUiCommand('disabled', { enabled: false })])
    const slashEditor = createEditor('<p>/none</p>')
    slashEditor.commands.setTextSelection(6)
    const slashWrapper = mount(RichTextSlashCommandList, {
      props: {
        editor: slashEditor,
        config: allDisabledConfig,
        listboxId: 'empty-list',
        query: 'no-match',
        queryRange: { from: 1, to: 6 },
      },
    })
    const { event, handled } = dispatchKey(slashWrapper, 'Enter')

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('closes on Tab without consuming browser focus navigation', () => {
    const editor = createEditor('<p>/</p>')
    editor.commands.setTextSelection(2)
    const wrapper = mount(RichTextSlashCommandList, {
      props: {
        editor,
        config: createConfig([createUiCommand('command')]),
        listboxId: 'tab-list',
        queryRange: { from: 1, to: 2 },
      },
    })
    const { event, handled } = dispatchKey(wrapper, 'Tab')

    expect(handled).toBe(false)
    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('tab')).toEqual([[]])
  })
})
