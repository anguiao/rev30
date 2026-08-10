---
status: completed
date: 2026-08-05
---

# 富文本表格能力补全设计

## 背景

`2026-07-27-rich-text-table-design.md` 已完成基础文档表格设计并落实到当前代码。现有 `tableFeature` 已具备：

- 完整的 Table、TableRow、TableCell、TableHeader schema；当前内置 preset 组合中只有 `all` 启用该 feature。
- 顶部尺寸选择器、Slash 固定尺寸插入、Table Toolbar 菜单和 Table Quick Bar。
- 新增、删除行列，切换首行表头和删除整表。
- 折叠光标、文字选区与 `CellSelection` 的上下文优先级。
- 单元格 `colspan`、`rowspan`、`colwidth`、`align` 和任意合法 `tableHeader` 位置的跨端 JSON 契约。
- 服务端表格几何校验、资源上限、HTML 清洗和静态渲染。
- 宽表格横向滚动、整格选区样式和基础键盘交互。

基础设计当时有意暂缓合并/拆分、首列表头、表头单元格、单元格级对齐 UI 和列宽拖动。当前 schema 与服务端契约已经保留这些数据，Tiptap 3.29.2 也提供对应表格原语，因此本轮只需要补全编辑动作、上下文 UI、列宽交互和回归验证，不需要替换现有表格模型。

本设计是基础表格 spec 的后续增量，不修改已经批准并落实的历史决策记录。当前实际行为以代码和测试为准。

## 目标

- 为现有 `tableFeature` 增加合并和拆分单元格的 editor actions 与 UI。
- 增加首列表头和所选表头单元格操作，并与现有首行表头保持一致。
- 暴露单元格已有的 `align` 属性，支持默认、左对齐、居中和右对齐。
- 启用 Tiptap 原生列宽拖动，允许拖动最右侧边界，并保证宽表格继续可横向滚动。
- 让新增能力同时出现在完整 Table Toolbar 菜单与稳定分组的 Table Quick Bar 中。
- 保持折叠光标、文字选区、`CellSelection`、焦点和键盘交互的既有契约。
- 保证编辑器 JSON、服务端规范化 JSON、安全 HTML 和只读内容样式继续一致。
- 正确处理编辑器初始禁用、运行时启用和再次禁用时的列宽插件行为。
- 用必要的单元、组件和真实 Chromium 测试覆盖用户可见行为与回归风险。

## 非目标

本轮不实现：

- 公式、排序、筛选、数据类型、汇总或其它电子表格能力。
- 行列拖拽排序、行列手柄或块编辑器式侧边控制。
- 表格题注、固定表头或分页控制。
- 数值输入列宽、均分列宽、一键恢复全部自动列宽或键盘列宽调整控件。
- 触屏设备上的列宽拖动；本轮原生 resize 交互只支持鼠标和触控板等细指针输入。
- 自定义 Table NodeView 或自定义列宽算法。
- 业务方自定义表格菜单、最小列宽、拖动手柄或新增公开 preset option。
- 扩大单元格块内容范围；单元格继续只接受一个或多个段落及其行内内容。

## 术语

- **目标单元格**：当前单元格级 action 实际读取或修改的去重单元格集合。
- **单格上下文**：折叠光标、同一单元格内的普通文字选区，或只包含一个完整单元格的 `CellSelection`。
- **多格选区**：覆盖两个或以上完整单元格的 `CellSelection`。
- **混合表头选区**：目标单元格中同时存在 `tableHeader` 和 `tableCell`。
- **统一对齐**：全部目标单元格的 `align` 相同，包括全部为 `null`。
- **混合对齐**：目标单元格具有两个或以上不同的 `align` 值。
- **首行表头**：表格第一行覆盖的单元格均为 `tableHeader`。
- **首列表头**：表格第一列覆盖的单元格均为 `tableHeader`。
- **列宽拖动**：Tiptap/ProseMirror Tables 根据指针拖动更新单元格 `colwidth`，并通过 `colgroup` 反映到编辑器和静态 HTML 的行为。

## 已确认的产品决策

