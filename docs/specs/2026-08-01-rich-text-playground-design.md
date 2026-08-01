---
status: approved
date: 2026-08-01
---

# 富文本 Playground 设计

## 背景

`@rev30/rich-text` 已提供 Vue editor、共享 schema、`all`/`compact` editor preset，以及对应的 server preset 和内容派生能力。当前完整功能演示位于 `apps/client` 的后台 demo 页面，该页面同时依赖业务路由、权限、API 和 `apps/server`，不适合作为富文本包本身的轻量本地开发入口。

现有 rich-text DOM 测试统一运行在 happy-dom 中。它们能够可靠验证命令、组件状态、ARIA、事件处理和 ProseMirror transaction 等应用逻辑，但不能证明真实浏览器中的布局、DOM Selection/Range、默认焦点移动、原生剪贴板和浏览器特有的 contenteditable 行为。项目需要一个以功能展示为主、同时承载少量真实浏览器契约测试的独立 playground。

本设计新增一个非生产 workspace package。它在浏览器中同时使用真实 client `all` preset 和真实 server `all` preset，不启动业务服务，也不经过 HTTP；编辑器 JSON 直接进入完整的 schema 校验、文档约束、静态渲染和 HTML 清洗流程。

## 目标

- 提供一个面向本地开发的 `all` preset 完整功能展示页。
- 使用覆盖大部分内容 feature 的默认文章，让页面首次打开即可展示真实内容。
- 在同一浏览器 bundle 中显式引入真实 client/server preset，验证两端 feature 配对和完整派生流程。
- 自动展示清洗后 HTML 的渲染结果，以及规范化 JSON 和 HTML 源码的展示副本；展示副本省略图片 data URL 的 base64 payload。
- 支持亮色、暗色、跟随系统三种主题模式。
- 使用 base64 data URL 模拟图片上传，不依赖 API、鉴权、数据库或持久化。
- 使用 Vitest Browser Mode 和真实 Chromium 补充 happy-dom 无法证明的关键用户行为。
- 让 playground 的类型检查、构建和精炼浏览器测试参与根级 `pnpm check`，避免本地工具腐化。

## 非目标

本阶段不实现：

- 修改、删除或精简现有 `apps/client` 富文本 demo 及其服务端 API、权限资源和测试。
- 展示 `compact` preset，或提供 preset 切换、自定义 feature 组合器。
- 将 playground 部署为生产应用，或加入现有根命令 `pnpm dev`。
- 引入路由、认证、PGlite、业务请求层或任何远程服务。
- 保存编辑内容、上传图片或派生结果；刷新后始终恢复默认文章。
- 导入、导出、下载、分享、版本历史或多文档管理。
- 把 server preset 放到 Web Worker，或提前优化极长文档的派生性能。
- 迁移或复制现有 happy-dom 测试，建立浏览器覆盖率门槛或视觉截图测试。
- 首期运行 Firefox/WebKit 矩阵，或把 synthetic composition/CJK `insertText` 声称为真实系统 IME 验证。
- 抽取或重构 `apps/client` 的主题、附件或 demo 基础设施。
- 主动重构 `packages/rich-text`，或修复七组既定浏览器契约之外的既有问题。

## 设计决策摘要

| 主题 | 决策 |
| --- | --- |
| 仓库位置 | 新增顶层 `playgrounds/*` 分类，首个 package 为 `playgrounds/rich-text` |
| package | 私有 `@rev30/rich-text-playground`，不属于生产 `apps/*` |
| 页面结构 | 单页、宽屏左右约 `3:2`、窄屏上下排列 |
| 编辑能力 | 只使用真实 client `all` preset |
| 派生能力 | 浏览器直接调用真实 server `all` preset 和 `deriveRichTextContent` |
| 结果更新 | 首次立即派生；编辑后 300ms 防抖自动派生 |
| 结果视图 | 默认渲染清洗 HTML；另有规范化 JSON 和 HTML 源码的展示副本，省略图片 base64 payload |
| 图片 | JPEG/PNG/WebP 文件转 data URL；不持久化、不请求服务端 |
| 主题 | 亮色、暗色、跟随系统，只持久化主题选择 |
| 测试 | 同一 package 内使用 Vitest Browser Mode + Playwright provider + Chromium |
| 根命令 | 新增 `pnpm dev:playground:rich-text`；现有 `pnpm dev` 不变 |

