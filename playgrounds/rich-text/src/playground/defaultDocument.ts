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
        content: [text("const articleTitle = '富文本示例'\nexport { articleTitle }")],
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
              cell('tableHeader', '项目'),
              cell('tableHeader', '负责人'),
              cell('tableHeader', '进度'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', '内容整理'),
              cell('tableCell', '编辑团队'),
              cell('tableCell', '已完成'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', '发布检查'),
              cell('tableCell', '运营团队'),
              cell('tableCell', '进行中'),
            ],
          },
        ],
      },
    ],
  }
}
