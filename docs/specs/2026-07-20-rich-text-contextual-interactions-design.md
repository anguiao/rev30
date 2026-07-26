---
status: approved
date: 2026-07-20
---

# 富文本上下文交互设计

## 背景

`@rev30/rich-text` 当前已经形成 feature、preset、editor/server implementation 分层，并提供：

- `compact` preset，供通知公告等短中篇后台内容使用。
- `all` preset，供富文本演示和未来知识库、帮助中心等长文场景使用。
- 固定顶部工具栏与可选状态栏。
- 统一的 `RichTextAction`，封装内容命令和激活状态，并可从同一命令派生执行与可执行状态。
- Link、Highlight、Image、CodeBlock、SearchReplace、TextStyle 等复杂工具栏控件。

现有顶部工具栏具备稳定且完整的能力入口，但缺少靠近当前选区或内容对象的上下文操作。用户执行高频文字格式、编辑已有链接、调整图片或代码块时，需要在编辑内容与顶部工具栏之间往返；长文场景也缺少可发现且适合键盘的块插入入口。

本设计采用“分层上下文交互”，在保留顶部工具栏主入口地位的前提下，为不同 preset 增加 Quick Bar 和 Slash 命令面板。自定义右键菜单不在范围内。

## 目标

- 保留顶部工具栏作为完整、稳定、可发现的主入口。
- 为 `compact` 和 `all` 提供按 feature 过滤的高频文字与链接 Quick Bar。
- 为 `all` 提供图片和代码块 Quick Bar。
- 为 `compact` 和 `all` 提供按各自 feature 集合裁剪的 Slash command 入口。
- 复用现有 `RichTextAction`、图片对话框、链接校验和代码语言选项，不复制业务行为。
- 延续 feature-first 目录结构，具体 feature 的专属 UI 仍归属于对应 feature。
- 保持应用层 API 收敛，业务方继续只选择内置 preset。
- 保持存储、服务端派生和 sanitize 行为不变。

## 非目标

本阶段不实现：

- 自定义右键 Context Menu，或拦截浏览器原生 `contextmenu`。
- 用 Quick Bar 替代或缩减顶部工具栏。
- Notion 式块侧栏、拖拽手柄、块排序或完整块编辑工作台。
- 移动端专属底部工具栏或触屏专属交互。
- 业务方自定义 Quick Bar、Slash command、菜单组件、slot 或公开内部 DSL。
- TextStyle 的字体、字号、文字颜色和行高 Quick Bar；这些能力继续留在顶部工具栏。
- Heading、List、Blockquote、TextAlign 或 HorizontalRule 的对象 Quick Bar。
- 新增表格、Mention、Emoji、媒体、复制代码、下载代码等内容能力。
- 修改富文本 JSON schema、服务端 preset、HTML 派生或 sanitize policy。

## 术语

- **顶部工具栏**：编辑器顶部始终存在的完整主入口。
- **Quick Bar**：跟随当前选区或内容上下文定位的浮动操作条。
- **普通文字 Quick Bar**：非空文字选区的通用行内格式操作。
- **Feature Quick Bar**：由 Link、Image、CodeBlock 等 feature 提供的专属上下文界面。
- **Slash 命令面板**：由 `/` 触发，用于块类型转换和块内容插入的命令列表。
- **对象上下文**：用户视为独立可操作对象的内容；既包括 Image node，也包括 Link mark 和 CodeBlock text block。

## 产品决策

### Preset 能力矩阵

| 交互面 | `compact` | `all` |
| --- | --- | --- |
| 顶部工具栏 | 保留完整主入口，并与可用 Quick Bar feature 共享交互契约 | 保留完整主入口，并与可用 Quick Bar feature 共享交互契约 |
| 普通文字 Quick Bar | 加粗、斜体、创建/编辑链接 | 加粗、斜体、下划线、高亮、创建/编辑链接；“更多”包含删除线、行内代码、清除格式 |
| Link Quick Bar | 直接编辑链接地址、新窗口打开、移除链接 | 直接编辑链接地址、新窗口打开、移除链接 |
| Image Quick Bar | 无 | 下载、编辑图片 |
| CodeBlock Quick Bar | 无 | 代码语言 |
| Slash 命令面板 | 正文、一级至三级标题、无序列表、有序列表 | `compact` 的全部命令，以及引用、代码块、分割线、图片 |
| 自定义右键菜单 | 无 | 无 |

顶部普通按钮与 Quick Bar 可以同时反映 active/disabled 状态，但任意时刻只显示一种 Quick Bar 上下文。Quick Bar 的可见性由 editor 或 Quick Bar 内部焦点驱动；用户打开顶部 popover、dropdown 或 dialog 后，焦点离开这一区域，Quick Bar 自然隐藏。

### Quick Bar 上下文优先级

Quick Bar 按以下顺序选择第一个匹配的上下文：

1. Image NodeSelection。
2. 折叠光标位于一个具有唯一 `href` 的连续 Link mark 内。
3. 光标或选区位于一个 CodeBlock 内。
4. 非空普通文字选区。
5. 不显示。

任何非空纯文字选区都不进入 Link Quick Bar：即使选区完全位于同一链接内，也显示普通文字 Quick Bar，使加粗、斜体、下划线和高亮等只作用于实际选中文字。选区跨越多个链接、多个 `href` 或链接与普通文字时同样显示普通文字 Quick Bar。纯文字选区可以跨越段落、标题、列表项和引用。

Link Quick Bar 是否出现、普通文字 Quick Bar 的 Link control 是否可用及其编辑范围，都由后文“Link 共享交互契约”的同一 range 解析函数派生。这里不另行定义目标或提交语义。

选区完全位于单个 CodeBlock 时显示 CodeBlock Quick Bar；选区跨越 CodeBlock 与其它块时不显示任何 Quick Bar。普通选区包含 Image、HorizontalRule 等原子节点时也不显示 Quick Bar；只有精确的 Image NodeSelection 进入 Image Quick Bar。这避免展示只对部分选区有效的操作。

editor 禁用或上下文失效时不显示 Quick Bar。主要输入设备匹配 `pointer: coarse` 的粗指针环境下隐藏全部 Quick Bar，继续使用现有顶部工具栏；该规则不影响 Slash command。本阶段不提供移动端专属替代界面。

### Slash 命令范围

Slash 命令面板属于编辑器 Vue 基础设施，由 preset 组合当前 feature 已有的 action：

- `compact` 包含正文、一级至三级标题、无序列表和有序列表。
- `all` 包含 `compact` 的全部命令，并增加引用、代码块、分割线和图片。

