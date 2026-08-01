import { richTextFeatureQuickBar } from '../../../vue/quick-bar'
import { richTextToolbarComponent } from '../../../vue/toolbar'
import { getSelectedCodeBlock } from '../editor'
import { codeBlockFeature } from '../shared'
import CodeBlockQuickBar from './CodeBlockQuickBar.vue'
import CodeBlockToolbarControl from './CodeBlockToolbarControl.vue'

export const codeBlockToolbarControl = richTextToolbarComponent({
  feature: codeBlockFeature,
  component: CodeBlockToolbarControl,
  props: {},
})

export const codeBlockQuickBar = richTextFeatureQuickBar({
  feature: codeBlockFeature,
  isActive: (editor) => getSelectedCodeBlock(editor.state.selection) !== null,
  component: CodeBlockQuickBar,
  props: {},
  getAnchorElement: (editor) => {
    const codeBlock = getSelectedCodeBlock(editor.state.selection)
    const element = codeBlock ? editor.view.nodeDOM(codeBlock.position) : null
    return element instanceof HTMLElement ? element : null
  },
  anchorAlignment: 'end',
})
