---
status: approved
date: 2026-08-04
---

# 富文本内容样式设计

## 背景

`@rev30/rich-text` 当前通过 `deriveRichTextContent()` 从同一份 Tiptap JSON 派生规范化 JSON、纯文本和经过 sanitize 的 HTML。为使 HTML 脱离项目样式后仍能直接显示，部分 feature 会把静态视觉规则写入每个元素的 `style`：

- Table 为 wrapper、table、每个 cell 和每个 header cell 重复写入滚动、边框、内边距、对齐、表头背景等规则。
- CodeBlock 为 `pre` 和 `code` 写入背景、内边距重置等规则。
- Image 为每张图片重复写入响应式尺寸规则。
- 应用展示 HTML 时又使用 Tailwind Typography 的 `prose prose-sm` 和 `dark:prose-invert`，编辑器也依赖相同 utility classes。
- CodeBlock 的只读高亮在 Client 和 Playground 中分别以 raw CSS 的方式动态注入 Highlight.js GitHub light/dark theme。

普通短文中的重复量有限，但 Table 的静态样式会随单元格数量线性增长。代表性大型表格中，静态样式文本可以占 HTML 的大部分；即使 HTTP 压缩能降低传输字节，它仍会增加服务端字符串构造、持久化或缓存、响应解压后的内存、sanitize、HTML 解析和 DOM 属性数量。该问题对普通文档是中低风险，对接近现有服务端上限的表格是高风险，值得在当前尚无历史数据和外部兼容负担时调整契约。

项目内和可控的项目外使用方都可以依赖包提供的 CSS，因此不再需要默认生成自包含、可独立展示的 HTML。

## 目标

- 从派生 HTML 中移除重复的静态视觉样式，显著降低大型表格等内容的 HTML 文本量。
- 由 `@rev30/rich-text` 自己拥有内容 CSS，移除富文本对 Tailwind Typography 的依赖。
- 尽量保持当前 `prose prose-sm max-w-none dark:prose-invert` 的实际视觉效果。
- 为只读内容提供 `sm`、`base`、`lg` 三种排版尺寸。
- 按 `all`、`compact` preset 提供独立公共 CSS 入口，避免使用方自行组合 feature CSS。
- Vue editor preset 自动加载对应内容 CSS；server/core 入口继续保持无 CSS 副作用。
- 使用项目现有 `.dark` 根类自动切换明暗样式，不使用 `light-dark()`。
- 保留由内容作者选择、且经过 schema 和 sanitizer 约束的格式与尺寸。
- 保持 `deriveRichTextContent()` 的 schema 校验、资源限制、纯文本派生和安全边界不变。

## 非目标

本阶段不实现：

- 自包含 HTML、邮件 HTML、带全部内联样式的导出模式。
- 无 CSS 时的运行时检测、自动 fallback 或警告。
- 按单个 feature 暴露公共 CSS 组合 API。
- 运行时 CSS 生成、TypeScript/CSS codegen 或从 preset 对象动态构造 stylesheet。
- `RichTextEditor` 的尺寸 prop；编辑器固定使用 `sm`。
- `xl`、`2xl` 或任意自定义排版尺寸。
- 单个页面中并存互不相同的富文本 light/dark 容器。
- `prefers-color-scheme`、每容器 theme prop 或 theme attribute。
- 旧 HTML、旧 CSS 变量或旧精确 HTML 字符串的兼容层与迁移。
- 为未来假设的破坏性变更预先设计 HTML/CSS 版本字段、长期兼容矩阵或自动重新派生机制。
- 面向非主流或已停止维护浏览器的兼容实现。
- 改变富文本 JSON schema、数据库字段或 API 响应结构。

## 方案选择

采用“独立 preset CSS 入口 + 包内 feature CSS partial”方案：

- 使用方只选择 `all.css` 或 `compact.css`。
- 两个 preset 文件分别直接组合内部 base 和 feature CSS，互不 import。
- feature 的特殊视觉规则与 feature 代码放在同一目录。
- CSS 使用普通静态源码，由现有 Vite/CSS pipeline 处理。
- 公共入口和内部 partial 均使用未分层 CSS，不声明 `@layer`。

未采用以下方案：

