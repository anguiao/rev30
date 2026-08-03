---
status: approved
date: 2026-08-02
---

# 富文本元素路径设计

## 背景

`@rev30/rich-text` 已具备顶部工具栏、Quick Bar、Slash Menu，以及可按 `start`、`end` 分区的底部状态栏。`all` preset 当前只在状态栏右侧显示字符数，左侧尚未提供与当前编辑位置相关的结构信息。

表格基础能力已经稳定接入 `all` preset，编辑器模型可以表达段落、标题、列表、引用、代码块、图片、表格及行内 mark。现在适合在状态栏左侧增加 element path，让用户了解选区开头所在的结构，并可以从路径直接选择相应内容。

本设计中的 element path 是 ProseMirror 文档模型的导航，不是编辑器 DOM 的检查器。它使用类似 HTML 的标签作为显示语言，但不会遍历渲染 DOM，也不会暴露 Tiptap NodeView、表格 wrapper 或浏览器补充的结构。

## 目标

- 在 `all` preset 状态栏左侧显示当前元素路径，字符数继续固定在右侧。
- 使用 `selection.from` 作为统一解析起点，使正向、反向和跨节点选区得到一致结果；仅 `AllSelection` 从文档起点向内找到首个实际内容。
- 同时显示块级节点、表格节点和当前文字上的行内 mark。
- 使用类似 `table > tr > td > p > strong > a` 的 HTML 标签形式展示路径。
- editor 可编辑时，所有可见路径项均可操作，并使用与用户直接操作一致的 ProseMirror selection 类型选择对应内容。
- 标签从当前 ProseMirror schema 的序列化定义派生，不维护节点或 mark 名称映射表；节点与 mark 属性只参与模型身份和选择计算，不向 UI 暴露属性值。
- 复用已有选区高亮、图片选中轮廓和表格单元格高亮，不增加 element path 专属选中样式。
- 复用现有 roving focus 交互，使可编辑状态下的整条路径只占一个 Tab stop。
- 保持 element path 为 editor-only feature，不改变服务端 schema、HTML 输出或公开配置 API。

## 非目标

本阶段不实现：

- 在 `compact` preset 中启用 element path。
- 根据完整选区计算共同祖先、覆盖节点集合或多条路径。
- 通过路径编辑标签、属性、链接地址或节点类型。
- DOM inspector、NodeView inspector 或浏览器元素检查能力。
- 显示 `doc`、文本节点、`tbody`、`colgroup`、`.tableWrapper` 等模型外或无须交互的层级。
- 自定义路径标签、过滤器、顺序、状态栏位置或业务方提供的渲染 slot。
- 新增公开 props、preset options 或 element path 配置 DSL。
- 新增 ProseMirror plugin、transaction 级路径缓存或持久化路径状态。
- 改写图片拖放、普通文字拖选、表格选区或其它既有 selection 交互。
- 为 element path 创建专属 editor selection 类型、Decoration 或 CSS 反馈。
- 通过路径移动、删除、复制或重排节点。

## 术语

- **元素路径**：由当前 selection 的文档顺序开头解析出的节点与 mark 序列。
- **路径项**：元素路径中一个可聚焦、可激活的标签按钮。
- **节点路径项**：对应 ProseMirror node 的路径项，例如 `blockquote`、`p`、`img`。
- **Mark 路径项**：对应当前文字 mark 的路径项，例如 `strong`、`em`、`a`。
- **语义标签**：从 schema 序列化定义中得到的 HTML-like 标签，仅作为 UI 表达，不作为模型身份。
- **内容选择**：使用 `TextSelection` 选择节点内首尾可用文字位置之间的内容。
- **原子选择**：使用 `NodeSelection` 选择图片等无法用文字范围表达的节点。
- **表格选择**：使用 ProseMirror Tables 的 `CellSelection` 选择单元格、整行或整张表格。

## 产品决策

### Preset 与状态栏位置

element path 只进入 `all` preset：

| 能力 | `compact` | `all` |
| --- | --- | --- |
| Element path feature | 无 | 有 |
| 状态栏左侧元素路径 | 无 | 有 |
| 状态栏右侧字符数 | 无 | 保持现状 |

`allRichTextStatusBar` 调整为：