当 editor 可编辑且光标位于顶层空段落时，该段落显示“开始输入，或按 / 唤起命令”的非交互提示，明确直接输入与 Slash command 都可用。提示不占据布局，不写入文档内容；输入内容、离开该段落或 editor 禁用后立即消失。嵌套段落不显示提示；该提示只是顶层正文输入入口的可发现性设计，不用于限制 Slash command 的触发上下文。

面板不包含行内格式、TextStyle、TextAlign、History、SearchReplace 或 CharacterCount。

命令按固定顺序分组：

1. **基础块**：正文、一级标题、二级标题、三级标题；`all` 末尾再增加引用。
2. **列表**：无序列表、有序列表。
3. **插入**：仅 `all` 提供，包含代码块、分割线、图片。

查询过滤后隐藏没有命令的空分组，但不重排剩余命令；键盘上下导航跨分组连续移动，分组标题不可选中。

查询在命令的中文标签、key 与以下 feature-local 额外关键词中做大小写不敏感的包含匹配：

| 命令 | 额外关键词 |
| --- | --- |
| 正文 | 段落、`text` |
| 一级标题 | 标题1、`h1`、`heading1` |
| 二级标题 | 标题2、`h2`、`heading2` |
| 三级标题 | 标题3、`h3`、`heading3` |
| 引用 | 无 |
| 无序列表 | 项目符号、`unordered`、`ul` |
| 有序列表 | 编号列表、`numbered`、`ol` |
| 代码块 | 代码、`codeblock` |
| 分割线 | 横线、`divider`、`separator`、`horizontalrule`、`hr` |
| 图片 | `img`、`picture` |

不支持拼音、拼音首字母或模糊匹配，不新增搜索依赖。

`正文` 作为默认块类型保留在命令列表中。通过 `/正文` 执行时，删除查询文本并保持段落类型。

## 架构

### Preset 配置

`RichTextEditorPreset` 内部新增以下可选配置：

```ts
interface RichTextEditorPreset {
  readonly editorFeatures: readonly RichTextEditorFeature[]
  readonly toolbar?: RichTextToolbarConfig
  readonly statusBar?: RichTextStatusBarConfig
  readonly quickBar?: RichTextQuickBarConfig
  readonly slashMenu?: readonly RichTextSlashMenuGroup[]
}
```

- `compactRichTextEditorPreset` 配置 `quickBar` 和基础 `slashMenu`。
- `createAllRichTextEditorPreset` 同时配置 `quickBar` 和 `slashMenu`。
- `defineRichTextEditorPreset` 校验 Quick Bar control、Feature Quick Bar 和 Slash command 引用的 feature 已存在于 preset，且具有对应 editor implementation；各配置 helper 负责拒绝自身不允许的重复 key。
- Toolbar、普通文字 Quick Bar 和 Status Bar 的 component entry 不单独声明 key，由 feature key 作为各自配置中的唯一身份；同一个 feature 在同一种组件配置中只提供一个入口。
- 内部定义 helper 使用 TypeScript `readonly` 表达不可变约束。服务端 HTML policy 保留只读定义，sanitize 时将各 feature policy 合并为新的配置。
- 配置与 helper 保持包内部使用，不从 `@rev30/rich-text/vue` 或 preset public entry 导出。

Quick Bar 配置明确区分普通文字 controls 与有序的 feature Quick Bars：

```ts
interface RichTextQuickBarConfig {
  readonly textControls?: RichTextQuickBarControls
  readonly featureBars: readonly RichTextFeatureQuickBar[]
}

interface RichTextQuickBarControls {
  readonly main: readonly RichTextQuickBarControl[]
  readonly more: readonly RichTextQuickBarControl[]
}

interface RichTextQuickBarControlBase {
  readonly type: 'action' | 'component'
  readonly feature: RichTextFeature
  readonly key: string
}

interface RichTextQuickBarActionControl extends RichTextQuickBarControlBase {
  readonly type: 'action'
  readonly item: RichTextActionItem
}

interface RichTextQuickBarComponentControl extends RichTextQuickBarControlBase {
  readonly type: 'component'
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}

type RichTextQuickBarControl =
  | RichTextQuickBarActionControl
  | RichTextQuickBarComponentControl

interface RichTextFeatureQuickBar {
  readonly feature: RichTextFeature
  readonly isActive: (editor: Editor) => boolean
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
  readonly getAnchorElement?: (editor: Editor) => HTMLElement | null
  readonly anchorAlignment?: 'end'
}
```

`RichTextQuickBar` 按 `featureBars` 的声明顺序选择第一个匹配当前 editor 状态的 Feature Quick Bar；都不匹配时，才根据非空普通文字选区渲染 `textControls`。这种不对称结构体现了普通文字始终作为最终兜底的实际规则。内置 all preset 依次声明 Image、Link、CodeBlock，compact preset 声明 Link，数组顺序直接表达优先级。

Feature Quick Bar component 由容器统一注入 `editor`；editor disabled 时不挂载 Quick Bar。配置中的 `props` 只承载上传回调、显示标签等属于该组件的选项。组件在配置阶段使用与 toolbar component control 相同的 `markRaw` 处理。默认定位以 selection 为锚点；块级对象可以通过 `getAnchorElement` 提供自身 DOM 锚点，并通过 `anchorAlignment: 'end'` 与其右边缘对齐。

Naive UI 的 popover 和 dropdown 使用 `to=false` 留在各自的 Vue 组件树中。Tiptap Floating UI 管理的 Quick Bar 和 Slash Menu 都是 `RichTextEditor` 的直接子组件，并由编辑器传入根元素作为容器。各临时界面在自身组件内维护显隐状态，并使用 Naive UI 的 `update:show`、`clickoutside` 以及焦点事件关闭。顶部 trigger 获得焦点后，Quick Bar 按自身焦点规则隐藏；Quick Bar 的草稿或子菜单随对应局部组件关闭而丢弃。

Toolbar、Quick Bar 和 Slash Menu 都调用 image feature 的 `openImageDialog`。该函数使用 Tiptap `VueRenderer` 按需创建 `ImageDialog`，关闭时立即销毁，并在 editor 销毁时同步清理。

`all` preset 创建三个图片入口时分别传入同一份上传 options。每次调用 `openImageDialog` 都根据当前选中图片创建独立的 `ImageDialog`：有图片时作为编辑表单初值，没有图片时进入插入界面。确认时 action 使用 editor 当前 selection，图片插入所需的 History 边界由 `insertImageAction` 负责。

### Action 与 Action Item

`RichTextAction` 使用一个 Tiptap `Command` factory 定义行为，使普通入口可以直接执行命令，也使 Slash Menu 可以把查询删除与对应 action 组合进同一个 transaction：

```ts
interface RichTextAction<
  Feature extends RichTextFeature = RichTextFeature,
  Key extends string = string,
  Arguments extends unknown[] = [],
> {
  readonly feature: Feature
  readonly key: Key
  readonly command: (...arguments_: Arguments) => Command
  readonly isActive?: (editor: Editor, ...arguments_: Arguments) => boolean
}
```

