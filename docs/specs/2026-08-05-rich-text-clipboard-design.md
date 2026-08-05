---
status: approved
date: 2026-08-05
---

# 富文本剪贴板与粘贴设计

## 背景

`@rev30/rich-text` 当前主要依赖 ProseMirror/Tiptap 的默认 clipboard 行为：普通 copy、cut、文本粘贴和富文本粘贴没有统一的业务拦截层，少量特殊行为由 feature 自带 extension 提供。这个方向能够保留浏览器和编辑器框架的成熟语义，但现有实现存在几类已确认问题：

- DOM parser 会调用 attribute `parseHTML`，但不会自动执行 ProseMirror attribute validator。外部 HTML 因此可能生成无法通过 `document.check()` 的 link、highlight 和 table attrs；OrderedList 还缺少对应 validator。
- Tiptap 默认 `linkOnPaste` 只判断 selection 是否为空，会把 `AllSelection` 和 table `CellSelection` 等非普通文本选区也当作链接标签选区。
- Image extension 默认不解析 Base64 `src`。Playground 使用 Data URL 图片，因此编辑器内部复制图片后，粘贴解析会丢弃 image node。
- 图片文件只有在 ImageDialog 已打开时才能通过全局 `window` paste listener 选入；在编辑器中直接粘贴截图或图片文件不会进入图片流程。
- 普通外部 HTML 中的 `<img>` 会被 editor schema 接受并可能在服务端校验前触发资源加载，而 client 不应复制服务端的业务来源策略。
- 现有 Chromium clipboard 测试使用 `Cmd/Ctrl+A`，但原设计要求通过真实键盘建立局部文本选区；当前断言也无法区分“旧文字获得链接”和“旧文字被 URL 替换后自动链接”。

本设计继续保留 ProseMirror 默认 clipboard 主路径，只为已确认的 paste 特殊行为建立显式组合边界。现有冻结 spec 不修改；本 spec 记录新的设计决策，后续实际行为以实现和测试为准。

## 目标

- 保持普通 copy、cut、文本粘贴和无特殊内容的富文本粘贴由 ProseMirror 处理。
- 让 editor feature 可以声明同步 paste rule，并由现有 preset feature 组合自动获得对应行为。
- 让外部 HTML 经各 feature 解析后生成满足 schema attribute 约束的文档。
- 将 URL 或邮箱的 link-on-paste 限定为用户明确选择的单个 textblock 文本。
- 让 `AllSelection`、跨 textblock、CellSelection、NodeSelection 和空光标恢复默认粘贴语义。
- 修复 image-enabled rich-text editor 之间的内部图片复制粘贴，包括 Playground Data URL 图片。
- 在编辑器中粘贴图片文件时复用现有 ImageDialog、upload adapter 和 image actions。
- 在解析不符合 ProseMirror clipboard 格式的普通外部 HTML 前移除 `<img>`，同时不把服务端 `isAllowedSrc` 复制到客户端。
- 用单测和真实 Chromium 分别覆盖规则策略与原生 clipboard 集成。

## 非目标

本阶段不实现：

- 自定义 copy/cut handler、异步 Clipboard API、自定义 MIME 或跨应用私有剪贴板协议。
- 列表编号、表格 TSV 等纯文本复制格式优化。
- 一次插入多张剪贴板图片；多张图片文件只选择第一张。
- 自动上传或绕过 ImageDialog 的图片插入路径。
- 外部 HTML 图片 URL 的客户端业务域名或路径白名单。
- 为 hostile clipboard 建立不可伪造的来源证明、私有 copy token 或 client image source policy。
- 在客户端复制服务端完整的 table 总量和几何校验。
- paste rule 的异步执行、数值优先级、共享可变上下文或通用事件总线。
- 修改已冻结的 rich-text image、table、contextual interactions 或 playground spec。

## 设计决策摘要

