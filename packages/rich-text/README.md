# @rev30/rich-text

`@rev30/rich-text` 提供 Tiptap schema、editor preset、server 校验/清洗与派生 HTML。服务端派生的 HTML 是经过 sanitize 的 fragment；生产环境仍必须在可信服务端执行校验和清洗。

## 源码分区

`src/core` 保存跨端富文本语义、schema 和 core preset；`src/client/editor` 保存不依赖 Vue 的 headless editor 运行时，`src/client/vue` 保存 Vue 编辑器 UI 与 Vue preset；`src/server` 保存可信服务端派生、校验和清洗，`src/content` 保存展示派生 HTML 的静态 CSS。具体能力按 `src/features/<name>/` 继续 feature-first 维护，并在 feature 内使用同样的职责目录。各职责的 `presets/` 是组合多个 feature 的 composition root。

## 内容 CSS

派生 HTML 不再携带静态视觉内联样式。只读使用方需要导入与 server preset 对应的 CSS，并在承载 fragment 的元素上添加内容容器 class：

```ts
import '@rev30/rich-text/content/presets/compact.css'
```

```html
<div class="rich-text-content rich-text-content--sm">
  <!-- sanitized HTML fragment -->
</div>
```

可用入口：

- `@rev30/rich-text/content/presets/all.css`
- `@rev30/rich-text/content/presets/compact.css`
- `@rev30/rich-text/content/presets/standard.css`

容器默认使用 base 排版（`16px / 28px`）；也可显式添加 `rich-text-content--base`，或选择 `rich-text-content--sm`（`14px / 24px`）和 `rich-text-content--lg`（`18px / 32px`）。页面根元素有 `.dark` class 时，内容样式会切换到 dark defaults。

`@rev30/rich-text/vue/presets/all`、`@rev30/rich-text/vue/presets/compact` 和 `@rev30/rich-text/vue/presets/standard` 会自动导入各自的内容 CSS。`@rev30/rich-text/presets/*`、`@rev30/rich-text/server` 和 `@rev30/rich-text/server/presets/*` 保持无 CSS 副作用。

可在容器或祖先上通过以下变量覆盖颜色：

- `--rich-text-content-body-color`
- `--rich-text-content-heading-color`
- `--rich-text-content-link-color`
- `--rich-text-content-muted-color`
- `--rich-text-content-code-color`
- `--rich-text-content-code-background`
- `--rich-text-content-quote-color`
- `--rich-text-content-quote-border-color`
- `--rich-text-content-table-border-color`
- `--rich-text-content-table-header-background`