- `command(...arguments_)` 返回 Tiptap `Command`，并遵循 Tiptap 命令约定：只通过传入的 `CommandProps` 读取状态及修改 `tr`，不在内部自行 `editor.view.dispatch()`；当 `dispatch` 不存在时只返回是否可执行，不产生外部副作用。
- `runRichTextAction(editor, action, ...arguments_)` 通过 `editor.commands.command(action.command(...arguments_))` 立即执行。Toolbar、Quick Bar 和 feature UI 统一使用该 helper。
- `canRunRichTextAction(editor, action, ...arguments_)` 通过 `editor.can().command(action.command(...arguments_))` 从同一命令派生可执行状态。
- 需要聚焦 editor 的 action 在自身 command 内通过 `chain().focus()` 表达；SearchReplace 输入等不应抢占焦点的 action 不添加 `focus()`。
- SearchReplace 等 plugin action 在传入的 `tr` 上设置 meta、selection 和内容变更。打开图片对话框、调用 `window.open` 等纯 UI 行为由对应 feature component 或调用回调负责。
- action-backed Slash command 由 action item 直接派生，并通过 Tiptap chain 组合其无参数 action；图片入口使用同一个 `richTextSlashCommand`，并提供打开对话框的执行函数。

`RichTextActionItem` 统一承载 `RichTextAction` 的标签、图标和无法由标签或 action key 推导的额外搜索关键词，且保留 action 的参数类型：

```ts
interface RichTextActionItem<
  Feature extends RichTextFeature = RichTextFeature,
  Key extends string = string,
  Arguments extends unknown[] = [],
> {
  readonly action: RichTextAction<Feature, Key, Arguments>
  readonly label: string
  readonly icon: RichTextIconClass
  readonly keywords: readonly string[]
}
```

Toolbar、普通文字 Quick Bar 和 action-backed Slash command 可以引用同一个无参数 action item。需要参数但仍要共享展示与搜索元数据的入口也可以定义 action item；当前图片 Slash command 复用 `insertImageActionItem`，再由 `richTextSlashCommand` 绑定上传配置与 `openImageDialog`。Toolbar 的 button、dropdown、component control 保持各自的配置形式。

`RichTextActionItem` 与定义 helper 直接放在 `editor/action.ts`；各 feature 的 action item 与 action、editor feature 一同放在自身 `editor.ts`。提供 Vue 组件或 Vue 入口配置的 feature 使用 `vue/` 目录，并由 `vue/index.ts` 组合其中的组件。

不同入口可以拥有专属的复杂 UI 组件，但必须复用 feature 的 action、校验函数、选项和内部子组件，不复制命令逻辑。

顶部工具栏与 Quick Bar 对同一 feature 复用状态解析、action 和核心编辑组件。Link 的顶部工具栏和普通文字 Quick Bar 使用同一个 `LinkControl`；自动出现的 Link Quick Bar 直接渲染同一个 `LinkEditor`，区别只是它不主动抢焦点。

ProseMirror selection 属于 editor state，DOM 焦点移入输入框、菜单或对话框时不会因此消失。Link 因为允许从折叠光标或部分选区编辑完整链接，打开编辑器时保留命令所需的 range，并在组件内维护 URL 草稿；Image 和 CodeBlock 在操作时解析当前 selection。

#### 临时界面与焦点

- SearchReplace、Link、Highlight、TextStyle、通用 dropdown 和 CodeBlock 语言列表各自维护自己的显隐状态；`ImageDialog` 由 `openImageDialog` 创建和销毁。
- Naive UI popover/dropdown 依靠自身的 trigger、`update:show` 和点击外部行为关闭。点击新的 trigger 时，已有临时界面通过点击外部或失去焦点完成关闭。
- Quick Bar 只在 editor 或 Quick Bar 内部持有焦点时显示。焦点移到顶部 trigger、浮层或 modal 后，Quick Bar 隐藏；焦点回到 editor 后，再按当前 selection 重新计算。
- 子菜单的 `Escape` 只关闭拥有该事件的子菜单，并按组件自己的语义聚焦 trigger 或 editor；未被子组件消费的 `Escape` 才由 Quick Bar 容器关闭整个 Quick Bar。
- 临时界面关闭后，后续操作继续读取 editor state 中的 selection。

#### Link 共享交互契约

三个 Link 入口使用同一个 `resolveLinkRange` 和 `LinkEditor`，差异只如下：

| 入口 | 触发 | 可用范围 | 界面 |
| --- | --- | --- | --- |
| Link Quick Bar | 折叠光标进入唯一连续链接时自动出现 | 完整 link range | 直接显示 URL 编辑器，但不主动聚焦输入框 |
| 普通文字 Quick Bar Link control | 用户在非空文字 Quick Bar 点击 Link control | 单个 text block 中的完整 link range 或精确文字选区；跨块或包含 inline atom 时 disabled | popover 中显示 URL 编辑器并自动聚焦 |
| 顶部 Link control | 用户点击顶部 Link 按钮 | 上述范围，以及普通折叠光标的零长度 range；跨块或包含 inline atom 时 disabled | popover 中显示 URL 编辑器并自动聚焦 |

`resolveLinkRange` 的规则为：

- 只接受允许 Link mark 的 `TextSelection`。非空选区必须位于同一个 text block，且范围内只能包含文本；跨块选区或包含 inline atom 时返回 `null`。
- 同一 text block 中，相邻文本节点若具有相同 `href`，合并为一个连续 link range，避免文档 JSON 的节点切分泄漏到交互层。
- 折叠光标位于一个且仅一个连续链接范围内（含普通文字与链接的边界）时，返回该完整 link range。光标位于两个不同链接之间或普通文字中时，返回零长度 range；显式 stored marks 已不包含 Link 时也按零长度 range 处理。因此只有实际链接范围会显示 Link Quick Bar，而顶部 Link control 仍可设置 stored mark。
- 非空选区完全包含在一个连续链接范围内时，返回完整 link range 并预填原 URL；其它合法文字选区保留精确范围且不预填 URL。这样，部分选择一个链接可编辑完整链接，混合选区则只修改用户实际选择的部分。
- 当链接覆盖整个段落的开头或结尾时，分别用 `ArrowLeft`/`ArrowRight` 清除 stored Link mark，使后续输入落在链接外；该操作不插入占位空格，也不修改文档内容。

`LinkEditor` 的规则为：

