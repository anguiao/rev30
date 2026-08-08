---
status: approved
date: 2026-08-08
---

# Rich Text 源码运行时边界重组设计

## 背景

`@rev30/rich-text` 当前已经形成稳定的 feature-first 结构，并通过 `package.json` subpath exports 与 Vite 构建图测试隔离 core、Vue/editor、server 和 content CSS。现有客户端与服务端代码不会互相导入，生产边界本身是可靠的。

目前的问题主要位于包内源码的空间组织：

- 通用编辑器代码位于 `src/editor`，Vue UI 位于 `src/vue`，二者实际上都属于客户端运行时，但在顶层没有共同边界。
- 每个 `src/features/<name>` 通过同级的 `shared.ts`、`editor.ts`、`server.ts`、`vue/` 和 `content.css` 区分职责。文件名能够表达用途，但目录树仍把不同运行时实现并列放置。
- `shared` 只表达“被多方使用”，没有明确说明这些代码承载的是跨端富文本核心语义。
- 通用基础设施按职责分层，而 feature 实现按文件后缀分层，两处使用了不同的结构语言。

近期修改历史同时说明 feature 聚合仍有实际价值：最近 40 个涉及 rich-text feature 的提交中，25 个只围绕一个 feature，且单个 feature 经常同时修改 editor 与 Vue，或同时修改 core 与 server。完全按运行环境拆散全部 feature 会让常见维护工作在多个远距离目录之间切换。

因此，本设计保留单一 workspace 包和 feature-first 维护方式，同时把客户端、服务端和跨端核心边界提升为显式目录结构。

## 目标

- 保留单一 `@rev30/rich-text` workspace 包。
- 继续以 `features/<name>` 作为具体富文本能力的主要维护单元。
- 使用 `core`、`client`、`server` 和 `content` 四种统一职责名称组织通用基础设施与 feature 实现。
- 将 framework-agnostic editor 与 Vue UI 一起归入客户端边界，同时保留二者之间的单向分层。
- 让源码位置和构建图测试共同表达运行时依赖边界。
- 保持现有公开 import、导出符号、feature 集合、preset 行为、服务端派生结果和内容样式不变。
- 让测试目录能够反映新的源码职责，同时保留有价值的跨层 preset 契约测试。

## 非目标

本设计不包含：

- 将 rich-text 拆成多个 workspace 包。
- 新增 `@rev30/rich-text/client`、headless editor 或其他公共入口。
- 修改 feature 模型、preset API、toolbar/quick-bar/slash-menu/status-bar 配置模型。
- 增删 all、compact 或 standard preset 的 feature，或调整其顺序。
- 修改 Tiptap extension 配置、编辑器交互、文档 schema、HTML 渲染、sanitize policy 或 CSS 规则。
- 修改 `RichTextDocument`、`RichTextContentInvalidError` 等公开类型和错误语义。
- 引入新的运行时依赖、构建工具、lint 插件或路径别名体系。
- 为包内旧物理路径建立兼容转发文件。
- 重写既有 approved spec；它们继续作为当时决策的历史记录。

## 设计决策摘要

| 主题 | 决策 |
| --- | --- |
| 包边界 | 保持单一 `@rev30/rich-text` 包 |
| 主要维护轴 | 保留 feature-first |
| 显式职责 | `core`、`client`、`server`、`content` |
| 客户端内部分层 | `client/vue` 可依赖 `client/editor`，反向禁止 |
| Feature 布局 | `features/<name>` 内按职责建立子目录 |
| 缺失职责 | 不建立空目录 |
| Content CSS | 独立于 client 和 server |
| 公开入口 | 名称与导出符号保持不变，只更新物理映射 |
| 旧内部路径 | 不保留转发或兼容层 |
| 边界验证 | 保留公开入口 Vite 构建图，并增加内部 headless editor 构建图检查 |
| 行为变化 | 无 |

## 职责模型

### Core

`core` 表示客户端与服务端共同使用的富文本核心语义，包括：

- feature 身份与实现声明；
- preset 的 canonical feature 集合；
- Tiptap schema extension 的跨端配置；
- `RichTextDocument` schema 与相关纯校验；
- 客户端和服务端共同使用的 attribute normalizer、枚举和纯规则。