| 主题 | 决策 |
| --- | --- |
| 默认边界 | copy、cut 和未被 rule 消费的 paste 继续走 ProseMirror |
| 组合位置 | paste rule 归属对应 editor feature，由 collector 从 preset 已启用的 feature 自动收集 |
| 执行顺序 | 沿用 `preset.features` 顺序；link rule 忽略带文件的 clipboard，不依赖额外优先级让位给 image |
| 运行时接入 | Collector 把已启用 feature 的 rules 封装到一个匿名 Tiptap Extension，由它对接 `transformPastedHTML` 和 ProseMirror `handlePaste` |
| Link on Paste | 只处理同一 textblock 内、允许 link mark 的非空 `TextSelection`，保留 `linkifyjs` 的 URL 与邮箱 token 范围 |
| `AllSelection` 粘贴 | `Cmd/Ctrl+A` 后粘贴 URL 替换全文，不把全文作为链接标签 |
| 外部 HTML attrs | 各 shared feature 的 DOM parse rule 与 attribute parser 共同拒绝非法结构并返回 canonical attrs |
| 内部图片 | 保留 ProseMirror 内部 HTML，允许解析 Data URL |
| 外部 HTML 图片 | DOM 解析前从 inert template 中移除所有 `<img>`；这是最佳努力过滤，不是来源证明 |
| 图片文件 | 选择第一张图片并打开预填的 ImageDialog，不自动上传 |
| 图片来源校验 | client 不新增 `isAllowedSrc`；server 仍是最终可信边界 |
| 多文件 | 选择文件列表中的第一张图片，其余文件忽略 |
| 测试 | happy-dom 锁定策略，Chromium 锁定真实键盘与 clipboard 结果 |

## 信任边界与术语

### 内部 rich-text HTML

由 ProseMirror clipboard serializer 产生的 HTML。其首个顶层元素包含 `data-pm-slice`，值符合 ProseMirror 的 `<openStart> <openEnd> [-<wrapperCount>] <JSON context>` clipboard 格式。该标记用于恢复 ProseMirror slice 结构和启发式识别内部 rich-text copy，不是安全凭证。

### 外部 HTML

首个顶层元素没有符合上述位置和格式要求的 ProseMirror slice 标记的 clipboard HTML。它可能来自浏览器页面、Office、其它编辑器或任意应用。格式校验只减少普通内容被误判的概率，无法阻止 hostile clipboard 伪造有效标记。

### 图片文件

`ClipboardEvent.clipboardData.files` 中 MIME 以 `image/` 开头的第一个 `File`。

### 纯文本 clipboard

`clipboardData.getData('text/plain').trim()` 非空，且 `clipboardData.getData('text/html')` 为空的 clipboard 内容。只要存在非空 HTML 表示，即使它经 schema 解析后只是没有 mark 的单个 URL，也视为富文本 fragment，不触发 link-on-paste。

### 明确文本选区

同时满足以下条件的 selection：

- 是非空 `TextSelection`；
- `$from` 与 `$to` 位于同一个 textblock；
- 该 textblock 允许 link mark。

### 安全边界

Browser editor 负责用户体验和结构一致性，不构成生产安全边界。服务端仍必须用对应 server preset 执行 schema 校验、feature 文档约束、静态渲染和 HTML sanitize；image `isAllowedSrc` 只在可信服务端配置和执行。

## Paste feature 集成层

### 规则模型

新增内部 editor paste 模块，提供同步 rule；`RichTextEditorFeature` 可以携带一个可选 rule：

```ts
interface RichTextPasteRule {
  readonly transformHTML?: (html: string, editor: Editor) => string
  readonly handlePaste?: (context: {
    editor: Editor
    event: ClipboardEvent
    slice: Slice
  }) => boolean
}

interface RichTextEditorFeature<Feature extends RichTextFeature = RichTextFeature> {
  readonly feature: Feature
  readonly extensions?: () => readonly AnyExtension[]
  readonly pasteRule?: RichTextPasteRule
}
```