- 三个入口使用同一组 URL 输入框、“应用”、“新窗口打开”、“移除链接”和“取消”控件。只有 range 内实际存在 Link mark 时显示“移除链接”。
- URL 草稿初始化自 `range.href`，只存在于当前 `LinkEditor` 实例。非法非空 URL 显示 error，并禁用“应用”和“新窗口打开”；打开合法草稿不会关闭编辑器。
- 应用非空 URL 时，`setLinkAction` 直接在明确 range 上添加或替换 Link mark；应用空 URL 或点击“移除链接”时，`unsetLinkAction` 在同一 range 上移除 Link mark。零长度 range 对应 stored mark，editor selection 保持不变。
- 显式取消或 `Escape` 放弃草稿并聚焦 editor。Toolbar 和普通文字 Quick Bar 的 popover 在再次点击 trigger 或点击外部时直接销毁当前编辑器草稿，并保留外部点击产生的新焦点。
- Link Quick Bar 完成应用、移除或取消后向父 Quick Bar 发出 `dismiss`；当前 Quick Bar 隐藏，直到后续 selection/文档 transaction 或新的 editor focus 生命周期重新允许显示。每个 `LinkEditor` 都从自身 range 初始化 URL 草稿。

#### Image 共享交互契约

所有图片入口复用同一个 `ImageDialog`、`openImageDialog` 和 insert/update action，入口差异只如下：

| 入口 | 触发 | 操作依据 | 操作 |
| --- | --- | --- | --- |
| 顶部 ImageToolbarControl | 用户点击 enabled 的顶部图片按钮 | 当前 selection；或当前 Image NodeSelection 的属性 | 插入或编辑 |
| Image Quick Bar | 精确的 Image NodeSelection 自动出现 | 当前图片属性 | 下载或编辑 |
| `/图片` | 用户执行图片命令 | 删除 `/query` 后的当前 selection | 插入 |

共同流程为：

- 三个入口都通过 `openImageDialog` 打开对话框。该函数读取当前 selection 并创建对应的 `ImageDialog`；编辑模式将当前图片用于表单预填，插入模式不传图片。
- 顶部 ImageToolbarControl 在 Image NodeSelection 时提供编辑，其它 selection 均提供插入；插入沿用 Tiptap 的正常 selection 替换语义。
- 打开时根据当前 selection 确定使用共享 `insertImageAction` 还是 `updateImageAction`，确认时 action 直接作用于当前 editor state。`updateImageAction` 只在当前 selection 是 Image NodeSelection 时成功。
- 插入成功时沿用 Tiptap `insertContent` 的 selection 结果，得到新图片的 Image NodeSelection；编辑成功时只更新当前图片属性并保留已有 NodeSelection。两者都会聚焦 editor，允许显示 Quick Bar 的环境会据此显示 Image Quick Bar。文档结构与 selection 保持这两个 Tiptap 命令产生的结果。
- 从顶部工具栏打开 ImageDialog 或从 Image Quick Bar 打开对话框后，焦点进入 modal，Quick Bar 按自身焦点规则隐藏；关闭后再按当前 selection 重新计算。从 `/图片` 打开前先关闭 Slash 命令面板。
- 取消、`Escape` 或 modal 关闭控件都按显式取消处理：放弃草稿并聚焦 editor，不修改当前 selection。
- 对话框根据 insert/update action 的返回值决定确认是否成功。
- 上传和图片处理错误继续调用 preset 的 `onError`。对话框关闭后，无法取消的上传 Promise 可以继续 settle，其结果必须被忽略。
- Image Quick Bar 与顶部工具栏都不提供专用删除按钮或自定义删除 action。Image NodeSelection 继续使用 Tiptap/ProseMirror 原生 `Backspace` 与 `Delete`；删除、selection 映射和 History 沿用编辑器原生行为。图片是文档唯一内容时，schema 的原生删除结果为一个空正文段落和其中的折叠 TextSelection，editor 保持可继续输入。

#### CodeBlock 共享交互契约

顶部 `CodeBlockToolbarControl` 与 CodeBlock Quick Bar 共享同一个 `CodeBlockLanguageControl`。该组件内部维护固定语言选项，并通过“从当前 selection 找所在 CodeBlock”的 helper 和同一个 action 工作：

| 入口 | CodeBlock 内的操作 | 入口特有能力 |
| --- | --- | --- |
| 顶部 CodeBlockToolbarControl | 切换语言；active 的代码块按钮转为正文 | 在非 CodeBlock selection 上用代码块按钮创建 CodeBlock |
| CodeBlock Quick Bar | 切换语言 | 仅作为已有 CodeBlock 的自动上下文界面 |

- 折叠光标或非空选区完全位于同一个 CodeBlock 时，从当前 selection 找到该 CodeBlock；顶部语言控件 enabled，CodeBlock Quick Bar 显示。选区跨越多个 CodeBlock，或跨越 CodeBlock 与其它块时，helper 返回 `null`：顶部语言控件 disabled，且不显示 CodeBlock Quick Bar。
- Toolbar 将语言组件与代码块切换按钮组成 split button；Quick Bar 直接复用语言组件，并通过 `showLabel` 显示当前语言。它不提供“转为正文”，该低频操作仍可通过顶部 active 的代码块按钮完成。
- “纯文本”映射为 `null`，其它菜单项写入各自规范化 value。文档中存在不在固定菜单里的合法语言时，按钮直接显示原始语言标识，不伪装成“纯文本”。
- CodeBlock Quick Bar 的显示条件由 selection 决定，但定位锚点是当前 CodeBlock 的 DOM 节点。浮层默认位于代码块上方，右边缘对齐并保持 `4px` 间距；光标在同一代码块内移动时位置不变，上方空间不足时翻转到代码块下方并保持右对齐。
- 语言列表始终从当前 selection 解析 CodeBlock。选择语言成功后关闭列表并聚焦 editor；命令只更新节点属性，因此不会额外移动 selection。`Escape` 关闭并聚焦 editor，点击外部关闭时保留该次点击产生的新焦点。
- 语言列表使用组件自己的受控 `show`，以便 `Escape` 只关闭当前列表并聚焦对应 editor；不同 editor 实例之间互不影响。

#### Highlight 共享交互契约

顶部工具栏与普通文字 Quick Bar 直接复用同一个 `HighlightControl`；四色选项也由该组件内部维护：

| 入口 | 目标 | 入口特有能力 |
| --- | --- | --- |
| 顶部 HighlightControl | 当前 selection | 折叠光标时设置或清除 stored highlight mark |
| 普通文字 Quick Bar | 触发 Quick Bar 的精确非空文字 selection | 无折叠光标入口 |

