# Rich Text 测试

测试约定见 [`AGENTS.md`](./AGENTS.md)。

## 测试基础设施

`helpers/editor.ts` 负责 Editor 与挂载宿主的销毁，Vue wrapper 由 `setup.ts` 自动卸载；只有验证卸载行为的用例需要显式调用 `unmount()`。Vitest 自动恢复每个用例的 spy，模块 mock 和领域资源仍由所属测试负责清理。

剪贴板 fixture 复用 `helpers/clipboard.ts`，其中集中补齐 happy-dom 缺少的 `FileList.item()` 并隔离其文件/文本 MIME 读取差异。表格单元格定位和 `CellSelection` fixture 复用 `helpers/table.ts`，业务预期留在各测试中。

## 环境说明

happy-dom 中建立的 selection、focus、clipboard 和几何输入只验证编辑器对这些公开状态与事件的响应，不代表真实浏览器布局、原生剪贴板权限、IME/composition 或浏览器特有的 selection/focus 行为。

`playgrounds/rich-text` 的 Chromium suite 补充这些 happy-dom 无法证明的真实浏览器契约：默认 preset smoke、原生 clipboard、DOM Selection/focus、布局和键盘、图片文件 input 以及 server 派生展示。它属于 playground package，不复制到这里，也不计入 `@rev30/rich-text` 的 V8 coverage。

## 运行方式

```bash
pnpm --filter @rev30/rich-text test
pnpm --filter @rev30/rich-text test __tests__/features/image/client/vue/ImageDialog.test.ts
pnpm --filter @rev30/rich-text coverage
pnpm --filter @rev30/rich-text-playground test:browser
pnpm --filter @rev30/rich-text-playground test:browser:ui
```

覆盖率只用于诊断 core/server/editor/Vue 入口盲区，不设置百分比门槛。HTML 报告生成在 `packages/rich-text/coverage/`。
浏览器 suite 使用 `@vitest/browser-playwright` 和 Chromium，不参与 V8 coverage；首次运行前请执行 `pnpm --filter @rev30/rich-text-playground exec playwright install chromium`。headed clipboard 调试会覆盖系统剪贴板且不会读取或恢复它，详见 playground README。