Rule 通过所属 `RichTextEditorFeature` 与 feature 建立唯一关联，不再重复携带 feature tag，也不再定义独立 `RichTextPasteConfig`。一条 rule 可以同时提供 HTML transform 和 paste handler；rule 不支持 Promise、数值 priority、rule 间共享状态或单独的顺序配置。

### Feature 归属与 preset 组合

Link rule 直接属于既有 link editor feature：

```ts
const linkEditorFeature = defineRichTextEditorFeature(linkFeature, {
  pasteRule: linkPasteRule,
})
```

Image paste 需要已有 ImageDialog integration。Image feature 提供不依赖 Vue 的 rule 构造逻辑，由 image Vue integration 注入打开 Dialog 的内部函数，生成配置完成的 image editor feature。应用仍只提供既有 `image.upload` 与 `image.onError`，不接触 rule 或 Dialog callback。

`compact` 和 `all` 继续只维护各自已有的 `editorFeatures`。启用 link editor feature 会自动包含 link rule；`all` 中配置完成的 image editor feature 会自动包含 image rule，不再维护第二份 paste rule 清单。未来自定义 preset 通过受控 builder 组合 editor features 时，也自然获得这些 feature 的 paste 行为。

Collector 沿用 `preset.features` 的既有顺序收集 transforms 和 handlers。Link handler 在纯文本条件之外还要求 `clipboardData.files` 为空，因此任何带文件的事件都不会被 link rule 消费；image handler 再按自身条件选择第一张图片。当前规则的消费条件互斥，不新增 priority、依赖关系或覆盖顺序。以后只有出现无法通过输入条件拆分的真实冲突时，才另行设计排序机制。

### 执行流程

1. ProseMirror 从 clipboard 读取 HTML 或文本。
2. 按 `preset.features` 顺序依次执行已启用 editor feature 的所有 `transformHTML`。
3. Schema DOM parser 解析转换后的内容；各 feature 的 DOM parse rule 与 attribute `parseHTML` 返回可接受的 canonical attrs。
4. Paste executor 将解析后的 `slice`、原始 `ClipboardEvent` 和 Tiptap `Editor` 传给 handlers。
5. 按同一 feature 顺序调用 handlers；第一个返回 `true` 的 rule 消费事件。
6. 所有 handlers 都返回 `false` 时，ProseMirror 执行默认 paste。

`RichTextEditorPreset` 的公开与运行时形状都不增加 `paste` 字段，也不使用私有 symbol 保存第二份配置。现有 preset 校验继续保证每个 editor feature 都属于 preset 且不重复；rule 随已验证的 editor feature 进入 collector，不需要单独做 feature 配对校验。

`collectRichTextEditorExtensions` 在至少收集到一条 rule 时创建一个匿名 Tiptap Extension。它只负责把内部规则转换为框架认识的两个入口：将所有 `transformHTML` 组合成 Extension 的 `transformPastedHTML`，并通过一个 ProseMirror plugin 注册统一的 `handlePaste`。它不定义 image、link 等具体行为，也不是新的 feature 或公开扩展点。

Collector 把这个匿名 Extension 放在返回数组末尾。其 `transformPastedHTML` 由 Tiptap 3.29.2 与其它 extension transform 组合，并在 ProseMirror DOM parse 前按 `preset.features` 顺序执行内部 rule transforms；其 ProseMirror plugin 则利用 Tiptap 反转同 priority extension 输入顺序的现有行为，使统一 `handlePaste` 先于其它同 priority extension handler 被查询。这里不设置新的 Tiptap priority，也不形成 rule priority 机制。

该匿名 Extension 不导出 factory，测试也不读取其名称、实例或数组位置。顺序契约只通过用户可见的 paste 行为验证；升级 Tiptap 时若其 plugin 组装规则变化，由这些行为测试暴露兼容性问题。

`RichTextEditor.vue` 不感知 image、link、ImageDialog 或具体 paste rules。

## 用户可见行为

