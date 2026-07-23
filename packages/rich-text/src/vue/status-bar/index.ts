import type { Editor } from '@tiptap/core'
import { markRaw, type Component, type ComponentInstance } from 'vue'
import type { RichTextFeature } from '../../core/feature'

export interface RichTextStatusBarItemInjectedProps {
  editor: Editor
}

type RichTextStatusBarComponentProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextStatusBarItemInjectedProps
>

type RichTextStatusBarComponentItemOptions<TComponent extends Component> = {
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: TComponent
  readonly props: RichTextStatusBarComponentProps<TComponent>
}

export interface RichTextStatusBarComponentItem {
  readonly feature: RichTextFeature
  readonly key: string
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

export interface RichTextStatusBarConfig {
  readonly start: readonly RichTextStatusBarComponentItem[]
  readonly end: readonly RichTextStatusBarComponentItem[]
}

export function richTextStatusBarComponent<TComponent extends Component>(
  item: RichTextStatusBarComponentItemOptions<TComponent>,
): RichTextStatusBarComponentItem {
  return Object.freeze({
    feature: item.feature,
    key: item.key,
    component: markRaw(item.component),
    props: Object.freeze({ ...item.props } as Record<string, unknown>),
  })
}

export function defineRichTextStatusBar({
  start,
  end,
}: RichTextStatusBarConfig): RichTextStatusBarConfig {
  const itemKeys = new Set<string>()

  for (const item of [...start, ...end]) {
    if (itemKeys.has(item.key)) {
      throw new Error(`Rich text status bar has a duplicate item: "${item.key}"`)
    }

    itemKeys.add(item.key)
  }

  return Object.freeze({
    start: Object.freeze([...start]),
    end: Object.freeze([...end]),
  })
}