- 两处都只提供黄、绿、蓝、粉四色和“清除高亮”，点击主按钮只打开颜色面板，不直接切换默认色，也不记录最近使用色。
- 目标只有一种已支持高亮色时，主 action 与对应颜色同时 active；目标包含多种高亮色时，主 action active，但不选中任一颜色；没有高亮时两者都不 active。顶部折叠光标从当前 stored mark 派生同一状态。
- 颜色面板直接读取和修改当前 editor selection。只有 `canRunRichTextAction` 允许的颜色按钮可点击；执行选择或清除后关闭当前面板，action 自身负责聚焦 editor。
- `Escape` 只关闭颜色面板并把焦点还给高亮 trigger，不关闭整个 Quick Bar；点击外部沿用 `NPopover` 的默认关闭行为。关闭时没有需要保留的颜色草稿。

### Quick Bar 组件

目录与职责：

```text
packages/rich-text/src/
├── vue/
│   └── quick-bar/
│       ├── index.ts
│       ├── resolve.ts
│       ├── RichTextQuickBar.vue
│       └── RichTextTextQuickBar.vue
└── features/
    ├── link/vue/LinkQuickBar.vue
    ├── image/vue/ImageQuickBar.vue
    └── code-block/vue/CodeBlockLanguageControl.vue
```

- `quick-bar/index.ts` 定义内部配置类型和 helper。
- `quick-bar/resolve.ts` 只负责按 editor state 和 preset 配置选择当前 Quick Bar。
- `RichTextQuickBar.vue` 是唯一的 Tiptap `BubbleMenu`，负责可见性、定位、dismiss 和通用键盘导航，并渲染普通 controls 或当前 feature component。
- `RichTextTextQuickBar.vue` 只负责渲染普通文字 action/component controls 和“更多”菜单，不知道 Bold、Italic 等具体 feature。
- `LinkQuickBar.vue`、`ImageQuickBar.vue` 跟随对应 feature 放置；CodeBlock Quick Bar 直接使用 `CodeBlockLanguageControl.vue`。
- 普通文字选区对应 preset 组合的一组 controls，由 `RichTextTextQuickBar.vue` 负责渲染。

`RichTextQuickBar.vue` 通过一个 `BubbleMenu` 和一个唯一 plugin key（`richTextQuickBar`）管理全部上下文的定位与可见状态。

### Slash Menu 组件

```text
packages/rich-text/src/vue/slash-menu/
├── index.ts
├── plugin.ts
└── RichTextSlashMenu.vue
```

- `index.ts` 定义命令分组、label/key/关键词过滤、统一的 Tiptap command 和执行 helper。
- `plugin.ts` 封装 Suggestion，以及空段落提示和 composition 刷新所需的 ProseMirror view plugin。
- `RichTextSlashMenu.vue` 提供 Suggestion renderer callbacks，直接渲染菜单，并负责查询过滤、active option、键盘导航、ARIA、定位挂载和生命周期。
- 各 feature 的 action item 定义 label、icon 及无法由 label/action key 推导的额外关键词；preset 将 item 适配成统一的 Slash command，并组合命令的分组与顺序。无参数 item 默认复用自身 action command；图片等需要先收集参数的入口复用同一 item 元数据，并提供打开现有 UI 的自定义执行函数。
- `/` 入口使用 Tiptap Suggestion utility，菜单元素通过 `SuggestionProps.mount()` 接入其定位生命周期。
- `slashMenu` preset 字段保存只读命令分组数组，只组合当前 preset 的命令；`RichTextEditor` 在分组存在时挂载 `RichTextSlashMenu`。

Slash Menu 是 Vue editor 的交互基础设施。菜单由 Slash command 组成，模块、Preset 字段和 Vue 组件统一以 Menu 命名，以区分完整菜单与单条命令。命令模型、ProseMirror plugin 和菜单统一放在 `vue/slash-menu/`，并由 `compact` 和 `all` 的 Vue preset 配置各自命令。项目直接依赖 `@tiptap/suggestion`，版本与其它 Tiptap 依赖保持一致。

使用互不冲突的内部 plugin key：

- Quick Bar：`richTextQuickBar`。
- Slash Suggestion：`richTextSlashMenu`。
- Slash view：`richTextSlashMenuView`。

#### Slash 命令列表契约

- Slash 使用 preset 提供的命令分组与固定顺序，并通过命令自身的标签、key 和 feature-local 关键词按当前 `/query` 过滤。
- disabled 命令保持可见，但不能成为 active option。列表首次出现时，以第一个 enabled 命令作为 active option；没有 enabled 命令时不设置 active option。`ArrowUp`/`ArrowDown` 跳过 disabled 命令，并在 enabled 命令间循环；点击 disabled 命令不执行、不关闭面板。
- Slash 的 `/query` 随 Suggestion 更新而变化时，如果旧 active option 仍在过滤结果中并且可执行，则继续保留；仅在它失效时选择第一个 enabled 命令，没有 enabled 结果时清空 active option。
- 指针在命令项上真实移动时更新 active option；仅因键盘导航触发列表滚动、导致元素从静止指针下方经过时，不得重置键盘 active option。
- 点击 enabled 命令或在存在 active option 时按 `Enter`，都通过同一个选择入口执行。command 返回 false 时保持面板打开，并从下一次 transaction 重新计算 enabled 状态。
- `Tab` 关闭面板、保留已输入的 `/query` 且不消费事件，由浏览器继续默认焦点导航。
- Slash 由 editor 持有焦点。没有 active option 时，`Enter` 交给 editor 正常换行。
- 默认 action-backed 命令先在同一个 chain 中删除 `/query`，再组合自身 command。图片等自定义 UI 命令先提交查询删除，再调用无返回值的界面回调，并由 Slash adapter 视为已处理。
- `/图片` 在选择命令时用一个 transaction 删除 `/query`，确认时再用一个 transaction 插入图片。

### Feature UI 复用

- Bold、Italic、Underline、Strike、InlineCode、RemoveFormat 复用现有 action item。
- Highlight Quick Bar 与顶部工具栏直接复用 `HighlightControl`、内部颜色选项和 highlight actions。
- 所有 Link 入口复用 `normalizeLinkHref`、`resolveLinkRange`、`setLinkAction`、`unsetLinkAction` 和 `LinkEditor`；`LinkControl` 只负责手动触发的 popover，`LinkQuickBar` 只负责自动上下文与 dismiss。
- `setLinkAction` 与 `unsetLinkAction` 直接作用于调用时传入的明确 range；`resolveLinkRange` 负责在连续链接范围与精确文字选区之间做选择。
- Link editor extension 配置 `enableClickSelection: false`。单击链接只放置折叠光标并显示 Link Quick Bar；拖选任何链接文字都进入普通文字 Quick Bar。
- 顶部工具栏和普通文字 Quick Bar 使用相同的点击触发 `LinkControl`。
- Image Quick Bar、顶部 ImageToolbarControl 与图片 Slash command 复用 `openImageDialog`、`ImageDialog` 和 insert/update action；preset 在创建三个入口时传入同一份上传/error options。Image Quick Bar 提供下载与编辑，顶部 ImageToolbarControl 提供插入与编辑。
- `insertImageAction` 使用 Tiptap `insertContent` 的 selection 结果；`updateImageAction` 更新当前 NodeSelection 的节点属性并保留该 selection。
- CodeBlock Quick Bar 直接复用顶部 `CodeBlockToolbarControl` 内部使用的 `CodeBlockLanguageControl`；selection helper、语言选项和 `setCodeBlockLanguageAction` 只有一份。
- Heading、List、Blockquote、CodeBlock、HorizontalRule 的 Slash command 由各 feature 的无参数 action item 派生；图片命令通过 `richTextSlashCommand` 复用参数化的 `insertImageActionItem`，并提供打开 `ImageDialog` 收集参数的自定义执行函数。