| 场景 | 结果 |
| --- | --- |
| 普通 copy / cut | 保持浏览器与 ProseMirror 默认行为；cut 进入正常 history |
| 普通文本或无特殊内容的富文本 paste | 替换当前 selection，并保留 target schema 支持的内容 |
| 纯合法 URL 或邮箱 paste 到明确文本选区 | 原文字不变，获得对应 link mark |
| URL paste 到空光标 | 插入 URL 文本，后续由现有 autolink 行为处理 |
| URL paste 到 `AllSelection`、跨 textblock、CellSelection 或 NodeSelection | 不触发 link-on-paste，执行默认替换或插入 |
| 不支持的 URL、非 URL 或富文本 URL 片段 | 不触发 link-on-paste，执行默认 paste |
| image-enabled editor 之间复制包含图片的内容 | 恢复图片和周围支持的富文本，不打开 ImageDialog |
| 外部 HTML 含 `<img>`、但无图片文件 | 移除 `<img>`，保留其余 target schema 支持的内容 |
| 外部 clipboard 含图片文件 | 选择第一张图片并打开预填的 ImageDialog |
| Clipboard 同时含多张图片 | 只使用第一张图片，其余忽略 |
| ImageDialog 内非输入区域 paste 图片 | 用第一张图片更新当前候选文件 |
| 编辑已有图片时选择、拖放或 paste 新文件 | 更新替换候选，等待用户主动上传并确认 |
| ImageDialog 输入区域 paste | 不拦截文本 paste |

纯文本 copy 的列表编号和表格列结构保持现状，不作为本阶段验收项。

## Link 设计

### Link-on-paste

Shared Link extension 将 Tiptap `linkOnPaste` 设为 `false`，由 `linkPasteRule` 明确实现产品策略。

Link rule 只在以下条件全部满足时返回 `true`：

- `clipboardData.files` 为空；
- clipboard 内容符合上述纯文本 clipboard 定义；
- `linkifyjs` 识别出 trim 后的完整内容恰好是一个 `url` 或 `email` token；
- token 的 `href` 通过现有 scheme 和 `normalizeLinkHref` 规则；
- 当前 selection 是明确文本选区。

Handler 只忽略 clipboard 纯文本的首尾空白，对 trim 后的值执行 tokenization；中间存在空白或其它内容时不匹配。之后对 `linkifyjs` 返回的 `href` 执行 `normalizeLinkHref`，再使用 canonical href 给 selection 添加 link mark，不替换原文字。邮箱因此保留为 `mailto:`，不会把 token 原文误补全为 `https`。任一条件不满足时返回 `false`，让默认 paste 继续执行。

`linkifyjs` 从 Tiptap Link 的传递依赖提升为 `packages/rich-text` 的直接 runtime dependency，避免导入 Tiptap 私有 helper 或重新实现 URL tokenization。本阶段不注册电话号码或其它额外 token plugin；未被默认 `linkifyjs` 识别的 `tel:` 文本继续走默认 paste。

### Link HTML 属性

Link 必须同时覆盖 mark 级 DOM parse rule 和 `href` attribute parser，因为 Tiptap 只有在 mark rule 的 `getAttrs` 返回 `false` 时才会跳过整个 link mark；仅让 attribute parser 返回空值仍可能创建缺少必填 `href` 的 mark。

Mark rule 读取原始 `href` 并先执行 `normalizeLinkHref`：

- trim 首尾空白；
- 对无显式协议的合法主机名补全默认 `https`；
- 只保留当前允许的 scheme；
- 无效 href 时由 `getAttrs` 返回 `false`，不创建 link mark，但保留 anchor 文字。

合法 href 再由 attribute `parseHTML` 返回同一个 canonical 值，确保 DOM parser 写入 document 的不是未经规范化的原始属性。

Editor document 不持久化外部 anchor 的 `target`、`rel`、`class` 或 `title`。直接 JSON 中的非法 href 继续由 attribute validator 和 `document.check()` 拒绝。

## Highlight、List 与 Table HTML 属性

### Highlight