| 主题 | 决策 |
| --- | --- |
| 发布范围 | 四项能力作为一次完整的表格编辑闭环交付 |
| 首列表头 | 始终切换整张表格的第一列，与首行表头对称 |
| 表头单元格 | 全部已是表头时全部取消；否则把全部目标单元格统一设为表头 |
| 对齐值 | `null`、`left`、`center`、`right` 四种；`null` 在 UI 中显示为“默认” |
| 对齐层级 | 单元格对齐作为继承默认值；段落自身 `textAlign` 自然覆盖，不做额外清理 |
| Quick Bar | 固定为“行 / 列 / 单元格 / 对齐 / 删除表格”五个入口 |
| Quick Bar 位置 | 在当前可见 `.tableWrapper` 上方水平居中；不改变其它 feature 的锚点对齐 |
| 列宽边界 | 允许拖动内部边界和最右侧边界 |
| 混合类型合并 | 允许合并表头与普通单元格；结果继承左上角单元格类型与属性 |
| 合并列宽 | 合并时把每个逻辑列的已有宽度完整保存在合并单元格的 `colwidth` 中；拆分按该数组展开，不在拆分时推断已丢失的宽度 |
| 合并与表头维度 | 保持 ProseMirror Tables 默认行为；跨越首行/首列交叉区域的合并单元格作为不可分割节点处理，不自动拆分、不增加禁用规则，也不额外记录独立表头状态 |
| 拖动中禁用 | 保持原生手势边界；禁用后不能开始新的列宽拖动，已经开始的拖动允许在松开指针时完成 |
| 拖动输入 | 列宽拖动支持鼠标和触控板等细指针输入；不为触屏设备增加自定义 pointer/touch resize 交互 |

## 实现方案

本轮扩展现有 Table feature，复用 Tiptap 表格原语，并在现有 feature-first 目录中增加 selection helper、actions、action items 和 Vue 菜单配置：

- 合并与拆分复用 Tiptap/ProseMirror Tables 原语；合并 action 在同一 transaction 中补全原生命令未保留的逻辑列宽映射。
- 首行和首列表头复用 Tiptap 3.29.2 的 `toggleHeaderRow`、`toggleHeaderColumn` command；这两个 editor command 内部使用 ProseMirror Tables 面向首个维度的新版 `toggleHeader('row' | 'column')` 语义。
- 表头单元格与批量对齐在项目 action 中做目标集合归一化，避免混合选区行为依赖 anchor cell。
- 列宽使用 Tiptap 原生 `columnResizing` 和 TableView，不实现自定义 NodeView。
- Toolbar 与 Quick Bar 复用 action、状态解析、label、icon 和 dropdown option factory。
- schema 与服务端继续使用现有 Table feature，不建立平行契约。

该方案沿用项目现有边界，新增逻辑可以独立测试，也能避免把 selection 与 transaction 规则复制到 Vue 组件。

## 架构

### Feature 边界

`tableFeature` 继续是不可拆分的单一 feature，并保持以下依赖方向：

```text
shared schema/config
        ↓
editor actions/state helpers ──→ Vue Toolbar / Quick Bar
        ↓
editor transactions ──────────→ RichTextEditor v-model

shared schema/config
        ↓
server validation / static renderer / sanitizer
```

不新增跨 feature 的 Table 专用焦点、菜单或 Grid 基础设施。

### 文件职责

主要调整继续收敛在现有文件：

```text
packages/rich-text/src/features/table/
├── shared.ts
├── editor.ts
├── server.ts
└── vue/
    ├── index.ts
    ├── dropdown.ts
    ├── TableQuickBarActionDropdown.vue
    ├── TableQuickBar.vue
    └── TableToolbarControl.vue
```

- `shared.ts`：保留 Table schema 与属性校验，开启原生列宽拖动配置。
- `editor.ts`：解析目标单元格，定义新增 actions、action items 和 active state；四个对齐 action item 在此绑定具体对齐值，向 UI 暴露为普通无参数 action。
- `server.ts`：继续使用现有几何校验和 HTML policy；本轮不增加新的服务端能力。
- `vue/dropdown.ts`：组合行、列、单元格和对齐菜单项，统一派生动态文案、active/disabled 状态和菜单语义。
- `TableToolbarControl.vue`：渲染完整多级菜单与动态表头文案。
- `TableQuickBar.vue`：渲染五个稳定入口。
- `TableQuickBarActionDropdown.vue`：继续承担 Quick Bar 平铺 dropdown，并沿用通用无参数 action item 模型，不复制命令逻辑。
- `RichTextEditor.vue`：确保列宽 plugin 不依赖初始 `disabled` 状态，并补充编辑器专用拖动手柄规则。

不从 package public exports 暴露新增 action、selection helper 或 UI 配置。

