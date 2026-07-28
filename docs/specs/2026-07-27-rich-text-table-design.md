---
status: approved
date: 2026-07-27
---

# 富文本表格设计

## 背景

`@rev30/rich-text` 已经完成上下文交互的实现与重构，目前具备：

- feature、preset、editor/server implementation 分层。
- `compact` 与 `all` 两个内置 preset。
- 顶部工具栏、Quick Bar 和 Slash 命令面板。
- 顶部工具栏与 Quick Bar 的统一 roving focus、`Alt+F10` 入口，以及共享的 Menu/Palette 焦点 helper。
- 可在不同入口复用的 `RichTextAction`。
- 编辑器与服务端共用 feature 集合，并通过 ProseMirror schema 校验 JSON。
- 服务端从同一份 JSON 派生规范化 JSON、纯文本和经过 sanitize 的 HTML。

现有上下文交互设计曾明确将表格排除在范围外。相关基础设施现已稳定，适合在不扩张公开配置 API 的前提下，将文档型表格作为一个完整 feature 接入 `all` preset。

本设计面向普通富文本文档，不把编辑器扩展为电子表格。初版优先建立稳定的 schema、创建入口、基础结构操作、上下文交互和跨端渲染契约。

## 目标

- 为 `all` preset 增加基础文档表格。
- 从顶部工具栏通过可视化尺寸选择器创建表格。
- 从 Slash 命令快速插入固定尺寸表格。
- 新建表格默认将第一行设为表头。
- 提供新增、删除行列，切换首行表头和删除表格等基础操作。
- 在顶部工具栏保留完整入口，并提供紧凑的 Table Quick Bar。
- 明确区分单元格内文字选区、折叠光标和完整单元格选区。
- 将单元格内容限制为段落及其行内格式。
- 将 Table controls 接入现有 Toolbar、Quick Bar、Menu 和 Palette 键盘交互，不创建平行的焦点模型。
- 保持编辑器、服务端校验、HTML 输出和 sanitize policy 一致。
- 保证宽表格在窄容器内仍可使用，并支持基本键盘与辅助技术访问。

## 非目标

本阶段不实现：

- 在 `compact` preset 中启用表格。
- 公式、排序、筛选、数据类型、汇总或其它电子表格能力。
- 合并或拆分单元格的操作入口。
- 拖拽调整列宽。
- 行列拖拽排序、拖拽手柄或类似块编辑器的侧边控制。
- 单元格背景色、边框样式、垂直对齐或表格主题配置。
- 标题、列表、引用、代码块、图片或嵌套表格等单元格块内容。
- 表格标题、题注、固定表头或分页控制。
- 通过删除最后一行或最后一列隐式删除整个表格。
- 自定义点击表格下方、方向键或其它退出表格的交互。
- Table Quick Bar 专属快捷键，或为了进入 Quick Bar 改写表格的 `Tab`/`Shift+Tab` 行为。
- 新增通用 Grid focus abstraction，或重构现有 Toolbar、Quick Bar、Menu 和 Palette 焦点基础设施。
- 业务方自定义尺寸上限、默认尺寸、最小列宽或 Table UI。
- 自定义 Table NodeView；使用 Tiptap 提供的表格视图和命令。

## 术语

- **Table Toolbar Control**：顶部工具栏中的表格入口。表格外用于创建，表格内用于打开完整结构操作菜单。
- **Table Size Picker**：以网格形式选择初始行列数的弹出界面。
- **Table Quick Bar**：光标或完整单元格选区位于表格时出现的紧凑上下文操作条。
- **文字选区**：非空 `TextSelection`，选中的是单元格段落中的文字。
- **单元格上下文**：折叠 `TextSelection` 位于 `tableCell` 或 `tableHeader` 内。
- **完整单元格选区**：ProseMirror Tables 的 `CellSelection`，目标是一个或多个完整单元格。
- **首行表头**：初版 UI 管理的行表头状态；当表格第一行覆盖的单元格均为 `tableHeader` 时启用。其它位置可以存在由 Tiptap 原生模型表达的 `tableHeader`，但不属于该状态。
- **逻辑网格位置数**：表格逻辑列数与实际行数的乘积；合并单元格覆盖的每个位置均计入，用于服务端构造 `TableMap` 前的资源上限检查。

## 产品决策

### Preset 范围

| 能力 | `compact` | `all` |
| --- | --- | --- |
| Table schema | 无 | 有 |
| 顶部创建入口 | 无 | 8×8 尺寸选择器 |
| Slash 入口 | 无 | 固定插入 3×3 表格 |
| Table Quick Bar | 无 | 有 |
| 行列与表格结构操作 | 无 | 有 |
| 服务端校验与 HTML 派生 | 不接受 Table JSON | 接受并渲染 Table JSON |

Table 是一个不可拆分的 feature。preset 不会出现只有 Table、TableRow 或 TableCell 其中一部分的状态。

### 顶部工具栏创建

顶部工具栏的“插入”分组新增 Table Toolbar Control，并放在图片入口之前。

Table trigger 使用稳定的 `data-rich-text-toolbar-item="table"`，参与现有顶部工具栏的 roving focus：

- `Alt+F10` 从 editor 进入顶部工具栏后，可通过 `ArrowLeft`/`ArrowRight`、`Home` 和 `End` 到达 Table trigger。
- selection 位于表格内时设置 active 状态；editor disabled 或表格外插入不可执行时设置 disabled。
- trigger 持有焦点时，`Escape` 沿用顶部工具栏契约，将焦点交还 editor 并保留 ProseMirror selection。
- disabled trigger 由统一 roving focus 自动跳过。

