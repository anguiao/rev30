import { flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RichTextDemoPreviewResponse } from '@rev30/contracts'
import AdminPage from '../../../src/pages/index.vue'
import RichTextDemoPage from '../../../src/pages/index/demos/rich-text.vue'
import {
  createRichTextDemoImageDataUrl,
  generateRichTextPreview,
} from '../../../src/features/demos'
import { useThemeStore } from '../../../src/stores/theme'
import { mountAuthRoute, session } from '../../helpers/auth'
import { createDeferred } from '../../helpers/promise'

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
  generateRichTextPreview: vi.fn(),
}))

const createRichTextDemoImageDataUrlMock = vi.mocked(createRichTextDemoImageDataUrl)
const generateRichTextPreviewMock = vi.mocked(generateRichTextPreview)

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
    generateRichTextPreviewMock.mockReset()
  })

  it('submits editor content and shows server-derived output', async () => {
    generateRichTextPreviewMock.mockResolvedValue(previewResponse)
    const { wrapper } = await mountPage()

    expect(wrapper.text()).toContain('完整富文本能力演示')
    expect(
      wrapper.get('[data-test="rich-text-demo-preview"]').attributes('disabled'),
    ).toBeUndefined()

    await wrapper.get('[data-test="rich-text-demo-editor-stub"]').trigger('click')
    await wrapper.get('[data-test="rich-text-demo-preview"]').trigger('click')
    await flushPromises()

    expect(generateRichTextPreviewMock.mock.calls[0]?.[0]).toEqual({
      contentJson: previewResponse.contentJson,
    })
    expect(wrapper.get('[data-test="rich-text-demo-rendered"]').html()).toContain(
      '<strong>组件演示</strong>',
    )
    expect(wrapper.get('[data-test="rich-text-demo-rendered"] .hljs-keyword').text()).toBe('const')

    const jsonTab = wrapper.findAll('.n-tabs-tab').find((tab) => tab.text() === 'JSON')

    expect(jsonTab).toBeDefined()

    await jsonTab!.trigger('click')
    expect(wrapper.get('[data-test="rich-text-demo-json"]').text()).toContain('组件演示')
  })

  it('does not auto-highlight code blocks without a language', async () => {
    generateRichTextPreviewMock.mockResolvedValue({
      ...previewResponse,
      contentHtml: '<p><strong>组件演示</strong></p><pre><code>const ready = true</code></pre>',
    })
    const { wrapper } = await mountPage()

    await wrapper.get('[data-test="rich-text-demo-editor-stub"]').trigger('click')
    await wrapper.get('[data-test="rich-text-demo-preview"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-test="rich-text-demo-rendered"] code').classes()).not.toContain(
      'hljs',
    )
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

  it('ignores a preview response after the editor content changes', async () => {
    const pendingPreview = createDeferred<RichTextDemoPreviewResponse>()
    generateRichTextPreviewMock.mockReturnValue(pendingPreview.promise)
    const { wrapper } = await mountPage()

    await wrapper.get('[data-test="rich-text-demo-editor-stub"]').trigger('click')
    await wrapper.get('[data-test="rich-text-demo-preview"]').trigger('click')
    wrapper.getComponent({ name: 'RichTextEditorStub' }).vm.$emit('update:modelValue', {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '已修改' }] }],
    })
    await flushPromises()

    pendingPreview.resolve(previewResponse)
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-demo-rendered"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rich-text-demo-error"]').exists()).toBe(false)
  })

  it('ignores a preview error after the editor content changes', async () => {
    const pendingPreview = createDeferred<RichTextDemoPreviewResponse>()
    generateRichTextPreviewMock.mockReturnValue(pendingPreview.promise)
    const { wrapper } = await mountPage()

    await wrapper.get('[data-test="rich-text-demo-editor-stub"]').trigger('click')
    await wrapper.get('[data-test="rich-text-demo-preview"]').trigger('click')
    wrapper.getComponent({ name: 'RichTextEditorStub' }).vm.$emit('update:modelValue', {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '已修改' }] }],
    })
    await flushPromises()

    pendingPreview.reject(new Error('旧请求失败'))
    await flushPromises()

    expect(wrapper.find('[data-test="rich-text-demo-error"]').exists()).toBe(false)
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