- **公开 feature CSS 入口并由使用方逐项组合**：可做到最小 CSS，但会把 preset 一致性和 import 顺序转嫁给使用方。
- **由 TypeScript preset 生成 CSS**：能从一个模型生成多种输出，但当前只有两个稳定 preset，会引入不必要的构建协议和调试成本。
- **保留静态内联样式并只压缩字符串**：无法减少 DOM 属性、解压后内存和解析成本，也继续混合内容数据与视觉默认值。

## 公共契约

### HTML 输出

`deriveRichTextContent()` 继续返回 HTML fragment，不增加根 wrapper，也不在 JSON 或 HTML 中保存 preset 名称、排版尺寸或 theme：

```ts
const { html } = deriveRichTextContent(contentJson, compactRichTextServerPreset)
```

HTML 本身只承诺：

- 语义化结构与现有 accessibility attributes。
- preset 允许的节点、marks 和 attributes。
- 经过规范化和 sanitize 的作者格式及内容尺寸。

HTML 不再承诺脱离对应 CSS 后保持完整视觉。缺少 CSS、导入了错误 preset CSS，或者忘记添加容器 class，均属于使用方的集成错误；包不为此增加运行时 fallback。

HTML 结构与内容 CSS 按正常方式做非破坏性演进。本设计不为尚未发生的破坏性变化增加版本标记或永久兼容承诺；未来确有此类需求时，再根据当时的持久化数据和部署约束单独设计。

### 公共 CSS 入口

`packages/rich-text/package.json` 增加两个公共 export：

```text
@rev30/rich-text/content/presets/all.css
@rev30/rich-text/content/presets/compact.css
```

不提供根级 `content.css`，也不公开 base 或 feature partial。只读或非 Vue 使用方显式导入与 server preset 对应的 CSS：

```ts
import '@rev30/rich-text/content/presets/compact.css'
```

```html
<div class="rich-text-content rich-text-content--sm">
  <!-- sanitized HTML fragment -->
</div>
```

同一个 bundle 中只需导入一次对应 stylesheet。

### Vue preset 自动加载

以下 Vue preset 入口各自 side-effect import 对应的 preset CSS：

```text
@rev30/rich-text/vue/presets/all
@rev30/rich-text/vue/presets/compact
```

因此使用 `RichTextEditor` 的常规 Vue 消费方不需要再手动导入内容 CSS。自动加载只发生在 Vue preset 入口：

- `@rev30/rich-text/presets/*` 保持纯 core 配置。
- `@rev30/rich-text/server/presets/*` 和 `@rev30/rich-text/server` 不 import CSS，也不依赖 Vue/editor 模块。
- 只展示服务端 HTML、未 import Vue preset 的页面仍显式 import 公共 CSS。

### 容器与尺寸

所有内容规则均作用于 `.rich-text-content` 后代，不污染宿主页面：

| class | 根字号 / 行高 | 用途 |
| --- | --- | --- |
| `.rich-text-content--sm` | `14px / 24px` | 当前编辑器和现有只读展示的默认值 |
| `.rich-text-content` 或 `.rich-text-content--base` | `16px / 28px` | 普通只读正文 |
| `.rich-text-content--lg` | `18px / 32px` | 较宽松的只读正文 |

`.rich-text-content--base` 是明确表达默认尺寸的同义 class，不是兼容 alias。尺寸 class 只控制排版比例，不改变 preset 能力或 theme。Table 的字号、行高、wrapper 间距和 cell/header padding 也参与尺寸变化；边框宽度、`96px` 最小列宽和横向滚动行为保持固定。

`RichTextEditor` 不增加尺寸 prop；内部 `EditorContent` 固定添加：

```text
rich-text-content rich-text-content--sm
```

只读场景由使用方选择尺寸。现有 Announcement、Client demo 和 Playground 继续使用 `sm`。

## CSS 架构

### 目录

```text
packages/rich-text/src/
├── content/
│   ├── base.css
│   └── presets/
│       ├── all.css
│       └── compact.css
└── features/
    ├── blockquote/content.css
    ├── code-block/content.css
    ├── heading/content.css
    ├── image/content.css
    ├── link/content.css
    ├── list/content.css
    ├── table/content.css
    └── ...
```

只为确实具有静态内容视觉的 feature 增加 `content.css`。没有专属视觉规则的 feature 不创建空文件。