## 仓库与 package 架构

### Workspace 分类

`pnpm-workspace.yaml` 在现有 `apps/*`、`packages/*` 之外增加：

```yaml
packages:
  - apps/*
  - packages/*
  - playgrounds/*
```

`playgrounds/*` 表达仅供开发、调试、展示或实验的私有 workspace package。它仍属于同一个 pnpm workspace，不创建嵌套 workspace。

预期目录结构：

```text
playgrounds/rich-text/
  __tests__/
    fixtures/
      RichTextEditorHarness.vue
    rich-text-clipboard.browser.test.ts
    rich-text.browser.test.ts
    setup.browser.ts
  src/
    assets/
      example-image.webp
    components/
      EditorPanel.vue
      ResultPanel.vue
    playground/
      defaultDocument.ts
      image.ts
      presets.ts
      useDerivation.ts
      useThemeMode.ts
    App.vue
    main.ts
    style.css
  index.html
  package.json
  tsconfig.app.json
  tsconfig.node.json
  tsconfig.test.json
  vite.config.ts
  vitest.config.ts
```

文件可在实现时按职责做等价的小幅调整，但不得把展示页和浏览器测试拆成两个 workspace package 或两个应用。

### 依赖边界

playground 只通过 `@rev30/rich-text` 的公开 exports 使用包能力：

- `@rev30/rich-text/schema`
- `@rev30/rich-text/vue`
- `@rev30/rich-text/vue/presets/all`
- `@rev30/rich-text/server`
- `@rev30/rich-text/server/presets/all`

内部包依赖保持 `workspace:*`。playground 不导入 `apps/client`、`apps/server` 或 rich-text 的 `src/*` 私有路径。

显式把 server entry 放入 playground 浏览器 bundle 是本设计的有意行为，不改变 Vue/editor 公共入口不得意外携带 server 模块的既有架构约束。`@rev30/rich-text` 现有 import-boundary 测试继续保留；playground 的浏览器 smoke test负责证明显式 server import 在真实 Chromium 中仍可执行。

第三方依赖只增加以下类别：

- Vue、Vite、Naive UI 和现有主题/样式管线所需依赖。
- Tailwind CSS、Iconify Tailwind plugin 和 typography plugin，用于生成 rich-text 源码中的 utility class 及结果渲染样式。
- `highlight.js`，用于清洗后代码块的只读语法高亮。
- Vitest Browser Mode 所需的 `@vitest/browser-playwright`、`vitest-browser-vue` 和 Chromium provider 依赖。

已有 catalog 依赖继续使用 `catalog:`，其它依赖与仓库现有直接版本保持一致；不为本任务迁移无关 package 的依赖声明，也不为 playground 引入 Storybook、Playwright Test、路由或状态管理库。

## 模块职责

| 单元 | 职责 | 依赖 |
| --- | --- | --- |
| `App.vue` | 页面框架、主题 provider、左右布局和顶层错误展示 | Naive UI、主题 composable、两个 panel |
| `EditorPanel.vue` | 渲染真实 `RichTextEditor`、同步 `modelValue`、恢复默认文章 | client preset、默认文档工厂 |
| `ResultPanel.vue` | 展示派生状态、渲染结果，以及省略图片 payload 的规范化 JSON 和 HTML 源码展示副本 | 派生结果、代码高亮 |
| `presets.ts` | 创建一次 client/server `all` preset，并配置图片 callbacks/policy | rich-text 公开 preset entries、图片 helper |
| `defaultDocument.ts` | 每次返回全新的默认 `RichTextDocument` | rich-text schema 类型、示例图片 data URL |
| `image.ts` | 校验本地文件、读取 data URL、同步校验 server 允许的 data URL | 浏览器 File/FileReader API |
| `useDerivation.ts` | 维护 300ms 防抖、内容 revision、最近成功结果和派生错误 | `deriveRichTextContent`、server preset |
| `useThemeMode.ts` | 三态主题、系统媒体查询和主题偏好持久化 | Vue、`matchMedia`、`localStorage` |
| Browser fixture | 用真实样式和 provider 挂载 rich-text，暴露用户可见状态供测试断言 | Vitest Browser Mode、`vitest-browser-vue` |

