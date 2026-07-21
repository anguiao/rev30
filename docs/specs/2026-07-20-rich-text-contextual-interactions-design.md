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

本设计采用“分层上下文交互”，在保留顶部工具栏主入口地位的前提下，为不同 preset 增加 Quickbar 和 Slash 命令面板。自定义右键菜单不在范围内。

## 目标

- 保留顶部工具栏作为完整、稳定、可发现的主入口。
- 为 `compact` 和 `all` 提供按 feature 过滤的高频文字与链接 Quickbar。
- 为 `all` 提供图片和代码块 Quickbar。
- 为 `all` 提供 Slash command 入口。
- 复用现有 `RichTextAction`、图片对话框、链接校验和代码语言选项，不复制业务行为。
- 延续 feature-first 目录结构，具体 feature 的专属 UI 仍归属于对应 feature。
- 保持应用层 API 收敛，业务方继续只选择内置 preset。
- 保持存储、服务端派生和 sanitize 行为不变。

## 非目标

本阶段不实现：

- 自定义右键 Context Menu，或拦截浏览器原生 `contextmenu`。
- 用 Quickbar 替代或缩减顶部工具栏。
- Notion 式块侧栏、拖拽手柄、块排序或完整块编辑工作台。
- 移动端专属底部工具栏或触屏专属交互。
- 业务方自定义 Quickbar、Slash command、菜单组件、slot 或公开内部 DSL。
- TextStyle 的字体、字号、文字颜色和行高 Quickbar；这些能力继续留在顶部工具栏。
- Heading、List、Blockquote、TextAlign 或 HorizontalRule 的对象 Quickbar。
- 新增表格、Mention、Emoji、媒体、复制代码、下载代码等内容能力。
- 修改富文本 JSON schema、服务端 preset、HTML 派生或 sanitize policy。

## 术语

- **顶部工具栏**：编辑器顶部始终存在的完整主入口。
- **Quickbar**：跟随当前选区或内容上下文定位的浮动操作条。
- **普通文字 Quickbar**：非空文字选区的通用行内格式操作。
- **Feature Quickbar**：由 Link、Image、CodeBlock 等 feature 提供的专属上下文界面。
- **Slash 命令面板**：由 `/` 触发，用于块类型转换和块内容插入的命令列表。
- **对象上下文**：用户视为独立可操作对象的内容；既包括 Image node，也包括 Link mark 和 CodeBlock text block。

## 产品决策

### Preset 能力矩阵

| 交互面 | `compact` | `all` |
| --- | --- | --- |
| 顶部工具栏 | 保留完整主入口，并与可用 Quickbar feature 共享交互契约 | 保留完整主入口，并与可用 Quickbar feature 共享交互契约 |
| 普通文字 Quickbar | 加粗、斜体、创建/编辑链接 | 加粗、斜体、下划线、高亮、创建/编辑链接；“更多”包含删除线、行内代码、清除格式 |
| Link Quickbar | 只读链接地址、编辑、新窗口打开、移除链接 | 只读链接地址、编辑、新窗口打开、移除链接 |
| Image Quickbar | 无 | 编辑图片 |
| CodeBlock Quickbar | 无 | 代码语言 |
| Slash 命令面板 | 无 | `/` 触发 |
| 自定义右键菜单 | 无 | 无 |

顶部普通按钮与 Quickbar 可以同时反映 active/disabled 状态，但任意时刻只显示一种 Quickbar 上下文。任意顶部工具栏 popover、dropdown 或 dialog 都与 Quickbar 互斥，不能同时显示。

### Quickbar 上下文优先级

Quickbar 按以下顺序选择第一个匹配的上下文：

1. Image NodeSelection。
2. 折叠光标位于一个具有唯一 `href` 的连续 Link mark 内。
3. 光标或选区位于一个 CodeBlock 内。
4. 非空普通文字选区。
5. 不显示。

任何非空纯文字选区都不进入 Link Quickbar：即使选区完全位于同一链接内，也显示普通文字 Quickbar，使加粗、斜体、下划线和高亮等只作用于实际选中文字。选区跨越多个链接、多个 `href` 或链接与普通文字时同样显示普通文字 Quickbar。纯文字选区可以跨越段落、标题、列表项和引用。

Link Quickbar 是否出现、普通文字 Quickbar 的 Link control 模式与 disabled 状态，都由后文“Link 共享交互契约”的同一目标解析器派生。这里不另行定义目标或提交语义。

选区完全位于单个 CodeBlock 时显示 CodeBlock Quickbar；选区跨越 CodeBlock 与其它块时不显示任何 Quickbar。普通选区包含 Image、HorizontalRule 等原子节点时也不显示 Quickbar；只有精确的 Image NodeSelection 进入 Image Quickbar。这避免展示只对部分选区有效的操作。

editor 禁用或上下文失效时不显示 Quickbar。主要输入设备匹配 `pointer: coarse` 的粗指针环境下隐藏全部 Quickbar，继续使用现有顶部工具栏；该规则不影响 Slash command。本阶段不提供移动端专属替代界面。

### Slash 命令范围

Slash 命令面板只属于 `all`，包含：

- 正文。
- 一级、二级、三级标题。
- 无序列表、有序列表。
- 引用。
- 代码块。
- 分割线。
- 图片。

当 editor 可编辑且光标位于顶层空段落时，该段落显示“开始输入，或按 / 唤起命令”的非交互提示，明确直接输入与 Slash command 都可用。提示不占据布局，不写入文档内容；输入内容、离开该段落或 editor 禁用后立即消失。嵌套段落不显示提示，因为它们不能触发 Slash 命令。

面板不包含行内格式、TextStyle、TextAlign、History、SearchReplace 或 CharacterCount。

命令按固定顺序分为三组：

1. **基础块**：正文、一级标题、二级标题、三级标题、引用。
2. **列表**：无序列表、有序列表。
3. **插入**：代码块、分割线、图片。

查询过滤后隐藏没有命令的空分组，但不重排剩余命令；键盘上下导航跨分组连续移动，分组标题不可选中。

查询在命令的中文标签与以下固定关键词中做大小写不敏感的包含匹配：