这里的“core”表示可同时用于客户端和服务端，不表示零依赖。它可以依赖 `@tiptap/core`、具体 Tiptap extension、ProseMirror 类型和 `zod`，但不能依赖 Vue、Naive UI、浏览器交互、服务端 sanitize 或 content CSS。

### Client editor

`client/editor` 表示不依赖 Vue 的编辑器运行时能力，包括 action、editor feature、interaction、paste rule，以及具体 feature 的 commands、selection 和 clipboard 行为。

它可以依赖 package core 和 feature core，但不能依赖 Vue、`@tiptap/vue-3`、Naive UI、server 或 content CSS。

### Client Vue

`client/vue` 表示 Vue UI 适配，包括 `RichTextEditor`、toolbar、quick bar、slash menu、status bar、Vue interaction helpers、Vue editor presets 和 feature 专属组件。

它可以依赖 core 和 client/editor；`client/editor` 不得反向依赖 `client/vue`。只有 `client/vue/presets` 这一 composition root 可以额外导入对应的 content CSS preset，package Vue 基础设施和 feature Vue 实现不直接导入 content CSS。

### Server

`server` 表示可信服务端边界，包括文档派生、服务端 feature implementation、HTML policy、tag transform、sanitize 和服务端 preset。

它可以依赖 package core 和 feature core，但不能依赖 client、Vue、Naive UI 或 content CSS。

### Content

`content` 表示用于展示派生 HTML 的静态样式。它独立于编辑器和服务端运行时代码：

- package content preset 可以组合基础 CSS 和 feature content CSS；
- Vue preset 可以通过 CSS side effect 导入对应 content preset；
- core 和 server 不得导入 CSS；
- content CSS 不依赖 TypeScript 运行时代码。

## 目标源码结构

通用基础设施调整为：

```text
packages/rich-text/src/
├── core/
│   ├── index.ts
│   ├── feature.ts
│   ├── preset.ts
│   ├── schema/
│   │   └── index.ts
│   └── presets/
│       ├── all.ts
│       ├── compact.ts
│       └── standard.ts
├── client/
│   ├── editor/
│   │   ├── action.ts
│   │   ├── feature.ts
│   │   ├── interaction.ts
│   │   └── paste.ts
│   └── vue/
│       ├── index.ts
│       ├── RichTextEditor.vue
│       ├── interactions/
│       ├── preset.ts
│       ├── presets/
│       ├── quick-bar/
│       ├── slash-menu/
│       ├── status-bar/
│       ├── theme/
│       └── toolbar/
├── server/
│   ├── index.ts
│   ├── derive.ts
│   ├── errors.ts
│   ├── feature.ts
│   ├── preset.ts
│   ├── sanitize.ts
│   └── presets/
├── content/
│   ├── base.css
│   ├── edge.css
│   └── presets/
└── features/
```

`src/index.ts` 不再作为额外的物理层存在；package 根入口直接映射到 `src/core/index.ts`。`src/server` 和 `src/content` 已经是明确边界，保留其顶层位置并调整内部引用即可。

## Feature 内部结构

每个 feature 继续拥有自身的跨端语义、客户端实现、服务端实现和内容样式，但使用显式目录表达职责。

复杂 feature 以 image 为例：

```text
src/features/image/
├── core/
│   ├── feature.ts
│   └── dimensions.ts
├── client/
│   ├── editor.ts
│   └── vue/
│       ├── index.ts
│       ├── ImageDialog.vue
│       ├── ImageQuickBar.vue
│       └── ImageToolbarControl.vue
├── server/
│   └── feature.ts
└── content/
    └── style.css
```

简单 feature 以 bold 为例：

```text
src/features/bold/
├── core/
│   └── feature.ts
├── client/
│   └── editor.ts
└── server/
    └── feature.ts
```

不为不存在的职责建立空目录。例如 history 不建立 `server` 或 `content`，character-count 不建立 `server`。

### 现有文件迁移规则

