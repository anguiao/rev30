import type { Editor } from '@tiptap/vue-3'
import { markRaw, type Component, type ComponentInstance } from 'vue'
import type { RichTextFeature } from '../../../core/feature'
import type { RichTextActionItem } from '../../../client/editor/action'

export interface RichTextQuickBarComponentProps {
  editor: Editor
}

type RichTextQuickBarConfiguredProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextQuickBarComponentProps | 'disabled'
>

interface RichTextQuickBarControlBase {
  readonly type: 'action' | 'component'
  readonly feature: RichTextFeature
  readonly key: string
}

export interface RichTextQuickBarActionControl extends RichTextQuickBarControlBase {
  readonly type: 'action'
  readonly item: RichTextActionItem
}

export interface RichTextQuickBarComponentControl extends RichTextQuickBarControlBase {
  readonly type: 'component'
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

export type RichTextQuickBarControl =
  | RichTextQuickBarActionControl
  | RichTextQuickBarComponentControl

export type RichTextQuickBarControls = readonly RichTextQuickBarControl[]

export interface RichTextFeatureQuickBar {
  readonly feature: RichTextFeature
  readonly isActive: (editor: Editor) => boolean
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
  readonly getAnchorElement?: (editor: Editor) => HTMLElement | null
  readonly anchorAlignment?: 'end'
}

export interface RichTextQuickBarConfig {
  readonly textControls?: RichTextQuickBarControls
  readonly featureBars: readonly RichTextFeatureQuickBar[]
}

export function richTextQuickBarAction(item: RichTextActionItem): RichTextQuickBarActionControl {
  return {
    type: 'action',
    feature: item.action.feature,
    key: item.action.key,
    item,
  }
}

export function richTextQuickBarComponent<TComponent extends Component>(options: {
  readonly feature: RichTextFeature
  readonly component: TComponent
  readonly props: RichTextQuickBarConfiguredProps<TComponent>
}): RichTextQuickBarComponentControl {
  return {
    type: 'component',
    feature: options.feature,
    key: options.feature.key,
    component: markRaw(options.component),
    props: { ...options.props } as Record<string, unknown>,
  }
}

export function richTextFeatureQuickBar<TComponent extends Component>(options: {
  readonly feature: RichTextFeature
  readonly isActive: (editor: Editor) => boolean
  readonly component: TComponent
  readonly props: RichTextQuickBarConfiguredProps<TComponent>
  readonly getAnchorElement?: (editor: Editor) => HTMLElement | null
  readonly anchorAlignment?: 'end'
}): RichTextFeatureQuickBar {
  return {
    feature: options.feature,
    isActive: options.isActive,
    component: markRaw(options.component),
    props: { ...options.props } as Record<string, unknown>,
    ...(options.getAnchorElement ? { getAnchorElement: options.getAnchorElement } : {}),
    ...(options.anchorAlignment ? { anchorAlignment: options.anchorAlignment } : {}),
  }
}

export function defineRichTextQuickBar(options: {
  readonly textControls?: RichTextQuickBarControls
  readonly featureBars?: readonly RichTextFeatureQuickBar[]
}): RichTextQuickBarConfig {
  const controlKeys = new Set<string>()

  for (const control of options.textControls ?? []) {
    if (controlKeys.has(control.key)) {
      throw new Error(`Rich text quick bar has a duplicate control: "${control.key}"`)
    }

    controlKeys.add(control.key)
  }

  return {
    ...(options.textControls ? { textControls: options.textControls } : {}),
    featureBars: options.featureBars ?? [],
  }
}