| 命令 | 额外关键词 |
| --- | --- |
| 正文 | 段落、`paragraph`、`text` |
| 一级标题 | 标题1、`h1`、`heading1` |
| 二级标题 | 标题2、`h2`、`heading2` |
| 三级标题 | 标题3、`h3`、`heading3` |
| 引用 | `quote`、`blockquote` |
| 无序列表 | 项目符号、`bullet`、`unordered`、`ul` |
| 有序列表 | 编号列表、`numbered`、`ordered`、`ol` |
| 代码块 | 代码、`code`、`codeblock` |
| 分割线 | 横线、`divider`、`separator`、`horizontalrule`、`hr` |
| 图片 | `image`、`img`、`picture` |

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
  readonly quickbar?: RichTextQuickbarConfig
  readonly slashCommand?: RichTextSlashCommandConfig
  readonly host?: Component
}
```

- `compactRichTextEditorPreset` 配置 `quickbar`，不配置 `slashCommand`。
- `createAllRichTextEditorPreset` 同时配置 `quickbar` 和 `slashCommand`。
- `defineRichTextEditorPreset` 校验 Quickbar control、Feature Quickbar 和 Slash command 引用的 feature 已存在于 preset，且具有对应 editor implementation；同时拒绝 Quickbar 中重复的 feature 或 key。
- 配置与 helper 保持包内部使用，不从 `@rev30/rich-text/vue` 或 preset public entry 导出。

Quickbar 配置显式区分普通文字 controls 与 feature component：

```ts
interface RichTextQuickbarConfig {
  readonly text?: RichTextQuickbarControlsConfig
  readonly features: readonly RichTextFeatureQuickbarConfig[]
}

interface RichTextQuickbarControlsConfig {
  readonly primary: readonly RichTextQuickbarControl[]
  readonly more: readonly RichTextQuickbarControl[]
}

type RichTextQuickbarControl =
  | {
      readonly type: 'action'
      readonly item: RichTextActionItem
    }
  | {
      readonly type: 'component'
      readonly feature: RichTextFeature
      readonly key: string
      readonly component: Component
      readonly props: Readonly<Record<string, unknown>>
    }

interface RichTextFeatureQuickbarConfig {
  readonly feature: RichTextFeature
  readonly key: string
  readonly isActive: (editor: Editor) => boolean
  readonly getReferenceElement?: (editor: Editor) => HTMLElement | null
  readonly referenceAlignment?: 'end'
  readonly component: Component
  readonly props: Readonly<Record<string, unknown>>
}
```

`RichTextQuickbar` 按 `features` 数组的声明顺序匹配第一个 active feature component；都不匹配时，才根据非空文字选区渲染 `text` controls。数组顺序是唯一的优先级来源，内置 preset 依次声明 Image、Link、CodeBlock，不提供额外数字优先级、自动扫描或全局注册。

Feature Quickbar component 由容器统一注入 `editor` 和 `disabled`，配置中的 `props` 只承载颜色、语言和上传回调等 feature-specific 选项。组件在配置阶段使用与现有 toolbar component control 相同的 `markRaw` 处理。默认定位仍以 selection 为 reference；块级对象可以提供自身 DOM reference，并通过 `referenceAlignment: 'end'` 与其右边缘对齐。

`RichTextEditor` 在组件树内通过 provide/inject 提供轻量 overlay 状态，包含本地 overlay host、滚动容器、当前顶部临时层和 Quickbar 关闭回调，不按 editor 建立 service、registry 或 WeakMap，也不纳入 preset 或 public API。顶部 popover、dropdown 或 dialog 打开时登记自身引用，使唯一 BubbleMenu 不渲染任何 Quickbar 上下文；关闭或组件卸载时只清除与自身引用相同的 active overlay，随后从当前 selection 重新计算 Quickbar。纯 UI 开关不派发 ProseMirror transaction。

需要独立于具体 toolbar、Quickbar 或 Slash command 持续存在的 feature UI，通过 `host` 显式挂载在 `RichTextEditor` 层。当前唯一的 host 是共享 `ImageDialogHost`：各入口只向同一 dialog controller 提交 session，不在某个工具栏按钮内部暗藏对话框生命周期。

图片 dialog session 只保存 owner、明确目标和 options，不保存 toolbar、Quickbar 或 Slash 等来源标签。插入 selection、插入 anchor 与编辑 node 的差异由目标类型表达；History 等提交行为同样从目标类型派生。

### Surface-neutral action item

现有 action 在 `run` 内各自创建并提交 Tiptap chain，无法与删除 slash query 组成严格的单一 transaction。`RichTextAction` 改为只保留一个 Tiptap `Command` factory 作为行为定义：

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
- `runRichTextAction(editor, action, ...arguments_)` 通过 `editor.commands.command(action.command(...arguments_))` 立即执行。Toolbar、Quickbar 和现有 feature UI 统一使用该 helper，不再调用 `action.run`。
- `canRunRichTextAction(editor, action, ...arguments_)` 通过 `editor.can().command(action.command(...arguments_))` 从同一命令派生可执行状态，不再为 action 维护独立 `canRun`。
- 需要聚焦 editor 的 action 在自身 command 内通过 `chain().focus()` 表达；SearchReplace 输入等不应抢占焦点的 action 不添加 `focus()`。
- SearchReplace 等 plugin action 改为在传入的 `tr` 上设置 meta、selection 和内容变更，不再自行创建并 dispatch transaction。打开图片对话框、调用 `window.open` 等纯 UI 行为不属于 `RichTextAction`，继续由 surface-specific UI command/wrapper 负责。
- Slash command 直接通过 Tiptap chain 的 `.command(action.command(...arguments_))` 组合同一 action，不需要额外 adapter 或可组合 action 变体。

当前 `RichTextToolbarItem` 同时承载 `RichTextAction`、标签和图标。为避免 Quickbar 依赖 toolbar 命名，提取内部的 surface-neutral action item：

```ts
type RichTextActionItemAction = RichTextAction<RichTextFeature, string, []>