## Schema 与跨端契约

### Table 配置

`Table.configure` 调整为：

```ts
Table.configure({
  resizable: true,
  renderWrapper: true,
  cellMinWidth: 96,
  lastColumnResizable: true,
})
```

继续使用现有扩展后的 TableCell 和 TableHeader：

- `content: 'paragraph+'`
- `colspan`、`rowspan` 为正安全整数
- `colwidth` 为 `null` 或有限数字数组
- `align` 为 `null | 'left' | 'center' | 'right'`

开启 `resizable` 只增加 editor plugin 和 NodeView 行为，不改变 JSON schema。

### 服务端契约

现有服务端已经：

- 用 `TableMap` 拒绝碰撞、缺格、越界 rowspan 和不一致 colwidth 等非法几何结构。
- 在构造 `TableMap` 前限制单表与单文档网格槽位数。
- 允许并规范化 `th`、`td` 的 `colspan`、`rowspan`、`colwidth` 和 `text-align`。
- 允许并规范化 `table`、`col` 的受控宽度声明。
- 为只读 HTML 生成 `.tableWrapper`、`colgroup` 和横向滚动区域。

因此本轮不修改 JSON schema、HTML allowlist、sanitize transform 或错误类型。新增编辑行为产生的文档直接进入现有可信服务端边界。

## Selection 与目标单元格

### 目标解析

`editor.ts` 增加一个内部 helper，从当前 `Selection` 返回按文档顺序排列且去重的目标单元格节点与位置：

- `CellSelection`：使用其完整单元格集合。
- 折叠光标：返回光标所在单元格。
- 非空普通文字选区：只有 `$from` 与 `$to` 位于同一个单元格时返回该单元格。
- 跨单元格但不是 `CellSelection` 的 selection：返回空集合，不推断多个目标。
- 表格外 selection：返回空集合。

表格级 action 继续通过 `getSelectedTable` 解析当前表格。只有 selection 的两端属于同一张表格时，完整 Table Toolbar 菜单才进入 active 模式。

### 状态聚合

同一组目标单元格同时用于：

- 判断表头单元格 action 的动态 label。
- 判断对齐菜单的统一值或混合状态。
- 生成四个已绑定 align action item 的 active 与 `can()` 结果。
- 保证 Toolbar 与 Quick Bar 对同一 selection 显示相同状态。

Vue 组件不缓存第二份 selection 或单元格状态。每次 editor transaction 后直接从最新 `editor.state` 重新派生。

## Editor actions

### 合并单元格

新增 `mergeCellsAction`，复用 ProseMirror Tables `mergeCells` 并在同一 transaction 中保留逻辑列宽：

- 只接受覆盖两个或以上完整单元格的 `CellSelection`。
- selection 外轮廓必须是可合并矩形，且不得切穿既有合并单元格边界。
- 合并前通过 `TableMap` 读取所覆盖逻辑列的持久化宽度；该读取只使用文档中的 `colwidth`，不测量或反推 DOM 宽度。
- 结果继承左上角单元格的节点类型与属性。
- 原生合并完成后，把各逻辑列的宽度按顺序写入结果单元格的 `colwidth`；固定宽度保留对应数值，未固定的列保留原生 `0` 占位语义，全部列均未固定时规范为 `null`。
- 其它非空单元格内容按从上到下、从左到右的顺序追加到结果单元格。
- 表头与普通单元格可以混合合并。
- 成功后 selection 落在合并后的单元格。

这不是在拆分时恢复已经丢失的信息。项目 action 在原生合并产生最终 transaction 前补全 `colwidth`，因此 editor JSON 始终携带后续拆分需要的完整逻辑列映射。合并仍只产生一次文档 transaction，并可一次 Undo。

普通不可执行情况返回 `false`，UI 由同一 action 的 `can()` 显示 disabled。

### 拆分单元格

新增 `splitCellAction`，在确认只有一个目标单元格后调用 Tiptap `splitCell`：

- 折叠光标、同一单元格内的文字选区或单格 `CellSelection` 可以触发。
- 目标必须具有大于 1 的 `colspan` 或 `rowspan`。
- 原内容保留在左上角单元格，其余新单元格为空段落。
- 新单元格继承原单元格的节点类型、对齐和其它适用属性。
- 原生 `splitCell` 按合并单元格的 `colwidth[i]` 展开第 `i` 个逻辑列：固定值写为新单元格的单值 `colwidth`，`0` 写回未固定的 `null`。`rowspan` 大于 1 时，各拆出行使用相同的逐列映射。
- 折叠光标或文字选区按 transaction mapping 保留在左上角单元格；单格 `CellSelection` 拆分后沿用上游行为，变为覆盖拆出矩形的 `CellSelection`。

