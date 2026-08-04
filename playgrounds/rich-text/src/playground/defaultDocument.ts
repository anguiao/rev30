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
        content: [text('欢迎体验 Rev30 富文本编辑器')],
      },
      paragraph([
        text('这是 '),
        text('@rev30/rich-text', [{ type: 'code' }]),
        text(' 的完整功能示例。你可以像编辑真实内容一样，用'),
        text('标题与段落', [{ type: 'bold' }]),
        text('组织结构，用'),
        text('强调与引用', [{ type: 'italic' }]),
        text('保留语气，再在右侧查看同步生成的结果。'),
      ]),
      paragraph([
        text('现在就动手试试。', [
          {
            type: 'textStyle',
            attrs: { color: '#3b82f6', fontFamily: 'serif', fontSize: '18pt', lineHeight: '1.5' },
          },
        ]),
        text('选中一段文字，'),
        text('标出重点', [{ type: 'highlight', attrs: { color: 'rgba(250, 204, 21, 0.35)' } }]),
        text('、'),
        text('补充说明', [{ type: 'underline' }]),
        text('，或者把'),
        text('过时的表达', [{ type: 'strike' }]),
        text('改得更准确。你也可以打开'),
        text('项目仓库', [{ type: 'link', attrs: { href: 'https://github.com/anguiao/rev30' } }]),
        text('，了解这个编辑器的实现。'),
      ]),
      {
        type: 'heading',
        attrs: { level: 2, textAlign: null },
        content: [text('常用编辑能力')],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              paragraph([
                text('组织复杂内容。', [{ type: 'bold' }]),
                text('用多级标题、项目列表、引用和表格建立清晰层次。'),
              ]),
            ],
          },
          {
            type: 'listItem',
            content: [
              paragraph([
                text('补充丰富信息。', [{ type: 'bold' }]),
                text('加入链接、图片与代码片段，让说明更完整。'),
              ]),
            ],
          },
        ],
      },
      {
        type: 'heading',
        attrs: { level: 3, textAlign: null },
        content: [text('让排版跟着内容说话')],
      },
      paragraph([text('从左侧开始，适合自然阅读。')], 'left'),
      paragraph([text('把一句提醒放在中央。')], 'center'),
      paragraph([text('让署名安静地落在右侧。')], 'right'),
      paragraph(
        [text('较长的说明可以均匀地铺满行宽。完成编辑后，这份文档会经过两个步骤：')],
        'justify',
      ),
      {
        type: 'orderedList',
        attrs: { start: 1 },
        content: [
          { type: 'listItem', content: [paragraph([text('在左侧修改内容，结果会自动同步。')])] },
          {
            type: 'listItem',
            content: [paragraph([text('在右侧比较渲染效果、JSON 和清洗后的 HTML。')])],
          },
        ],
      },
      {
        type: 'blockquote',
        content: [
          paragraph([text('最好的演示不是告诉你每个按钮有什么用，而是让你直接开始编辑。')]),
        ],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'typescript' },
        content: [text("const publishStatus = 'ready'\nexport { publishStatus }")],
      },
      { type: 'horizontalRule' },
      {
        type: 'image',
        attrs: { src: exampleImage, alt: '一位编辑正在整理文章结构', width: 320, height: null },
      },
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              cell('tableHeader', '查看方式'),
              cell('tableHeader', '适合检查'),
              cell('tableHeader', '更新状态'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', '渲染'),
              cell('tableCell', '最终效果'),
              cell('tableCell', '实时同步'),
            ],
          },
          {
            type: 'tableRow',
            content: [
              cell('tableCell', 'JSON / HTML'),
              cell('tableCell', '派生内容'),
              cell('tableCell', '实时同步'),
            ],
          },
        ],
      },
    ],
  }
}
