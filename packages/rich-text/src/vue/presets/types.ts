import { validateRichTextFeatureImplementations, type RichTextFeature } from '../../core/feature'
import type { RichTextPreset } from '../../core/preset'
import type { RichTextEditorFeature } from '../../editor/feature'
import type { RichTextQuickBarConfig, RichTextQuickBarControl } from '../quick-bar'
import type { RichTextSlashMenuGroup } from '../slash-menu'
import type { RichTextStatusBarConfig, RichTextStatusBarComponentItem } from '../status-bar'
import type { RichTextToolbarConfig, RichTextToolbarControlConfig } from '../toolbar'

export interface RichTextEditorPreset<
  Preset extends RichTextPreset = RichTextPreset,
  EditorFeatures extends readonly RichTextEditorFeature[] = readonly RichTextEditorFeature[],
> extends RichTextPreset<Preset['key'], Preset['features']> {
  readonly editorFeatures: EditorFeatures
  readonly toolbar?: RichTextToolbarConfig
  readonly statusBar?: RichTextStatusBarConfig
  readonly quickBar?: RichTextQuickBarConfig
  readonly slashMenu?: readonly RichTextSlashMenuGroup[]
}

function assertEditorFeature(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  feature: RichTextFeature,
  surface: string,
) {
  if (!editorFeatures.some((editorFeature) => editorFeature.feature === feature)) {
    throw new Error(
      `Rich text preset "${preset.key}" has ${surface} for unknown feature "${feature.key}"`,
    )
  }
}

function validateToolbarControl(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  control: RichTextToolbarControlConfig,
) {
  assertEditorFeature(preset, editorFeatures, control.feature, 'a toolbar control')
}

function validateStatusBarItem(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  item: RichTextStatusBarComponentItem,
) {
  assertEditorFeature(preset, editorFeatures, item.feature, 'a status bar item')
}

function validateQuickBarControl(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  control: RichTextQuickBarControl,
) {
  assertEditorFeature(preset, editorFeatures, control.feature, 'a quick bar control')
}

function validateQuickBar(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  quickBar: RichTextQuickBarConfig,
) {
  for (const control of [
    ...(quickBar.textControls?.main ?? []),
    ...(quickBar.textControls?.more ?? []),
  ]) {
    validateQuickBarControl(preset, editorFeatures, control)
  }

  for (const featureQuickBar of quickBar.featureBars) {
    assertEditorFeature(preset, editorFeatures, featureQuickBar.feature, 'a feature quick bar')
  }
}

function validateSlashMenu(
  preset: RichTextPreset,
  editorFeatures: readonly RichTextEditorFeature[],
  groups: readonly RichTextSlashMenuGroup[],
) {
  for (const group of groups) {
    for (const command of group.commands) {
      assertEditorFeature(preset, editorFeatures, command.feature, 'a slash command')
    }
  }
}

export function defineRichTextEditorPreset<
  const Preset extends RichTextPreset,
  const EditorFeatures extends readonly RichTextEditorFeature<Preset['features'][number]>[],
>(
  preset: Preset,
  options: {
    readonly editorFeatures: EditorFeatures
    readonly toolbar?: RichTextToolbarConfig
    readonly statusBar?: RichTextStatusBarConfig
    readonly quickBar?: RichTextQuickBarConfig
    readonly slashMenu?: readonly RichTextSlashMenuGroup[]
  },
): RichTextEditorPreset<Preset, ReadonlyArray<EditorFeatures[number]>> {
  const { editorFeatures } = options

  validateRichTextFeatureImplementations(preset, 'editor', editorFeatures)

  if (options.toolbar) {
    for (const group of options.toolbar.groups) {
      for (const control of group.controls) {
        validateToolbarControl(preset, editorFeatures, control)
      }
    }
  }

  if (options.statusBar) {
    for (const item of [...options.statusBar.start, ...options.statusBar.end]) {
      validateStatusBarItem(preset, editorFeatures, item)
    }
  }

  if (options.quickBar) {
    validateQuickBar(preset, editorFeatures, options.quickBar)
  }

  if (options.slashMenu) {
    validateSlashMenu(preset, editorFeatures, options.slashMenu)
  }

  return {
    key: preset.key,
    features: preset.features,
    editorFeatures,
    ...(options.toolbar ? { toolbar: options.toolbar } : {}),
    ...(options.statusBar ? { statusBar: options.statusBar } : {}),
    ...(options.quickBar ? { quickBar: options.quickBar } : {}),
    ...(options.slashMenu ? { slashMenu: options.slashMenu } : {}),
  }
}
