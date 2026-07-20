import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { collectRichTextEditorExtensions } from '../../src/editor/feature'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import {
  defineRichTextBlockMenu,
  richTextBlockMenuUiCommand,
  type RichTextBlockUiCommandContext,
  type RichTextBlockUiCommand,
} from '../../src/vue/block-menu'
import RichTextBlockCommandList from '../../src/vue/block-menu/RichTextBlockCommandList.vue'
import { createTestEditor } from '../helpers/editor'

const preset = defineRichTextPreset({
  key: 'block-command-list-test',
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
    run?: (context: RichTextBlockUiCommandContext) => boolean
    keywords?: readonly string[]
  } = {},
) {
  return richTextBlockMenuUiCommand({
    feature: baseFeature,
    key,
    label: key,
    icon: 'i-[lucide--pilcrow]',
    keywords: options.keywords ?? [],
    isEnabled: () => options.enabled ?? true,
    run: options.run ?? (() => true),
  })
}

function createConfig(commands: readonly RichTextBlockUiCommand[]) {
  return defineRichTextBlockMenu([
    { key: 'first-group', label: '第一组', commands: commands.slice(0, 2) },
    { key: 'second-group', label: '第二组', commands: commands.slice(2) },
  ])
}

describe('RichTextBlockCommandList', () => {
  it('selects the first enabled command and cycles across groups while skipping disabled commands', async () => {
    const editor = createEditor()
    const commands = [
      createUiCommand('disabled', { enabled: false }),
      createUiCommand('second'),
      createUiCommand('third'),
    ]
    const wrapper = mount(RichTextBlockCommandList, {
      props: {
        editor,
        config: createConfig(commands),
        source: 'plus',
        listboxId: 'block-list',
        anchor: 0,
      },
    })

    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(
      'block-list-option-second',
    )
    expect(
      wrapper.get('[data-test="rich-text-block-command-disabled"]').attributes(),
    ).toMatchObject({
      'aria-disabled': 'true',
      'aria-selected': 'false',
    })

    await wrapper.get('[role="listbox"]').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(
      'block-list-option-third',
    )

    await wrapper.get('[role="listbox"]').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(
      'block-list-option-second',
    )

    await wrapper.get('[role="listbox"]').trigger('keydown', { key: 'ArrowUp' })
    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(
      'block-list-option-third',
    )
  })

  it('hides empty groups and resets the active command when the query changes', async () => {
    const editor = createEditor()
    const wrapper = mount(RichTextBlockCommandList, {
      props: {
        editor,
        config: createConfig([
          createUiCommand('first', { keywords: ['alpha'] }),
          createUiCommand('second', { keywords: ['beta'] }),
          createUiCommand('third', { keywords: ['gamma'] }),
        ]),
        source: 'plus',
        listboxId: 'filtered-list',
        anchor: 0,
      },
    })

    await wrapper.get('[role="listbox"]').trigger('keydown', { key: 'ArrowDown' })
    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toContain('second')

    await wrapper.setProps({ query: 'GAM' })

    expect(wrapper.findAll('section')).toHaveLength(1)
    expect(wrapper.get('section').text()).toContain('第二组')
    expect(wrapper.get('[role="listbox"]').attributes('aria-activedescendant')).toBe(
      'filtered-list-option-third',
    )
  })

  it('does not execute disabled or failed commands', async () => {
    const editor = createEditor()
    const disabledRun = vi.fn(() => true)
    const failedRun = vi.fn(() => false)
    const wrapper = mount(RichTextBlockCommandList, {
      props: {
        editor,
        config: createConfig([
          createUiCommand('disabled', { enabled: false, run: disabledRun }),
          createUiCommand('failed', { run: failedRun }),
        ]),
        source: 'plus',
        listboxId: 'failure-list',
        anchor: 0,
      },
    })

    await wrapper.get('[data-test="rich-text-block-command-disabled"]').trigger('click')
    expect(disabledRun).not.toHaveBeenCalled()

    await wrapper.get('[data-test="rich-text-block-command-failed"]').trigger('click')
    expect(failedRun).toHaveBeenCalledOnce()
    expect(wrapper.emitted('executed')).toBeUndefined()
  })

  it('keeps focus in the plus list after a failed command schedules editor focus', async () => {
    const editor = createEditor()
    const wrapper = mount(RichTextBlockCommandList, {
      attachTo: document.body,
      props: {
        editor,
        config: createConfig([
          createUiCommand('failed', {
            run: ({ editor: commandEditor }) => {
              commandEditor.commands.focus()
              return false
            },
          }),
        ]),
        source: 'plus',
        listboxId: 'focus-failure-list',
        anchor: 0,
      },
    })
    const listbox = wrapper.get('[role="listbox"]')
    ;(listbox.element as HTMLElement).focus()

    await listbox.trigger('keydown', { key: 'Enter' })
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

    expect(wrapper.emitted('executed')).toBeUndefined()
    expect(wrapper.find('[role="listbox"]').exists()).toBe(true)
    expect(document.activeElement).toBe(listbox.element)
  })

  it('keeps plus open on Enter without an active option but lets slash Enter pass through', () => {
    const plusEditor = createEditor()
    const allDisabledConfig = createConfig([createUiCommand('disabled', { enabled: false })])
    const plusWrapper = mount(RichTextBlockCommandList, {
      props: {
        editor: plusEditor,
        config: allDisabledConfig,
        source: 'plus',
        listboxId: 'disabled-list',
        anchor: 0,
      },
    })
    const plusEnter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    plusWrapper.get('[role="listbox"]').element.dispatchEvent(plusEnter)
    expect(plusEnter.defaultPrevented).toBe(true)
    expect(plusWrapper.emitted('executed')).toBeUndefined()

    const slashEditor = createEditor('<p>/none</p>')
    slashEditor.commands.setTextSelection(6)
    const slashWrapper = mount(RichTextBlockCommandList, {
      props: {
        editor: slashEditor,
        config: allDisabledConfig,
        source: 'slash',
        listboxId: 'empty-list',
        query: 'no-match',
        queryRange: { from: 1, to: 6 },
      },
    })
    const slashEnter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true })

    slashWrapper.get('[role="listbox"]').element.dispatchEvent(slashEnter)
    expect(slashEnter.defaultPrevented).toBe(false)
  })

  it('closes on Tab without consuming browser focus navigation', () => {
    const editor = createEditor()
    const wrapper = mount(RichTextBlockCommandList, {
      props: {
        editor,
        config: createConfig([createUiCommand('command')]),
        source: 'plus',
        listboxId: 'tab-list',
        anchor: 0,
      },
    })
    const event = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })

    wrapper.get('[role="listbox"]').element.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(wrapper.emitted('close')).toEqual([['tab']])
  })
})
