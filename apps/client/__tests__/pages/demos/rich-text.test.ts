import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RichTextDemoPreviewResponse } from '@rev30/contracts'
import AdminPage from '../../../src/pages/index.vue'
import RichTextDemoPage from '../../../src/pages/index/demos/rich-text.vue'
import { createRichTextDemoImageDataUrl, previewRichTextDemo } from '../../../src/features/demos'
import { useThemeStore } from '../../../src/stores/theme'
import { mountAuthRoute, session } from '../../helpers/auth'

const { createAllRichTextEditorPresetMock } = vi.hoisted(() => ({
  createAllRichTextEditorPresetMock: vi.fn((options) => ({
    key: 'all',
    features: [],
    toolbar: null,
    options,
  })),
}))

vi.mock('@rev30/rich-text/vue/presets/all', () => ({
  createAllRichTextEditorPreset: createAllRichTextEditorPresetMock,
}))

vi.mock('@rev30/rich-text/vue', () => ({
  RichTextEditor: defineComponent({
    name: 'RichTextEditorStub',
    props: ['modelValue', 'preset', 'minHeight'],
    emits: ['update:modelValue'],
    setup(_, { emit }) {
      return () =>
        h(
          'button',
          {
            'data-test': 'rich-text-demo-editor-stub',
            type: 'button',
            onClick: () =>
              emit('update:modelValue', {
                type: 'doc',
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: '组件演示' }] },
                  {
                    type: 'codeBlock',
                    attrs: { language: 'typescript' },
                    content: [{ type: 'text', text: 'const ready = true' }],
                  },
                ],
              }),
          },
          'editor',
        )
    },
  }),
}))

vi.mock('highlight.js/styles/github.css?raw', () => ({
  default: '.hljs { color: light; }',
}))

vi.mock('highlight.js/styles/github-dark.css?raw', () => ({
  default: '.hljs { color: dark; }',
}))

vi.mock('../../../src/features/demos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/features/demos')>()),
  createRichTextDemoImageDataUrl: vi.fn(),
  previewRichTextDemo: vi.fn(),
}))

const createRichTextDemoImageDataUrlMock = vi.mocked(createRichTextDemoImageDataUrl)
const previewRichTextDemoMock = vi.mocked(previewRichTextDemo)

const previewResponse: RichTextDemoPreviewResponse = {
  contentJson: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: '组件演示' }] },
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [{ type: 'text', text: 'const ready = true' }],
      },
    ],
  },
  contentText: '组件演示\n\nconst ready = true',
  contentHtml:
    '<p><strong>组件演示</strong></p><pre><code class="language-typescript">const ready = true</code></pre>',
}

async function mountPage() {
  return await mountAuthRoute(
    '/demos/rich-text',
    [
      {
        path: '/',
        component: AdminPage,
        children: [{ path: 'demos/rich-text', component: RichTextDemoPage }],
      },
    ],
    {
      ...session,
      accessCodes: ['demo:rich-text:preview'],
    },
  )
}

describe('rich text demo page', () => {
  beforeEach(() => {
    createAllRichTextEditorPresetMock.mockClear()
    createRichTextDemoImageDataUrlMock.mockReset()
    previewRichTextDemoMock.mockReset()
  })

  it('submits editor content and shows server-derived output', async () => {
    previewRichTextDemoMock.mockResolvedValue(previewResponse)
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('完整富文本能力演示')
    expect(wrapper.get('[data-test="rich-text-demo-preview"]').attributes('disabled')).toBeDefined()

    await wrapper.get('[data-test="rich-text-demo-editor-stub"]').trigger('click')
    await wrapper.get('[data-test="rich-text-demo-preview"]').trigger('click')
    await flushPromises()

    expect(previewRichTextDemoMock).toHaveBeenCalledWith({
      contentJson: previewResponse.contentJson,
    })
    expect(wrapper.get('[data-test="rich-text-demo-rendered"]').html()).toContain(
      '<strong>组件演示</strong>',
    )
    expect(wrapper.get('[data-test="rich-text-demo-rendered"] .hljs-keyword').text()).toBe('const')
    expect(wrapper.get('[data-test="rich-text-demo-json"]').text()).toContain('组件演示')
  })

  it('uses base64 image conversion and surfaces image errors', async () => {
    const { wrapper } = await mountPage()
    const imageOptions = createAllRichTextEditorPresetMock.mock.calls[0]?.[0].image
    const file = new File(['image'], 'image.png', { type: 'image/png' })
    createRichTextDemoImageDataUrlMock.mockResolvedValue('data:image/png;base64,aW1hZ2U=')

    await expect(imageOptions.upload(file)).resolves.toEqual({
      src: 'data:image/png;base64,aW1hZ2U=',
    })

    imageOptions.onError(new Error('图片过大'))
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-demo-error"]').text()).toBe('图片过大')
  })

  it('loads highlight themes for the resolved mode while the page is mounted', async () => {
    const { wrapper } = await mountPage()
    const theme = useThemeStore()
    const highlightTheme = document.head.querySelector<HTMLStyleElement>(
      '#rich-text-demo-highlight-theme',
    )

    theme.setMode('light')
    await flushPromises()
    expect(highlightTheme?.textContent).toBe('.hljs { color: light; }')

    theme.setMode('dark')
    await flushPromises()

    expect(highlightTheme?.textContent).toBe('.hljs { color: dark; }')

    wrapper.unmount()
    expect(document.head.querySelector('#rich-text-demo-highlight-theme')).toBeNull()
  })
})