selection 位于表格外且为空时，打开 control 显示 8×8 Table Size Picker。该条件包含折叠 `TextSelection` 和 `GapCursor`，不包含 `NodeSelection` 或其它非空 selection：

- 指针经过某个格子时，高亮从左上角到该格子的矩形区域，并显示“`列数 × 行数`”。
- 点击格子后插入对应尺寸的表格。
- 点击、`Enter`、`Space` 或 `ArrowDown` 打开后聚焦 1×1；`ArrowUp` 打开后聚焦 8×8。
- 网格复用现有 Palette 方向键 helper，并由 `TableSizePicker` 在本地维护当前尺寸、高亮矩形和唯一 tab stop。
- 四方向键在网格中移动，`Home`/`End` 移到 1×1/8×8，`Enter`/`Space` 插入当前尺寸。
- `Escape` 关闭并将焦点交还 trigger；`Tab`/`Shift+Tab` 不被消费，并在离开时关闭面板。
- 8×8 只限制创建时可直接选择的尺寸，不限制后续通过结构操作增加行列。

插入命令使用 Tiptap 的块节点插入语义：

- 表格自身是块节点，不额外预插入换行或空段落。
- 光标位于段落中间时，直接调用 Tiptap `insertTable`，由其 `replaceSelectionWith` 与 ProseMirror fitter 正常拆分段落并将表格作为独立块插入；Table feature 不实现自定义 split transaction。
- 表格外存在非空 selection 时禁用创建入口，避免按 Tiptap 默认替换语义用表格覆盖已有内容。
- 表格内不允许嵌套表格，因此 control 改为显示结构操作菜单，而不显示尺寸选择器。
- 新表格无论尺寸都固定传入 `withHeaderRow: true`；`1×1` 或其它单行表格同样使用首行表头，并将 selection 放入第一个表头单元格。

尺寸选择器的最大行列数、Slash 固定尺寸、最小列宽和服务端单表资源上限均使用包内常量表达，不增加 preset option 或公开 props：

| 常量语义 | 初始值 |
| --- | --- |
| 尺寸选择器最大行数 | 8 |
| 尺寸选择器最大列数 | 8 |
| Slash 插入行数 | 3 |
| Slash 插入列数 | 3 |
| 单列最小宽度 | 96px |
| 单表最大逻辑网格位置数 | 10,000 |

### Slash 快捷插入

`all` preset 的“插入”分组增加“表格”命令，顺序为代码块、分割线、表格、图片。

选择 `/表格` 时不再打开尺寸选择器，而是直接插入 3×3 表格：

- 第一行为表头。
- 查询文本删除与表格插入组合在同一个 transaction 中。
- 一次 Undo 同时撤销表格插入并恢复 `/表格` 查询文本。
- enabled 状态由包含查询删除和表格插入的完整 `can()` chain 派生。
- 命令复用 Table feature 的插入 action，只在 Slash adapter 中绑定固定的 3×3 参数。

Slash Suggestion 在 `tableCell` 或 `tableHeader` 内不启动。用户在单元格内输入 `/` 时，它只是普通文字，不出现 Slash 命令面板。

### 表格结构操作

Table Toolbar Control 在当前 selection 完全位于同一张表格时显示完整结构操作菜单：

- 在当前行或所选行之前新增一行。
- 在当前行或所选行之后新增一行。
- 删除当前行或所有选中的行。
- 在当前列或所选列左侧新增一列。
- 在当前列或所选列右侧新增一列。
- 删除当前列或所有选中的列。
- 切换首行表头。
- 删除整张表格。

结构菜单复用现有 Menu focus helper：

- 点击、`Enter`、`Space` 或 `ArrowDown` 打开后优先聚焦 active 项，否则聚焦第一个 enabled 项。
- `ArrowUp` 打开后聚焦最后一个 enabled 项。
- `ArrowUp`/`ArrowDown`、`Home`、`End` 在 enabled menu items 间导航，`Enter`/`Space` 执行。
- `Escape` 关闭并恢复 Table trigger；`Tab`/`Shift+Tab` 关闭菜单但保留浏览器默认导航。

Table Quick Bar 提供同一组能力的紧凑入口：

- “行”菜单：上方新增、下方新增、删除行。
- “列”菜单：左侧新增、右侧新增、删除列。
- 首行表头切换按钮。
- 删除表格按钮。

四个入口分别作为现有 Quick Bar root 管理的 roving items。指针将焦点移入 Quick Bar 后，可以使用 `ArrowLeft`/`ArrowRight`、`Home` 和 `End` 导航；行列子菜单复用与顶部结构菜单相同的 Menu focus helper。子菜单先消费 `Escape` 并恢复自身 trigger，只有外层收到未被子菜单消费的 `Escape` 时才 dismiss Table Quick Bar。

顶部菜单和 Quick Bar 复用完全相同的 actions、label、icon、active 与 disabled 解析，不复制命令逻辑。

删除规则沿用 Tiptap Tables 的命令语义：

- 表格仅剩一行时，Tiptap `deleteRow` 的 `can()` 返回 false，“删除行”禁用。
- 表格仅剩一列时，Tiptap `deleteColumn` 的 `can()` 返回 false，“删除列”禁用。
- 不为上述操作增加自定义 guard 或将其包装为删除表格的 fallback。
- 菜单提供显式“删除表格”操作，并可通过 History 撤销。
- 完整选中整张表格后使用 `Backspace`/`Delete` 的 Tiptap 默认删除行为继续保留；Table feature 不为此新增或覆盖 keymap，它也不属于删除行列的 fallback。

表头与结构操作直接沿用 Tiptap 的单元格类型和命令语义：