- `data-color` 优先于 inline `background-color`。
- 值经 trim 和小写转换后，与 `highlightColors` 精确匹配。
- 支持的颜色保存为 canonical value。
- 不支持的颜色解析为 `color: null`，保留 highlight mark，不把任意颜色写入 document。
- Shared parser 与 server sanitizer 复用同一个颜色 normalizer。

### OrderedList

OrderedList 增加 attribute validator，并包装 Tiptap 原有 parser：

- `start` 只接受安全整数，包括 `0` 和负数；非法外部 HTML 值归一化为 `1`。
- `type` 只接受 `1 | a | A | i | I | null`；非法外部 HTML 值归一化为 `null`。
- Tiptap 对 CSS `list-style-type` 的既有映射先执行，再进入相同 normalizer。
- 直接 JSON 中的非法 `start` 或 `type` 由 `document.check()` 拒绝。

### Table

TableCell 与 TableHeader 覆盖上游宽松的 `colspan`、`rowspan` 和 `colwidth` parser，并继续使用归一化后的 `align` parser：

- `colspan`、`rowspan` 必须是完整的正安全整数；非法值归一化为 `1`。
- 单个 `colspan` 或 `rowspan` 超过现有单表 10,000 网格槽位上限时归一化为 `1`，避免单个 attribute 形成无界放大。
- `colwidth` 的每一项必须完整解析为有限数字；任一项非法时整个 attribute 归一化为 `null`。
- 不新增 colwidth 最小值或数组长度约束。
- `align` 只保留 `left | center | right | null`。

本阶段不新增 table paste handler，不在 client 计算完整候选表格网格，也不复制 server 的单文档累计限制与 `TableMap` 几何校验。正常从表格应用或网页复制的内容由实际行列和小跨度组成，其处理成本随输入规模增长；多个各自合法的 span 仍可能被 hostile clipboard 组合成超大候选网格，并在 server 介入前触发 client `TableMap` 的高内存或主线程阻塞。本设计明确接受这一客户端可用性残余风险，不为异常输入增加纯文本降级。Server 继续对最终完整 document 执行现有 10,000/100,000 资源限制和几何完整性检查。

## Image 设计

### 内部与外部 HTML

Image extension 允许解析 Base64 `src`，修复 Playground Data URL image 在内部 clipboard round-trip 时被 schema parser 丢弃的问题。

Image HTML transform 使用 inert `<template>` 解析 clipboard HTML：

- 若首个顶层元素的 `data-pm-slice` 符合 ProseMirror clipboard 格式，返回原始内部 HTML，让默认 parser 恢复 image node 和周围内容。
- 否则移除所有 `<img>` 后返回其余 HTML。

使用 inert template 避免为了检查和删除普通外部 `<img>` 而先把它们挂入活动 document。Client 不新增图片来源 callback、业务 URL 白名单或私有 clipboard 协议。内部标记可被 hostile clipboard 伪造；伪造成功时，其中的 `<img src>` 仍可能在服务端校验前由 editor 加载。因此该 transform 只提供普通外部粘贴的最佳努力过滤，不承担来源证明、网络请求隔离或安全保证；最终持久化的 `src` 仍须通过 server image policy。

目标 editor 未启用 image feature 时，不承诺保留内部图片。

### 图片文件选择

Image feature 提供唯一的纯函数，从 `clipboardData.files` 中按顺序返回第一张 `image/*` 文件。Editor image rule 与 ImageDialog 局部事件入口复用该函数。

Editor paste handler：

1. 内部 rich-text HTML 返回 `false`，保留默认 rich paste。
2. 查找第一张图片文件。
3. 找不到时返回 `false`。
4. 找到时打开 ImageDialog 并返回 `true`，不再插入 clipboard 的其它表示。

ImageDialog 移除全局 `window` paste listener。Dialog 内容根节点只处理自身范围内冒泡的 paste 事件；它忽略已被消费的事件、input、textarea、contenteditable 和上传中状态。同一个 DOM paste 事件因此只进入 editor 或 dialog 其中一个作用域。