每个单元只承担表中职责。尤其不把 preset 创建、图片 policy、派生状态和主题持久化全部堆入 `App.vue`。

## 页面与交互设计

### 页面框架

页面不使用路由。顶部 header 包含：

- 标题“Rich Text Playground”。
- 简短说明，明确这是 `all` preset 的本地功能展示。
- Naive UI 主题选择控件，提供亮色、暗色、跟随系统三项。

主工作区在 Tailwind `xl` breakpoint 及以上使用 `minmax(0, 3fr) minmax(22rem, 2fr)` 双栏布局，编辑器在左、派生结果在右；更窄宽度下改为上下排列。左右面板都有 `min-width: 0`，结果区和表格等宽内容只在自身范围内滚动，不造成页面级横向溢出。

### 编辑区

编辑区直接渲染 `RichTextEditor` 和真实 client `all` preset。初始 `modelValue` 来自默认文档工厂，editor `min-height` 为 320px，宽屏时优先使用可用视口高度。

编辑区底部只提供一个次要操作“恢复示例”。该操作：

1. 以工厂函数创建新的默认文档对象。
2. 替换当前 editor JSON。
3. 清除图片或派生错误。
4. 立即重新派生，不等待 300ms 防抖。

不提供“生成结果”按钮。用户编辑后自动触发防抖派生。

### 结果区

结果区使用三个标签页，固定顺序为：

1. **渲染**：默认标签页，使用 `v-html` 展示 server preset 返回的清洗 HTML。
2. **JSON**：使用两个空格缩进展示 server preset 返回的规范化 JSON 的展示副本。
3. **HTML**：展示 server preset 返回的 HTML 字符串的展示副本。

不展示编辑器提交前的原始 JSON，也不展示 `deriveRichTextContent` 返回的纯文本。渲染标签页在 DOM 更新后对带语言信息的代码块执行 `highlight.js` 高亮；每次结果替换后重新处理，不保存或复用旧 DOM。高亮只改变渲染标签页的展示 DOM，不改写 server 返回值或 HTML 源码标签页。

JSON 和 HTML 源码标签页不得把图片 data URL 的完整 base64 payload 写入 DOM。页面为每个合法的 `data:image/(jpeg|png|webp);base64,...` 保留 MIME 前缀，并把 payload 替换为明确的省略标记和解码后字节数；视图内同时提示这里展示的是省略图片 payload 的副本。除图片 payload 外不得截断或改写派生结果。

完整规范化 JSON 和清洗 HTML 仍保存在内存中的派生结果里，并原样用于渲染标签页。首期不提供查看、复制或下载完整 payload 的入口；需要核对完整返回值时使用浏览器开发工具。源码展示副本的生成不得回写派生结果。

结果状态为：

- `ready`：当前结果对应最新 editor revision。
- `pending`：内容已经变化，正在等待 300ms 防抖；继续显示上次成功结果并提示“内容已修改，正在同步”。
- `error`：最新 revision 派生失败；继续显示上次成功结果，并明确标记该结果不是当前内容。

页面初始化立即派生默认文章，因此正常情况下不出现长期空结果。只有首次派生失败时结果区显示错误空状态。

## 默认文章

默认文章以可阅读的示例内容组织，不是 feature 名称堆砌。它至少包含：