- 新建表格仍通过 `withHeaderRow: true` 创建首行表头。
- “首行表头”control 直接使用 Tiptap `toggleHeaderRow`，不引入表格级 header 状态。
- 新增或删除行列时不迁移、提升或规范化 `tableHeader`。例如在现有表头行上方插入普通行后，原有 header cells 可以随文档结构移动到第二行。
- 外部内容已有的首列表头或其它合法 header cells 同样随 Tiptap 结构命令处理；初版不维持“表头必须始终位于第一行或第一列”的额外不变量。

合并、拆分、列宽拖拽、首列表头和单元格级对齐不进入任何菜单。Table JSON 契约保留 Tiptap 原生表格模型；有效外部内容中已有的 `tableHeader` 位置、`colspan`、`rowspan`、`colwidth` 或单元格 `align` 属性可以在校验和渲染时保留，但初版不提供创建或编辑首列表头及其它属性的界面。这些内容不是仅为兼容而保留的遗留数据，后续可以在不迁移已有内容的前提下增加对应编辑能力。

### Selection 与 Quick Bar

Table Quick Bar 的匹配规则为：

- 折叠 `TextSelection` 位于表格单元格内时显示。
- `CellSelection` 选中一个或多个完整单元格时显示。
- 非空 `TextSelection` 即使完全位于单元格内，也不显示 Table Quick Bar，而是进入普通文字 Quick Bar。
- 非空文字 selection 跨出表格或包含非文字原子节点时，继续沿用现有 Quick Bar 的拒绝规则。

更新后的 feature Quick Bar 优先级为：

1. Image NodeSelection。
2. 折叠光标位于连续 Link mark 内。
3. CodeBlock 上下文。
4. Table 单元格上下文或 `CellSelection`。
5. 非空普通文字选区。
6. 不显示。

因此，折叠光标位于单元格内的链接中时仍优先显示 Link Quick Bar；在同一链接中拖选文字后则显示普通文字 Quick Bar。

Table Quick Bar 锚定当前 `.tableWrapper` 的右上方，使它在折叠光标和多单元格选择之间保持稳定。宽表格滚动时以可见 wrapper 为锚点，不依赖表格内容的最右侧边缘。

`CellSelection` 沿用 ProseMirror Tables 的交互方式和 `selectedCell` node decoration。项目只补充与现有主题一致的整格高亮，不重新实现单元格选择模型。

### 键盘导航与退出表格

表格保留 Tiptap Tables 的默认键盘行为：

- `Tab` 移动到下一个单元格。
- `Shift+Tab` 移动到上一个单元格。
- 在最后一个单元格按 `Tab` 时自动增加一行，并进入新行的第一个单元格。
- `Enter` 在当前单元格内创建下一段，不用于退出表格。
- `CellSelection` 覆盖整张表格时，`Backspace`/`Delete` 沿用默认的整表删除行为。

Quick Bar 只接管未被 editor keymap 消费的普通 `Tab`。Table keymap 会消费单元格内的 `Tab`/`Shift+Tab`，因此两者始终优先执行单元格导航，不进入 Table Quick Bar。键盘用户通过统一的 `Alt+F10` 进入顶部工具栏，并使用完整的 Table Toolbar Control；Table Quick Bar 保持为指针就近操作入口，不新增专属快捷键。

项目已经启用 GapCursor。表格位于文档末尾时，用户可以进入表格后的 GapCursor，再按 `Enter` 创建普通段落。因此初版不增加类似 CodeBlock 的“点击块下方自动退出”插件，也不添加额外按钮或键盘覆盖。

## 方案选择

### 采用：单一 Table feature + Tiptap 表格原语

采用一个完整的 `tableFeature`，内部组合 Tiptap 的 Table、TableRow、TableCell 和 TableHeader：

- 能与现有 feature/preset 架构直接对齐。
- schema、commands、CellSelection、TableMap、键盘导航和内置 TableView 均复用成熟实现。
- 行列节点不会被业务方单独启用，避免无效 schema 组合。
- UI、server policy 和测试仍可按现有 feature-first 目录收敛。

### 未采用：拆分为多个 feature

将 Table、TableRow、TableCell 和 TableHeader 拆分为独立 feature 会允许不完整组合，还会让 preset 校验、服务端实现对应关系和 UI 所属边界变得复杂。它们在产品上始终共同出现，因此不拆分。

### 未采用：自定义 Table NodeView

初版不需要 spreadsheet 式选择、拖拽列宽、行列手柄或复杂单元格 UI。自定义 NodeView 会重复 Tiptap 已有的 TableView、colgroup 和 selection 逻辑，并增加编辑器与静态渲染差异，因此不采用。

### 键盘交互采用：复用现有统一焦点基础设施

Table trigger、结构菜单、尺寸 Palette 和 Quick Bar controls 分别接入当前 Toolbar、Menu、Palette 与 Quick Bar 已有的焦点契约。Table 组件只维护行列尺寸、context 和 popup 显隐等 feature-local 状态，不实现第二套 roving focus、菜单导航或快捷键。

未采用另外两种方式：

- Table 自行管理全部键盘行为会重复刚统一的焦点进入、enabled item 过滤、方向键和 `Escape` 恢复逻辑。
- 新增通用 Grid focus abstraction 会为唯一的 8×8 选择器扩大本次范围，并可能牵连现有颜色 Palette；当前 Palette helper 配合 Table picker 的局部唯一 tab stop 已足够。

## 架构

### Feature 目录

新增目录：

```text
packages/rich-text/src/features/table/
├── shared.ts
├── editor.ts
├── server.ts
└── vue/
    ├── index.ts
    ├── TableQuickBar.vue
    ├── TableSizePicker.vue
    └── TableToolbarControl.vue
```

