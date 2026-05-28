import type { Editor } from '@tiptap/core'
import type { Component, ComponentInstance } from 'vue'

export type RichTextIconClass = `i-[${string}--${string}]`

export interface RichTextCommand {
  key: string
  label: string
  icon: RichTextIconClass
  run: (editor: Editor) => boolean
  isActive?: (editor: Editor) => boolean
  isDisabled?: (editor: Editor) => boolean
}

export interface RichTextToolbarButtonControl {
  type: 'button'
  command: RichTextCommand
}

export interface RichTextToolbarDropdownControl {
  type: 'dropdown'
  key: string
  label: string
  icon: RichTextIconClass
  commands: RichTextCommand[]
  getActiveCommand?: (editor: Editor, commands: RichTextCommand[]) => RichTextCommand | undefined
}

export interface RichTextToolbarControlInjectedProps {
  editor: Editor | null
  disabled?: boolean
}

type RichTextToolbarComponentProps<TComponent extends Component> = Omit<
  ComponentInstance<TComponent>['$props'],
  keyof RichTextToolbarControlInjectedProps
>

type RichTextToolbarComponentControlOptions<TComponent extends Component> = {
  key: string
  component: TComponent
  props: RichTextToolbarComponentProps<TComponent>
}

export interface RichTextToolbarComponentControl {
  type: 'component'
  key: string
  component: Component
  props: Record<string, unknown>
}

export type RichTextToolbarControlConfig =
  | RichTextToolbarButtonControl
  | RichTextToolbarDropdownControl
  | RichTextToolbarComponentControl

export interface RichTextToolbarGroup {
  key: string
  controls: RichTextToolbarControlConfig[]
}

export interface RichTextToolbarConfig {
  groups: RichTextToolbarGroup[]
}

export function defineRichTextCommand(command: RichTextCommand): RichTextCommand {
  return command
}

export function defineRichTextToolbar(groups: RichTextToolbarGroup[]): RichTextToolbarConfig {
  return { groups }
}

export function richTextToolbarButton(command: RichTextCommand): RichTextToolbarButtonControl {
  return {
    type: 'button',
    command,
  }
}

export function richTextToolbarDropdown(
  control: Omit<RichTextToolbarDropdownControl, 'type'>,
): RichTextToolbarDropdownControl {
  return {
    type: 'dropdown',
    ...control,
  }
}

export function richTextToolbarComponent<TComponent extends Component>(
  control: RichTextToolbarComponentControlOptions<TComponent>,
): RichTextToolbarComponentControl {
  return {
    type: 'component',
    key: control.key,
    component: control.component,
    props: control.props as Record<string, unknown>,
  }
}

export function getActiveRichTextCommand(
  editor: Editor,
  commands: RichTextCommand[],
): RichTextCommand | undefined {
  return commands.find((command) => command.isActive?.(editor))
}