## 数据流与交互

### Quick Bar

数据流保持单向：

```text
Editor transaction/selection
→ 解析 Quick Bar 上下文
→ 从 preset 选择 controls 或 feature component
→ 执行 RichTextAction
→ Tiptap transaction
→ 现有 update:modelValue
```

- 简单按钮使用 `mousedown.prevent`，避免点击时丢失文字选区。
- Quick Bar 容器使用不透明的主题浮层背景，不能透出正文或页面背景。
- Quick Bar 可见、editor 持有焦点且不在 composition 时，未被 Tiptap keymap 消费的普通 `Tab` 把焦点移到 roving 顺序中第一个当前可见、active 且 enabled 的 control；没有该 control 时移到第一个 enabled control。ProseMirror selection 保留在 editor state 中。实现只在 editor 既有按键处理完成后、事件仍未被消费时接管；List 缩进、CodeBlock 或其它 feature 已消费的 `Tab` 保持原行为。`Shift+Tab` 不由 Quick Bar 接管。Quick Bar 不新增独立键盘快捷键。
- Quick Bar 通过键盘获得焦点时保留当前显示上下文；action 仍直接读取 editor state 中的 selection。简单 toolbar 模式使用 roving tabindex：仅一个 enabled control 为 `tabindex="0"`，其它为 `-1`；`ArrowLeft`/`ArrowRight` 跳过 disabled control 并循环导航，`Home`/`End` 移到首尾 enabled control，`Enter`/`Space` 执行。
- Quick Bar 的简单 toolbar 模式中，普通 `Tab` 不循环 roving controls，而是按浏览器顺序离开 Quick Bar；新焦点不被覆盖，`Shift+Tab` 同样返回前一个可聚焦元素。Link 输入态和子菜单使用各自正常的内部 Tab 顺序。Quick Bar 不形成焦点陷阱。
- Quick Bar 容器收到未被子组件消费的 `Escape` 时，聚焦 editor 并 dismiss 当前 Quick Bar；selection 或文档 transaction 改变后才重新允许显示。Link 编辑器使用表单的正常 Tab 顺序，不拦截输入框的左右方向键；“更多”打开时不改变焦点，用户通过正常 Tab 顺序进入菜单。高亮颜色和 CodeBlock 语言子菜单会先消费自己的 `Escape`，只关闭当前子菜单。
- `RichTextEditor` 对外作为一个组合控件：正文、顶部工具栏、Quick Bar 及其非模态子界面之间的焦点移动不触发组件对外的 `blur`，也不移除编辑器整体的 focus-within 样式；只有焦点离开整个组合控件时才触发 `blur`。
- Quick Bar 或子菜单持有 DOM 焦点时，Tiptap `editor.isFocused` 可以为 `false`，但 `editor.state.selection` 仍然存在并继续作为 action 目标。Quick Bar 由直接父组件挂到 `RichTextEditor` 根元素；其中的 Naive UI 子菜单使用 `to=false` 留在 Quick Bar 组件树内，两者都位于编辑器 DOM 边界中。
- 三个 Link 入口共享 range 解析、action 和 `LinkEditor`；每个 `LinkEditor` 实例维护自己的 URL 草稿。
- 所有 Image 入口的打开、确认、取消和异步结果处理由 `openImageDialog` 与 `ImageDialog` 定义；selection 结果沿用 insert/update action 的实际行为。
- CodeBlock Quick Bar 与顶部语言控件的当前 selection 解析、切换语言、关闭来源、焦点和 selection 行为全部由“CodeBlock 共享交互契约”定义。

### Slash command

- Slash 采用 Tiptap Suggestion 的 `startOfLine` 匹配和可编辑/selection 生命周期，适用于列表项、引用等嵌套 text block 与其它可匹配文本上下文；具体命令是否可用由包含 query 删除的完整 `can()` chain 决定。
- 直接输入、粘贴、editor command、Undo/Redo 或外部 `modelValue` 更新只要形成当前可匹配的 `/query`，都会由同一个 Suggestion 生命周期启动或同步面板。
- Slash 面板打开期间焦点始终留在 editor，editor DOM 临时设置指向 listbox 的 `aria-controls`、`aria-expanded` 和 `aria-activedescendant`；命令列表不抢占焦点。
- Slash renderer 先将命令列表挂到 `RichTextEditor` 根元素，再交给 Suggestion 管理定位与关闭；不挂到 `document.body`。
- 输入法处于 composition 状态时不处理命令面板快捷键。
- 查询使用命令标签、key 与 feature-local 固定关键词的大小写不敏感包含匹配，不支持拼音、首字母或模糊匹配。
- 查询没有任何匹配时保持面板打开，显示“无匹配命令”空状态且不设置 active option。方向键不执行操作，用户可通过 Backspace 修改查询并恢复匹配结果。此时 `Enter` 不被命令面板消费，由 editor 正常换行：原段落保留 `/query`，光标进入新段落，Suggestion 自然关闭。
- 查询不包含空格。composition 结束后输入第一个空格时，关闭命令面板并完整保留 `/query ` 文本，不删除查询、不自动执行 active option。composition 期间的空格不触发关闭。
- 存在 active option 时，`ArrowUp`/`ArrowDown` 移动 active option，`Enter` 执行；不存在 active option 时，`Enter` 交给 editor 正常处理。`Escape` 关闭并保留已输入文本，焦点继续留在 editor。`Tab` 保留已输入文本并关闭面板，但不消费按键事件，由浏览器将焦点移到下一个可聚焦元素。
- 命令的 active option、disabled、方向键、`Enter`、点击和执行失败行为统一按“Slash 命令列表契约”处理。所有匹配命令均 disabled 时不设置 active option，`Enter` 交给 editor 正常处理。
- 执行同步命令时，先创建包含 `deleteRange(/query)` 的 chain，再通过 `.command(command.command)` 组合块操作，最后只调用一次 `run()`。删除与 command 位于同一个 transaction，因此 Undo 恢复为一次操作，`update:modelValue` 也只观察到最终内容。
- Slash 命令的 enabled 状态使用 `editor.can().chain().deleteRange(/query).command(command.command).run()` 对完整操作做无 dispatch 模拟。
- 执行图片自定义命令时，先删除 `/query`，关闭命令面板并打开对话框；删除后的 editor selection 留在来源空段落中。
- `/图片` 对话框确认时调用共享 `insertImageAction`，由当前 editor selection 决定插入位置。
- 图片插入成功后，共享 `insertImageAction` 沿用 Tiptap `insertContent` 的正常结果，当前实现得到新图片的 Image NodeSelection 并聚焦 editor；不创建后继段落，也不把光标移入已有后继段落。
- 取消 `/图片` 对话框时保留来源空段落。
- `/图片` 明确形成两个 History 事件：第一次来自查询删除，第二次来自确认插图。确认后第一次 Undo 删除图片并恢复空段落，第二次 Undo 恢复 `/query`；取消后没有插图事件，一次 Undo 恢复 `/query`。顶部工具栏插入和编辑图片各自产生一个可单步 Undo 的内容 transaction。