interface RichTextActionItem<Action extends RichTextActionItemAction = RichTextActionItemAction> {
  readonly action: Action
  readonly label: string
  readonly icon: RichTextIconClass
}
```

Toolbar、普通文字 Quickbar 和 Slash command 可以引用同一个无参数 action item。需要 URL、颜色、语言等参数的 action 继续由 feature component 或 UI command 包装。Toolbar 的 button、dropdown、component control 仍保持 toolbar-specific；不新增自动注册的全局 surface registry。

复杂 UI 可以拥有 surface-specific 组件，但必须复用 feature 的 action、校验函数、选项和内部子组件，不复制命令逻辑。

顶部工具栏与 Quickbar 对同一 feature 默认共享目标解析、校验、应用/取消、关闭来源、焦点恢复和目标失效语义。只在 surface 的触发意图或布局约束冲突时允许分化，并在 preset/component 层明确记录；已确定的 Link 分化只是顶部按钮因用户主动点击而直接进入 URL 输入态，Link Quickbar 自动出现时先进入只读展示态。

任何 Link 输入、Highlight 面板、CodeBlock 语言列表或 ImageDialog 固定目标后，若发生并非由当前 surface 提交的外部 `docChanged` transaction，统一将目标视为失效：关闭当前子界面、放弃草稿且不修改其它内容，不恢复旧 selection，也不覆盖当前新焦点。仅 selection 或 plugin meta 变化不算内容失效；显式取消、点击外部和成功提交仍使用各自契约，而不是目标失效路径。

#### 顶部临时操作层互斥契约

- 顶部临时操作层完整包含：SearchReplace popover、Link 输入、Highlight 颜色面板、TextStyle 的文字颜色/字体/字号/行高面板、Heading/TextAlign/List 通用 dropdown、CodeBlock 语言列表和 ImageDialog。无论由顶部按钮还是现有 SearchReplace 快捷键打开，都必须登记为当前顶部临时层。顶部普通 action button 不是临时操作层，不抑制 Quickbar。
- 打开顶部临时操作层前，当前 Quickbar 子界面先按“点击外部”关闭：未应用草稿丢弃，该次顶部触发产生的新焦点不被覆盖。随后将新浮层设为 active overlay，并隐藏整个 Quickbar；不会把 Quickbar 草稿传递给顶部 control。
- 同一 `RichTextEditor` 组件树内任意时刻只允许一个顶部临时操作层。打开新的顶部临时层时，已有顶部临时层按点击外部规则关闭，再由新浮层接管。关闭操作按对象引用比对，旧组件的延迟关闭或卸载不能清除后来打开的浮层状态。
- 顶部临时层的成功、显式取消、`Escape`、点击外部和目标失效仍分别遵循对应 feature 契约。所有关闭路径和组件卸载都必须清除自身登记；没有 active overlay 后按当前 selection 重新计算 Quickbar，不无条件恢复旧上下文。
- Quickbar 自身的只读 toolbar、输入态或子菜单属于同一个 Quickbar 层，不互相计为多个临时操作层。

#### Link 共享交互契约

三个 Link surface 使用同一目标解析器和 URL editor 内核，差异只如下：

| Surface | 触发 | 可用目标 | 初始界面 |
| --- | --- | --- | --- |
| Link Quickbar | 折叠光标进入唯一连续链接时自动出现 | 完整 link range | 只读地址与编辑、新窗口打开、移除操作；点击编辑后进入 URL 输入态 |
| 普通文字 Quickbar Link control | 用户在非空文字 Quickbar 点击 Link control | 单块的完整 link range、精确普通选区或精确混合选区；跨块时 disabled | 直接进入编辑、创建或设置 URL 输入态 |
| 顶部 LinkToolbarControl | 用户点击顶部 Link 按钮 | 上述单块目标，以及用于 stored link mark 的普通折叠光标；跨块时 disabled | 直接进入 URL 输入态 |

共享目标解析器必须完整区分以下模式：

- 折叠光标位于链接文字内部，或位于链接与普通文字的边界时，解析唯一相邻链接的完整连续 link range，进入编辑模式。光标恰好位于两个不同 `href` 的相邻链接之间时不推测目标；Link Quickbar 不显示，顶部 Link control 按普通折叠光标处理。只有 stored link mark、附近没有实际链接文字时，不视为已有 Link 对象。
- 非空选区完全位于一个具有唯一 `href` 的连续 Link mark 内时，解析该完整连续 link range，进入编辑模式；文字格式 action 仍只作用于用户的实际选区。
- 单一 text block 内的纯普通文字选区保留精确 text range，进入创建模式。
- 单一 text block 内混合普通文字与一个或多个已有链接，或包含多个 link range/`href` 时，保留精确 text range，进入设置模式且不预填 URL。应用非空 URL 时，先移除实际选区内原 Link marks，再将同一 URL 应用于实际选区；不扩展到选区外，部分选中旧链接时允许在选区边界拆分 link range。
- 跨越多个 text block 的选区不解析为 Link 目标。普通文字 Quickbar 仍显示，但 Link control disabled；顶部 Link control 同样 disabled；其它行内格式继续可用。
- 不在实际链接内的折叠光标只供顶部 Link control 使用，进入 stored mark 模式。Link Quickbar 不显示，普通文字 Quickbar 也不存在折叠选区入口。

URL 输入态的共享状态机为：

- 三个 URL 输入态使用同一组控件：URL 输入框、“应用”、“新窗口打开”和显式“取消”。“新窗口打开”只在当前草稿可规范化为受支持的非空 URL 时 enabled，并打开草稿 URL；不关闭输入层。
- 当命令目标内实际存在 Link mark 时，同时显示“移除链接”：编辑模式移除完整 link range，混合设置模式只移除精确 text range 内已有的 Link marks。纯普通文字创建模式和只有 stored link mark 的折叠模式不显示该按钮；后者仍可通过空 URL 应用清除 stored mark。
- 进入时分别保存“命令目标”和“原 selection”。命令目标可以是为编辑完整链接而扩展的 link range，最终 selection 始终以用户打开输入前的原 selection 为准。编辑单一链接时预填原 URL；创建、设置或 stored mark 模式不预填 URL。
- 应用受支持的非空 URL 时，恢复目标并通过共享 action 提交。以空 URL 应用时，编辑/设置模式移除目标内 Link marks，创建模式不修改文档，stored mark 模式清除 stored link mark。以上都是成功应用。
- 任何成功应用都在同一个 transaction 中完成 Link mark 变更并恢复经 transaction 映射后的原 selection，然后关闭 URL 输入层、聚焦 editor，并按该 selection 重新计算上下文。链接内原折叠光标重新进入只读 Link Quickbar；原非空选区保持其精确范围并进入普通文字 Quickbar；普通折叠光标仍无 Quickbar。顶部工具栏回到 Link 按钮。
- 非法 URL 保持输入层打开、保留草稿并显示现有 error 状态，不修改文档。
- Link Quickbar 只读态的“新窗口打开”同样不修改文档、不关闭当前界面。只读态或输入态的“移除链接”都提交 unlink；在同一个 transaction 中恢复经映射的原 selection，成功后关闭输入层或只读 Link Quickbar，再按新上下文重新计算。
- 显式取消或 `Escape` 放弃草稿，恢复原 selection 与 editor 焦点。点击外部放弃草稿并保留该次点击产生的新焦点。目标失效时关闭并放弃草稿，不恢复旧 selection、不覆盖当前新焦点。
- 顶部 Link 输入按“顶部临时操作层互斥契约”接管并抑制 Quickbar。Quickbar 向顶部输入转移时不传递未应用草稿，顶部输入从原始文档值重新初始化。

#### Image 共享交互契约

所有图片入口复用同一个 `ImageDialog`、目标管理器和 insert/update action，入口差异只如下：

| Surface | 触发 | 保存目标 | 操作 |
| --- | --- | --- | --- |
| 顶部 ImageToolbarControl | 用户点击 enabled 的顶部图片按钮 | 折叠文字 selection；或 Image NodeSelection 的图片位置与原属性 | 插入或编辑；其它非空 selection 时 disabled |
| Image Quickbar | 精确的 Image NodeSelection 自动出现后，用户点击编辑 | 图片位置与原属性 | 编辑 |
| `/图片` | 用户执行图片命令 | 删除 `/query` 后留下的顶层空段落位置 | 插入 |

共享状态机为：

- 打开对话框前固定表格中的明确目标和原 selection；输入焦点、对话框焦点或后续 editor selection 变化不改变操作目标。
- 顶部 ImageToolbarControl 只在折叠文字 selection 时提供插入，在 Image NodeSelection 时提供编辑；TextSelection 非折叠、其它 NodeSelection 或 AllSelection 时 disabled，不打开对话框，也不以图片替换选中内容。
- 确认时恢复并验证目标。插入模式要求保存的折叠 selection 或顶层空段落仍可用于原插入操作；编辑模式要求原位置仍是属性匹配的同一 Image node。验证成功后分别调用共享 `insertImageAction` 或 `updateImageAction`。
- 插入和编辑成功后都关闭对话框，将 selection 设为结果图片的 Image NodeSelection 并聚焦 editor，再按该 selection 重新计算上下文；允许显示 Quickbar 的环境会因此显示 Image Quickbar。任何入口都不自动创建图片后的正文段落，也不把光标移动到图片后的已有段落。
- 从顶部工具栏打开的 ImageDialog 按“顶部临时操作层互斥契约”抑制 Quickbar。从 Image Quickbar 打开时，对话框作为当前 Quickbar 层的子界面替代可见浮条，关闭后再按 selection 重新计算；从 `/图片` 打开前先关闭 Slash 命令面板。后两种来源都不登记为顶部临时层。
- 取消、`Escape` 或 modal 关闭控件都按显式取消处理：放弃草稿，恢复原 selection 与 editor 焦点。
- 对话框打开期间发生统一规则所述的外部 `docChanged` transaction，或确认时 selection、锚点、节点位置、节点类型或原图片属性不再匹配时，目标失效：关闭对话框，不插入或修改其它内容，不恢复旧 selection，也不覆盖当前新焦点。
- 上传和图片处理错误继续调用 preset 的 `onError`。目标失效或对话框关闭后，无法取消的上传 Promise 可以继续 settle，但其结果必须被忽略。
- Image Quickbar 与顶部工具栏都不提供专用删除按钮或自定义删除 action。Image NodeSelection 继续使用 Tiptap/ProseMirror 原生 `Backspace` 与 `Delete`；删除、selection 映射和 History 沿用编辑器原生行为。图片是文档唯一内容时，schema 的原生删除结果为一个空正文段落和其中的折叠 TextSelection，editor 保持可继续输入。

#### CodeBlock 共享交互契约

顶部 CodeBlockToolbarControl 与 CodeBlock Quickbar 共享同一个 CodeBlock 目标解析器、语言选项和 action：

| Surface | CodeBlock 内的操作 | Surface 特有能力 |
| --- | --- | --- |
| 顶部 CodeBlockToolbarControl | 切换语言；active 的代码块按钮转为正文 | 在非 CodeBlock selection 上用代码块按钮创建 CodeBlock |
| CodeBlock Quickbar | 切换语言 | 仅作为已有 CodeBlock 的自动上下文界面 |

- 折叠光标或非空选区完全位于同一个 CodeBlock 时，解析该 CodeBlock 及原 selection 为共享目标；顶部语言控件 enabled，CodeBlock Quickbar 显示。选区跨越多个 CodeBlock，或跨越 CodeBlock 与其它块时，不解析 CodeBlock 目标：顶部语言控件 disabled，且不显示 CodeBlock Quickbar。
- 两个 surface 使用同一组固定语言选项和 `setCodeBlockLanguageAction`；“纯文本”映射为 `null`，其它选项写入各自规范化 value。当前语言在两个 surface 中使用相同 active 状态和标签。
- CodeBlock Quickbar 只显示使用 `small` 尺寸的当前语言与下拉箭头，不提供“转为正文”；该低频操作仍可通过顶部 active 的代码块按钮完成。
- CodeBlock Quickbar 的显示条件由 selection 决定，但定位锚点是当前 CodeBlock 的 DOM 节点。浮层默认位于代码块上方，右边缘对齐并保持 `4px` 间距；光标在同一代码块内移动时位置不变，上方空间不足时翻转到代码块下方并保持右对齐。
- 打开语言列表时固定 CodeBlock 目标与原 selection。选择语言前验证目标仍是同一个 CodeBlock；成功后关闭列表，保留原 selection 并聚焦 editor。目标失效时关闭列表，不修改其它块；`Escape` 关闭时恢复原 selection 与 editor 焦点，点击外部关闭时保留该次点击产生的新焦点。
- 顶部语言列表按“顶部临时操作层互斥契约”抑制 Quickbar；Quickbar 内的语言列表属于当前 Quickbar 层。

#### Highlight 共享交互契约

顶部 HighlightToolbarControl 与普通文字 Quickbar 复用同一个颜色 control、固定颜色选项和 highlight actions：

| Surface | 目标 | Surface 特有能力 |
| --- | --- | --- |
| 顶部 HighlightToolbarControl | 当前 selection | 折叠光标时设置或清除 stored highlight mark |
| 普通文字 Quickbar | 触发 Quickbar 的精确非空文字 selection | 无折叠光标入口 |

- 两个 surface 都只提供黄、绿、蓝、粉四色和“清除高亮”，点击主按钮只打开颜色面板，不直接切换默认色，也不记录最近使用色。
- 目标只有一种已支持高亮色时，主 action 与对应颜色同时 active；目标包含多种高亮色时，主 action active，但不选中任一颜色；没有高亮时两者都不 active。顶部折叠光标从当前 stored mark 派生同一状态。
- 打开颜色面板时保存原 selection；Quickbar 同时固定其显示和 action 目标。选择颜色或“清除高亮”成功后立即关闭面板，保留原 selection、聚焦 editor，并重新计算 active 状态。disabled 或 action 返回 false 时不修改内容，也不关闭面板。
- 顶部颜色面板按“顶部临时操作层互斥契约”抑制 Quickbar；Quickbar 内的颜色面板属于当前 Quickbar 层。
- `Escape` 关闭面板并恢复原 selection 与 editor 焦点；点击外部关闭面板并保留该次点击产生的新焦点。关闭时没有需要保留的颜色草稿。

### Quickbar 组件

目录与职责：

```text
packages/rich-text/src/
├── vue/
│   ├── quickbar.ts
│   └── quickbar/
│       ├── RichTextQuickbar.vue
│       └── RichTextQuickbarControls.vue
└── features/
    ├── link/vue/LinkQuickbar.vue
    ├── image/vue/ImageQuickbar.vue
    └── code-block/vue/CodeBlockQuickbar.vue
