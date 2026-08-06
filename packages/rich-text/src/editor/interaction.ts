import { Extension, type AnyExtension, type Editor } from '@tiptap/core'
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

export function defineRichTextInteraction<const Feature extends RichTextFeature, Payload>(
  feature: Feature,
  key: string,
) {
  const interaction: RichTextInteraction<Feature> = { feature, key }
  const extensionName = `richTextInteraction:${feature.key}:${key}`
  const pluginKey = new PluginKey<RichTextInteractionHandle<Payload>>(extensionName)

  function request(editor: Editor, payload: Payload) {
    const handle = pluginKey.getState(editor.state)

    if (handle === undefined) {
      throw new Error(`Rich text interaction "${feature.key}:${key}" is not configured`)
    }

    handle(editor, payload)
  }

  function defineHandler(handle: RichTextInteractionHandle<Payload>): RichTextInteractionHandler {
    return {
      interaction,
      createExtension: () =>
        Extension.create({
          name: extensionName,

          addProseMirrorPlugins() {
            return [
              new Plugin({
                key: pluginKey,
                state: {
                  init: () => handle,
                  apply: (_transaction, currentHandle) => currentHandle,
                },
              }),
            ]
          },
        }),
    }
  }

  return {
    interaction,
    request,
    defineHandler,
  }
}