- `shared.ts` 定义 `tableFeature`、固定尺寸与列宽常量，以及编辑器和服务端共用的 Table extension factory。
- `editor.ts` 定义 selection/table context resolver、Table actions、action items 和 `tableEditorFeature`。
- `server.ts` 定义 `tableServerFeature`、Table 几何校验与 HTML policy。
- `vue/TableSizePicker.vue` 只负责尺寸选择、指针和键盘交互。
- `vue/TableToolbarControl.vue` 根据当前 context 在尺寸选择器与完整结构菜单之间切换。
- `vue/TableQuickBar.vue` 渲染紧凑结构 controls。
- `vue/index.ts` 组合 toolbar control、feature Quick Bar 和 Slash command。

不新增跨 feature 的 Table 专用基础设施。通用 Toolbar、Quick Bar 和 Slash Menu 继续只读取 preset 配置。

### Schema 与 extensions

Table feature 直接使用 `@tiptap/extension-table` 提供的四个节点 extension，并做以下固定配置：

- Table：`resizable: false`。
- Table：`renderWrapper: true`，使编辑器与静态 HTML 都具有 `.tableWrapper`。
- Table：`cellMinWidth: 96`。
- TableCell：将 `content` 从默认的 `block+` 收紧为 `paragraph+`。
- TableHeader：将 `content` 从默认的 `block+` 收紧为 `paragraph+`。
- TableCell 与 TableHeader：保留原生 `align` 属性，但只接受 `null`、`left`、`center` 或 `right`。
- TableCell 与 TableHeader：`colspan`、`rowspan` 只接受正整数；`colwidth` 只接受 `null` 或数字数组，不根据 `96px` 最小渲染宽度增加值域、数组长度或规范形式限制。
- TableRow：沿用上游结构约束。

同一个 factory 每次创建新的 extension instances，供 editor feature 与 server feature 使用，避免复用有内部状态的 extension instance，同时保证两端 node spec 完全一致。

单元格中的段落继续使用 `all` preset 已启用的 marks 和 paragraph attributes，因此可以使用加粗、斜体、下划线、删除线、行内代码、高亮、链接、TextStyle、文字对齐和 HardBreak。

Heading、List、Blockquote、CodeBlock、Image、HorizontalRule 和 Table 都不符合 `paragraph+`，不能成为单元格子节点：

- 编辑器粘贴和命令插入由 ProseMirror schema 约束，不增加自定义兜底转换。
- 服务端使用相同 schema 构造文档并执行 `document.check()`。
- Table schema 不收窄为当前 UI 只能创建的简单矩形子集；合法的 `colspan`、`rowspan`、`colwidth` 和单元格 `align` 继续使用 Tiptap 原生属性表达。
- Table schema 允许 Tiptap 原生模型支持的任意合法 `tableHeader` 位置；初版首行表头 control 不构成 schema 约束。
- Table server feature 在构造 `TableMap` 前以不展开跨度的预检查计算表格可能占用的逻辑网格位置；超过 10,000 时直接拒绝，避免极大 `colspan` 等小体积输入触发巨量内存分配。
- 10,000 上限只存在于服务端边界；编辑器不预检查该上限，也不改变 Tiptap 的行列命令或键盘行为。极端情况下由编辑器生成的超限内容会在预览或保存时被拒绝。
- `document.check()` 之后，Table server feature 通过服务端 feature 文档校验 hook 遍历 Table 节点并使用 `TableMap` 检查表格几何结构；缺失单元格、单元格碰撞、越出表格的 `rowspan`、不一致的列宽映射和零尺寸表格均视为非法内容，不交给编辑器隐式修复。
- 外部 JSON 含有非法单元格结构时抛出现有 `RichTextContentInvalidError`，不静默删除或改写节点。
- `richTextDocumentEnvelopeSchema` 保持宽松 envelope；实际内容约束仍由 preset 对应的 ProseMirror schema 承担。

单元格级 `align` 与段落级 `textAlign` 是两个不同层级：

- `tableCell` 或 `tableHeader` 的 `align` 作为单元格默认对齐，由后代段落继承。
- 现有 TextAlign control 仍只修改段落的 `textAlign`。
- 段落存在显式 `textAlign` 时覆盖继承自单元格的对齐。
- 初版不提供设置或清除单元格 `align` 的 UI。

首行表头 control 的 active 状态只取决于第一行覆盖的单元格是否全部为 `tableHeader`。切换操作只增加或移除第一行的行表头语义，不清理其它行列中已有的 `tableHeader`。

### Actions

Table feature 定义以下 actions：

- `insertTableAction(rows, columns)`。
- `addRowBeforeAction`。
- `addRowAfterAction`。
- `deleteRowAction`。
- `addColumnBeforeAction`。
- `addColumnAfterAction`。
- `deleteColumnAction`。
- `toggleHeaderRowAction`。
- `deleteTableAction`。

所有 actions：

- 使用现有 `RichTextAction` 和 Tiptap `Command` factory。
- 只通过传入的 `CommandProps` 操作 transaction，不自行 dispatch。
- 由 `runRichTextAction` 执行，由 `canRunRichTextAction` 派生 enabled 状态。
- 成功后聚焦 editor；菜单组件只负责关闭自身，不负责修正文档结构。
- 复用 Tiptap table commands，不为最后一行或最后一列增加额外删除分支。
- 行列插入与删除 action 直接保留 Tiptap transaction 结果，不增加 header 迁移、提升、拆分或其它后处理。