插入和编辑模式都开放文件选择、拖放与 scoped paste 三种本地文件入口，并复用同一个 `selectedImageFile` 更新函数。编辑模式下，这三种入口只建立替换候选，不自动上传，也不提前更新现有 image node；用户仍须主动点击上传并确认。取消、上传失败或在确认前关闭 Dialog 时，现有 image node 保持不变。

### ImageDialog 状态

ImageDialog 的初始 props 使用成对命名：

```ts
interface ImageDialogProps {
  existingImage?: RichTextImageAttrs
  initialImageFile?: File
}
```

`existingImage` 表示 Dialog 打开时选中的持久化 image node，并提供初始 attrs；`initialImageFile` 只用于 editor 直接 paste 图片文件时预填 Dialog。Dialog 不把当前候选文件建模为受控 prop，而是用私有可变状态接管之后的文件选择、拖放和 scoped paste：

```ts
const selectedImageFile = shallowRef<File | null>(props.initialImageFile ?? null)
```

| `existingImage` | `selectedImageFile` | 含义 |
| --- | --- | --- |
| 无 | 无 | 工具栏或 slash menu 打开的空白插入 |
| 有 | 无 | 编辑现有图片 |
| 无 | 有 | 粘贴新图片并插入 |
| 有 | 有 | 用粘贴候选替换现有图片 |

有 `selectedImageFile` 时立即显示本地 object URL 预览，但不自动上传。之后继续使用现有流程：

1. 用户点击上传。
2. `upload(file)` 返回 `src`。
3. Dialog 加载图片并取得自然尺寸。
4. 只有远端图片加载成功且自然宽高均为正数后，才清除 `selectedImageFile` 并把本次上传视为完成。
5. 用户可以修改说明和尺寸。
6. 确定后运行既有 `insertImageAction` 或 `updateImageAction`。

插入与替换使用不同的属性初始化规则：

- 插入新图片时，远端图片成功加载后继续用文件名初始化说明，并用新图片的自然宽高初始化展示尺寸。
- 替换已有图片时，选择候选文件不清空原有说明；远端图片成功加载后保留原 `alt` 和展示 `width`，再按新图片的自然宽高比重新计算 `height`，避免沿用旧比例造成拉伸。
- 旧图片没有有效展示 `width` 时，替换结果使用新图片的自然宽高。
- 用户可以在确认前继续修改说明和尺寸；只有最终确认才更新 document。

打开 Dialog 时根据 editor selection 确定 action。图片 NodeSelection 使用 `updateImageAction`；其它 selection 使用 `insertImageAction`。Dialog focus 不改变 ProseMirror state selection。取消不产生 transaction；确认产生正常 history transaction，撤销能够恢复插入前内容或旧图片 attrs。

`upload()` reject、返回的 `src` 加载失败或自然尺寸无效都调用现有 `onError`，并保持 document 不变。对于后两种情况，Dialog 清除失败的 `src` 和对应自然尺寸，但继续保留 `selectedImageFile` 与本地预览，允许用户重试上传或重新选择文件；只有远端图片成功加载后才释放候选文件。该规则只处理本次候选文件的上传结果，不改写打开 Dialog 时已有图片的 attrs。Client 不新增 `isAllowedSrc` 或业务 URL policy；应用提供的 upload adapter 仍负责产生业务 `src`，server preset 在最终派生或保存时执行权威校验。

## 模块与 API 边界

模块职责：

- `src/editor/paste.ts`：rule 定义、按 feature 顺序执行的规则执行器，以及把 rules 封装为匿名 Tiptap Extension 的内部函数。
- `src/editor/feature.ts`：让 editor feature 可携带一个 paste rule，并在 extension collector 中自动收集。
- `src/features/link/editor.ts`：`linkPasteRule` 与 link selection policy。
- `src/features/image/editor.ts`：内部/外部 clipboard 判断、第一张图片提取和不依赖 Vue 的 image paste rule 构造。
- `src/features/image/vue/*`：把 image rule 接到私有 `openImageDialog`，维护 Dialog UI 状态。
- feature shared modules：HTML attribute normalizer 与 validator。

现有应用消费方式不变：