```

- `quickbar.ts` 定义内部配置类型、helper 和 feature 校验入口。
- `RichTextQuickbar.vue` 是唯一的 Tiptap `BubbleMenu`，解析当前上下文并渲染普通 controls 或当前 feature component。
- `RichTextQuickbarControls.vue` 只负责渲染通用 action controls 和“更多”菜单，不知道 Bold、Italic 等具体 feature。
- `LinkQuickbar.vue`、`ImageQuickbar.vue`、`CodeBlockQuickbar.vue` 跟随对应 feature 放置。
- 普通文字选区只是 preset 组合的一组 controls，不新增硬编码具体 feature 的 `TextSelectionQuickbar.vue`。

只使用一个 `BubbleMenu` 和一个唯一 plugin key，例如 `richTextQuickbar`。不为每种上下文创建独立 BubbleMenu，从结构上避免多个浮层竞争位置和可见状态。

### Slash command 组件

```text
packages/rich-text/src/vue/
├── slash-command.ts
└── slash-command/
    ├── RichTextSlashCommandMenu.vue
    └── RichTextSlashCommandList.vue
```

- `slash-command.ts` 定义命令分组、关键词、action/UI command 和执行 helper。
- `RichTextSlashCommandMenu.vue` 注册 Suggestion renderer，并负责本地挂载、ARIA 和生命周期。
- `RichTextSlashCommandList.vue` 负责分组、查询过滤、active option、键盘导航和命令选择。
- `/` 入口使用 Tiptap Suggestion utility，并挂载 `RichTextSlashCommandList`。
- `slashCommand` preset 配置不携带来源或调用分支。`all` preset 额外持有唯一的 `RichTextSlashCommandMenu` component 引用，使 `compact` 的公共入口不会静态加载 all-only 的 `slash-command` feature；该引用只用于导入隔离，不构成可配置 renderer 抽象。

新增 editor-only `slash-command` feature，仅由 `allRichTextPreset` 启用。其 editor implementation 安装 `/` Suggestion 所需扩展；它不声明 server implementation，也不贡献文档 extension。新增直接依赖 `@tiptap/suggestion`，版本与项目内其它 Tiptap 依赖保持一致。

使用互不冲突的内部 plugin key：

- Quickbar：`richTextQuickbar`。
- Slash Suggestion：`richTextSlashCommand`。

#### Slash 命令列表契约

- Slash 使用 preset 提供的命令分组、固定顺序、标签、图标、关键词、过滤函数和执行 wrapper，并按当前 `/query` 过滤。
- disabled 命令保持可见，但不能成为 active option。列表首次出现时，以第一个 enabled 命令作为 active option；没有 enabled 命令时不设置 active option。`ArrowUp`/`ArrowDown` 跳过 disabled 命令，并在 enabled 命令间循环；点击 disabled 命令不执行、不关闭面板。
- Slash 的 `/query` 因直接输入、Backspace 或 composition 结束而变化时，不保留旧 active option；每次都重置为新过滤结果中的第一个 enabled 命令，没有 enabled 结果时清空 active option。
- 点击 enabled 命令或在存在 active option 时按 `Enter`，都通过同一个选择入口执行。action 返回 false 时保持面板打开，并从下一次 transaction 重新计算 enabled 状态。
- `Tab` 关闭面板、保留已输入的 `/query` 且不消费事件，由浏览器继续默认焦点导航。
- Slash 由 editor 持有焦点。没有 active option 时，`Enter` 交给 editor 正常换行。
- 普通同步命令先在同一个 chain 中删除 `/query`，再组合 action。图片等 UI command 在删除查询后取得明确的插入锚点。
- 图片对话框属于异步 UI 边界，不尝试跨对话框生命周期复用或合并 transaction。`/图片` 在选择命令时删除 `/query`，确认时另用一个 transaction 插入图片。

### Feature UI 复用

- Bold、Italic、Underline、Strike、InlineCode、RemoveFormat 复用现有 action item。
- Highlight Quickbar 与顶部 HighlightToolbarControl 复用颜色选项、highlight actions 和 surface-neutral 内部颜色 control，具体状态、关闭来源和 selection 行为只按“Highlight 共享交互契约”实现。
- 所有 Link surface 复用 `normalizeLinkHref`、`setLinkAction`、`unsetLinkAction`、共享目标解析器和 URL editor 内核；surface wrapper 只提供“Link 共享交互契约”表格中列出的触发与初始界面差异。
- `setLinkAction` 与 `unsetLinkAction` 只作用于调用时的明确 selection，不在 action 内隐式 `extendMarkRange`；共享目标解析器负责为编辑模式保存并恢复完整 link range，为创建和设置模式保存并恢复精确 text range。
- Link editor extension 将现有 `enableClickSelection: true` 改为 `false`。单击链接只放置折叠光标并显示 Link Quickbar，不自动选中整段链接；拖选任何链接文字都进入普通文字 Quickbar。
- 现有 `LinkToolbarControl` 不再因光标进入链接而自动展开；它的直接输入态和与 Quickbar 的互斥关系均按“Link 共享交互契约”实现。
- Image Quickbar 与顶部 ImageToolbarControl 复用 `ImageDialog`、preset 上传/error options、共享目标管理器和 insert/update action；两处都不新增图片删除 control。具体状态与 selection 结果只按“Image 共享交互契约”实现。
- `insertImageAction` 和 `updateImageAction` 都在各自内容 transaction 中把结果图片设为 Image NodeSelection；不添加图片后继段落处理。
- CodeBlock Quickbar 与顶部 CodeBlockToolbarControl 复用目标解析器、语言选项和 `setCodeBlockLanguageAction`，具体状态与 selection 结果只按“CodeBlock 共享交互契约”实现。
- Heading、List、Blockquote、CodeBlock、HorizontalRule 的 Slash command 引用现有 action；图片命令属于 UI command，打开现有 `ImageDialog`。

## 数据流与交互

### Quickbar

数据流保持单向：

```text
Editor transaction/selection
→ 解析 Quickbar 上下文
→ 从 preset 选择 controls 或 feature component
→ 执行 RichTextAction
→ Tiptap transaction
→ 现有 update:modelValue
```

- 简单按钮使用 `mousedown.prevent`，避免点击时丢失文字选区。
- Quickbar 容器使用不透明的主题输入背景，不能透出正文或页面背景。
- Quickbar 可见、editor 持有焦点且不在 composition 时，未被 Tiptap keymap 消费的普通 `Tab` 固定原 selection，并把焦点移到 roving 顺序中第一个当前可见、active 且 enabled 的 control；没有该 control 时移到第一个 enabled control。实现只在 editor 既有按键处理完成后、事件仍未被消费时接管；List 缩进、CodeBlock 或其它 feature 已消费的 `Tab` 保持原行为。`Shift+Tab` 不由 Quickbar 接管。Quickbar 不新增独立键盘快捷键。
- Quickbar 通过键盘获得焦点时固定原 selection，不因 editor 失焦而关闭或改变 action 目标。简单 toolbar 模式使用 roving tabindex：仅一个 enabled control 为 `tabindex="0"`，其它为 `-1`；`ArrowLeft`/`ArrowRight` 跳过 disabled control 并循环导航，`Home`/`End` 移到首尾 enabled control，`Enter`/`Space` 执行。
- Quickbar 的简单 toolbar 模式中，普通 `Tab` 不循环 roving controls，而是解除目标固定并按浏览器顺序离开 Quickbar；新焦点不被覆盖，`Shift+Tab` 同样返回前一个可聚焦元素。Link 输入态和子菜单先使用各自正常的内部 Tab 顺序，焦点真正离开整个 Quickbar 层时才解除固定。Quickbar 不形成焦点陷阱。
- Quickbar 中按 `Escape` 时关闭当前子界面，恢复原 editor selection 与焦点。Link URL 输入态改用表单的正常 Tab 顺序，不拦截输入框的左右方向键；退回只读 toolbar 态后恢复 roving tabindex。“更多”打开时不改变焦点，用户通过正常 Tab 顺序进入菜单；高亮颜色面板仍按其颜色选择交互管理焦点。
- `RichTextEditor` 对外作为一个组合控件：正文、顶部工具栏、Quickbar 及其非模态子界面之间的焦点移动不触发组件对外的 `blur`，也不移除编辑器整体的 focus-within 样式；只有焦点离开整个组合控件时才触发 `blur`。
- Quickbar 或子菜单持有 DOM 焦点时，Tiptap `editor.isFocused` 可以为 `false`；此时操作目标继续使用已固定的 selection。所有可聚焦的非模态编辑器浮层挂载到 `RichTextEditor` 内部、滚动容器外部的本地 overlay host，不使用挂载到 document body 后再模拟 DOM 包含关系的方式。
- 三个 Link surface 的目标固定、提交、取消、点击外部、目标失效、焦点恢复以及 Quickbar 抑制全部由“Link 共享交互契约”的同一状态控制器实现。本节不为各 surface 重复定义状态转换。
- 所有 Image surface 的目标固定、确认、取消、目标失效、异步结果处理和成功 selection 全部由“Image 共享交互契约”定义。本节不为各 surface 重复定义状态转换。
- CodeBlock Quickbar 与顶部语言控件的目标固定、切换语言、关闭来源、焦点和 selection 行为全部由“CodeBlock 共享交互契约”定义。
- 对象上下文失效时立即关闭 Quickbar，不推测替代目标。

### Slash command

- 仅当 editor 可编辑、selection 为折叠光标，且 `/` 是顶层段落的第一个字符时触发。半角或全角前导空白后的 `/`、段落中间的 `/`、以及用 `/` 替换非空选区均不触发。
- Slash 会话只由用户在 editor 内直接输入触发。粘贴、Undo/Redo 或外部 `modelValue` 更新产生的段首 `/query` 只作为普通文本，不打开面板。直接输入 `/` 打开后，后续字符输入与 Backspace 在同一会话内更新查询。
- Slash 面板打开期间焦点始终留在 editor，editor DOM 临时设置指向 listbox 的 `aria-controls`、`aria-expanded` 和 `aria-activedescendant`；命令列表不抢占焦点。
- Slash renderer 先将命令列表挂到 `RichTextEditor` 的本地 overlay host，再交给 Suggestion 管理定位与关闭；不挂到 `document.body`。
- 输入法处于 composition 状态时不处理命令面板快捷键。
- 查询使用中文标签与 preset 固定关键词的大小写不敏感包含匹配，不支持拼音、首字母或模糊匹配。
- 查询没有任何匹配时保持面板打开，显示“无匹配命令”空状态且不设置 active option。方向键不执行操作，用户可通过 Backspace 修改查询并恢复匹配结果。此时 `Enter` 不被命令面板消费，由 editor 正常换行：原段落保留 `/query`，光标进入新段落，Suggestion 自然关闭。
- 查询不包含空格。composition 结束后输入第一个空格时，关闭命令面板并完整保留 `/query ` 文本，不删除查询、不自动执行 active option。composition 期间的空格不触发关闭。
- 存在 active option 时，`ArrowUp`/`ArrowDown` 移动 active option，`Enter` 执行；不存在 active option 时，`Enter` 交给 editor 正常处理。`Escape` 关闭并保留已输入文本，焦点继续留在 editor。`Tab` 保留已输入文本并关闭面板，但不消费按键事件，由浏览器将焦点移到下一个可聚焦元素。
- 命令的 active option、disabled、方向键、`Enter`、点击和执行失败行为统一按“Slash 命令列表契约”处理。所有匹配命令均 disabled 时不设置 active option，`Enter` 交给 editor 正常处理。
- 执行同步命令时，先创建包含 `deleteRange(/query)` 的 chain，再通过 `.command(action.command(...arguments_))` 组合块操作，最后只调用一次 `run()`。删除和 action 必须处于严格的同一个 transaction，而不是依赖 history 的时间窗口将两个 transaction 合并。这使 Undo 恢复为一次操作，也避免 `update:modelValue` 观察到“查询文本已删除、Slash command 尚未执行”的中间状态。
- Slash 命令的 enabled 状态使用 `editor.can().chain().deleteRange(/query).command(action.command(...arguments_)).run()` 对完整操作做无 dispatch 模拟，不只在删除前的 editor state 上调用通用 `canRunRichTextAction`。
- 执行图片 UI command 时，先删除 `/query`，再保存删除后留下的顶层空段落位置作为插入锚点，关闭命令面板并打开对话框。
- `/图片` 对话框确认时，恢复并验证保存的插入锚点；只有该位置仍是原顶层空段落时才在此插入图片。对话框期间 selection 变化不改变插入目标；外部内容更新导致锚点失效或该段落不再为空时，关闭对话框且不插入、不推测替代位置。
- 图片插入成功后，共享 `insertImageAction` 选中结果图片并聚焦 editor，不创建后继段落、不把光标移入已有后继段落；其它成功状态按“Image 共享交互契约”处理。
- 取消 `/图片` 对话框时保留来源空段落。
- `/图片` 明确形成两个 History 事件：第一次来自查询删除，第二次来自确认插图。确认后第一次 Undo 删除图片并恢复空段落，第二次 Undo 恢复 `/query`；取消后没有插图事件，一次 Undo 恢复 `/query`。不依赖 history 的时间窗口合并异步操作。顶部工具栏插入和编辑图片各自产生一个可单步 Undo 的内容 transaction。

## 错误处理

- 通用 action 使用 `canRunRichTextAction` 派生 disabled 状态；Slash 命令使用包含 query 删除的完整模拟 chain。disabled 命令不修改内容。
- 执行同步 action command 返回 false 时不关闭当前菜单，下一次 transaction 重新计算状态。
- 非法链接沿用现有 URL 规范化和输入 error 状态，不关闭链接编辑界面。
- 图片处理错误继续走 preset 已提供的 `onError`；Quickbar 和 Slash 命令面板不引入第二套错误通道。
- Quickbar 和 Slash 命令面板自身不发起服务端请求，不增加通用 `try/catch` 或 fallback。
- 外部 `modelValue` 更新或其它外部 `docChanged` transaction 使固定目标失效时，按共享规则关闭相关浮层或对话框，不尝试应用到其它内容；selection-only 与 plugin meta transaction 不触发该路径。已启动但无法取消的图片上传可继续 settle，其结果必须被忽略。

## 可访问性与定位

- Quickbar 使用 `role="toolbar"` 和中文 `aria-label`，按钮提供 `aria-label`、active 和 disabled 状态。editor 中未被消费的普通 `Tab` 可进入；简单 controls 使用 roving tabindex 与左右方向键/Home/End 导航，`Tab`/`Shift+Tab` 正常离开；Link 输入态和子菜单使用各自的表单/menu 焦点语义。
- 命令列表使用 listbox/option 语义，通过 `aria-activedescendant` 与持有焦点的 editor 建立 ARIA 关联。
- Link 输入、颜色面板、语言列表、图片对话框和命令列表均支持 `Escape` 关闭，并按交互来源处理焦点；由取消或 `Escape` 关闭时恢复 editor 焦点，由点击外部关闭时保留点击产生的新焦点。顶部临时操作层还必须在任何关闭路径清除自身的 active overlay 登记。
- BubbleMenu 和 Slash Suggestion 使用 Tiptap/Floating UI 的定位能力，避免遮挡当前选区并适应编辑器边缘。
- 不拦截浏览器原生右键、复制、粘贴或拼写检查行为。

## Public API 与跨端边界

- `RichTextEditor` props 不变。
- 应用层继续从内置入口选择 `compactRichTextEditorPreset` 或调用 `createAllRichTextEditorPreset`。
- 不公开 Quickbar、Slash command config、内部 helper 或自定义组件入口。
- `core`、`schema`、`server` 不依赖 Vue menu 或 Suggestion UI。
- 富文本 JSON schema、server preset、HTML 输出和 sanitize policy 不变，无数据迁移。

## 测试

### Preset 与模型

- 校验 Quickbar、Feature Quickbar 和 Slash command 不能引用 preset 未启用的 feature。
- 校验 `compact` 不包含 `slash-command` feature 或 `slashCommand` config。
- 校验 `all` 包含约定的 Quickbar 上下文、命令分组和 `slash-command` editor feature。

### Quickbar

- 验证 Image、Link、CodeBlock、普通文字的上下文优先级，任意时刻只渲染一个模式。
- 验证普通文字 Quickbar 支持跨段落、标题、列表项和引用的纯文字选区；跨 CodeBlock 选区或包含原子节点的选区不显示 Quickbar。
- 验证跨 text block 的普通文字选区中 Link control 为 disabled，其它行内格式仍可用；单一 text block 选区可创建或编辑链接。
- 验证 `compact/all` 的普通文字 controls 和“更多”菜单内容。
- 验证 Quickbar 与顶部工具栏复用同一高亮颜色 control，按钮不直接应用默认色，并正确展示单色、混合色与清除状态；顶部折叠光标正确设置或清除 stored mark。验证选择颜色或清除成功后两处面板都关闭、保留原 selection 并聚焦 editor，disabled 或失败时不关闭。
- 验证 action active/disabled 状态以及执行后选区保持。
- 验证未被 editor keymap 消费的普通 `Tab` 在 Quickbar 可用时固定 selection，并优先聚焦可见的 active enabled control、否则首个 enabled control；已消费的 `Tab`、composition、`Shift+Tab`、Quickbar 隐藏/抑制或全 disabled 时保持原行为。验证没有独立 Quickbar 快捷键。验证 Quickbar roving tabindex、跳过 disabled control、循环方向键、Home/End、Enter/Space、Escape 恢复 selection，`Tab`/`Shift+Tab` 正常离开且不形成焦点陷阱，以及 Link 输入和子菜单的焦点进出。
- 验证正文、Quickbar control、“更多”菜单、Link 输入和顶部非模态浮层之间的焦点移动不触发 `RichTextEditor` 的 `blur`，从任一内部焦点离开整个组件时只触发一次 `blur`。验证子菜单获得焦点时编辑器根容器仍匹配 focus-within。
- 验证折叠光标进入 Link Quickbar，任何非空链接文字选区进入普通文字 Quickbar，并且 Link 文字格式只作用于实际选区。验证关闭 `enableClickSelection` 后单击链接放置光标而不整段选中。
- 验证折叠光标在链接内部、链接与普通文字边界时解析唯一连续 link range，两个不同 `href` 的相邻链接边界与仅有 stored mark 时不显示 Link Quickbar。
- 验证 Link Quickbar 的只读展示态、进入编辑、应用、取消未应用修改、按关闭来源处理焦点、新窗口打开与移除。验证普通文字 Quickbar 的 Link control 在单一连续链接选区内编辑完整 link range，纯普通文字选区创建链接，单块混合选区在精确 range 内设置、替换或移除链接，不扩展到选区外。
- 验证三个 URL 输入态都显示输入框、应用、新窗口打开和显式取消；打开按钮只对合法非空草稿 enabled 且不关闭输入层。验证目标内存在实际 Link marks 时显示并正确执行“移除链接”，纯普通文字创建与 stored mark 模式不显示；取消始终放弃草稿且不修改文档。
- 验证所有 Link surface 只将完整 link range 用作命令目标；应用非空/空 URL 或移除链接后，都在同一个 transaction 中恢复经映射的原 selection。折叠链接光标重新进入只读 Link Quickbar，非空原选区仍进入普通文字 Quickbar。
- 验证顶部 `LinkToolbarControl` 只在点击后打开，不再因进入已有链接而自动展开。
- 验证 Quickbar 与 SearchReplace、Link、Highlight、TextStyle、Heading、TextAlign、List、CodeBlock 和 Image 的全部顶部 popover/dropdown/dialog 互斥；SearchReplace 由按钮或现有快捷键打开时结果相同。顶部临时层打开前按点击外部规则关闭 Quickbar 子界面并放弃未应用草稿，打开期间不渲染任何 Quickbar，关闭后按当前 selection 恢复。验证顶部临时层之间也互斥，旧浮层的延迟关闭或组件卸载不会清除新浮层状态。
- 验证顶部 Link 对折叠链接光标、单一链接选区、单块普通/混合选区、跨块选区与折叠普通光标的目标解析，输入期间固定目标，失效时不修改其它内容。
- 验证顶部 Link 的应用、Escape/再次点击取消、点击外部与目标失效关闭路径，以及各路径的 selection、焦点和 Quickbar 抑制恢复。
- 验证所有 ImageDialog 入口固定插入 selection 或待编辑图片，取消时恢复 selection 和焦点，外部内容更新或目标失效时关闭对话框、忽略上传结果且不修改其它内容。
- 验证顶部 ImageToolbarControl 只对折叠文字 selection 执行插入、对 Image NodeSelection 执行编辑；非折叠 TextSelection、其它 NodeSelection 与 AllSelection 时 disabled，不能用图片替换选中内容。
- 验证 Image Quickbar 与顶部工具栏都没有专用删除 control；Image NodeSelection 的原生 `Backspace`/`Delete`、History 和 selection 映射无回归，图片是唯一内容时得到可继续输入的空正文段落。另验证上传错误回调。
- 验证顶部工具栏、Image Quickbar 和 `/图片` 共享图片状态机：插入或编辑成功后都形成目标图片的 Image NodeSelection 并聚焦 editor，不创建后继段落、不移动到已有后继段落；允许显示 Quickbar 时重新进入 Image Quickbar。验证每次 insert/update action 自身在一个 transaction 中完成内容与 selection 变更且可单步 Undo；`/图片` 的查询删除按 Slash command 测试中的独立 History 规则验证。
- 验证顶部 CodeBlock 按钮创建 CodeBlock，并可在 active 状态下转为正文；CodeBlock Quickbar 不提供该重复操作。
- 验证折叠光标和非空选区完全位于单个 CodeBlock 时，顶部与 Quickbar 的语言控件都可用并指向同一块；跨 CodeBlock 或跨其它块时，顶部语言控件 disabled 且 CodeBlock Quickbar 不显示。验证 Quickbar 使用小尺寸控件并锚定代码块右上方，光标在块内移动时不跟随；验证切换语言后保留原 selection 和焦点，目标失效时不修改其它块。
- 验证 editor disabled、上下文失效、外部内容替换时的隐藏行为，以及 `pointer: coarse` 条件下所有 Quickbar 均隐藏。
- 验证所有固定目标的 feature 子界面在外部 `docChanged` transaction 后关闭并放弃草稿，不恢复旧 selection、不修改新内容；selection-only 与 plugin meta transaction 不误触发失效。

### Slash 命令面板

- 验证可编辑的当前顶层空段落显示 Slash 提示，输入内容、进入嵌套段落或禁用 editor 后隐藏，且提示不进入文档内容。
- 验证 Slash 命令列表挂在本地 overlay host 内，打开期间 editor 保持焦点并具有正确的 ARIA 关联。
- 验证三个命令分组及其固定顺序，查询后隐藏空分组且键盘可跨分组连续导航。
- 验证 `/` 只在顶层段落第一个字符且 selection 折叠时触发，前导空白、段中斜杠和替换选区不触发；粘贴、Undo/Redo 与外部 `modelValue` 更新不开启 Slash 会话。验证中文标签与固定中英文关键词、大小写不敏感包含匹配、不匹配拼音、无结果空状态与 Backspace 恢复、每次查询变化后重置到首个 enabled 结果、无 active option 时 `Enter` 正常换行、IME composition、空格关闭面板但保留全部文本，以及 `Tab` 关闭后继续浏览器默认焦点导航。
- 验证 disabled、初始 active option、循环导航、点击和执行失败行为；没有 active option 时 `Enter` 交给 editor。验证 Slash 的 enabled 状态从包含 query 删除的完整模拟 chain 计算。
- 验证同步命令在一个 transaction 中删除查询文本并执行块操作，只触发一次内容更新且可单步 Undo。
- 验证图片 UI command 删除查询文本、固定来源空段落并打开对话框；确认时在有效锚点插入，锚点失效时不插入，取消时留下空段落。验证 `/图片` 确认后需要两次 Undo 依次撤销插图和查询删除，取消后一次 Undo 恢复查询；顶部插入和图片编辑仍各自单步 Undo。
- 验证 feature 未启用的命令不会进入 preset，`canRunRichTextAction` 返回 false 的命令显示 disabled。

### 回归与验证

- 未在本设计中明确调整的顶部工具栏布局、active/disabled 状态和复杂控件行为无回归；Link、Highlight、Image、CodeBlock 与临时操作层按共享契约验证新行为。
- 原生 `contextmenu` 不被拦截。
- 现有 server、schema、sanitize 和导入边界测试继续通过。
- 定向运行 `@rev30/rich-text` 测试与 typecheck，最终运行完整 `pnpm check`。

## 验收标准

- 顶部工具栏保持完整主入口，用户可忽略 Quickbar 而完成现有任务。
- `compact` 只增加普通文字与 Link Quickbar，不加载 `slash-command` 相关 extension。
- `all` 增加普通文字、Link、Image、CodeBlock Quickbar，以及 Slash command。
- 任意时刻最多显示一个 Quickbar 和一个 Slash 命令面板；任意顶部工具栏临时操作层与 Quickbar 绝不同时显示，且同一 editor instance 最多打开一个顶部临时操作层。
- 所有上下文操作复用 feature action 或现有复杂 UI，不存在第二套内容命令逻辑。
- 不新增自定义右键菜单、公开配置 API、移动端专属界面或服务端行为。
- 无数据迁移，现有富文本内容继续正常编辑、派生和展示。

## 预期改动范围

主要改动位于：

- `packages/rich-text/src/vue/RichTextEditor.vue`。
- `packages/rich-text/src/vue/toolbar/` 的复杂 control 协调接入。
- `packages/rich-text/src/vue/presets/compact.ts` 与 `all.ts`。
- 新增内部 `vue/quickbar*`、`vue/slash-command*` 模块。
- `editor/action.ts` 与现有 feature action，包括将 SearchReplace 的内部 dispatch 改为统一 command。
- Link、Highlight、Image、CodeBlock 现有 feature 的 Vue UI，以及 Image 插入/编辑后的统一 Image NodeSelection 行为。
- 新增 editor-only `slash-command` feature。
- `packages/rich-text/package.json`、workspace lockfile 和相关测试。
- 如 README 的富文本能力概览不再准确，随实现同步更新对应说明。

本设计不要求修改 `apps/server`、`packages/contracts` 或数据库 schema。