尺寸选择器与 Slash command 都复用 `insertTableAction`。顶部传入用户选定的 1 至 8 行列数，Slash adapter 固定传入 3 行 3 列。

`insertTableAction` 自身负责拒绝表格内的嵌套插入和表格外的非空 selection；该约束不是仅由 Toolbar component 设置 disabled。Toolbar 直接用同一 action 的 `can()` 决定能否打开尺寸选择器；Slash adapter 删除查询 range 后形成折叠 selection，再在同一个 chain 中执行该 action。

除上述 guard 和固定传入 `withHeaderRow: true` 外，`insertTableAction` 直接复用 Tiptap `insertTable`，不自行拆分段落、插入占位段落或修正上游 selection 结果。

### Table context resolver

`editor.ts` 提供唯一的 Table context resolver，供 Toolbar 和 Quick Bar 共享：

- 从 selection 深度向上查找 `tableCell` 或 `tableHeader`，再定位所属 `table`。
- `CellSelection` 从 `$anchorCell` 和 `$headCell` 解析目标表格，并拒绝跨表格状态。
- 非空 `TextSelection` 可以解析为 toolbar 的结构上下文，但明确不匹配 Table Quick Bar。
- 返回 table position、node、wrapper DOM 查询所需信息以及 selection 类型，不缓存 DOM 或旧 transaction position。

Toolbar 在表格内即使用结构上下文；Quick Bar 在此基础上再应用“排除非空文字选区”的产品规则。

### Vue preset 接入

`createAllRichTextEditorPreset` 增加：

- `allEditorFeatures` 中的 `tableEditorFeature`。
- 顶部“插入”分组中的 `tableToolbarControl`。
- `featureBars` 中位于 CodeBlock 之后、普通文字兜底之前的 `tableQuickBar`。
- Slash “插入”分组中的固定尺寸 Table command。

`compactRichTextEditorPreset` 不引用任何 Table shared/editor/server/Vue implementation。

Table Toolbar Control 是一个 component control：

- 表格外根据 `insertTableAction` 的 `can()` 状态决定是否可打开尺寸选择器。
- 表格内打开结构菜单，并逐项读取对应 action 的 active/disabled 状态。
- 非空 selection 位于表格外时 disabled。
- action 成功后关闭当前 popover/dropdown；失败时保持当前界面，不修改内容。
- trigger 暴露稳定的 Table toolbar item key、active/disabled 和 popup ARIA 状态，由 `RichTextToolbar` 统一管理 roving focus 与 `Alt+F10`。

Table Quick Bar 使用现有 `RichTextFeatureQuickBar` 契约，并通过 `getAnchorElement` 返回当前 `.tableWrapper`。它不创建第二个 BubbleMenu plugin，也不创建自己的 roving focus root。

### 统一焦点基础设施接入

Table Vue components 只复用现有焦点基础设施：

- Table Toolbar trigger 和 Table Quick Bar controls 使用 `data-rich-text-toolbar-item`，分别由已有 `RichTextToolbar` 与 `RichTextQuickBar` root 管理 roving focus、焦点记忆和外层 `Escape`。
- Table Size Picker 的格子使用现有 Palette item 契约，并调用 `focusRichTextPaletteItem` 与 `handleRichTextPaletteKeydown`；唯一 tab stop 和尺寸高亮仍是 Table picker 的局部状态。
- 顶部结构菜单及 Quick Bar 的行列子菜单调用 `focusRichTextMenuItem` 与 `handleRichTextMenuKeydown`。
- popup 使用 `to=false` 保持在对应组件树内，使焦点仍属于 RichTextEditor 组合控件。
- action 成功后由 action 聚焦 editor；popup 只关闭自身。`Escape` 关闭局部 popup 时恢复 trigger，不提前覆盖外层焦点语义。

本设计不修改 `vue/interactions/focus/`、顶部 Toolbar shortcut 或 Quick Bar Tab handler。Table 只接入这些既有契约。

### Slash Menu 接入

现有 Slash Suggestion plugin 增加 Table context 排除条件。该条件只影响 Suggestion 是否启动，不改变普通 `/` 输入。

Table feature 提供固定尺寸 Slash command adapter：

```text
deleteRange(/query)
→ insertTableAction(3, 3)
→ one transaction
→ update:modelValue
```

它继续遵循现有 Slash command 的过滤、disabled、active option、IME、`Escape`、`Tab` 和执行失败契约。命令 label 为“表格”，key 为 `table`，额外关键词包含 `table`。

### 服务端与 HTML policy

`allRichTextPreset` 增加 `tableFeature`，`createAllRichTextServerPreset` 增加 `tableServerFeature`。服务端使用与编辑器相同的 Table extension factory。

内部 `RichTextServerFeature` 增加可选的文档校验 hook：

```ts
interface RichTextServerFeature {
  readonly feature: RichTextFeature
  readonly htmlPolicy: RichTextHtmlPolicy
  readonly extensions?: () => readonly AnyExtension[]
  readonly validateDocument?: (document: ProseMirrorNode) => void
}
```

`deriveRichTextContent` 在 schema 构造与 `document.check()` 成功后，按 preset 的 feature 顺序调用各 server feature 的 `validateDocument`：

- Table server feature 使用该 hook 先执行逻辑网格资源上限预检查，再执行 `TableMap` 几何完整性校验。
- hook 只做校验，不规范化或修改文档。
- hook 抛出的错误与 schema 构造、`document.check()` 错误一起转换为现有 `RichTextContentInvalidError`。
- 该类型与定义 helper 保持包内使用，不从 `@rev30/rich-text/server` 公共入口导出。
- 初版只有 Table 使用该 hook；通用派生逻辑不识别或硬编码 Table 节点。