普通单元格上的 action 返回 `false`。

### 首行与首列表头

保留现有 `toggleHeaderRowAction`，新增对称的 `toggleHeaderColumnAction`，并让二者落实已经确认的“始终操作首个维度”语义：

- 分别调用 Tiptap `toggleHeaderRow` 与 `toggleHeaderColumn`；Tiptap 3.29.2 的这两个 command 内部调用 ProseMirror Tables `toggleHeader('row')` 与 `toggleHeader('column')` 的非 deprecated 语义。
- 无论光标位于表格何处，都只切换第一行或第一列。
- active state 分别使用 `rowIsHeader(..., 0)` 与 `columnIsHeader(..., 0)`。
- 当首行与首列同时启用时，沿用上游命令跳过另一表头维度交叉区域的规则，避免普通未合并交叉单元格丢失另一维表头语义。
- `tableHeader`/`tableCell` 类型属于整个单元格节点。合并单元格跨越被跳过的交叉区域时，上游命令保持该不可分割节点的现有类型；这可能让两个表头 active 状态在该结构下联动，或让一次切换没有可见变化。项目不为此自动拆分、禁用 action、增加隐藏状态或补写 transaction。
- 动态 label 分别为“设置/取消首行表头”和“设置/取消首列表头”。

### 表头单元格

新增内部归一化 action，不直接采用混合选区下的原生逐次切换语义：

1. 解析全部目标单元格。
2. 若目标全部为 `tableHeader`，将全部转换为 `tableCell`。
3. 否则将全部目标统一转换为 `tableHeader`；已有 header 保持 header。
4. 转换只替换节点类型，保留内容、`colspan`、`rowspan`、`colwidth` 和 `align`。

因此混合选区只需一次操作即可统一设为表头。UI 在全部为 header 时显示“取消表头单元格”，其它情况显示“设置表头单元格”。

### 单元格对齐

新增参数化 `setCellAlignAction`，参数类型固定为：

```ts
type TableCellAlign = 'left' | 'center' | 'right'
```

action 参数为 `TableCellAlign | null`。`editor.ts` 中的四个 UI action item 分别把下列值绑定到独立的无参数 action；Toolbar 与 Quick Bar 因而继续使用与其它菜单项相同的执行路径：

| UI | action 参数 |
| --- | --- |
| 默认 | `null` |
| 左对齐 | `'left'` |
| 居中 | `'center'` |
| 右对齐 | `'right'` |

action 对全部目标单元格设置相同 `align`：

- 若全部目标已经等于请求值，返回 `false`，对应 option 为 active 且不可重复执行。
- 若 selection 为混合对齐，四个 option 均不显示 active。
- action 只修改单元格节点属性，不修改段落 `textAlign`。
- 单元格对齐通过继承作用于内部段落；段落显式 `textAlign` 继续自然覆盖。

批量设置由项目 action 按目标位置写入同一个 transaction，不把行为交给 anchor cell 的单值预检查，确保 anchor 已是目标值而其它单元格不是时仍能完成归一化。

## Toolbar 与 Quick Bar

### 完整 Table Toolbar 菜单

selection 位于表格内时，Table Toolbar Control 的菜单顺序为：

1. “行”子菜单：上方新增、下方新增、删除行。
2. “列”子菜单：左侧新增、右侧新增、删除列。
3. “单元格”子菜单：合并单元格、拆分单元格、设置/取消表头单元格。
4. “对齐”子菜单：默认、左对齐、居中、右对齐。
5. 分隔线。
6. 设置/取消首行表头。
7. 设置/取消首列表头。
8. 分隔线。
9. 删除表格。

表格外的创建尺寸选择器保持不变。

### Table Quick Bar

Table Quick Bar 固定按以下顺序显示五个 roving item：

1. `行⌄`
2. `列⌄`
3. `单元格⌄`
4. `对齐⌄`
5. 删除表格

其中：

- 行、列 dropdown 保持现有平铺菜单。
- 单元格 dropdown 平铺合并、拆分和动态表头单元格操作。
- 对齐 dropdown 平铺四个对齐值，并显示统一 active state。
- 删除表格继续使用独立危险操作按钮。

