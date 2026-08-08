import { describe, expect, it } from 'vitest'
import { defineRichTextPreset } from '../../src/core/preset'
import { baseEditorFeature, paragraphActionItem } from '../../src/features/base/client/editor'
import { baseFeature } from '../../src/features/base/core/feature'
import { boldActionItem } from '../../src/features/bold/client/editor'
import { headingActionItems } from '../../src/features/heading/client/editor'
import { defineRichTextSlashMenu, richTextSlashCommand } from '../../src/client/vue/slash-menu'
import { defineRichTextEditorPreset } from '../../src/client/vue/preset'
import { defineRichTextQuickBar, richTextQuickBarAction } from '../../src/client/vue/quick-bar'

describe('contextual configuration validation', () => {
  it('rejects quick bar controls without an enabled editor feature', () => {
    const preset = defineRichTextPreset({
      key: 'missing-quick-bar-feature',
      features: [baseFeature],
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature],
        quickBar: defineRichTextQuickBar({
          textControls: [richTextQuickBarAction(boldActionItem)],
        }),
      }),
    ).toThrow('a quick bar control for unknown feature "bold"')
  })

  it('rejects duplicate text quick bar controls', () => {
    expect(() =>
      defineRichTextQuickBar({
        textControls: [
          richTextQuickBarAction(boldActionItem),
          richTextQuickBarAction(boldActionItem),
        ],
      }),
    ).toThrow('duplicate control: "bold"')
  })

  it('validates every slash command feature', () => {
    const slashMenu = defineRichTextSlashMenu([
      {
        key: 'basic',
        label: '基础块',
        commands: [richTextSlashCommand(paragraphActionItem)],
      },
    ])
    const preset = defineRichTextPreset({
      key: 'slash-menu',
      features: [baseFeature],
    })

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature],
        slashMenu,
      }),
    ).not.toThrow()

    const headingSlashMenu = defineRichTextSlashMenu([
      {
        key: 'basic',
        label: '基础块',
        commands: [richTextSlashCommand(headingActionItems[0])],
      },
    ])

    expect(() =>
      defineRichTextEditorPreset(preset, {
        editorFeatures: [baseEditorFeature],
        slashMenu: headingSlashMenu,
      }),
    ).toThrow('a slash command for unknown feature "heading"')
  })
})