Table HTML policy 增加以下标签：

- `div`
- `table`
- `colgroup`
- `col`
- `tbody`
- `tr`
- `th`
- `td`

policy 只接受静态 renderer 产生的表格结构：

- wrapper transform 将 `div` 规范化为精确的 `class="tableWrapper"`，注入 `overflow-x: auto`，并设置固定的 `tabindex="0"`、`role="region"` 与“可横向滚动的表格”可访问名称。
- `table` 只允许 renderer 产生的 `width` 或 `min-width` 像素样式。
- `col` 只允许 `width` 或 `min-width` 像素样式。
- `td` 和 `th` 只保留合法正整数的 `colspan`、`rowspan`，renderer 产生的 `colwidth` 数字列表，以及值为 `left`、`center` 或 `right` 的 `text-align` 样式；不额外允许 renderer 不会产生的 `data-colwidth`。
- 不允许事件属性、任意 class、其它 style 或其它表格属性。

服务端始终先用 schema 从 JSON 构造并执行 `document.check()`，再执行逻辑网格资源预检查与 `TableMap` 几何完整性检查，最后执行静态渲染和 sanitize。HTML policy 不用于接受任意外部 HTML。

表格纯文本派生继续使用现有 `getText` 与 schema serializers，并接受 Tiptap 对 table、row、cell 和 paragraph 块节点应用默认 block separator 后的结果；初版不承诺紧凑的行列分隔格式，也不增加 Markdown、TSV 或自定义表格文本 serializer。

### 样式与响应式

表格使用以下布局约束：

- 每列初始最小宽度为 96px。
- 未持久化完整列宽的表格在内容较少时占满可用宽度；完整 `colwidth` 继续沿用 Tiptap renderer 的固定宽度结果。
- 总最小宽度超过容器时，`.tableWrapper` 横向滚动，外层编辑器不横向溢出。
- 不压缩列宽到 96px 以下。
- 不提供拖拽 resize handle。

`96px` 是 editor 与静态 HTML 的有效渲染下限，不是 persisted `colwidth` 的数据下限。外部合法 JSON 中较小的数字宽度保持原值，Tiptap 渲染时应用 `cellMinWidth`；服务端不因其低于 96 而拒绝或改写 canonical JSON。

编辑器内由 `RichTextEditor.vue` 的 scoped styles 设置 wrapper、table、cell 和 selection 样式；服务端 HTML wrapper 使用经过 sanitize 的内联 `overflow-x:auto` 保证独立渲染时仍可滚动。表格的文字排版继续沿用现有 `prose`/`dark:prose-invert`。

完整单元格 selection 使用 `.selectedCell::after` 覆盖层：

- 使用现有 `--rich-text-theme-selection-color`。
- 不遮挡文字，不接收 pointer event。
- 与普通 `::selection` 保持视觉一致，但能清楚表达整格选择。

## 数据流

### 顶部创建

```text
Table Toolbar Control
→ Table Size Picker
→ rows/columns
→ insertTableAction
→ Tiptap transaction
→ update:modelValue
```

### Slash 创建

```text
/表格 query
→ Table Slash adapter
→ deleteRange + insertTableAction(3, 3)
→ single Tiptap transaction
→ update:modelValue
```

### 结构操作

```text
Editor selection
→ Table context resolver
→ Toolbar menu or Table Quick Bar
→ shared Table action
→ Tiptap transaction
→ update:modelValue
```

### 键盘进入 Table control

```text
Alt+F10
→ RichTextToolbar roving focus
→ Table trigger
→ Table Size Picker 或结构菜单
→ Table action
→ Tiptap transaction
→ editor focus
```

### 表格内 Tab

```text
Tab / Shift+Tab
→ Tiptap Table keymap
→ 移动单元格或新增末行
```

该路径在 editor keymap 中已经被消费，不进入 Quick Bar Tab handler。

### 服务端派生

```text
contentJson
→ all server preset schema
→ ProseMirror document.check()
→ Table logical-grid resource limit
→ TableMap geometry validation
→ canonical JSON / text / static HTML
→ Table HTML policy + sanitize
```

## 错误处理

- Table Size Picker 只生成 1 至 8 的行列参数，不接受自由输入。
- Slash 使用内部固定的 3×3 参数。
- 所有结构 controls 通过相同 action 的 `can()` 结果派生 disabled 状态。
- disabled Toolbar、Quick Bar、Menu 和 Palette items 由现有焦点 helper 跳过。
- action 返回 false 时不关闭界面、不修改文档，也不增加 fallback transaction。
- action 成功后关闭当前 popup，并由 action 将焦点交还 editor。
- 传入服务端的 Table JSON 超过单表 10,000 个逻辑网格位置时拒绝，不尝试截断、拆表或自动修复；编辑器不为该资源边界增加 action guard 或键盘分支。
- schema 非法、超过逻辑网格资源上限或未通过 `TableMap` 几何完整性检查的 Table JSON，在服务端边界抛出 `RichTextContentInvalidError`。
- sanitize 只保留 Table renderer 所需的精确标签、属性和样式。
- Table UI 不发起网络请求，不增加通用 `try/catch`。

## 可访问性