## 错误处理

- 通用 action 使用 `canRunRichTextAction` 派生 disabled 状态；Slash 命令使用包含 query 删除的完整模拟 chain。disabled 命令不修改内容。
- 普通控件通过 `canRunRichTextAction` 派生 disabled 状态。ImageDialog 确认只有在 insert/update action 成功时关闭；Slash command 执行失败时保持 Suggestion 会话。
- 非法链接沿用现有 URL 规范化和输入 error 状态，不关闭链接编辑界面。
- 图片处理错误统一交给 preset 提供的 `onError`。
- Quick Bar 和 Slash 命令面板自身不发起服务端请求，不增加通用 `try/catch` 或 fallback。
- Link 输入使用打开时解析的明确 range；Image、CodeBlock 和其它 UI 在操作时读取当前 editor state。ImageDialog 关闭后仍在进行的上传结果会被忽略。

## 可访问性与定位

- Quick Bar 使用 `role="toolbar"` 和中文 `aria-label`，按钮提供 `aria-label`、active 和 disabled 状态。editor 中未被消费的普通 `Tab` 可进入；简单 controls 使用 roving tabindex 与左右方向键/Home/End 导航，`Tab`/`Shift+Tab` 正常离开；Link 输入态和子菜单使用各自的表单/menu 焦点语义。
- 命令列表使用 listbox/option 语义，通过 `aria-activedescendant` 与持有焦点的 editor 建立 ARIA 关联。
- Link 输入、颜色面板、语言列表、图片对话框和命令列表均支持 `Escape` 关闭，并按局部组件语义把焦点交还 editor 或自身 trigger；点击外部关闭时不覆盖点击产生的新焦点。
- BubbleMenu 和 Slash Suggestion 使用 Tiptap/Floating UI 的定位能力，避免遮挡当前选区并适应编辑器边缘。
- 不拦截浏览器原生右键、复制、粘贴或拼写检查行为。

## Public API 与跨端边界

- `RichTextEditor` props 不变。
- 应用层继续从内置入口选择 `compactRichTextEditorPreset` 或调用 `createAllRichTextEditorPreset`。
- 不公开 Quick Bar、Slash command config、内部 helper 或自定义组件入口。
- `core`、`schema`、`server` 不依赖 Vue menu 或 Suggestion UI。
- 富文本 JSON schema、server preset、HTML 输出和 sanitize policy 不变，无数据迁移。

## 测试

### Preset 与模型

- 校验 Quick Bar、Feature Quick Bar 和 Slash command 不能引用 preset 未启用的 feature。
- 校验 `compact` 包含基础块与列表 Slash command，且不引用未启用的 feature。
- 校验 `all` 包含约定的 Quick Bar 上下文，以及基础块、列表和插入命令分组。

### Quick Bar

- 验证 Image、Link、CodeBlock、普通文字的上下文优先级，任意时刻只渲染一个模式。
- 验证普通文字 Quick Bar 支持跨段落、标题、列表项和引用的纯文字选区；跨 CodeBlock 选区或包含原子节点的选区不显示 Quick Bar。
- 验证跨 text block 的普通文字选区中 Link control 为 disabled，其它行内格式仍可用；单一 text block 选区可创建或编辑链接。
- 验证 `compact/all` 的普通文字 controls 和“更多”菜单内容。
- 验证 Quick Bar 与顶部工具栏直接复用同一 `HighlightControl`，按钮不直接应用默认色，并正确展示单色、混合色、部分高亮与清除状态；顶部折叠光标正确设置或清除 stored mark。验证选择颜色或清除后面板关闭，disabled 时不执行；`Escape` 只关闭颜色面板并聚焦 trigger。
- 验证 action active/disabled 状态以及执行后选区保持。
- 验证未被 editor keymap 消费的普通 `Tab` 在 Quick Bar 可用时优先聚焦可见的 active enabled control、否则首个 enabled control；已消费的 `Tab`、composition、`Shift+Tab`、Quick Bar 隐藏/抑制或全 disabled 时保持原行为。验证没有独立 Quick Bar 快捷键。验证 Quick Bar roving tabindex、跳过 disabled control、循环方向键、Home/End、Enter/Space、Escape 聚焦 editor，`Tab`/`Shift+Tab` 正常离开且不形成焦点陷阱，以及 Link 输入和子菜单的焦点进出。
- 验证正文、Quick Bar control、“更多”菜单、Link 输入和顶部非模态浮层之间的焦点移动不触发 `RichTextEditor` 的 `blur`，从任一内部焦点离开整个组件时只触发一次 `blur`。验证子菜单获得焦点时编辑器根容器仍匹配 focus-within。
- 验证折叠光标进入 Link Quick Bar，任何非空链接文字选区进入普通文字 Quick Bar，并且 Link 文字格式只作用于实际选区。验证关闭 `enableClickSelection` 后单击链接放置光标而不整段选中。
- 验证折叠光标在链接内部、链接与普通文字边界时解析唯一连续 link range，两个不同 `href` 的相邻链接边界与仅有 stored mark 时不显示 Link Quick Bar。
- 验证 Link Quick Bar 直接渲染共享 URL editor 且不抢焦点；应用、移除或取消后 dismiss，selection 或文档上下文变化后可重新出现。验证移动到另一个链接时创建新的编辑实例，不沿用旧草稿。
- 验证三个 Link 入口都显示输入框、应用、新窗口打开和显式取消；打开按钮只对合法非空草稿 enabled 且不关闭编辑器。range 内存在实际 Link marks 时显示并正确执行“移除链接”，纯普通文字与 stored mark range 不显示。
- 验证 `resolveLinkRange` 合并相邻同 URL 文本节点；折叠光标和单一连续链接选区解析完整 link range，普通或混合文字选区保留精确 range，跨块或包含 inline atom 时返回 `null`。
- 验证段落开头和结尾的 `ArrowLeft`/`ArrowRight` 对称退出 Link stored mark，不插入空格或修改原链接内容。
- 验证 Link action 只修改明确 range，应用非空/空 URL 或移除链接后 selection 保持不变；普通折叠光标通过零长度 range 设置或清除 stored mark。
- 验证顶部与普通文字 Quick Bar 使用同一个点击触发 `LinkControl`，只在点击后打开；再次点击、显式取消、`Escape` 和点击外部都放弃未应用草稿，并分别遵循 editor/外部焦点语义。
- 验证 Quick Bar 在 editor 或内部持有焦点时显示，焦点进入外部 trigger 或 ImageDialog 后隐藏；返回 editor 后按当前 selection 恢复。验证“更多”等局部子菜单在 Quick Bar 隐藏后同步关闭。
- 验证所有 ImageDialog 入口使用当前 selection，编辑时只将当前图片用作表单初值；取消时不修改文档并恢复焦点，action 失败时保持对话框打开。
- 验证顶部 ImageToolbarControl 对 Image NodeSelection 执行编辑，其它 selection 执行插入，并沿用 Tiptap 的 selection 替换语义。
- 验证 Image Quick Bar 与顶部工具栏都没有专用删除 control；Image NodeSelection 的原生 `Backspace`/`Delete`、History 和 selection 映射无回归，图片是唯一内容时得到可继续输入的空正文段落。另验证上传错误回调。
- 验证顶部工具栏、Image Quick Bar 和 `/图片` 共享 `openImageDialog`、ImageDialog 与 actions：插入沿用 Tiptap 的 selection 替换结果并得到新图片 NodeSelection，编辑只更新当前图片属性并保留 NodeSelection；两者都保持 Tiptap 命令产生的文档结构，并可单步 Undo。`/图片` 的查询删除按 Slash command 测试中的独立 History 规则验证。
- 验证顶部 CodeBlock 按钮创建 CodeBlock，并可在 active 状态下转为正文；CodeBlock Quick Bar 不提供该重复操作。
- 验证折叠光标和非空选区完全位于单个 CodeBlock 时，顶部与 Quick Bar 复用的语言控件都可用并指向同一块；跨 CodeBlock 或跨其它块时，顶部语言控件 disabled 且 CodeBlock Quick Bar 不显示。验证 Quick Bar 显示当前语言并锚定代码块右上方，未知但合法的语言显示原始标识；验证切换语言后不额外移动 selection，并且 `Escape` 只关闭所属 editor 的语言列表。
- 验证 editor disabled、上下文变化时的隐藏行为，以及 `pointer: coarse` 条件下所有 Quick Bar 均隐藏。