- `start` 包含 element path。
- `end` 继续包含 character count。

状态栏现有布局保持 `start` 弹性占据剩余空间、`end` 固定可见。element path 自身设置 `min-width: 0` 并承接横向溢出；路径过长时允许在左侧区域横向滚动，不挤压或遮挡右侧字符数。路径更新后，如果 DOM 焦点位于 element path 内则保证当前聚焦项可见，否则保证最内层、也就是最接近当前内容的路径项可见。可见性调整只改变 element path 自身的横向滚动位置，不滚动页面、编辑器内容滚动区或其它上层容器。

当没有可显示路径时，左侧不渲染占位文案，右侧字符数位置不变。

### 路径解析位置

所有 selection 统一以 `selection.from` 为解析起点：

- 非空正向文字选区使用其文档顺序开头。
- 非空反向文字选区仍使用同一个文档顺序开头，不使用 `anchor` 或 `head`。
- 跨段落、跨节点和跨表格内容的选区不计算共同祖先，也不识别覆盖范围。
- `AllSelection` 的 `selection.from` 位于文档内容之前，因此从文档顺序中的第一个实际选中内容向内解析完整路径，不显示根 `doc`；文档没有可解析子节点时路径为空。
- 折叠 `TextSelection` 使用光标所在内容。
- 其它 `TextSelection` 只解析 `$from` 当前所在的模型上下文，不为了寻找下一段可见文字而向后扫描；当 `$from` 正好位于 textblock 末尾时，路径保留该 textblock 且不加入下一段的 mark。
- `NodeSelection` 使用被选中的 node；不能只解析其前方的 `$from`。
- `CellSelection` 使用选区中按文档顺序排列的第一个单元格，并在该 `td` 或 `th` 终止路径；由于 cell selection 不表示单元格内的文字位置，不继续加入其内部段落或 mark。
- `GapCursor` 位于两个节点之间，不代表任何具体元素；除可解析的模型祖先外不补选相邻节点，因此顶层 GapCursor 的路径为空。

非空选区即使覆盖图片或其它原子节点，也只根据选区开头计算路径。例如，从图片前的代码块拖选到图片之后时，路径仍表示代码块开头，而不会因为范围经过图片而加入 `img`。

### 节点与 mark 组成

路径按从外到内排列：

1. `selection.from` 所在位置的模型祖先节点。
2. 直接承载当前内容的节点。
3. 当前文字上的 mark，按 schema 决定的序列化嵌套顺序排列。

以下内容不进入路径：

- 根 `doc`。
- 文本节点本身。
- schema 中 `selectable: false` 的行内叶子节点，例如序列化为 `br` 的 HardBreak；普通文字 selection 的位置位于这类节点相邻处，不把它们解释为可激活元素。
- 没有独立模型节点的 DOM wrapper。
- 表格渲染产生的 `.tableWrapper`、`tbody`、`colgroup`。

示例：

| 当前上下文 | 路径 |
| --- | --- |
| 二级标题普通文字 | `h2` |
| 引用中的加粗链接文字 | `blockquote > p > strong > a` |
| 列表项中的斜体文字 | `ul > li > p > em` |
| 普通表格单元格中的段落 | `table > tr > td > p` |
| 表头单元格中的段落 | `table > tr > th > p` |
| 包含一个或多个单元格的 CellSelection | 到文档顺序中的首个被选单元格为止，例如 `table > tr > td` |
| HardBreak 相邻位置 | 只显示外层 textblock 与实际文字 mark，不显示 `br` |
| 图片 NodeSelection | `img`，或包含该图片的模型祖先路径后接 `img` |
| 顶层 GapCursor | 空路径 |

代码块只显示 schema 中代码块 node 序列化得到的 `pre`，不会为了匹配其渲染 DOM 再制造一个独立的 `code` 路径项。

### Mark 边界

路径只反映实际文档内容上的 mark，不显示仅供后续输入使用的 `storedMarks`。