- Table Toolbar Control 使用“表格”作为可访问名称，并暴露 active/disabled 状态。
- editor 通过 `aria-keyshortcuts="Alt+F10"` 暴露顶部工具栏入口；Table trigger 参与同一 roving focus，不新增快捷键。
- Table Size Picker 使用 `role="grid"`，行使用 `role="row"`，可选格子具有 `gridcell` 语义和如“3 列 2 行”的 `aria-label`。
- 网格使用唯一 tab stop；复用现有 Palette 方向键语义，`Enter`/`Space` 插入，`Escape` 关闭并恢复 trigger，`Tab`/`Shift+Tab` 正常离开。
- 指针 hover 的矩形高亮与键盘 active cell 使用同一状态，不只依靠颜色传达尺寸，旁边同步显示文字尺寸。
- Table Quick Bar 使用现有 `role="toolbar"`、roving tabindex 和局部菜单语义。
- Table keymap 消费单元格内的 `Tab`/`Shift+Tab` 后不进入 Table Quick Bar；完整结构能力仍可通过 `Alt+F10` 到达顶部 Table control。
- 行、列菜单项使用完整动词标签；disabled 项仍可被辅助技术识别，但不能执行。
- 删除表格不弹出确认对话框，依赖本地 History Undo，避免在高频编辑流程中增加模态步骤。
- 输出使用原生 `table`、`th` 和 `td` 语义，不用 `div` 模拟表格结构。
- 服务端输出的横向滚动 wrapper 可获得键盘焦点，并以“可横向滚动的表格”向辅助技术说明用途。
- 粗指针环境继续隐藏所有 Quick Bar；完整操作仍可从顶部工具栏完成。

## Public API 与跨端边界

- `RichTextEditor` props 和 emits 不变。
- `AllRichTextEditorPresetOptions` 与 `AllRichTextServerPresetOptions` 不增加 Table 配置。
- 应用层继续只需选择 `createAllRichTextEditorPreset` 与 `createAllRichTextServerPreset`。
- Table actions、尺寸常量、Quick Bar 和 Toolbar components 保持包内部使用。
- `compact` preset 的 schema、工具栏、Quick Bar、Slash 和服务端行为不变。
- 现有合法 `all` 内容继续有效；schema 只新增可接受节点，不需要数据迁移。
- `apps/server` API、`packages/contracts` 和数据库 schema 不变。

## 测试

### Feature、preset 与 schema

- 验证 `tableFeature` 同时声明 editor/server implementation。
- 验证 `all` shared/editor/server preset 包含 Table，`compact` 完全不包含。
- 验证新建 `1×1`、单行及多行表格的第一行均为 `tableHeader`，多行表格的其余行为 `tableCell`。
- 验证单元格接受一个或多个 paragraph 及其 marks、HardBreak 和 paragraph attributes。
- 验证单元格中的 Heading、List、CodeBlock、Image、HorizontalRule 和嵌套 Table JSON 被服务端拒绝。
- 验证合法 `tableHeader` 位置、正整数 `colspan`/`rowspan`、数字数组 `colwidth` 和单元格 `align` 能通过校验并保留；非法属性类型、非法 `align`、缺格、碰撞、越界 `rowspan`、列宽映射不一致和零尺寸表格被服务端拒绝。
- 验证 editor 与 server 使用相同 Table node schema；服务端在 schema 检查之后额外拒绝非法表格几何结构。

### Actions 与编辑行为

- 验证插入 1×1、3×3 和 8×8 表格，尺寸及首行表头正确。
- 验证折叠光标位于段落中间时插入独立块，并保留表格前后的文字。
- 验证表格外非空 selection 和表格内嵌套插入不可执行，折叠 `TextSelection` 与表格外 `GapCursor` 可以插入。
- 验证上下新增行、左右新增列、删除所选行列、切换首行表头和删除表格。
- 验证首行表头 active/toggle 不清理其它位置已有的合法 `tableHeader`。
- 验证仅剩一行或一列时对应删除 action 返回 false，删除表格 action 仍可执行。
- 验证结构操作和显式删除表格可通过 History 单步撤销。
- 验证 `Tab`、`Shift+Tab` 的单元格导航，以及最后一个单元格 `Tab` 自动新增一行。
- 验证完整选择整张表格后，默认 `Backspace`/`Delete` 可以删除表格。
- 验证表格末尾可以进入 GapCursor，并通过 `Enter` 创建后继段落，不依赖 Table feature 自定义 plugin。

### Toolbar、Quick Bar 与 Slash

- 验证尺寸选择器 hover 矩形、尺寸标签、1×1 至 8×8 点击插入。
- 验证 Table trigger 参与顶部 Toolbar 的稳定 item key、active/disabled、roving focus 和 `Alt+F10` 入口。
- 验证 `ArrowDown`/`ArrowUp` 打开尺寸选择器后分别聚焦 1×1/8×8。
- 验证尺寸选择器唯一 tab stop、四方向键、`Home`/`End`、`Enter`/`Space`、`Escape` 和未被消费的 `Tab`/`Shift+Tab`。
- 验证 Table Toolbar Control 在表格外显示尺寸选择器，在表格内显示完整结构菜单。
- 验证结构菜单与行列子菜单的焦点进入、enabled item 导航、`Escape` 恢复 trigger 和 `Tab` 关闭行为。
- 验证 Toolbar 与 Table Quick Bar 使用同一 actions 和 disabled 状态。
- 验证 Table Quick Bar 的四个 controls 能被外层 roving focus 发现，子菜单 `Escape` 不会提前 dismiss 外层 Quick Bar。
- 验证折叠单元格光标和 `CellSelection` 显示 Table Quick Bar，非空单元格文字 selection 显示普通文字 Quick Bar。
- 验证 Link、Table 与普通文字 Quick Bar 的优先级，以及任意时刻只显示一种模式。
- 验证 Table Quick Bar 锚定 `.tableWrapper`，表格 context 失效、editor disabled 或粗指针环境时隐藏。
- 验证单元格内 `Tab`/`Shift+Tab` 由 Table keymap 消费且不进入 Table Quick Bar，同时 `Alt+F10` 仍可进入顶部工具栏。
- 验证 `/表格` 直接创建 3×3 首行表头表格，查询删除与插入只有一个 transaction，并可一次 Undo。
- 验证 Table Slash command 的 enabled 状态来自完整模拟 chain。
- 验证 Slash Suggestion 在普通段落启动，在 `tableCell` 和 `tableHeader` 内不启动。

