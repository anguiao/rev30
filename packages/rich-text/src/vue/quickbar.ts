import type { Editor } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { markRaw, type Component, type ComponentInstance } from 'vue'
import type { RichTextFeature } from '../core/feature'
import type { RichTextActionItem } from './action-item'

export interface RichTextQuickbarInjectedProps {
  editor: Editor
  disabled?: boolean
}

type RichTextQuickbarComponentProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextQuickbarInjectedProps
>

export interface RichTextQuickbarActionControl {
  readonly type: 'action'
  readonly item: RichTextActionItem
}

export interface RichTextQuickbarComponentControl {
  readonly type: 'component'
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

export type RichTextQuickbarControl =
  | RichTextQuickbarActionControl
  | RichTextQuickbarComponentControl

export interface RichTextQuickbarControlsConfig {
  readonly primary: readonly RichTextQuickbarControl[]
  readonly more: readonly RichTextQuickbarControl[]
}

export interface RichTextFeatureQuickbarConfig {
  readonly feature: RichTextFeature
  readonly key: string
  readonly isActive: (editor: Editor) => boolean
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

export interface RichTextQuickbarConfig {
  readonly text?: RichTextQuickbarControlsConfig
  readonly features: readonly RichTextFeatureQuickbarConfig[]
}

export const richTextQuickbarPluginKey = new PluginKey('richTextQuickbar')

export function requestRichTextQuickbarPluginUpdate(
  editor: Editor,
  update: 'show' | 'hide' | 'updatePosition',
) {
  if (!editor.isDestroyed) {
    editor.view.dispatch(editor.state.tr.setMeta(richTextQuickbarPluginKey, update))
  }
}

const quickbarLayerIds = new WeakMap<Editor, string>()
let nextQuickbarLayerId = 0

export function getRichTextQuickbarLayerId(editor: Editor) {
  const existing = quickbarLayerIds.get(editor)

  if (existing) {
    return existing
  }

  nextQuickbarLayerId += 1
  const id = `rich-text-quickbar-${nextQuickbarLayerId}`
  quickbarLayerIds.set(editor, id)
  return id
}

export function richTextQuickbarAction(item: RichTextActionItem): RichTextQuickbarActionControl {
  return Object.freeze({
    type: 'action',
    item,
  })
}

export function richTextQuickbarComponent<TComponent extends Component>(options: {
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: TComponent
  readonly props: RichTextQuickbarComponentProps<TComponent>
}): RichTextQuickbarComponentControl {
  return Object.freeze({
    type: 'component',
    feature: options.feature,
    key: options.key,
    component: markRaw(options.component),
    props: Object.freeze({ ...options.props } as Record<string, unknown>),
  })
}

export function richTextFeatureQuickbar<TComponent extends Component>(options: {
  readonly feature: RichTextFeature
  readonly key: string
  readonly isActive: (editor: Editor) => boolean
  readonly component: TComponent
  readonly props: RichTextQuickbarComponentProps<TComponent>
}): RichTextFeatureQuickbarConfig {
  return Object.freeze({
    feature: options.feature,
    key: options.key,
    isActive: options.isActive,
    component: markRaw(options.component),
    props: Object.freeze({ ...options.props } as Record<string, unknown>),
  })
}

export function getRichTextQuickbarControlFeature(control: RichTextQuickbarControl) {
  return control.type === 'action' ? control.item.action.feature : control.feature
}

export function getRichTextQuickbarControlKey(control: RichTextQuickbarControl) {
  return control.type === 'action' ? control.item.action.key : control.key
}

function freezeControls(controls: readonly RichTextQuickbarControl[]) {
  return Object.freeze([...controls])
}

export function defineRichTextQuickbar(options: {
  readonly text?: RichTextQuickbarControlsConfig
  readonly features?: readonly RichTextFeatureQuickbarConfig[]
}): RichTextQuickbarConfig {
  const features = Object.freeze([...(options.features ?? [])])

  return Object.freeze({
    ...(options.text
      ? {
          text: Object.freeze({
            primary: freezeControls(options.text.primary),
            more: freezeControls(options.text.more),
          }),
        }
      : {}),
    features,
  })
}