- 除 `AllSelection` 外，非空 `TextSelection` 只读取 `selection.from` 处直接可得的文字内容；该位置没有文字节点时不向后扫描，也不加入后续内容的 mark。
- 折叠光标沿用 ProseMirror resolved position 的 mark 边界语义。
- 相邻且类型和 attrs 相同的 mark 视为同一个连续范围。
- 相邻但 attrs 不同的 mark 保持独立，例如两个不同 `href` 的链接不会合并。
- mark 内嵌其它 mark 时，外层 mark 的连续范围不会被内层 mark 打断。

例如文档内容为 `<strong>甲<em>乙</em>丙</strong>`，光标位于“乙”时显示 `p > strong > em`。激活 `em` 选择“乙”，激活 `strong` 选择“甲乙丙”。

相邻内容为 `<a href="/a">甲</a><a href="/b">乙</a>` 时，选区从“乙”开始只解析和选择第二个 `a`；不会因为标签相同而跨越不同 attrs 合并范围。

### 标签派生与属性边界

路径使用 HTML-like 标签，但标签来源是 ProseMirror schema，而不是手写映射或编辑器 DOM：

- node 调用对应 `NodeSpec.toDOM(node)` 的序列化定义。
- mark 调用对应 `MarkSpec.toDOM(mark)` 的序列化定义。
- 从返回的 `DOMOutputSpec` 只提取语义根标签。
- Heading 根据实际 attrs 自然得到 `h1`、`h2` 或 `h3`。
- TextStyle 根据 schema 序列化结果显示 `span`。
- Link 显示 `a`。
- TableCell 与 TableHeader 分别显示 `td` 与 `th`。

表格开启 `renderWrapper` 后，序列化结果包含视图 wrapper。表格节点通过 Tiptap Tables 已提供的 `tableRole` 和 schema `parseDOM` 语义识别 `table`、`tr`、`td`、`th`，忽略 wrapper；这是一条由 schema 元数据派生的通用表格规则，不建立 feature key 到标签的映射表。

路径按钮及其辅助描述只使用标签，不暴露属性值：

- Link 始终显示 `a`，URL 不进入按钮正文、tooltip 或辅助技术名称。
- Image 始终显示 `img`，`src`、`alt`、尺寸等属性不进入按钮正文、tooltip 或辅助技术名称。
- 其它节点和 mark 的 attrs 同样不进入任何 UI 描述。

节点与 mark 的实际 attrs 仍用于标识路径项、区分 mark 连续范围和建立 selection。路径按钮的 accessible name 仅由选择动作和标签组成，例如“选择 `a` 元素”。无法从当前 schema 序列化定义得到语义标签的 node 或 mark 不显示；不使用 feature key、node type name 或人工名称作为 fallback。

### 路径项激活与 selection

激活路径项的目标是复用用户直接操作时已有的 selection 类型和视觉反馈，而不是统一建立 `NodeSelection`。

| 路径项类型 | 激活结果 | 视觉反馈 |
| --- | --- | --- |
| 有文字位置的 textblock | 选择该节点内容的 `TextSelection` | 现有文字选区高亮 |
| 包含文字位置的容器节点 | 从首个可用文字位置选择到最后一个可用文字位置 | 现有文字选区高亮 |
| 空 textblock | 光标落在其唯一文字位置 | 现有光标，无伪造范围 |
| 仅包含原子内容、无法建立文字范围的容器 | 该容器的 `NodeSelection` | 现有 NodeSelection 反馈；不补 feature 专属样式 |
| `img` 等原子节点 | 该节点的 `NodeSelection` | 现有图片选中轮廓等反馈 |
| `td`、`th` | 覆盖该单元格的 `CellSelection` | 现有单元格高亮 |
| `tr` | 覆盖该行所有单元格的 `CellSelection` | 现有整行单元格高亮 |
| `table` | 覆盖该表全部单元格的 `CellSelection` | 现有整表单元格高亮 |
| mark | 类型和 attrs 相同的最大连续文字范围 | 现有文字选区高亮 |

文本容器的范围通过节点边界和 ProseMirror 可用文字位置计算，不遍历渲染 DOM。选择 mark 时，其它嵌套 mark 不会打断目标范围。

HardBreak 等被排除的行内叶子节点没有独立路径项，但仍处于父级 textblock 或文本容器建立的 `TextSelection` 范围内。

激活操作只提交 selection transaction：