- 一级至三级标题和普通段落。
- 加粗、斜体、下划线、删除线、行内代码和高亮。
- TextStyle 支持的代表性字体、字号、文字颜色和行高。
- HTTPS 示例链接；当前 link feature 拒绝相对 URL，不制造无法通过同一 schema 的“内部链接”。
- 左对齐、居中、右对齐和两端对齐的代表性段落。
- 无序列表、有序列表和引用。
- 带合法语言标记的代码块。
- 分割线。
- 一张小于 1 MiB 的仓库内 JPEG、PNG 或 WebP 示例图片，在构建时以内联 data URL 导入并写入文档。
- 一张包含表头和多行内容的表格。

默认文档必须通过同一个 server `all` preset 的完整校验和清洗。History、SearchReplace、Slash Menu、Quick Bar 和 CharacterCount 是交互能力，不为它们制造虚假 JSON；用户通过真实工具栏、快捷键、选区和状态栏体验。

默认文档由工厂函数生成，调用方不得共享或原地修改模块级 JSON 对象。

## Client/Server preset 与图片策略

### Preset 生命周期

页面 setup 时各创建一次：

- `createAllRichTextEditorPreset(...)`
- `createAllRichTextServerPreset(...)`

编辑器更新不会重新创建 preset。client preset 的图片 `upload` 调用本地 data URL helper，`onError` 将错误交给页面展示。server preset 使用与上传 helper 相同的允许类型和大小边界。

### 图片上传

首期图片策略为：

- 只接受 MIME 为 `image/jpeg`、`image/png`、`image/webp` 的文件。
- 单个输入文件最大 1 MiB。
- 不做压缩、缩放或格式转换，避免引入 `apps/client` 附件链路。
- 使用 `FileReader.readAsDataURL` 读取，并把结果作为 editor image `src`。
- 上传失败不修改文档，并显示明确的类型、大小或读取错误。

server image options：

- `allowedSrcSchemes` 只额外允许 `data`。
- `isAllowedSrc` 只接受 `data:image/(jpeg|png|webp);base64,...`。
- 校验合法 base64 结构，并以浏览器可执行的同步长度计算确认解码后不超过 1 MiB。
- 拒绝外部 URL、协议相对 URL、其它 data MIME 和超限 payload。

不得复用 `apps/server` demo 中依赖 `Buffer.byteLength` 的函数，也不得为了复用而把 Node polyfill 加入浏览器 bundle。

## 派生数据流

### 初始化

1. 读取主题偏好并建立 theme provider。
2. 创建 client/server preset。
3. 创建默认文档并赋给 editor state。
4. 同步调用 `deriveRichTextContent(defaultDocument, serverPreset)`。
5. 成功后以规范化 JSON 和清洗 HTML建立首个 `ready` 结果。

### 编辑更新

1. `RichTextEditor` emit 新的 `modelValue`。
2. 页面保存最新 JSON并增加单调递增的 revision。
3. 状态转为 `pending`，取消上一枚尚未执行的 debounce timer。
4. 最后一次变化后的 300ms 到期时，读取最新 JSON并同步调用 `deriveRichTextContent`。
5. 成功时原子替换结果与结果 revision，状态转为 `ready`。
6. 失败时保存当前错误，保留最近成功结果，状态转为 `error`。

`deriveRichTextContent` 当前为同步函数，JavaScript 同一线程内不存在旧请求晚于新请求返回的问题，因此不引入 AbortController、请求 ID、Promise 队列或并发 fallback。页面卸载时清除未执行的 timer。

首期接受派生运行在主线程。若未来真实测量表明长文档在 300ms 防抖后仍造成可感知输入阻塞，再另行设计 schema/preset 缓存或 Web Worker；本 spec 不预留未使用抽象。

### 安全语义

playground 调用的是与生产相同的 server preset 派生和清洗逻辑，但代码和输入位于同一个浏览器信任域，因此它验证的是功能一致性和浏览器兼容性，不构成生产安全边界。生产系统仍必须在可信服务端执行校验与清洗。

