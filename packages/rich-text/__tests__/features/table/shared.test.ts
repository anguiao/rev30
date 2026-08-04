import { getSchema } from '@tiptap/core'
import { describe, expect, it } from 'vitest'
import { collectRichTextEditorExtensions } from '../../../src/editor/feature'
import { tableFeature } from '../../../src/features/table/shared'
import { allRichTextPreset } from '../../../src/presets/all'
import { createAllRichTextEditorPreset } from '../../../src/vue/presets/all'

const imageUpload = async (file: File) => ({ src: `/api/attachments/${file.name}/content` })

describe('table shared feature', () => {
  it('declares editor and server implementations and creates a complete extension set', () => {
    expect(tableFeature).toMatchObject({
      key: 'table',
      editorImplementation: true,
      serverImplementation: true,
    })

    const extensions = tableFeature.sharedExtensions!()

    expect(extensions.map((extension) => extension.name)).toEqual([
      'table',
      'tableRow',
      'tableCell',
      'tableHeader',
    ])
    expect(tableFeature.sharedExtensions!()).not.toBe(extensions)
    expect(tableFeature.sharedExtensions!()[0]).not.toBe(extensions[0])
  })

  it('uses paragraph-only cells, a wrapped non-resizable table, and strict cell attributes', () => {
    const editorPreset = createAllRichTextEditorPreset({ image: { upload: imageUpload } })
    const schema = getSchema(collectRichTextEditorExtensions(editorPreset))

    expect(schema.nodes.table!.spec.content).toBe('tableRow+')
    expect(schema.nodes.tableCell!.spec.content).toBe('paragraph+')
    expect(schema.nodes.tableHeader!.spec.content).toBe('paragraph+')
    expect(schema.nodes.table!.spec.toDOM).toBeDefined()

    const valid = schema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  attrs: { colspan: 1, rowspan: 1, colwidth: [20], align: 'center' },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '标题' }] }],
                },
              ],
            },
          ],
        },
      ],
    })

    expect(valid.firstChild?.firstChild?.firstChild?.type.name).toBe('tableHeader')
    expect(() =>
      schema
        .nodeFromJSON({
          type: 'doc',
          content: [
            {
              type: 'table',
              content: [
                {
                  type: 'tableRow',
                  content: [
                    {
                      type: 'tableCell',
                      content: [{ type: 'heading', attrs: { level: 1 } }],
                    },
                  ],
                },
              ],
            },
          ],
        })
        .check(),
    ).toThrow()
  })

  it('belongs to all preset only', () => {
    expect(allRichTextPreset.features).toContain(tableFeature)
  })
})