- 不修改文档内容。
- 不写入 History，不产生新的 Undo 步骤。
- selection 建立后聚焦 editor，并将选区滚动到可见区域。
- editor disabled 时仍显示当前路径，但所有路径项 disabled，不提交 transaction。

### 图片拖动语义

当前 Tiptap Image node 是 `draggable`。鼠标点击图片会形成 Image `NodeSelection`，从图片内部拖动则进入节点拖放流程，不会把图片拖成普通文字范围或新的 NodeSelection。

element path 不修改这一行为：

- 只有当前 selection 实际指向图片时，路径才以 `img` 表示图片。
- 普通 `TextSelection` 跨过图片时不会给图片添加 `ProseMirror-selectednode`，路径仍由 `selection.from` 决定。
- 激活 `img` 使用已有 Image `NodeSelection`，继续复用现有图片轮廓。
- 不把图片拖动重新解释为 element path 选择手势。

### 状态栏交互与焦点

element path 在状态栏内部形成独立 roving focus root，复用现有 `useRichTextRovingFocus`：

- editor 可编辑且路径非空时，整条路径只有一个 `tabindex="0"`，默认入口是最内层路径项；editor disabled 时所有路径项 disabled，整条路径不占 Tab stop。
- `ArrowLeft`、`ArrowRight` 在路径项之间循环移动。
- `Home`、`End` 分别聚焦最外层和最内层路径项。
- `Enter`、`Space` 激活当前路径项。
- `Escape` 将焦点还给 editor，并保持当前 ProseMirror selection。
- 指针或键盘聚焦某个路径项后，roving focus 记住该项；路径更新导致该项消失时，按现有 helper 规则选择新的可用入口。
- 路径发生更新或溢出时，焦点位于路径内则优先滚动当前聚焦项到可见区域；焦点不在路径内才滚动最内层项到可见区域。

DOM 焦点从 editor 内容移到同一编辑器内的 Toolbar、Status Bar 或其它控件时，ProseMirror selection 继续保留，element path 继续显示当前路径。焦点离开整个编辑器区域、进入页面其它区域时同样不隐藏或清空路径；页面存在多个编辑器时，每个编辑器都显示自身当前 `EditorState.selection` 对应的路径。激活路径项后焦点回到 editor，因此不会维护一份独立的“反选 selection”或“最后路径”状态。

路径按钮提供仅包含选择动作和标签的 accessible name。分隔符 `>` 只用于视觉表达，不进入辅助技术的交互序列。

### 视觉反馈

element path 不区分“用户直接选择”和“从路径激活”两种来源。两者产生相同的 ProseMirror selection，也使用相同反馈：

- `TextSelection` 使用现有 `::selection` 与失焦 selection decoration。
- Image `NodeSelection` 使用现有 `img.ProseMirror-selectednode` 轮廓。
- `CellSelection` 使用现有 `selectedCell` 高亮。
- 其它 `NodeSelection` 只使用编辑器已有通用行为，本 feature 不添加 outline、背景或 Decoration。

路径按钮自身只使用状态栏已有字号、颜色和主题变量，并提供普通 hover、focus-visible、disabled 状态；不硬编码一套新的 editor selection 色彩。

## 方案选择

### 采用：model-first editor-only feature

采用独立的 `element-path` feature：

- shared 层声明 feature 身份和 editor-only 能力。
- editor 层负责路径解析、schema 标签派生和 selection action。
- Vue 层只负责状态栏渲染、键盘交互和调用 action。
- `all` preset 同时引用 feature、editor implementation 和状态栏 item。

该方案使路径语义可以脱离 Vue 组件测试，并与现有 feature-first 目录结构保持一致。

### 未采用：状态栏组件内直接解析

将 schema、selection 和表格规则全部写进 Vue 组件会让模型逻辑难以复用和单元测试，也会把组件与当前 preset 细节耦合，因此不采用。

### 未采用：遍历 editor DOM

DOM 遍历会暴露 `.tableWrapper`、`tbody`、NodeView wrapper 等渲染细节，并可能与服务端 schema 或编辑器 state 不一致。element path 表达的是文档模型，因此不采用 DOM 作为 source of truth。

### 未采用：节点与 mark 标签映射表

