# Rich Text Playground

这是 `@rev30/rich-text` 的本地功能展示和真实 Chromium 契约测试入口。页面在同一个浏览器 bundle 中使用真实 client `all` preset、server `all` preset 和 `deriveRichTextContent`，不启动业务服务、不调用业务 API，也不持久化文档或图片。

server preset 在这里用于验证功能配对、schema 校验、清洗和渲染的一致性；浏览器中的编辑器 JSON 和 server 派生代码处在同一个信任域，因此该 playground 不是生产安全边界。生产系统仍必须在可信服务端执行富文本校验和清洗。

## 内容样式

Playground 通过真实 Vue `all` preset 自动加载 `@rev30/rich-text/content/presets/all.css`。右侧只读结果使用 `rich-text-content rich-text-content--sm` 容器，与编辑器保持同一排版尺寸；不再依赖 Tailwind Typography，也不再动态注入 Highlight.js 的全局 theme CSS。只读生产页面若未导入 Vue preset，应显式导入与 server preset 对应的 package CSS；详见 `packages/rich-text/README.md`。

## 启动和验证

```bash
pnpm dev:playground:rich-text
pnpm --filter @rev30/rich-text-playground typecheck
pnpm --filter @rev30/rich-text-playground exec playwright install chromium
pnpm --filter @rev30/rich-text-playground test:browser
```

开发服务器默认监听 `http://localhost:3210`。`test:browser` 是 headless Chromium suite，包含 preset smoke、真实 Selection/focus、clipboard、布局/键盘和图片文件输入契约；Chromium binary 首次运行前安装一次。

需要只运行派生错误回归时：

```bash
pnpm --filter @rev30/rich-text-playground test __tests__/result-panel.browser.test.ts
```

需要查看真实页面或逐步调试时，`test:browser:ui` 会以 headed/watch 模式运行，并排除 `rich-text-clipboard.browser.test.ts`：

```bash
pnpm --filter @rev30/rich-text-playground test:browser:ui
```

clipboard 文件只由下面这个一次性 headed 命令运行；它会覆盖当前系统剪贴板，不会读取或恢复原剪贴板内容，请在确认可以接受这一点时再运行：

```bash
pnpm --filter @rev30/rich-text-playground test:browser:clipboard:ui
```

失败时保留的 Playwright trace 位于 `playgrounds/rich-text/test-results/traces/`，其它测试附件位于 `playgrounds/rich-text/test-results/attachments/`。

## 派生状态

- `ready`：结果对应最新 editor revision。
- `pending`：内容已修改，等待 300ms 防抖，并继续保留上一次成功结果。
- `error`：最新 revision 派生失败，并继续保留上一次成功结果。首次派生失败时没有成功结果，结果面板显示错误空状态。

公开的 `RichTextContentInvalidError` 显示“富文本内容无效”；其它异常统一显示“生成富文本结果失败”，原始异常仍保留在派生状态中供测试和开发诊断。

## 人工 IME 边界

自动化 suite 使用真实 Chromium 键盘路径，但不会把 synthetic composition/CJK `insertText` 当作系统 IME 证明。人工验证 IME 时，建议覆盖这些边界：

- 在编辑器顶层空段落输入 `/` 并继续输入查询，确认菜单筛选和焦点仍正确。
- 在候选组合期间分别按 Space、Enter，确认候选提交与 Slash 命令确认不会被错误地当作普通文本或提前执行。
- 在候选组合或 Slash 菜单打开时按 Escape，确认组合/菜单按浏览器和编辑器预期关闭。
- 确认命令后检查菜单状态、编辑器焦点和 selection；不要只根据菜单是否隐藏判断命令是否已经提交。
