import { Extension, type AnyExtension, type CommandProps, type Editor } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { RichTextFeature } from '../core/feature'

export interface RichTextInteraction<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly key: string
}

export interface RichTextInteractionHandler {
  readonly interaction: RichTextInteraction
  readonly createExtension: () => AnyExtension
}

type RichTextInteractionHandle<Payload> = (editor: Editor, payload: Payload) => void

interface RichTextInteractionRequest<Payload> {
  readonly payload: Payload
}

interface RichTextInteractionState<Payload> {
  readonly request?: RichTextInteractionRequest<Payload>
}

export function defineRichTextInteraction<const Feature extends RichTextFeature, Payload>(
  feature: Feature,
  key: string,
) {
  const extensionName = `richTextInteraction:${feature.key}:${key}`
  const pluginKey = new PluginKey<RichTextInteractionState<Payload>>(extensionName)

  function command({ editor, tr, dispatch }: CommandProps, payload: Payload): boolean {
    if (pluginKey.getState(editor.state) === undefined) {
      throw new Error(`Rich text interaction "${feature.key}:${key}" is not configured`)
    }

    if (dispatch) {
      tr.setMeta(pluginKey, { payload } satisfies RichTextInteractionRequest<Payload>)
    }

    return true
  }

  function request(editor: Editor, payload: Payload) {
    return editor.commands.command((props) => command(props, payload))
  }

  function defineHandler(handle: RichTextInteractionHandle<Payload>): RichTextInteractionHandler {
    return {
      interaction,
      createExtension: () =>
        Extension.create({
          name: extensionName,

          addProseMirrorPlugins() {
            const editor = this.editor

            return [
              new Plugin({
                key: pluginKey,
                state: {
                  init: () => ({}),
                  apply(transaction, currentState) {
                    const request = transaction.getMeta(pluginKey) as
                      | RichTextInteractionRequest<Payload>
                      | undefined

                    return request === undefined ? currentState : { request }
                  },
                },
                view: () => ({
                  update(view, previousState) {
                    const previousRequest = pluginKey.getState(previousState)?.request
                    const request = pluginKey.getState(view.state)?.request

                    if (request !== undefined && request !== previousRequest) {
                      handle(editor, request.payload)
                    }
                  },
                }),
              }),
            ]
          },
        }),
    }
  }

  const interaction = {
    feature,
    key,
    request,
    command,
    defineHandler,
  }

  return interaction
}