入口位置与含义不会根据 selection 动态替换；只有内部 menu item 的 active、disabled 和动态 label 变化。

由于本轮将 Table Quick Bar 从三个入口扩展为五个入口，操作条改为在当前可见 `.tableWrapper` 上方水平居中。该增量决策替代基础表格 spec 中的右上方对齐；锚点仍为 wrapper，不随折叠光标或 `CellSelection` 移动，宽表格横向滚动时也不依赖内部 table 的最右侧边缘。Floating UI 继续使用 `shift` 处理靠近编辑器边缘时的溢出；CodeBlock 等其它 feature 的锚点对齐保持不变。

### 上下文优先级

现有 Quick Bar 匹配顺序保持不变：

1. Image NodeSelection。
2. 折叠光标位于连续 Link mark。
3. CodeBlock 上下文。
4. Table 单格上下文或 `CellSelection`。
5. 非空普通文字选区。
6. 不显示。

因此：

- 多格 `CellSelection` 显示 Table Quick Bar。
- 折叠光标位于单元格时显示 Table Quick Bar。
- 单元格内非空文字选区显示普通文字 Quick Bar，但完整 Toolbar 中的单元格 action 仍作用于该文字所在单元格。

### 焦点与可访问性

- 四个 dropdown trigger 与删除按钮继续由 Quick Bar roving focus 管理。
- 完整 Toolbar trigger 继续由顶部 roving focus 管理。
- `Escape` 先关闭局部 dropdown 并回到自身 trigger；未被局部组件消费时再交给外层 Quick Bar。
- `Tab`/`Shift+Tab` 保留浏览器默认焦点移动，并关闭临时菜单。
- dropdown 使用 `role="menu"`，trigger 提供稳定的 `aria-label`、`aria-haspopup` 和 `aria-expanded`。
- disabled item 提供 `aria-disabled`，active 对齐和动态表头状态具有可识别的菜单文本或选中语义。
- 不增加新的 Table 专属键盘入口；键盘用户继续通过 `Alt+F10` 进入完整 Toolbar。

## 列宽拖动

### 原生插件

Table 开启 `resizable: true` 后使用 Tiptap 内置 `columnResizing`：

- 原生插件使用 mouse 事件，支持鼠标和映射为鼠标输入的触控板；触屏设备不提供列宽拖动。
- 指针靠近单元格边界时激活对应 handle。
- 拖动期间 TableView 只更新 DOM 预览。
- 松开指针时由一个 transaction 更新该逻辑列覆盖的单元格 `colwidth`。
- 内部边界只写入边界左侧的逻辑列，不主动反向调整右侧列；相邻自动列仍由浏览器表格布局分配剩余空间，表格的最终宽度或最小宽度可以随持久化列宽变化。
- 最小列宽为 `96px`。
- `lastColumnResizable: true` 允许拖动最右侧边界，并通过 table `width` 或 `min-width` 改变整表占用宽度。
- `.tableWrapper` 继续负责超出容器后的横向滚动。
- 一次 History Undo 撤销一次完成的列宽拖动。

不增加 Table NodeView、拖动状态 store 或 Vue pointer listener。

### `disabled` 生命周期

Tiptap 3.29.2 的 Table extension 只在扩展初始化时根据 `editor.isEditable` 决定是否注册 `columnResizing`。当前 `RichTextEditor` 直接用初始 `disabled` 设置 `editable`，会导致“初始禁用、后续启用”的 editor 永久缺少 resize plugin。

为保持 `disabled` prop 的运行时契约：

1. `RichTextEditor` 创建 Editor 时先允许扩展完成可编辑 plugin 注册。
2. Editor 构造完成后、视图交给模板前，立即调用 `setEditable(!props.disabled, false)` 应用真实状态。
3. 后续继续由现有 watcher 调用 `setEditable`。

`columnResizing` 在尚未拖动时通过 `view.editable` 阻止 handle 激活和 mousedown，因此 plugin 可以始终注册而不会在只读状态开始修改文档。拖动开始后，上游挂在 window 的 move/mouseup handler 不再检查 `view.editable`；如果此时切换为禁用，当前拖动仍允许在 mouseup 时提交。项目不增加中途取消、DOM 预览回滚或 plugin state 操作，只保证禁用后发起的新手势无效。编辑器样式还需只在实际 `contenteditable="true"` 时显示有效 handle/cursor，避免禁用切换时残留视觉状态。