## 主题与样式

主题模式类型固定为 `light | dark | system`：

- `light` 使用 Naive UI 亮色主题并移除根 `.dark`。
- `dark` 使用 Naive UI 暗色主题并添加根 `.dark`。
- `system` 订阅 `prefers-color-scheme`，根据当前系统值选择上述实际主题。

主题选择写入 localStorage key `rev30-rich-text-playground-theme`；只持久化这一项。系统主题监听在离开 `system` 或组件卸载时正确清理。localStorage 中存在不认识的值时按系统边界拒绝该值并使用 `system`，不维护旧格式迁移。

`style.css` 使用与 client 等价的最小 Tailwind 配置：

- 扫描 playground 源码和 workspace 链接的 `@rev30/rich-text` 源码。
- 启用 typography 与 Iconify Tailwind plugin。
- 定义 dark variant 和必要的基础字体、背景、文本颜色。
- 复用 Naive UI 和 rich-text 主题变量，不复制 client 的业务主题 token 或硬编码等价值。

结果渲染使用 typography 样式并支持暗色；宽表格和代码块必须在结果面板内可滚动或换行。

## 错误处理

只在真实系统边界捕获并转为用户可见错误：

### 图片边界

- 非允许 MIME、超过 1 MiB、FileReader 失败时分别显示“仅支持 JPEG、PNG 和 WebP 图片”“图片不能超过 1 MiB”“读取图片失败”，文档保持不变。
- 下一张合法图片上传成功或恢复示例后清除旧图片错误。

### 派生边界

- schema、文档约束、图片来源或 sanitize transform 失败：显示派生错误并保留最近成功结果。
- 结果区明确提示保留内容已经过期，不能把它标记为当前内容。
- 首次派生失败时显示错误空状态。
- 不回退到 editor DOM、未经清洗的 client HTML 或另一套 renderer。

未知异常使用“生成富文本结果失败”展示，但保留原始 Error 供测试和开发控制台诊断。内部纯函数不增加重复 `try/catch`、空值兜底或 silent fallback。

### 环境边界

- server entry 无法打包或在 Chromium 中执行：构建或浏览器 smoke test直接失败。
- Chromium binary 缺失：测试命令明确失败并提示一次性安装命令，不静默跳过。

## 真实浏览器测试设计

### 运行架构

浏览器测试属于同一个 `@rev30/rich-text-playground` package：

- Vitest Browser Mode 作为 test runner。
- `@vitest/browser-playwright` 作为 provider。
- `vitest-browser-vue` 挂载 Vue 组件并提供可访问 locator。
- 首期只有一个 headless Chromium instance。
- 不引入 Playwright Test 或第二个测试应用。

package 的 `vitest.config.ts` 复用 Vite 的 Vue、Tailwind 和 module resolution 配置。浏览器测试加载真实 `src/style.css`，因此 rich-text utility class、Iconify、typography 和 Naive UI 主题均参与实际布局。

现有 `packages/rich-text` Node/happy-dom 测试全部保留。浏览器层只证明真实引擎契约，不复制纯逻辑、props/emit、ARIA 状态或 transaction 测试。

### Fixture

`RichTextEditorHarness.vue` 是测试辅助组件，不是独立页面。它包含：

- 真实 `NConfigProvider`、真实 playground 样式和真实 client `all` preset。
- 固定且可滚动的编辑器容器。
- 编辑器前后各一个可聚焦控件，用于验证默认 Tab 顺序和整体 blur。
- 可见的 model JSON、blur 次数和必要事件状态，供测试通过用户可观察结果断言。
- 确定性的本地图片 upload callback 和一张小型 PNG/WebP fixture。
- 每个测试独立创建并销毁 editor，不共享 selection、clipboard、对象 URL 或 DOM。

不得 mock Tiptap、BubbleMenu、Naive UI 弹层、`getBoundingClientRect`、scroll metrics 或浏览器 Selection。

### 首期契约用例组