手写 `paragraph -> p`、`bold -> strong` 等映射会复制 schema 已有知识，并在 extension 序列化调整后产生漂移。标签直接从 schema 序列化定义派生，表格只使用其标准 schema role 处理 wrapper。

### 未采用：所有节点统一 NodeSelection

NodeSelection 是结构选择，不会产生普通文字拖选的现有高亮。为所有块节点使用 NodeSelection 必须额外增加通用节点样式，且与“反选和直接选中不应有视觉差异”的目标冲突。因此按内容节点、原子节点和表格节点分别使用 TextSelection、NodeSelection 和 CellSelection。

## 架构与文件边界

预计新增：

```text
packages/rich-text/src/features/element-path/
├── shared.ts
├── editor.ts
└── vue/
    ├── ElementPathStatusBarItem.vue
    └── index.ts
```

职责如下：

- `shared.ts`
  - 定义 `elementPathFeature`。
  - 标记为 `editorImplementation: true`、`serverImplementation: false`。
  - 不增加 schema extension。
- `editor.ts`
  - 定义 node item 与 mark item 的判别联合类型。
  - 提供从 `EditorState` 解析当前路径的纯函数。
  - 从 schema `toDOM` 和 table role 派生标签。
  - 提供按 item 类型建立 selection 的 action。
  - 不读取 editor DOM，不持有跨 transaction 状态。
- `vue/ElementPathStatusBarItem.vue`
  - 通过 Vue editor 的响应式 state 计算路径。
  - 渲染标签、分隔符、accessible name 和 disabled 状态。
  - 管理组件内部 roving focus、横向可见性和 Escape 返回 editor。
  - 只调用 editor 层 action，不复制 position 或 mark range 算法。
- `vue/index.ts`
  - 使用 `richTextStatusBarComponent` 导出 `elementPathStatusBarItem`。

现有文件调整：

- `packages/rich-text/src/presets/all.ts`
  - 将 `elementPathFeature` 加入 `allRichTextPreset`。
- `packages/rich-text/src/vue/presets/all.ts`
  - 将 `elementPathEditorFeature` 加入 `allEditorFeatures`。
  - 将 `elementPathStatusBarItem` 放入 `allRichTextStatusBar.start`。
  - 保持 `characterCountStatusBarItem` 位于 `end`。

`compact` preset、server preset、RichTextEditor props 和状态栏公开类型均不改变。

## 数据流

```text
EditorState transaction / focus lifecycle
  -> Vue editor.state 响应式更新
  -> resolveElementPath(state)
  -> 生成当前 transaction 的临时 path descriptors
  -> ElementPathStatusBarItem 渲染
  -> 用户激活 path item
  -> selectElementPathItemAction 解析对应模型范围
  -> dispatch selection-only transaction
  -> focus + scrollIntoView
  -> editor.state 再次驱动路径更新
```

path descriptor 只服务当前 state，不写入 extension storage、plugin state 或 Vue 长期缓存。文档或 selection 变化后直接重新计算。

## 边界与错误处理

- resolver 只接收有效的 `EditorState`，不为无效 schema 或损坏文档增加 `try/catch`。
- schema 无法序列化某个 node 或 mark 时省略该项，不猜测标签。
- 路径为空是合法状态，不显示错误或占位符。
- DOM blur 不会令路径为空；只有当前 `EditorState.selection` 无法解析出可显示项时才显示空路径。
- 激活时只使用当前 editor state；disabled editor 直接不执行 action。
- selection transaction 失败时 action 返回 `false`，不改用其它 selection 类型或修改文档作为 fallback。
- 表格范围由 ProseMirror Tables 的模型与映射计算，不根据 DOM 行列索引推断。
- 序列化属性、NodeView 属性和渲染后 DOM 属性均不进入路径项的 UI 描述。

## 测试与验收

### 路径解析单元测试