该调整不触发 `update:modelValue`，也不重建 Editor、文档或 selection。

### 编辑器样式

在现有表格选区规则旁补齐 ProseMirror Tables 所需的编辑器样式：

- 单元格保持 `position: relative`。
- `.column-resize-handle` 覆盖当前列边界并使用现有 theme token。
- handle 的层级高于 `selectedCell` overlay 和单元格内容。
- `.resize-cursor` 与拖动单元格使用列宽调整 cursor。
- 禁用 editor 不展示可操作 handle。

只读 HTML 不包含 resize decoration，继续只使用 `content.css` 的表格排版规则。

## 数据流

### 菜单 action

```text
editor selection
  → 目标单元格 / 当前表格解析
  → Toolbar 与 Quick Bar 派生 active / disabled / label
  → 用户选择菜单项
  → RichTextAction 创建一个 transaction
  → Editor dispatch
  → RichTextEditor onUpdate
  → update:modelValue(JSON)
  → 现有服务端校验、规范化与 HTML 派生
```

### 列宽拖动

```text
pointer 靠近列边界
  → columnResizing plugin 激活 handle
  → 拖动时 TableView 更新 DOM 预览
  → mouseup transaction 写入 colwidth
  → RichTextEditor onUpdate
  → update:modelValue(JSON)
  → 静态 renderer 由 colwidth 生成 colgroup 与 table width/min-width
```

Vue 只维护 dropdown 显隐等临时界面状态，不维护表格数据副本。

## 失败与边界处理

- selection 不满足 action 前置条件时返回 `false`，UI 显示 disabled。
- 合并失败时不自动扩大、缩小或修复 selection。
- 合并失败时不写入列宽；成功合并后的 `colwidth` 必须继续满足现有逐逻辑列一致性校验。
- 拆分失败时不创建额外单元格。
- 表头与对齐 action 没有合法目标时不 dispatch。
- 行列删除继续保留现有最后一行、最后一列与整表选区保护，不回退为删除整表。
- 列宽拖动不会小于 `96px`；完成前的 DOM 预览不写入 model。
- 普通不可执行状态不抛异常，也不增加 `try/catch`。
- 非可信 JSON 继续在服务端 schema、资源上限与 `TableMap` 几何校验处失败，并包装为现有富文本内容无效错误。

## 兼容性

- 现有无显式列宽的表格继续使用 `colwidth: null`，无需迁移。
- 现有合法 `colspan`、`rowspan`、`colwidth`、`align` 和任意位置的 `tableHeader` 继续原样规范化。
- UI 新产生的列宽不小于 `96px`；现有外部文档中的合法有限 `colwidth` 继续由 TableView 和静态 renderer 按最小列宽约束展示。
- 内置 preset 定义不变；`compact` 的 schema、Toolbar、Quick Bar、服务端接受范围和 bundle 边界保持不变。
- 表格创建尺寸、默认 3×3 Slash 插入、首行默认表头、行列操作、selection 优先级和删除规则保持不变。
- 不新增 public export、preset option 或消费方迁移步骤。

## 测试设计

只添加覆盖用户可见行为、核心规则和回归风险的测试。

### Editor 单元测试

扩展 `packages/rich-text/__tests__/features/table/editor.test.ts`：

- 合并合法矩形，验证 `colspan`、`rowspan`、内容顺序和左上角类型/属性。
- 合并全部自动、部分固定和全部固定宽度的逻辑列，验证合并结果完整保留 `colwidth`，且不会产生服务端拒绝的列宽映射。
- 允许混合表头/普通单元格合并。
- 拒绝单格、非矩形和切穿既有合并结构的合并。
- 拆分合并单元格，验证内容、类型、对齐，以及固定宽度和自动宽度按已保存的 `colwidth` 映射展开，而不是读取 DOM 推断。
- 首列表头与首行表头在普通单元格结构下独立切换并保留交叉单元格；跨越交叉区域的合并单元格保持 ProseMirror Tables 默认的节点级切换结果。
- 单格、多格和混合选区的表头单元格归一化。
- 四种对齐值、混合对齐、anchor 已为目标值但其它目标不同，以及恢复 `null`。
- 对齐 action 不修改段落 `textAlign`。
- 新 actions 的 `can()` 与执行结果一致，History 可以撤销文档变更。

### Shared 与组件测试