1. **浏览器 preset smoke**
   - 在真实 Chromium 中创建 client/server `all` preset。
   - 默认文章完成初始派生和渲染。
   - 断言规范化 JSON、清洗 HTML 及 heading/link/code/image/table 等代表性内容存在。
   - 断言内存中的派生结果保留完整图片 data URL，而 JSON/HTML 源码视图只显示带解码后字节数的 payload 省略标记。
   - 该用例守住 `sanitize-html`、PostCSS 和 Tiptap server renderer 的浏览器运行兼容性。

2. **原生输入、Selection 与 Quick Bar**
   - 使用真实键盘输入文本。
   - 使用 `Shift+Arrow` 建立局部 DOM Selection，不调用 editor selection command。
   - 断言 Quick Bar 可见且位于编辑器可见区域内。
   - 点击加粗后只改变实际选区，focus 和 selection 保持符合用户操作。

3. **原生 clipboard 与 Link on Paste**
   - 通过 Playwright provider browser command 为 Chromium 建立确定的 clipboard 内容和必要权限。
   - 用户路径仍使用真实粘贴快捷键，不直接调用 ProseMirror `handlePaste`；macOS 使用 `Meta+V`，其它平台使用 `Control+V`。
   - 断言最终 JSON 中实际选中文字获得期望 link mark。
   - 不把浏览器权限弹窗本身作为测试对象。
   - 该组放在独立 browser test 文件中，使 headed/watch 调试可以安全排除它，但根级 headless suite 必须始终包含它。

4. **Slash Menu 键盘与几何**
   - 在顶层空段落输入 `/` 和查询。
   - 断言菜单相对光标可见、未被容器裁剪，editor 保持正确焦点。
   - 使用方向键和 Enter 执行命令，使用 Tab 关闭后由浏览器默认导航到下一控件。

5. **Toolbar、Popover 与 blur**
   - 使用 `Alt+F10` 进入 Toolbar，以方向键执行 roving focus，以 Escape 返回 editor。
   - 焦点在 Toolbar、Popover 和 Quick Bar 内部移动时不触发整体 blur。
   - 真正离开 editor 组合区域后只触发一次 blur。

6. **CodeBlock 与 Table 布局/键盘**
   - 使用真实坐标点击 CodeBlock 下方空白，产生可继续输入的后继段落。
   - 固定窄容器中的宽表格产生真实 `scrollWidth > clientWidth`。
   - 在最后一个单元格按 Tab 后新增一行并移动 selection。

7. **Image 文件输入与 NodeSelection**
   - 通过真实 file input 选择合法本地图片并完成插入。
   - 自动 server 派生成功，清洗后的渲染结果显示图片。
   - 点击图片形成 NodeSelection，按 Backspace 删除后得到可继续输入的合法文档位置。

编号表示用户契约组；实现可把同组中互不共享 setup 的行为拆成多个 `it`，不以机械的测试数量作为验收标准。

### 契约失败处理

若七组既定用例在真实 Chromium 中暴露 `packages/rich-text` 的现有缺陷，本任务包含让该契约成立所必需的最小修复，并在合适的测试层补充必要的定向回归覆盖。修复必须保持现有公共 exports 和 `apps/client` demo 的既定行为兼容，不借机重构无关 feature。

若修复必须改变既定用户交互、公共 API 或 feature 架构，则视为超出本 spec 已确认的实现范围，停止扩张本任务并另行设计；不得削弱、删除或改写失败的浏览器契约来换取通过。

### 稳定性规则