| 现有位置或类型 | 目标位置或判断规则 |
| --- | --- |
| `features/<name>/shared.ts` | `features/<name>/core/feature.ts` |
| `features/<name>/editor.ts` | `features/<name>/client/editor.ts` |
| `features/<name>/vue/**` | `features/<name>/client/vue/**` |
| `features/<name>/server.ts` | `features/<name>/server/feature.ts` |
| `features/<name>/content.css` | `features/<name>/content/style.css` |
| `vue/presets/types.ts` | `client/vue/preset.ts` |
| `server/presets/types.ts` | `server/preset.ts` |
| 同时参与客户端与服务端语义的 helper | feature `core/` |
| 只操作 editor、selection、clipboard 或 DOM 的 helper | feature `client/` |
| 只参与可信校验、HTML 转换或 sanitize 的 helper | feature `server/` |
| 只定义派生 HTML 视觉表现的文件 | feature `content/` |

具体分类示例：

- link 的 `href.ts` 由 client 和 server 共用，进入 `features/link/core/href.ts`。
- link 的 `range.ts` 只操作 editor selection，进入 `features/link/client/range.ts`。
- list 和 table 的 attribute normalizer 同时服务 schema 与 server，进入各自 `core/`。
- code-block 的语言规则同时参与 extension 与 server 校验，进入 `features/code-block/core/`。
- table 的 Vue dropdown helper 进入 `features/table/client/vue/`。

## 依赖规则

下表中的“基础设施”不包含同目录的 preset：`core/presets`、`client/vue/presets`、`server/presets` 和 `content/presets` 是各自职责内显式允许跨 feature 组合的 composition root。

允许的生产源码依赖如下：

| 来源 | 可以依赖 | 禁止依赖 |
| --- | --- | --- |
| package core 基础设施 | package core 基础设施 | feature implementation、client、server、content |
| core preset | package core 基础设施、feature core | client、server、content |
| feature core | package core 基础设施、自身 core | client、server、content、其他 feature implementation |
| package client/editor | package core 基础设施、client/editor | Vue、Naive UI、server、content |
| feature client/editor | package core 基础设施、package client/editor、自身 core、自身 client/editor | Vue、server、其他 feature implementation、content |
| package client/vue 基础设施 | package core 基础设施、package client/editor、client/vue | server、content、具体 feature implementation |
| feature client/vue | package core 基础设施、package client/editor、package client/vue、自身 core、自身 client/editor、自身 client/vue | server、content、其他 feature implementation |
| Vue preset | core preset、package client、feature client、content preset | server |
| package server 基础设施 | package core 基础设施、server | client、Vue、content、具体 feature implementation |
| feature server | package core 基础设施、package server 基础设施、自身 core、自身 server | client、其他 feature implementation、content |
| server preset | core preset、package server 基础设施、feature server | client、Vue、content |
| feature content CSS | 自身 content CSS | TypeScript 运行时代码、其他 feature content CSS |
| content preset | package content 基础 CSS、feature content CSS | TypeScript 运行时代码 |

具体 feature 不直接导入其他 feature 的实现。出现真正跨 feature 的通用能力时，根据职责提升到 package 级 `core`、`client/editor`、`client/vue` 或 `server`；只有 core、Vue、server 和 content preset 可以组合多个 feature，不把组合关系隐藏在基础设施或 feature 内部。

依赖矩阵通过物理目录、`packages/rich-text/AGENTS.md` 和代码审阅共同维护。自动化验证聚焦会影响消费方的实际运行时边界、preset 裁剪和 CSS side effect；本次不增加覆盖 type-only import、全部跨 feature 直接依赖和 CSS `@import` 的通用静态解析器，避免纯结构重组引入一套需要长期维护的 architecture checker。

## Preset 组合流程

Preset 继续作为唯一组合入口，依赖方向保持单向：

```text
core preset
  = canonical feature core implementations

Vue preset
  = core preset
  + feature client/editor implementations
  + feature client/Vue controls
  + corresponding content preset CSS

server preset
  = core preset
  + feature server implementations
```

具体落位为：

- core preset：`src/core/presets/*`；
- Vue editor preset：`src/client/vue/presets/*`；
- server preset：`src/server/presets/*`；
- content preset：`src/content/presets/*`。

业务方继续只选择公开 preset，不直接组合包内 feature implementation。