### Slash 命令面板

- 验证可编辑的当前顶层空段落显示 Slash 提示，输入内容、进入嵌套段落或禁用 editor 后隐藏，且提示不进入文档内容。
- 验证 Slash 命令列表挂在 `RichTextEditor` 根元素内，打开期间 editor 保持焦点并具有正确的 ARIA 关联。
- 验证三个命令分组及其固定顺序，查询后隐藏空分组且键盘可跨分组连续导航。
- 验证 Suggestion 的 `startOfLine` 与折叠 selection 行为覆盖嵌套 text block；验证直接输入、粘贴、editor command 和匹配的外部内容替换通过同一生命周期启动或同步菜单。验证中文标签、key 与固定中英文额外关键词的大小写不敏感包含匹配、不匹配拼音、无结果空状态与 Backspace 恢复；查询变化时保留仍然有效的 active option，只在失效时回到首个 enabled 结果。另验证无 active option 时 `Enter` 正常换行、IME composition、空格关闭面板但保留全部文本，以及 `Tab` 关闭后继续浏览器默认焦点导航。
- 验证 disabled、初始 active option、循环导航、点击和执行失败行为；没有 active option 时 `Enter` 交给 editor。验证 Slash 的 enabled 状态从包含 query 删除的完整模拟 chain 计算。
- 验证同步命令在一个 transaction 中删除查询文本并执行块操作，只触发一次内容更新且可单步 Undo。
- 验证图片自定义命令删除查询文本并通过 `openImageDialog` 打开对话框；确认时按当前 selection 插入，取消时留下空段落。验证 `/图片` 确认后需要两次 Undo 依次撤销插图和查询删除，取消后一次 Undo 恢复查询；顶部插入和图片编辑仍各自单步 Undo。
- 验证 feature 未启用的命令不会进入 preset，完整 Slash 模拟 chain 返回 false 的命令显示 disabled。

### 回归与验证

- 未在本设计中明确调整的顶部工具栏布局、active/disabled 状态和复杂控件行为无回归；Link、Highlight、Image、CodeBlock 按各自共享组件与 action 契约验证新行为。
- 原生 `contextmenu` 不被拦截。
- 现有 server、schema、sanitize 和导入边界测试继续通过。
- 定向运行 `@rev30/rich-text` 测试与 typecheck，最终运行完整 `pnpm check`。

## 验收标准

- 顶部工具栏保持完整主入口，用户可忽略 Quick Bar 而完成现有任务。
- `compact` 增加普通文字与 Link Quick Bar，以及基础块和列表 Slash command。
- `all` 增加普通文字、Link、Image、CodeBlock Quick Bar，以及完整 Slash command。
- 任意时刻最多显示一种 Quick Bar 上下文和一个 Slash 命令面板。焦点离开 editor/Quick Bar 进入顶部浮层或 modal 时，Quick Bar 自然隐藏。
- 所有上下文操作通过 feature action 或共享的复杂 UI 执行。
- 不新增自定义右键菜单、公开配置 API、移动端专属界面或服务端行为。
- 无数据迁移，现有富文本内容继续正常编辑、派生和展示。

## 预期改动范围

主要改动位于：

- `packages/rich-text/src/vue/RichTextEditor.vue`。
- `packages/rich-text/src/vue/toolbar/` 的复杂 control 协调接入。
- `packages/rich-text/src/vue/presets/compact.ts` 与 `all.ts`。
- 新增内部 `vue/quick-bar/` 与 `vue/slash-menu/` 模块。
- `editor/action.ts` 与各 feature action。
- Link、Highlight、Image、CodeBlock 现有 feature 的 Vue UI，以及 Image 插入与编辑各自的 selection 行为。
- `vue/slash-menu/` 交互逻辑、Suggestion renderer 及两个 Vue preset 的命令配置。
- `packages/rich-text/package.json`、workspace lockfile 和相关测试。
- 如 README 的富文本能力概览不再准确，随实现同步更新对应说明。

本设计不要求修改 `apps/server`、`packages/contracts` 或数据库 schema。