- 折叠光标、正向 selection、反向 selection 和跨节点 selection 均使用 `selection.from`。
- `AllSelection` 从首个实际选中内容解析路径，不显示 `doc`。
- 非空 TextSelection 从 textblock 末尾开始时保留该 textblock，不向后扫描下一段或读取其 mark。
- Paragraph、Heading、Blockquote、List、ListItem、CodeBlock、Image 和 Table 节点顺序正确。
- `doc`、文本节点、不可选择的行内叶子节点、`.tableWrapper`、`tbody`、`colgroup` 不进入路径。
- Heading 动态得到 `h1`、`h2`、`h3`，TableCell 与 TableHeader 得到 `td`、`th`。
- 标签来自 schema 序列化定义；测试使用调整后的 schema tag 时，resolver 自动反映变化，不依赖节点名称映射。
- NodeSelection 正确解析被选图片，而不是只解析图片前的位置。
- CellSelection 使用文档顺序中的第一个单元格并终止于 `td` 或 `th`，不加入单元格内部段落和 mark。
- 顶层 GapCursor 返回空路径。
- nested marks 按 schema 顺序显示。
- 相同类型和 attrs 的连续 mark 合并，不同链接 attrs 不合并。
- `<strong>甲<em>乙</em>丙</strong>` 的 `strong` 与 `em` 范围符合设计。
- stored marks 不会制造文档中不存在的路径项。

### Selection action 单元测试

- textblock 选择完整内容并得到 `TextSelection`。
- 多 textblock 容器从首个文字位置选择到最后一个文字位置。
- 空 textblock 得到折叠 `TextSelection`。
- 只有原子内容的容器与 Image 使用 `NodeSelection`。
- TableCell、TableHeader、TableRow 和 Table 分别得到正确的 `CellSelection`。
- mark 选择类型和 attrs 相同的最大连续范围，嵌套 mark 不打断外层范围。
- action 只改变 selection，不改变 `doc`，也不产生 History 步骤。
- disabled 状态不执行 action。

### Vue 组件测试

- state transaction 后路径响应式更新，不需要额外 plugin 通知。
- 所有路径项正文和 accessible name 均不包含 attrs，URL、图片属性和样式值不会出现在 UI 描述中。
- editor 可编辑且路径非空时只有一个 Tab stop，默认位于最内层 item；editor disabled 时没有 Tab stop。
- `ArrowLeft`、`ArrowRight`、`Home`、`End` 使用现有 roving focus 语义。
- `Enter`、`Space` 激活 item，`Escape` 聚焦 editor 并保留 selection。
- 焦点离开整个编辑器区域后仍显示当前 selection 对应的路径，不创建独立的最后路径状态。
- editor disabled 时路径保持显示，item 全部 disabled。
- 路径溢出时右侧字符数保持可见；路径内有焦点时当前 item 可见，否则最内层 item 可见。
- `all` preset 的 `start` 包含 element path、`end` 包含 character count；`compact` preset 不包含 element path。

### Browser 测试

- 光标在普通文字、nested marks、表格单元格间移动时，状态栏路径与实际模型一致。
- 点击文字节点或 mark 路径项后显示现有文字 selection 高亮。
- 点击 `img` 路径项后得到 Image NodeSelection 和现有图片轮廓。
- 点击 `td`、`tr`、`table` 后得到对应单元格范围高亮。
- DOM 焦点移入状态栏后路径保持，激活后焦点回到 editor。
- DOM 焦点移到页面其它区域后路径仍保持；多个编辑器分别保留各自当前 selection 的路径。
- 长路径不会覆盖字符数。
- 编辑器位于视口外、上层纵向滚动容器内或页面存在多个编辑器时，路径挂载、更新和尺寸变化均不会滚动页面或上层容器。

### 验证命令

- 按需运行新增的 rich-text 定向 Vitest 与 browser tests。
- 运行 `pnpm --filter @rev30/rich-text typecheck`。
- 最终在沙箱外运行完整 `pnpm check`，覆盖 Chromium browser tests。

## 完成标准

- `all` preset 状态栏左侧稳定显示基于 `selection.from` 的 model-first element path。
- 路径包含当前模型节点与实际 marks，标签由 schema 自动派生。
- editor 可编辑时，所有可见 item 可通过指针和键盘激活，并建立本设计规定的已有 selection 类型；disabled 时路径只读显示且不占 Tab stop。
- element path 不新增公开配置、ProseMirror plugin、DOM inspector 逻辑或专属 selection 样式。
- 图片与表格继续沿用各自已有 selection 和视觉反馈。
- 定向测试、typecheck 和完整 `pnpm check` 通过。