- `shared.test.ts` 验证 `resizable`、`cellMinWidth` 和 `lastColumnResizable` 配置。
- `TableControls.test.ts` 验证完整菜单顺序、子菜单内容、动态表头 label、对齐 active/disabled 和键盘行为。
- `TableQuickBar.test.ts` 验证五个稳定入口、默认居中锚点对齐、单元格/对齐 dropdown、roving focus、局部 `Escape` 和原生 `Tab`。
- `RichTextEditor.test.ts` 验证 resize plugin 不受初始 disabled 影响而缺失、editable 状态可按 prop 往返切换，单纯切换状态不产生 model update；实际 pointer 手势留给 Chromium。

### 服务端回归测试

现有 `server.test.ts` 已覆盖合法合并属性、表头、对齐、列宽、非法几何结构、资源上限和 sanitizer。只在 editor 新产生的 JSON 或 HTML 形态出现现有断言未覆盖的差异时补充一条跨端回归，不重复已有矩阵。

继续保留 `compact` preset 不接受 Table JSON 的既有测试。

### Playground Chromium 测试

新增聚焦表格交互的 browser test：

- 创建完整单元格选区，从 Quick Bar 合并，再从合并单元格拆分。
- 通过完整 Toolbar 设置首列表头，通过 Quick Bar 设置表头单元格与批量对齐。
- 验证编辑器 DOM、JSON 和右侧派生 HTML 同步。
- 使用鼠标输入实际拖动内部列边界，验证 `colwidth`、`colgroup` 和 Undo。
- 实际拖动最右侧边界，验证 table 宽度或最小宽度变化及横向滚动。
- 初始 disabled 后启用仍可拖动；再次 disabled 后新发起的 pointer 手势不修改文档。测试不覆盖拖动进行中切换 disabled 的极端时序，该手势按上游默认允许完成。
- 非空文字选区继续显示普通文字 Quick Bar，Table Quick Bar 优先级不回归。

不使用 happy-dom 模拟真实列宽测量和 pointer drag；这些行为必须由 Chromium 验证。

### 验证命令

实现阶段按需运行：

```bash
pnpm --filter @rev30/rich-text test __tests__/features/table/editor.test.ts
pnpm --filter @rev30/rich-text test __tests__/features/table/vue/TableControls.test.ts
pnpm --filter @rev30/rich-text test __tests__/features/table/vue/TableQuickBar.test.ts
pnpm --filter @rev30/rich-text-playground test __tests__/rich-text-table.browser.test.ts
pnpm check
```

完整 `pnpm check` 按仓库约定在沙箱外运行，以支持 Chromium browser tests。

## 文档更新

- `playgrounds/rich-text/README.md` 的 browser suite 说明增加表格合并、表头、对齐和列宽拖动覆盖。
- 根 README 已说明完整 preset 包含文档表格，无需重复扩写。

## 验收标准

1. Table Toolbar 与 Table Quick Bar 可以完成合并、拆分、表头单元格和单元格对齐。
2. 首列表头与现有首行表头语义对称；普通单元格结构下二者可独立切换且交叉单元格正确，跨越交叉区域的合并单元格保持 ProseMirror Tables 默认节点级行为。
3. 混合表头选区一次操作即可统一设为表头；全部表头选区一次操作即可统一取消。
4. 对齐支持默认、左、居中、右四态，批量归一化不受 anchor cell 影响，也不修改段落 `textAlign`。
5. 鼠标和触控板可以拖动内部列边界和最右侧边界，宽度写入 `colwidth`，静态 HTML 与编辑器展示一致；合并不会丢失所覆盖逻辑列的已有宽度，随后拆分按保存的逐列映射展开。
6. 一次 Undo 可以撤销一次合并、拆分、表头、对齐或完成的列宽修改。
7. 初始 disabled、运行时 enabled、再次 disabled 的编辑器分别不能开始拖动、可以拖动、不能开始新拖动；单纯切换状态不修改文档，切换前已经开始的拖动按上游默认允许完成。
8. Table Quick Bar 在当前可见 `.tableWrapper` 上方水平居中；Toolbar、Quick Bar、Dropdown 和 selection 优先级不回归，键盘与辅助技术名称完整。
9. 服务端继续拒绝非法或超限表格，并安全保留新增 UI 产生的合法属性。
10. 内置 preset 组合、公开 API 与现有文档无需迁移。
11. 定向测试与完整 `pnpm check` 全部通过。