### Preset 组合

`compact.css` 直接 import `base.css` 及 compact feature 集合需要的 partial；`all.css` 直接 import `base.css` 及 all feature 集合需要的 partial。两者必须满足：

- `all.css` 不 import `compact.css`。
- `compact.css` 不 import `all.css`。
- 两个入口分别可以单独加载和构建。
- partial import 顺序由 preset 文件固定，使用方不负责排序。
- all-only selector 即使与 compact CSS 同处一个 bundle，也不改变 compact schema；CSS 不承担内容合法性校验。

### 作用域与宿主边界

`base.css` 提供容器、尺寸、颜色解析、首尾 block margin 和必要的局部 normalization。具体节点规则使用低特异性的 scoped selector，例如：

```css
.rich-text-content :where(p) {
  /* content typography */
}
```

规则遵循以下边界：

- 不写全局 element selector，不依赖 Tailwind Preflight。
- 不使用 `@layer`，避免公共 stylesheet 的优先级取决于宿主 layer 声明或加载顺序；规则以普通未分层 author CSS 参与 cascade。
- 为内容内部需要稳定盒模型的元素提供 scoped normalization，但不提供全站 reset。
- 不使用 `!important`，保证经过 sanitizer 允许的作者内联格式可以覆盖默认值。
- 正文、标题、列表和引用默认继承宿主应用字体；inline code 与 CodeBlock 显式使用标准 system monospace 字体栈，避免依赖 Tailwind Preflight 或宿主 reset。作者通过 TextStyle 选择的合法字体仍由内联样式覆盖默认值。
- 容器不再采用 Typography 的 `65ch` 上限；保持现有 `max-w-none` 的有效行为。
- 编辑器 selection、NodeSelection、Quick Bar 锚点、focus ring、placeholder 等交互样式仍属于 Vue/editor 层，不进入只读内容 CSS。

使用方优先通过公开 CSS 变量定制颜色；其它有意覆盖使用后加载的普通 CSS。Tailwind utility 所在的 cascade layer 不保证覆盖本包的未分层内容规则，本设计也不把 utility override 作为公共契约。

### Typography 视觉基线

实现时以仓库当前 `@tailwindcss/typography@0.5.20` 实际生效的 default、`prose-sm`、`prose-lg` 声明为迁移基线，只复制当前富文本 schema 能产生的元素规则，包括：

- paragraph、heading、list 及嵌套 list 的字号、行高、间距和字重。
- link、strong、em、underline、strike、inline code 的基础外观。
- blockquote、horizontal rule、code block、image 和 table wrapper 的间距。
- 根节点首尾 block 的 margin 收敛。

迁移后这些值由 `@rev30/rich-text` 源码拥有，不在构建或运行时依赖 Tailwind Typography。`sm` 必须尽量保持当前编辑器与只读页面的 computed styles；`base`、`lg` 分别采用 Typography 同名尺寸比例。Table 的 `sm` 保持当前表内文字和 cell/header 留白密度，`base`、`lg` 按对应 Typography 比例增大；固定结构约束不随尺寸变化。实现不复制当前 schema 无法产生的 `lead`、`video`、`figure`、`figcaption`、`kbd`、definition list 等规则。

本次有意不迁移 Typography 通过伪元素生成的装饰字符：inline code 不再由 `::before`/`::after` 添加反引号，blockquote 也不再为首尾 paragraph 添加引号。内容 CSS 不生成规范 HTML 中不存在的文字；inline code 与 blockquote 的其它排版和颜色仍按上述基线迁移。

迁移的规则需标明来源版本，并在 `packages/rich-text/THIRD_PARTY_NOTICES.md` 保留 `@tailwindcss/typography@0.5.20` 的 MIT 许可说明。该文件只记录实际复制或改写进入源码的第三方样式，不替代依赖锁文件。

## 颜色与明暗模式

### Theme 切换

默认规则是 light；存在 `.dark` 祖先时应用 dark defaults：

```css
.rich-text-content {
  /* light defaults */
}

.dark .rich-text-content {
  /* dark defaults */
}
```

该约定直接兼容当前 Client theme store 和 Playground 对 `document.documentElement.classList` 的管理。设计不使用 `light-dark()`，也不根据系统 `prefers-color-scheme` 自动推断。目标浏览器为实现时的主流 evergreen Chrome、Edge、Firefox 和 Safari。

