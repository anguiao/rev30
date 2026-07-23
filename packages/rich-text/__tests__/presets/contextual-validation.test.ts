import { describe, expect, it } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature, paragraphActionItem } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { boldActionItem, boldEditorFeature } from '../../src/features/bold/editor'
import { boldFeature } from '../../src/features/bold/shared'
import { headingActionItems } from '../../src/features/heading/editor'
import { slashCommandEditorFeature } from '../../src/features/slash-command/editor'
import { slashCommandFeature } from '../../src/features/slash-command/shared'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../../src/vue/quick-bar'
import { defineRichTextSlashCommand, richTextSlashCommandAction } from '../../src/vue/slash-command'

describe('contextual preset validation', () => {
  it('rejects quick bar controls without an enabled editor feature', () => {
    const preset = defineRichTextPreset({
      key: 'missing-quick-bar-feature',
      features: [baseFeature],
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature],
        quickBar: defineRichTextQuickBar({
          textControls: {
            main: [richTextQuickBarAction(boldActionItem)],
            more: [],
          },
        }),
      }),
    ).toThrow('a quick bar control for unknown feature "bold"')
  })

  it('rejects duplicate text controls', () => {
    const preset = defineRichTextPreset({
      key: 'duplicate-quick-bars',
      features: [baseFeature, boldFeature],
    })
    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature, boldEditorFeature],
        quickBar: defineRichTextQuickBar({
          textControls: {
            main: [richTextQuickBarAction(boldActionItem)],
            more: [richTextQuickBarAction(boldActionItem)],
          },
        }),
      }),
    ).toThrow('duplicate control: "bold"')
  })

  it('requires the slash-command editor feature and validates every command feature', () => {
    const slashCommand = defineRichTextSlashCommand([
      {
        key: 'basic',
        label: '基础块',
        commands: [richTextSlashCommandAction(paragraphActionItem)],
      },
    ])
    const presetWithoutSlashCommand = defineRichTextPreset({
      key: 'missing-slash-command',
      features: [baseFeature],
    })

    expect(() =>
      defineRichTextEditorPreset(presetWithoutSlashCommand, {
        editorFeatures: [baseEditorFeature],
        slashCommand,
      }),
    ).toThrow('without the "slash-command" editor feature')

    const presetWithoutHeading = defineRichTextPreset({
      key: 'missing-slash-command-feature',
      features: [baseFeature, slashCommandFeature],
    })
    const headingSlashCommand = defineRichTextSlashCommand([
      {
        key: 'basic',
        label: '基础块',
        commands: [richTextSlashCommandAction(headingActionItems[0])],
      },
    ])

    expect(() =>
      defineRichTextEditorPreset(presetWithoutHeading, {
        editorFeatures: [baseEditorFeature, slashCommandEditorFeature],
        slashCommand: headingSlashCommand,
      }),
    ).toThrow('a slash command for unknown feature "heading"')
  })
})