## 公开入口

公开入口名称和导出符号保持不变，只调整到新物理位置：

| 公开入口 | 新物理位置 |
| --- | --- |
| `@rev30/rich-text` | `src/core/index.ts` |
| `@rev30/rich-text/schema` | `src/core/schema/index.ts` |
| `@rev30/rich-text/presets/all` | `src/core/presets/all.ts` |
| `@rev30/rich-text/presets/compact` | `src/core/presets/compact.ts` |
| `@rev30/rich-text/presets/standard` | `src/core/presets/standard.ts` |
| `@rev30/rich-text/vue` | `src/client/vue/index.ts` |
| `@rev30/rich-text/vue/presets/*` | `src/client/vue/presets/*` |
| `@rev30/rich-text/server` | `src/server/index.ts` |
| `@rev30/rich-text/server/presets/*` | `src/server/presets/*` |
| `@rev30/rich-text/content/presets/*.css` | `src/content/presets/*.css` |

不新增 `/client`，也不把 `/vue` 改为 `/client/vue`。公开入口描述消费方实际使用的能力，`/vue` 比泛化的 `/client` 更精确；headless editor 继续作为包内实现，不借本次结构调整扩大公共 API。

需要同步更新：

- `packages/rich-text/package.json` 的 exports 物理路径；
- 根 `tsconfig.base.json` 中 rich-text 相关 paths；
- package 内部源码和测试的相对 import。

应用、contracts 和 playground 的公开 import 无需修改。现有 Tailwind `@source` 对整个 workspace package 的扫描方式也保持不变。

## 数据、行为与错误兼容

本次调整没有新的业务数据流。以下契约保持不变：

- editor 的 `RichTextDocument` 输入输出；
- schema 的接受、拒绝与规范化行为；
- all、compact、standard 的 feature 集合及 canonical identity；
- editor extension 和 server extension 的顺序；
- toolbar、quick bar、slash menu 和 status bar 配置；
- server derive 返回的规范化 JSON、text 和 sanitized HTML；
- HTML policy、tag transform 和 URL policy；
- content CSS preset 的选择性加载和最终样式；
- `RichTextContentInvalidError` 等错误类型、抛出条件和消费方式。

不增加运行时路径判断、兼容 fallback、异常包装或额外 `try/catch`。错误的内部 import 或跨层依赖应在 typecheck、Vite build graph 或测试阶段直接失败。

## 测试组织

测试目录跟随新的职责名称：

```text
packages/rich-text/__tests__/
├── architecture/
├── core/
├── client/
│   ├── editor/
│   └── vue/
├── server/
├── features/
│   └── <name>/
│       ├── core/
│       ├── client/
│       │   └── vue/
│       └── server/
├── presets/
└── helpers/
```

规则如下：

- 原 `__tests__/schema.test.ts` 进入 `__tests__/core/schema.test.ts`。
- 原 `__tests__/editor` 进入 `__tests__/client/editor`。
- 原 `__tests__/vue` 进入 `__tests__/client/vue`。
- feature 的 `shared.test.ts` 进入对应 `core/`。
- feature 的 editor、Vue 和 server 测试分别进入对应职责目录。
- `__tests__/helpers` 继续作为测试基础设施目录，不映射为生产运行时层。
- `__tests__/presets` 保留跨层组合契约测试。现有 preset 测试同时验证 core feature 顺序、editor extensions、Vue controls 和 server policies，不为追求目录对称而拆散。
- 现有 `core/feature-model.test.ts` 和 `core/feature-types.ts` 同时覆盖 core 声明、client/server implementation 与 Vue preset 校验，进入 `__tests__/presets`；`__tests__/core` 只保留不依赖 client 或 server 的 core 契约测试。
- 测试目录表达被测源码的职责，不直接决定 Vitest environment。纯 core、server、architecture 和 preset 契约在 Node 运行；需要实例化浏览器 editor 或 DOM 的 feature core 行为测试仍在 happy-dom 运行。Vitest 项目匹配规则按测试实际运行时显式维护。
- 行为测试只移动和重命名，不为纯目录重构复制断言；新增测试仅用于验证此前未被自动化覆盖的 headless editor/Vue 边界。