### 公共 CSS 变量

仅公开颜色层面的高价值覆盖点，不把每个字号、间距或 token 都转成公共 API：

| 变量 | 控制内容 |
| --- | --- |
| `--rich-text-content-body-color` | 正文文字 |
| `--rich-text-content-heading-color` | heading、strong 等强调文字 |
| `--rich-text-content-link-color` | link |
| `--rich-text-content-muted-color` | marker、分割线等弱化元素 |
| `--rich-text-content-code-color` | inline code 和 code block 基础文字 |
| `--rich-text-content-code-background` | code block 背景；inline code 默认保持透明 |
| `--rich-text-content-quote-color` | blockquote 文字 |
| `--rich-text-content-quote-border-color` | blockquote 边线 |
| `--rich-text-content-table-border-color` | table/cell 边框 |
| `--rich-text-content-table-header-background` | table header 背景 |

每个规则使用“公共变量 → editor theme 变量（如适用）→ 当前 light/dark 默认值”的解析顺序。公共变量只在 `var()` 中被读取，包自身不为它们赋默认值，因此使用方在容器或祖先上设置的值在 light/dark 下都优先；如需不同覆盖值，由使用方分别在普通和 `.dark` 作用域设置。内部可使用未文档化的 resolved/token variables 减少重复，但它们不是公共契约。实现不保留旧变量 alias；本设计与代码同步切换。

### CodeBlock 与 Highlight.js

`code-block/content.css` 负责两类规则：

- CodeBlock 容器的间距、padding、圆角、横向滚动和当前 light/dark 背景。
- 作用域限定在 `.rich-text-content` 内的 `.hljs`、`.hljs-keyword` 等 syntax token 颜色。

它不直接 `@import` Highlight.js 的全局 theme CSS。token selector 与颜色从当前使用的 `highlight.js/styles/github.css` 和 `github-dark.css` 原样迁移到包内作用域，CodeBlock 容器背景继续沿用当前 rich-text 的 light/dark 配色，不自行设计新 palette。

迁移的 theme selector 和 palette 同样标明来源版本，`packages/rich-text/THIRD_PARTY_NOTICES.md` 保留 `highlight.js@11.11.1` 的 BSD 3-Clause 许可说明。

Highlight.js JavaScript 行为不变：编辑器继续由 Lowlight 产生高亮 token，只读 Client/Playground 继续运行 `highlightElement()`。公共 CSS 只提供视觉，不负责执行语法分析。Client 和 Playground 删除 raw theme CSS import、动态 style tag 和随 theme 重写 stylesheet 的逻辑。

## HTML 样式边界

### 移入 CSS 的静态规则

| Feature | 移入 preset CSS 的内容 |
| --- | --- |
| Base / Heading / List / Link / marks | 颜色、字重、装饰、字号、行高、margin、padding、marker |
| Blockquote / HorizontalRule | 边线、颜色、间距 |
| CodeBlock | 背景、padding、圆角、overflow、code reset、syntax token 颜色 |
| Image | block 布局、上下间距、`max-width: 100%`、`height: auto` |
| Table | wrapper 滚动、table 默认宽度与 border collapse、cell 最小宽度/边框/按尺寸变化的 padding/垂直对齐、header 背景与字重 |

这些规则不再由 Tiptap extension 的静态 `HTMLAttributes` 或 server sanitizer transform 重复重建。

### 继续保留在 HTML 的内容格式

以下值属于文档内容或实际尺寸，继续由 schema 约束，并由 sanitizer 规范化后输出：

- TextStyle 的 text color、font family、font size、line height。
- Highlight 的作者选择颜色。
- Paragraph、Heading 和 TableCell 的显式 text alignment。
- Table/col 的合法固定 `width` 或 `min-width`，以及 `colspan`、`rowspan`、`colwidth`。
- Image 的 `src`、`alt`、`width`、`height`。数值 `width` 和 `height` 属性保留作者选择的展示尺寸与宽高比；Image 不再输出 `style` 属性，block 布局、响应式上限和自动高度全部由 CSS 提供。
- CodeBlock 的 language class，以及 Highlight.js/Lowlight 产生的 scoped token classes。
- Table wrapper 的 `class`、`tabindex`、`role` 和可访问名称。