- Chromium headless、单 worker、`retries = 0`，允许在仓库支持的本地操作系统或未来 CI 环境运行。
- 固定 viewport 为 1280×900、locale 为 `zh-CN`、时区为 `Asia/Shanghai`、颜色模式为亮色；测试不依赖本地字体或外部网络。
- 禁用动画，使用 locator 自动等待；禁止固定 sleep。
- 几何只断言相对关系、可见性、滚动事实和 viewport 边界，不断言固定像素或 Floating UI 私有 class。
- 失败时保留 Playwright trace；trace 统一写入 `playgrounds/rich-text/test-results/traces`，根 `.gitignore` 忽略 `playgrounds/*/test-results/`，不默认生成成功截图或视觉 snapshot。
- 根级 headless Chromium 使用浏览器进程内、非系统承载的 clipboard；剪贴板用例显式建立并清理自己的测试内容，不读取、保存或恢复宿主系统剪贴板。
- 常规 `test:browser:ui` headed/watch 入口排除独立的剪贴板用例，避免反复改写开发者的系统剪贴板。
- 另提供一次性 `test:browser:clipboard:ui` headed 入口，只运行剪贴板用例；命令和 README 必须在启动前明确提示它可能覆盖当前系统剪贴板，且不得为恢复而读取或保存原内容。
- 浏览器用例不得使用 `setTextSelection()`、手工 `CellSelection`、直接 handler 调用或伪造 bounding rect 来替代用户行为。
- 浏览器 suite 不进入现有 V8 coverage 百分比，也不新增覆盖率门槛。

### IME 边界

普通浏览器自动化的 `type()`、`insertText()` 或 synthetic `CompositionEvent` 不能证明真实操作系统输入法候选生命周期。首期：

- 保留现有 composition handler 单测。
- 浏览器测试可以证明 Unicode/CJK 字符能进入 contenteditable，但不得命名为“真实 IME 测试”。
- package README 记录人工检查项：至少覆盖 `/` 查询、候选期间空格/Enter、Escape 和候选确认后的 Slash Menu 状态。
- 不使用 Chromium 私有 CDP IME 命令作为根级 gate。

## 命令与根级集成

根 `package.json` 新增：

```json
{
  "scripts": {
    "dev:playground:rich-text": "pnpm --filter @rev30/rich-text-playground dev",
    "test": "pnpm -r --filter '!@rev30/rich-text-playground' test && pnpm --filter @rev30/rich-text-playground test"
  }
}
```

浏览器 suite 在其它 workspace package 测试完成后单独运行，避免它与现有线程池测试竞争 CPU 和内存。该调整只改变根 `pnpm test` 的编排；各 package 的定向测试命令保持不变。

playground package 至少提供：

| script | 行为 |
| --- | --- |
| `dev` | 启动本地 Vite 开发服务器 |
| `build` | 执行 Vite production build，证明浏览器 bundle 可生成 |
| `typecheck` | 检查 app、browser tests 和 Node config |
| `test` | 无头运行 browser suite，供根 `pnpm test` 调用 |
| `test:browser` | 与 `test` 相同的定向无头入口 |
| `test:browser:ui` | 启动排除剪贴板用例的 headed/watch 浏览器调试入口 |
| `test:browser:clipboard:ui` | 经明确警告后，一次性 headed 运行剪贴板契约；可能覆盖系统剪贴板 |

常用命令：

```bash
pnpm dev:playground:rich-text
pnpm --filter @rev30/rich-text-playground test
pnpm --filter @rev30/rich-text-playground test:browser:ui
pnpm --filter @rev30/rich-text-playground test:browser:clipboard:ui
pnpm --filter @rev30/rich-text-playground exec playwright install chromium
```

新增 workspace package 后，现有递归 `pnpm typecheck` 和 `pnpm build` 自然包含它；根 `pnpm test` 按上述顺序显式包含 browser suite，因此 `pnpm check` 同样覆盖它。不为完整验证增加条件跳过。浏览器 suite 使用单 worker 和精炼用例控制耗时，实施验证时单独记录其热启动耗时。若后续实测成为根级检查的主要瓶颈，应基于数据另行调整执行层级，不在首期预先排除。

## 文档更新

实现时同步更新：

