import type { Editor } from '@tiptap/core'
import { markRaw, type Component, type ComponentInstance } from 'vue'
import type { RichTextFeature } from '../../core/feature'
import type { RichTextActionItem, RichTextIconClass } from '../../editor/action'

interface RichTextToolbarControlBase {
  readonly type: 'button' | 'dropdown' | 'component'
  readonly feature: RichTextFeature
  readonly key: string
}

export interface RichTextToolbarButtonControl extends RichTextToolbarControlBase {
  readonly type: 'button'
  readonly item: RichTextActionItem
}

export interface RichTextToolbarDropdownControl extends RichTextToolbarControlBase {
  readonly type: 'dropdown'
  readonly label: string
  readonly icon: RichTextIconClass
  readonly items: readonly RichTextActionItem[]
  readonly getActiveItem?: (
    editor: Editor,
    items: readonly RichTextActionItem[],
  ) => RichTextActionItem | undefined
}

export interface RichTextToolbarControlProps {
  editor: Editor
  disabled?: boolean
}

type RichTextToolbarComponentProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextToolbarControlProps
>

type RichTextToolbarComponentControlOptions<TComponent extends Component> = {
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: TComponent
  readonly props: RichTextToolbarComponentProps<TComponent>
}

export interface RichTextToolbarComponentControl extends RichTextToolbarControlBase {
  readonly type: 'component'
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

export type RichTextToolbarControlConfig =
  | RichTextToolbarButtonControl
  | RichTextToolbarDropdownControl
  | RichTextToolbarComponentControl

export interface RichTextToolbarGroup {
  readonly key: string
  readonly controls: readonly RichTextToolbarControlConfig[]
}

export interface RichTextToolbarConfig {
  readonly groups: readonly RichTextToolbarGroup[]
}

export function defineRichTextToolbar(
  groups: readonly RichTextToolbarGroup[],
): RichTextToolbarConfig {
  const groupKeys = new Set<string>()
  const controlKeys = new Set<string>()

  for (const group of groups) {
    if (groupKeys.has(group.key)) {
      throw new Error(`Rich text toolbar has a duplicate group: "${group.key}"`)
    }

    groupKeys.add(group.key)

    for (const control of group.controls) {
      if (controlKeys.has(control.key)) {
        throw new Error(`Rich text toolbar has a duplicate control: "${control.key}"`)
      }

      controlKeys.add(control.key)
    }
  }

  return { groups }
}

export function richTextToolbarButton(item: RichTextActionItem): RichTextToolbarButtonControl {
  return {
    type: 'button',
    feature: item.action.feature,
    key: item.action.key,
    item,
  }
}

export function richTextToolbarDropdown(
  control: Omit<RichTextToolbarDropdownControl, 'type' | 'feature'>,
): RichTextToolbarDropdownControl {
  const feature = control.items[0]?.action.feature

  if (!feature) {
    throw new Error(`Rich text toolbar dropdown "${control.key}" must contain at least one item`)
  }

  for (const item of control.items) {
    if (item.action.feature !== feature) {
      throw new Error(`Rich text toolbar dropdown "${control.key}" mixes multiple features`)
    }
  }

  return {
    ...control,
    type: 'dropdown',
    feature,
  }
}

export function richTextToolbarComponent<TComponent extends Component>(
  control: RichTextToolbarComponentControlOptions<TComponent>,
): RichTextToolbarComponentControl {
  return {
    type: 'component',
    feature: control.feature,
    key: control.key,
    component: markRaw(control.component),
    props: { ...control.props } as Record<string, unknown>,
  }
}