```ts
createAllRichTextEditorPreset({
  image: {
    upload,
    onError,
  },
})
```

不新增 client `isAllowedSrc`、paste callback、paste error callback、ImageDialog imperative API 或应用侧 rule 配置。`compactRichTextEditorPreset` 仍是静态 export；`createAllRichTextEditorPreset` 的必填 options 形状不变。

Paste executor 不捕获 rule 编程错误。外部属性无效时按 feature 的明确规则归一化；图片上传错误使用既有 `onError`；server validation error 继续由现有业务调用链处理。

## 测试设计

### Paste feature 集成层

- Editor feature 自带的 rule 随 preset 启用，不要求 preset 维护第二份 rule 清单。
- HTML transforms 和 handlers 按 `preset.features` 顺序组合。
- Handlers 在首个 `true` 后停止；link handler 对任何带文件的 clipboard 返回 `false`。
- 所有 handlers 返回 `false` 时保留默认 paste。
- 未启用对应 editor feature 时，不注册其 paste 行为；既有 preset 校验继续拒绝未知或重复的 editor feature。
- 匿名 Extension 收集的 transforms 在 DOM parse 前按 feature 顺序生效，统一 handler 先于其它同 priority extension handler 被查询；测试只断言可见行为，不读取其名称、实例、数组位置或内部 plugin 顺序。

### Link

- 同一 textblock 内的明确文本选区 paste 纯合法 URL 或邮箱：文字不变，只增加 canonical link mark；邮箱 href 为 `mailto:`。
- URL 或邮箱首尾带空白或换行：trim 后匹配并设置 link；中间含空白或其它内容时不消费。
- 空光标、AllSelection、跨 textblock TextSelection、CellSelection 和 NodeSelection：link rule 不消费。
- 携带非空 `text/html` 的 URL fragment、非 URL 和不支持的 URL：link rule 不消费。
- 同时携带任意文件和 URL 文本：link rule 不消费，后续 image rule 或默认 paste 继续处理。
- 即使 HTML URL fragment 解析为单个无 mark text node，link rule 仍不消费。
- 默认 `linkifyjs` 未识别的电话号码或其它额外 token：link rule 不消费。
- 合法外部 anchor canonicalize href；非法 anchor 只保留文字。

### Image

- 格式有效且位于首个顶层元素的内部标记保留 image；标记缺失、位置错误或格式非法时移除 `<img>` 并保留周围内容。
- Data URL image 完成内部 serialize/parse round-trip。
- 文件列表跳过非图片并选择第一张图片。
- Editor image paste 打开一次预填 Dialog；内部 rich-text paste 不打开 Dialog。
- `existingImage` / `initialImageFile` 正确建立初始状态，`selectedImageFile` 在 Dialog 内维护四种运行时组合。
- 插入和编辑模式的文件选择、拖放与 scoped paste 都通过同一入口更换候选文件；输入控件 paste 不被拦截。
- 替换图片保留原说明与展示宽度，并按新图片比例重算高度；插入图片仍使用文件名和自然尺寸初始化。
- 上传 reject、返回的图片加载失败或自然尺寸无效时均报告错误、保留候选文件且 document 不变；成功加载前不释放候选文件。
- 选中已有图片时确认使用现有 update action，undo 恢复旧图片。

### Highlight、List 与 Table

- 合法外部 attrs 保留为 canonical values。
- 非法外部 attrs 归一化为已定义默认值。
- 解析后的 document 通过 `doc.check()`。
- 非法 JSON attrs 由 validators 拒绝。
- 单个 table span 超过 10,000 时归一化为 `1`。

### Chromium clipboard 契约

现有 `rich-text-clipboard.browser.test.ts` 不作为全文 link-on-paste 契约保留。它与 2026-08-01 Playground spec 中“使用 `Shift+Arrow` 建立局部 DOM Selection”的原始设计不一致，且当前断言不能区分 link-on-paste 与 URL 自身 autolink。

改写为：