## Import-boundary 验证

现有 `__tests__/architecture/import-boundaries.test.ts` 继续使用真实 Vite module graph 验证 public entry，并按新路径更新模块分类器和入口断言：

- server exports 不得加载 `src/client/**`、`features/*/client/**` 或 CSS；
- core/schema/preset exports 不得加载 client、server 或 CSS；
- Vue exports 不得加载 server；
- content CSS entries 继续保持可独立加载；
- Vue preset entries 继续自动加载各自 content CSS；
- compact、standard 和 all 继续只加载各自选择的 feature；
- 现有 code-block highlighter、text-style、character-count 等按 preset 裁剪的断言继续保留。

增加一项内部 headless-editor 构建图检查。测试入口覆盖 package `client/editor` 模块和所有实际存在的 `features/*/client/editor.ts`，并断言构建图不包含：

- package 或 feature 的 `client/vue`；
- Vue、`@tiptap/vue-3`、Naive UI；
- package 或 feature server；
- CSS。

该测试只保护新增的 editor/Vue 内部分层，不创建新的 public headless entry。

## 迁移方式

迁移是一次原子性的内部结构重组，不设计新旧结构并存期：

1. 移动 package core、schema、core presets 和 feature core 文件，并更新相关内部 import。
2. 移动通用 editor、Vue 基础设施、Vue presets 和 feature client 文件。
3. 移动 feature server 与 feature content 文件；顶层 server 和 content 保持其职责位置。
4. 更新 package exports、根 tsconfig paths、Vitest 项目匹配规则、测试路径与 architecture boundary 分类规则。
5. 更新 package 与测试目录的 `AGENTS.md`、package README 和测试 README。
6. 运行定向验证与完整仓库验证。

移动文件时尽量保留 Git rename history。所有消费新位置的 import 在同一实现变更中完成，不保留旧目录的 forwarding exports。旧路径都是包内实现路径，公开消费方没有兼容需求；转发层只会让新旧结构长期并存并削弱边界表达。

## 文档调整

- `packages/rich-text/AGENTS.md`：使用 `core/client/server/content` 更新架构规则，并明确 `client/vue -> client/editor` 单向依赖。
- `packages/rich-text/__tests__/AGENTS.md`：使用新的职责名称更新测试环境和 architecture boundary 约定，并说明目录职责与 Vitest environment 的关系。
- `packages/rich-text/README.md`：增加简短源码分区说明，保留现有 content CSS 消费文档。
- `packages/rich-text/__tests__/README.md`：更新定向测试示例中的新路径。
- 根 README 不需要更新；包能力、workspace 分类和用户可见功能均未改变。

## 验证

先运行 package 定向验证：

```text
pnpm --filter @rev30/rich-text typecheck
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/rich-text-playground typecheck
pnpm --filter @rev30/rich-text-playground test
```

最后运行完整验证：

```text
pnpm check
```

按仓库约定，完整验证需要在沙箱外运行，以支持 Chromium 浏览器测试。

## 验收标准

- 仍只有一个 `@rev30/rich-text` workspace 包。
- `src/editor`、`src/vue`、`src/presets`、`src/schema` 和 `src/index.ts` 旧位置不再存在。
- feature 根部不再存在 `shared.ts`、`editor.ts`、`server.ts`、`vue/` 或 `content.css` 旧布局。
- 每个生产源码文件都能明确归入 core、client、server 或 content；不存在为形式对称建立的空目录。
- client/editor 不依赖 Vue，client 和 server 不互相依赖，core 不依赖 client/server/content。
- 具体 feature 不直接依赖其他 feature implementation；跨 feature 组合只发生在 preset。
- 现有公开 import 和导出符号保持不变，应用、contracts 与 playground 无需修改消费代码。
- all、compact、standard 的 feature 集合、extension 顺序、UI 配置、server policy 和 content CSS 裁剪结果保持不变。
- `RichTextDocument`、服务端派生输出及公开错误语义保持不变。
- import-boundary 测试覆盖新的物理路径和 headless editor/Vue 边界。
- rich-text package、playground 和完整 `pnpm check` 全部通过。