没有实际自定义值时不输出占位内联声明：例如默认 cell alignment 和 Table 的默认 `width: 100%` 都由 CSS 处理。Image 无论是否设置展示尺寸都不输出内联样式。

### Sanitizer 与数据流

数据流保持：

```text
contentJson
→ preset schema 构造与 document.check()
→ feature document assertions
→ static renderer
→ preset HTML policies / sanitizer
→ sanitized HTML fragment
```

server feature policy 只允许其真实需要的动态 style property，不再为静态视觉开放任意值或重建固定声明；Image policy 不再允许 `style` 属性。Table 的几何校验、单表/全文资源上限、Image URL 校验、TextStyle/Highlight allowlist 和链接安全规则均保持现有行为。

CSS 不参与安全判断。内容是否合法仍完全由 schema、feature assertions 和 sanitizer 决定。

## 应用接入

实现以一次原子切换完成，不保留双轨行为：

- `RichTextEditor` 使用 `.rich-text-content.rich-text-content--sm`，删除 `prose`、`prose-sm`、`max-w-none` 和 `dark:prose-invert`。
- Announcement 只读内容显式 import compact CSS，并使用 `sm` container classes。
- Client rich-text demo 和 Playground 使用 all CSS 与 `sm` container classes；其 Vue all preset import 会自动带入 stylesheet。
- 删除 Client 和 Playground 的 `@tailwindcss/typography` plugin 配置与依赖；Tailwind CSS 继续用于普通应用 UI。
- 删除 Client/Playground 的 Highlight.js raw theme 注入逻辑，只保留代码高亮 JavaScript。
- 更新 table、code-block、image renderer 与 sanitizer policy，使静态视觉由 CSS 接管。
- 更新 package exports、相关 README 和富文本 Playground 说明，明确 HTML 与 preset CSS 必须配套。

仓库没有需要迁移的历史富文本数据，也没有依赖精确 style attribute 的外部消费者，因此不增加 feature flag、旧样式变量 alias、旧 HTML parser 或数据迁移脚本。

## 与既有 spec 的关系

本设计实现后，取代 `2026-07-27-rich-text-table-design.md` 中以下已冻结决定：

- Table 静态视觉由 server HTML 内联样式保证。
- 派生 Table HTML 无需外部 CSS 即可独立保持完整视觉。
- Table 内容继续依赖 Tailwind Typography 的 `prose` 排版。
- Table wrapper 间距仅由 editor scoped CSS 持有，静态 HTML 保持不同的间距实现。

同时取代 `2026-06-03-rich-text-image-upload-design.md` 中“图片防溢出由 Image HTML 自己输出、不要求配套 CSS”的决定；Image 尺寸仍是内容属性，但响应式约束改由对应 preset CSS 提供。

同时取代 `2026-08-01-rich-text-playground-design.md` 中 Playground 使用 Tailwind Typography 渲染结果、并以此保持与 Client 等价样式管线的决定；新的等价基线改为 `@rev30/rich-text` all preset CSS。

旧 spec 仍作为当时决策记录保留，不回写或改写；当前行为以本设计完成后的代码和测试为准。其它 Table schema、交互、几何校验、资源上限、安全决定，以及 Image 上传和 Playground 功能边界不受影响。

## 测试与验证

### 现有测试更新

- 更新 server renderer/sanitizer 的现有期望值，使其反映新的 HTML 输出，同时继续覆盖现有 schema、URL、style allowlist、Table 几何和资源限制等安全行为。
- 更新现有 Vue、Client 和 Playground 测试中的容器 class、CSS import 与 Highlight.js theme mock。
- 保留并更新现有 architecture tests，继续保证 server 不 import Vue/editor/CSS，Vue preset 可以 side-effect import 自己的 preset CSS。
- 不为“没有 `prose`”“没有 `light-dark()`”“没有旧内联声明”或“compact 不含 all-only selector”增加专门的反向测试。

### 新增正向契约