- 根 `README.md` 的目录概览，加入 `playgrounds/*` 非生产 package 分类。
- 根 `README.md` 的常用命令，加入启动 playground 和安装 Chromium。
- `playgrounds/rich-text/README.md`，说明用途、结果语义、定向测试、浏览器依赖、headed 剪贴板调试的系统副作用和人工 IME 边界。
- `packages/rich-text/__tests__/README.md`，补充真实浏览器契约测试由 playground package 持有，并明确 happy-dom 与 browser suite 的职责分界。

现有 demo 文档、API 文档和冻结 spec 不因本任务修改。

## 验证

实现完成后至少运行：

```bash
pnpm --filter @rev30/rich-text-playground typecheck
pnpm --filter @rev30/rich-text-playground test
pnpm --filter @rev30/rich-text-playground build
pnpm check
```

人工验证：

- 宽屏左右布局和窄屏上下布局均无页面级横向溢出。
- 亮色、暗色、跟随系统切换正确，刷新后只恢复主题偏好。
- 默认文章覆盖约定内容，并在首次打开时得到渲染、JSON 和 HTML。
- 连续输入期间编辑器保持流畅；停止约 300ms 后结果更新。
- 合法图片能够插入并派生，非法类型和超限文件显示明确错误。
- 派生失败时不显示未经清洗的 fallback，并清楚标记旧结果已经过期。
- `apps/client` 现有富文本 demo 和对应 API 行为保持不变。

## 风险与缓解

### Server 依赖的浏览器兼容性

当前 server 代码没有直接使用 Node API，但 `sanitize-html` 的传递依赖会在浏览器 bundle 中出现 Node external shim。真实 Chromium preset smoke 是兼容性 gate；不添加 Node polyfill 或另一套 renderer 掩盖失败。

### 主线程派生成本

完整派生包含 schema 建立、文档校验、静态渲染和 HTML 清洗。300ms 防抖避免逐键执行；图片限制为 1 MiB。首期不引入 Worker，后续只基于真实性能数据扩展。

### 样式与生产差异

playground 不依赖 client，但必须使用等价的 Tailwind/Naive UI/rich-text 样式管线。浏览器 fixture 复用 playground 的真实 CSS，防止几何测试运行在无样式 DOM 中。

### 根级测试成本

Chromium 安装是一次性环境成本，browser suite 比 happy-dom 慢。首期通过单浏览器、单 worker、无重试和有限契约组控制成本，并在实现时记录增量耗时；不以静默跳过换取绿色结果。

### 安全误解

浏览器中运行 server sanitizer 不能代替生产服务端校验。页面与文档明确称其为“真实 server preset 功能流程”，不宣称建立了可信安全边界。

## 验收标准

- 仓库新增 `playgrounds/*` workspace 分类和私有 `@rev30/rich-text-playground` package。
- `pnpm dev:playground:rich-text` 能启动无需业务服务的单页 playground。
- 页面使用真实 client/server `all` preset，且浏览器中完整派生默认文章。
- 默认文章覆盖约定的主要内容 feature；交互 feature 使用真实控件体验。
- 宽屏左右约 `3:2`、窄屏上下布局，右侧默认显示清洗 HTML 渲染结果。
- 规范化 JSON 和 HTML 源码标签页展示 server preset 返回值的展示副本，只省略图片 data URL payload 并标注解码后字节数；内存中的派生结果保持完整。
- 编辑后 300ms 防抖自动同步；恢复示例立即同步。
- 亮色、暗色、跟随系统三态可用，只持久化主题选择。
- JPEG/PNG/WebP data URL 图片上传和 server policy 在浏览器中工作，非法或超限输入被明确拒绝。
- Vitest Browser Mode 的 Chromium 契约层覆盖本 spec 的七组高风险行为，且不复制已有 happy-dom 逻辑测试。
- 七组契约暴露的现有真实浏览器缺陷得到最小范围修复和必要回归覆盖；公共 exports 与现有 demo 行为保持兼容。
- playground 的 typecheck、browser test 和 build 进入根级 `pnpm check` 并通过。
- README 和 rich-text 测试边界文档同步更新。
- 现有 `apps/client` demo、`apps/server` API、权限和数据库无改动。
