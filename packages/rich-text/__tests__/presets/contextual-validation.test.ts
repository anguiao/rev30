import { defineComponent } from 'vue'
import { describe, expect, it } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature } from '../../src/features/base/editor'
import { baseFeature } from '../../src/features/base/shared'
import { boldEditorFeature } from '../../src/features/bold/editor'
import { boldFeature } from '../../src/features/bold/shared'
import { boldToolbarItem } from '../../src/features/bold/vue'
import { headingToolbarItems } from '../../src/features/heading/vue'
import { paragraphActionItem } from '../../src/features/base/vue'
import { slashCommandEditorFeature } from '../../src/features/slash-command/editor'
import { slashCommandFeature } from '../../src/features/slash-command/shared'
import { defineRichTextEditorPreset } from '../../src/vue/presets/types'
import {
  defineRichTextQuickbar,
  richTextFeatureQuickbar,
  richTextQuickbarAction,
} from '../../src/vue/quickbar'
import { defineRichTextSlashCommand, richTextSlashCommandAction } from '../../src/vue/slash-command'

const component = defineComponent(() => () => null)

describe('contextual preset validation', () => {
  it('rejects quickbar controls without an enabled editor feature', () => {
    const preset = defineRichTextPreset({
      key: 'missing-quickbar-feature',
      features: [baseFeature],
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature],
        quickbar: defineRichTextQuickbar({
          text: {
            primary: [richTextQuickbarAction(boldToolbarItem)],
            more: [],
          },
        }),
      }),
    ).toThrow('a quickbar control for unknown feature "bold"')
  })

  it('rejects duplicate text and feature quickbars', () => {
    const preset = defineRichTextPreset({
      key: 'duplicate-quickbars',
      features: [baseFeature, boldFeature],
    })
    const featureQuickbar = richTextFeatureQuickbar({
      feature: boldFeature,
      key: 'bold-object',
      isActive: () => false,
      component,
      props: {},
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature, boldEditorFeature],
        quickbar: defineRichTextQuickbar({
          text: {
            primary: [richTextQuickbarAction(boldToolbarItem)],
            more: [richTextQuickbarAction(boldToolbarItem)],
          },
        }),
      }),
    ).toThrow('duplicate quickbar control: "bold"')

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature, boldEditorFeature],
        quickbar: defineRichTextQuickbar({ features: [featureQuickbar, featureQuickbar] }),
      }),
    ).toThrow('duplicate feature quickbar key: "bold-object"')
  })

  it('requires the slash-command editor feature and validates every command feature', () => {
    const slashCommand = defineRichTextSlashCommand([
      {
        key: 'basic',
        label: '基础块',
        commands: [richTextSlashCommandAction(paragraphActionItem, ['paragraph'])],
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
        commands: [richTextSlashCommandAction(headingToolbarItems[0], ['h1'])],
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
