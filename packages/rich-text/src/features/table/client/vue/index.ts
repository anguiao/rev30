import { TextSelection } from '@tiptap/pm/state'
import { richTextFeatureQuickBar } from '../../../../client/vue/quick-bar'
import { richTextToolbarComponent } from '../../../../client/vue/toolbar'
import { getSelectedTable } from '../editor'
import { tableFeature } from '../../core/feature'
import TableQuickBar from './TableQuickBar.vue'
import TableToolbarControl from './TableToolbarControl.vue'

export const tableToolbarControl = richTextToolbarComponent({
  feature: tableFeature,
  component: TableToolbarControl,
  props: {},
})

export const tableQuickBar = richTextFeatureQuickBar({
  feature: tableFeature,
  isActive: ({ state: { selection } }) =>
    getSelectedTable(selection) !== null &&
    (!(selection instanceof TextSelection) || selection.empty),
  component: TableQuickBar,
  props: {},
  getAnchorElement: (editor) => {
    const table = getSelectedTable(editor.state.selection)
    const element = table ? editor.view.nodeDOM(table.pos) : null

    return element instanceof HTMLElement ? element : null
  },
})