1. 使用真实 `Shift+Arrow` 选择局部文字，通过原生 paste shortcut 粘贴 URL；精确断言未选文字保持 plain，所选文字保持原文并获得 href。
2. 使用 `Cmd/Ctrl+A` 后粘贴 URL；断言旧内容消失且 document text 等于 URL，不在该用例中断言 autolink mark。
3. 在 image-enabled editor 中使用真实 copy/paste shortcuts 完成内部 Data URL image round-trip。

CellSelection、复杂 selection matrix 和图片 `File` clipboard 使用 happy-dom 定向测试，不在 browser suite 中用 editor command 或伪造操作系统 clipboard 能力替代用户行为。

Headless Chromium clipboard 继续参与常规测试。会覆盖宿主系统 clipboard 的 headed `test:browser:clipboard:ui` 未经用户明确确认不得运行。

## 验证

实现阶段按风险依次运行：

```bash
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/rich-text typecheck
pnpm --filter @rev30/rich-text-playground test
pnpm check
```

定向 Vitest 命令不在 `test` 后添加 `--`。完整 `pnpm check` 按仓库约定在支持 Chromium 的沙箱外运行。

## 风险与约束

### 内部 HTML 标记只支持最佳努力识别

普通外部 HTML 没有有效 `data-pm-slice` 时，client 会在 inert DOM 中移除 `<img>`，减少意外资源加载并保留默认 editor interoperability。Hostile clipboard 仍可伪造格式有效的标记，进而使其中的图片在服务端校验前被 editor 加载；本设计明确接受这一残余风险，不把该流程描述为可靠的网络请求隔离。Client 不据此授权持久化或服务端渲染，server image policy 仍拒绝不允许的 `src`。

### Client 不复制完整 Table 校验

严格 attribute parser 和单 span 上界消除单个任意大 attribute 值，但不能保证多个合法 attribute 组合后的 `width × height` 不超过 server 上限。ProseMirror Tables 可能在 paste transaction 中、server 校验之前为这种候选表格构造较大的 `TableMap`。正常用户内容不依赖这种极端组合；为避免 editor 与 server 维护两套复杂 table policy，本阶段接受 hostile clipboard 可能造成 editor 卡顿或内存压力的风险，不新增 table paste rule、候选网格预检或纯文本 fallback。最终单表、全文累计和几何限制仍由 server 执行。

### Dialog 存在两个 DOM 入口

Editor 和 Dialog 因焦点作用域不同各自接收 paste 事件，但它们复用唯一的图片文件提取函数。Dialog listener 绑定到自身内容根节点，不再绑定 `window`，同一事件不会被两个入口重复处理。

### 依赖行为变化

Link URL tokenization 显式依赖锁定的 `linkifyjs`，不依赖 Tiptap 私有 paste helper。升级该依赖时由产品行为测试判断兼容性，而不是自动继承新的默认行为。

## 验收标准

- 普通 copy、cut 和未被消费的 paste 行为没有新增应用层拦截。
- `compact` 和 `all` preset 从已启用的 editor features 自动获得 paste rules，不维护第二份规则清单，应用调用签名不变。
- 明确文本选区 paste URL 设置链接；`AllSelection` 和其它不符合定义的 selection 类型走默认 paste。
- 外部 link、highlight、ordered list 和 table attrs 解析为 canonical values，结果通过 `doc.check()`。
- Playground Data URL image 能在 image-enabled editor 中内部复制粘贴。
- 首个顶层元素没有有效 ProseMirror clipboard 标记的 HTML，其 `<img>` 在 ProseMirror DOM parse 前移除。
- 编辑器中 paste 图片文件打开已预选第一张图片的 ImageDialog，不自动上传。
- ImageDialog 不再注册全局 paste listener；Dialog 内 paste 与输入框文本 paste 行为正确。
- 图片插入、替换、取消、失败和 undo 行为符合本设计。
- Server image policy、table 完整校验和可信边界保持权威。
- Package 定向测试、typecheck、Playground headless clipboard tests 和完整 `pnpm check` 通过。