- 验证两个公共 preset CSS export 都能被独立解析和加载。
- 验证导入 all/compact Vue preset 后，`RichTextEditor` 能获得对应内容样式且默认使用 `sm`。
- 在真实浏览器中验证同一代表性文档在 editor 与只读容器中的关键 computed styles 一致。
- 验证 `sm`、`base`、`lg` 的根字号/行高及代表性 heading、paragraph、list、Table 字号与间距按预期变化，同时固定结构约束不变。
- 验证根节点 `.dark` 切换后正文、标题、链接、引用、code 和 table 使用 dark defaults。
- 验证 table 横向滚动、cell/header 外观、图片响应式尺寸和 CodeBlock syntax token 在真实浏览器中可见且正确。
- 验证公共颜色变量可以覆盖代表性正文、链接、code 和 table 颜色。

### 手工体积验收

实现阶段使用固定的 100 × 100 Table JSON 比较变更前后的 `derived.html.length`：

- 第一行为 `tableHeader`，其余行为 `tableCell`。
- 每个单元格使用默认 `colspan`、`rowspan`、`colwidth` 和 alignment，不添加作者格式。
- 单元格包含一个 paragraph，文本按 `R{row}C{column}` 生成，行列从 1 开始计数。
- 单表恰好占用现有上限 10,000 个 grid slots，不触发超限路径。

当前实现对该样本派生出的 HTML 长度约为 259 万字符；移除重复静态样式后的预估降幅约为 82%。实现验收目标仍为 `derived.html.length` 较当前实现降低至少约 75%。该值只作为一次性实现验收和回归风险判断，不写成精确字节数的自动化测试，也不把压缩算法或机器环境纳入公共契约。

### 完整验证

- 定向运行 `@rev30/rich-text` tests 与 typecheck。
- 运行 Client 和 Playground 相关测试及真实 Chromium browser tests。
- 检查 light/dark、三种尺寸、editor/read-only、Table、Image 和 CodeBlock 的代表性视觉。
- 最终在沙箱外运行 `pnpm check`。

## 验收标准

- `deriveRichTextContent()` 仍返回安全的 HTML fragment，但大型 Table 不再为每个 cell 重复输出静态视觉样式。
- 对应 preset CSS 加载后，现有 editor 和只读页面的 `sm` 视觉与当前效果基本一致。
- `sm`、`base`、`lg` 可用于只读容器；`RichTextEditor` 固定使用 `sm` 且 API 不增加尺寸 prop。
- all 与 compact CSS 均为独立公共入口，互不 import；Vue preset 自动加载对应入口。
- server/core preset 不加载 CSS，包的跨端依赖边界保持成立。
- `.dark` 根类能自动切换内容明暗配色，不依赖 `light-dark()` 或系统 media query。
- CodeBlock 继续使用当前 GitHub light/dark syntax palette，Client/Playground 不再动态注入全局 Highlight.js theme CSS。
- 作者选择的 text style、highlight、alignment、Table/col 尺寸和 Image 尺寸继续安全保留。
- 现有富文本安全、Table 资源上限和用户可见编辑行为无回归。
- 固定 100 × 100 Table 样本的派生 HTML 文本量较当前基线降低至少约 75%。

## 预期改动范围

主要改动位于：

- `packages/rich-text/src/content/` 与各相关 feature 的 `content.css`。
- `packages/rich-text/THIRD_PARTY_NOTICES.md` 的样式来源与许可说明。
- `packages/rich-text/package.json` 的 CSS exports。
- `packages/rich-text/src/vue/presets/all.ts`、`compact.ts` 的 CSS side-effect imports。
- `packages/rich-text/src/vue/RichTextEditor.vue` 的内容容器 class 与静态/交互样式边界。
- Table、CodeBlock、Image 等 feature 的 shared/server renderer 和 HTML policy。
- `apps/client/src/style.css`、`playgrounds/rich-text/src/style.css` 及各自 package dependency。
- Announcement、Client demo、Playground 的只读富文本容器与 CodeBlock highlight glue code。
- `packages/rich-text`、Client、Playground 相关 unit/browser/architecture tests。
- 富文本 package/Playground README 中的 CSS 消费说明。

本设计不要求修改：

- 富文本 JSON schema 和现有 preset feature 集合。
- `packages/contracts`、数据库 schema 或业务 API 结构。
- Table、Image、TextStyle、Highlight 等内容属性的产品能力。
- Client 的全局 theme store 或根 `.dark` 管理方式。
