import exampleImage from '../assets/example-image.png?inline'
import type { RichTextDocument } from '@rev30/rich-text/schema'

function text(textValue: string, marks?: unknown[]) {
  return marks?.length
    ? { type: 'text', text: textValue, marks }
    : { type: 'text', text: textValue }
}

function paragraph(content: unknown[], textAlign: string | null = null) {
  return { type: 'paragraph', attrs: { textAlign }, content }
}

function cell(type: 'tableCell' | 'tableHeader', value: string) {
  return {
    type,
    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: null },
    content: [paragraph([text(value)])],
  }
}

export function createDefaultDocument(): RichTextDocument {
  return {
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 1, textAlign: null },
        content: [text('用真实能力写一篇富文本文章')],
      },
      paragraph([
        text('这是一个本地 playground：编辑器使用 client all preset，结果使用 server all preset。'),
      ]),
      {
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: [text('内容与格式')],
      },
      paragraph([
        text('一段文字可以同时拥有 '),
        text('加粗', [{ type: 'bold' }]),
        text('、'),
        text('斜体', [{ type: 'italic' }]),
        text('、'),
        text('下划线', [{ type: 'underline' }]),
        text('、'),
        text('删除线', [{ type: 'strike' }]),
        text('、'),
        text('行内代码', [{ type: 'code' }]),
        text(' 和 '),
        text('高亮', [{ type: 'highlight', attrs: { color: 'rgba(250, 204, 21, 0.35)' } }]),
        text('。'),
      ]),
      paragraph([
        text('文字样式也可以表达 '),
        text('蓝色衬线文字', [
          {
            type: 'textStyle',
            attrs: { color: '#3b82f6', fontFamily: 'serif', fontSize: '18pt', lineHeight: '1.5' },
          },
        ]),
        text('，并链接到 '),
        text('HTTPS 文档', [{ type: 'link', attrs: { href: 'https://example.com/docs' } }]),
        text('。'),
      ]),
      {
        type: 'heading',
        attrs: { level: 3, textAlign: null },
        content: [text('段落对齐')],
      },
      paragraph([text('左对齐段落')], 'left'),
      paragraph([text('居中段落')], 'center'),
      paragraph([text('右对齐段落')], 'right'),
      paragraph([text('两端对齐段落，适合较长的说明文字。')], 'justify'),
      {
        type: 'bulletList',
        content: [
          { type: 'listItem', content: [paragraph([text('无序列表项目')])] },
          { type: 'listItem', content: [paragraph([text('第二个项目')])] },
        ],
      },
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          { type: 'listItem', content: [paragraph([text('有序列表项目')])] },
          { type: 'listItem', content: [paragraph([text('第二步')])] },
        ],
      },
      {
        type: 'blockquote',
        content: [paragraph([text('好的编辑体验，让内容和结构自然地保持一致。')])],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [
          text(
            'const result = deriveRichTextContent(document, serverPreset)\nconsole.log(result.html)',
          ),
        ],
      },
      { type: 'horizontalRule' },
      {
        type: 'image',
        attrs: { src: exampleImage, alt: '富文本 playground 示例图片', width: 320, height: null },
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              cell('tableHeader', '功能'),
              cell('tableHeader', '状态'),
              cell('tableHeader', '说明'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', 'Client all preset'),
              cell('tableCell', '已启用'),
              cell('tableCell', '真实编辑器工具栏'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', 'Server all preset'),
              cell('tableCell', '已启用'),
              cell('tableCell', '校验、清洗和静态渲染'),
            ],
          },
        ],
      },
      paragraph([text('继续输入，结果会在停止编辑约 300ms 后自动同步。')]),
    ],
  }
}
