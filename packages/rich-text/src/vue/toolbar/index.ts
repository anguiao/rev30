import type { Editor } from '@tiptap/core'
import { markRaw, type Component, type ComponentInstance } from 'vue'
import type { RichTextFeature } from '../../core/feature'
import {
  canRunRichTextAction,
  type RichTextAction,
  type RichTextActionItem,
  type RichTextIconClass,
} from '../../editor/action'

export type { RichTextIconClass } from '../../editor/action'

export type RichTextToolbarItem = RichTextActionItem

export interface RichTextToolbarButtonControl {
  readonly type: 'button'
  readonly item: RichTextToolbarItem
}

export interface RichTextToolbarDropdownControl {
  readonly type: 'dropdown'
  readonly key: string
  readonly feature: RichTextFeature
  readonly label: string
  readonly icon: RichTextIconClass
  readonly items: readonly RichTextToolbarItem[]
  readonly getActiveItem?: (
    editor: Editor,
    items: readonly RichTextToolbarItem[],
  ) => RichTextToolbarItem | undefined
}

export interface RichTextToolbarControlInjectedProps {
  editor: Editor
  disabled?: boolean
}

type RichTextToolbarComponentProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextToolbarControlInjectedProps
>

type RichTextToolbarComponentControlOptions<TComponent extends Component> = {
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: TComponent
  readonly props: RichTextToolbarComponentProps<TComponent>
}

export interface RichTextToolbarComponentControl {
  readonly type: 'component'
  readonly feature: RichTextFeature
  readonly key: string
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
  const frozenGroups = Object.freeze(
    groups.map((group) => {
      if (groupKeys.has(group.key)) {
        throw new Error(`Rich text toolbar has a duplicate group: "${group.key}"`)
      }

      groupKeys.add(group.key)

      for (const control of group.controls) {
        const key = getRichTextToolbarControlKey(control)

        if (controlKeys.has(key)) {
          throw new Error(`Rich text toolbar has a duplicate control: "${key}"`)
        }

        controlKeys.add(key)
      }

      return Object.freeze({
        ...group,
        controls: Object.freeze([...group.controls]),
      })
    }),
  )

  return Object.freeze({ groups: frozenGroups })
}

export function richTextToolbarButton(item: RichTextToolbarItem): RichTextToolbarButtonControl {
  return Object.freeze({
    type: 'button',
    item,
  })
}

export function richTextToolbarDropdown(
  control: Omit<RichTextToolbarDropdownControl, 'type' | 'feature'>,
): RichTextToolbarDropdownControl {
  const items = Object.freeze([...control.items])
  const feature = items[0]?.action.feature

  if (!feature) {
    throw new Error(`Rich text toolbar dropdown "${control.key}" must contain at least one item`)
  }

  for (const item of items) {
    if (item.action.feature !== feature) {
      throw new Error(`Rich text toolbar dropdown "${control.key}" mixes multiple features`)
    }
  }

  return Object.freeze({
    ...control,
    type: 'dropdown',
    feature,
    items,
  })
}

export function richTextToolbarComponent<TComponent extends Component>(
  control: RichTextToolbarComponentControlOptions<TComponent>,
): RichTextToolbarComponentControl {
  return Object.freeze({
    type: 'component',
    feature: control.feature,
    key: control.key,
    component: markRaw(control.component),
    props: Object.freeze({ ...control.props } as Record<string, unknown>),
  })
}

export function getRichTextToolbarControlFeature(control: RichTextToolbarControlConfig) {
  return control.type === 'button' ? control.item.action.feature : control.feature
}

export function getRichTextToolbarControlKey(control: RichTextToolbarControlConfig) {
  return control.type === 'button' ? control.item.action.key : control.key
}

export function getActiveRichTextToolbarItem(
  editor: Editor,
  items: readonly RichTextToolbarItem[],
): RichTextToolbarItem | undefined {
  return items.find((item) => item.action.isActive?.(editor))
}

export function isRichTextActionDisabled(action: RichTextAction, editor: Editor) {
  return !canRunRichTextAction(editor, action)
}