### 服务端与渲染

- 验证 `deriveRichTextContent` 在 `document.check()` 后按 feature 顺序执行文档校验 hook，并将 hook 错误映射为 `RichTextContentInvalidError`。
- 验证合法 Table JSON 能派生规范化 JSON、Tiptap 默认块分隔形式的纯文本和语义化 HTML。
- 验证静态 HTML 包含 `.tableWrapper`、`table`、`colgroup`、`tbody`、`th` 和 `td`。
- 验证 wrapper 的横向滚动样式、固定键盘访问属性与 table/col 的合法像素宽度被保留。
- 验证任意 wrapper class、事件属性、非法 style 和非法 span/colwidth 属性被清理或规范化。
- 验证合法 `colspan`、`rowspan`、列宽属性和单元格 `align` 可以跨 JSON 与 HTML 保留，但没有对应编辑 UI。
- 验证低于 96 的合法 persisted `colwidth` 不被拒绝或改写，渲染后的有效列宽仍不低于 96px。
- 验证段落级 `textAlign` 覆盖继承自单元格 `align` 的对齐。
- 验证服务端在调用 `TableMap` 前拒绝超过 10,000 个逻辑网格位置的表格，并将错误映射为 `RichTextContentInvalidError`。
- 验证 8 列表格在窄容器中由 wrapper 横向滚动，不扩大编辑器外层宽度。
- 验证普通表格、表头、单元格 selection 和暗色模式的编辑器视觉状态。

### 回归与验证

- 现有普通文字、Link、Image 和 CodeBlock Quick Bar 行为无回归。
- 既有 Toolbar roving focus、`Alt+F10`、Menu/Palette helper 和 Quick Bar Tab handler 继续由其现有测试覆盖；Table tests 只验证 feature 接入，不复制通用 helper 的内部测试。
- 现有 Slash 命令顺序除新增 Table 项外保持不变。
- `compact` editor/server/schema 测试继续通过。
- 定向运行 `@rev30/rich-text` 测试与 typecheck。
- 对尺寸选择器、结构菜单、selection 和横向滚动做浏览器交互检查。
- 最终运行完整 `pnpm check`。

## 验收标准

- `all` 用户可从顶部工具栏选择 1×1 至 8×8 的初始表格尺寸。
- `/表格` 可直接插入 3×3 表格，并可一次 Undo 恢复查询文本。
- 新表格首行为表头，光标进入第一个表头单元格。
- 用户可通过顶部菜单和 Table Quick Bar 完成基础行列与表格操作。
- 仅剩一行或一列时删除操作禁用，删除行列不会隐式转为删除表格。
- 服务端不会对超过 10,000 个逻辑网格位置的表格构造 `TableMap`；该资源上限不改变编辑器的 Tiptap 默认结构命令与键盘行为。
- 用户可以通过显式 control 或完整选中后的默认删除键行为删除整张表格。
- 单元格内非空文字选区使用普通文字 Quick Bar；折叠光标和 `CellSelection` 使用 Table Quick Bar。
- 单元格不能包含段落之外的块节点，但保留现有行内格式能力。
- 宽表格保持 96px 最小列宽，并在 wrapper 内横向滚动。
- 用户可通过默认 Tab 导航和 GapCursor 退出表格，不依赖额外 Table 交互。
- 单元格内的 `Tab`/`Shift+Tab` 不进入 Table Quick Bar，键盘用户可通过 `Alt+F10` 到达完整的顶部 Table control。
- 编辑器和服务端使用相同 schema，服务端输出安全且语义化的 Table HTML。
- 服务端额外拒绝 `document.check()` 无法识别的非法表格几何结构，不静默修复外部 Table JSON。
- `compact` preset、公开 Vue API、服务端接口、contracts 和数据库均不受影响。

## 预期改动范围

主要改动位于：

- 新增 `packages/rich-text/src/features/table/`。
- `packages/rich-text/src/server/feature.ts` 与 `packages/rich-text/src/server/derive.ts`，增加包内文档校验 hook。
- `packages/rich-text/src/presets/all.ts`。
- `packages/rich-text/src/server/presets/all.ts`。
- `packages/rich-text/src/vue/presets/all.ts`。
- `packages/rich-text/src/vue/RichTextEditor.vue` 的 Table 与 `CellSelection` 样式。
- 现有 Slash Suggestion 的 Table context 排除逻辑。
- `packages/rich-text/package.json` 与 workspace lockfile，新增版本一致的 `@tiptap/extension-table`。
- `packages/rich-text/__tests__/features/table/` 及相关 preset、Quick Bar、Slash、server 测试。
- 富文本演示页相关渲染与交互回归测试。
- 如 README 的富文本能力概览不再准确，随实现同步更新对应说明。

本设计不要求修改：

- `packages/rich-text/src/presets/compact.ts` 的 feature 集合。
- `packages/rich-text/src/server/presets/compact.ts`。
- `packages/rich-text/src/vue/presets/compact.ts`。
- `packages/rich-text/src/vue/interactions/focus/`。
- 通用 Toolbar shortcut、roving focus 或 Quick Bar Tab handler。
- `apps/server` API。
- `packages/contracts`。
- 数据库 schema 或现有富文本数据。
