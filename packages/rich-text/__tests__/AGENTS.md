# Rich Text 测试约定

- core、architecture、server、preset 和 schema 测试运行在 Node；Vue、editor 和 shared 交互测试运行在 happy-dom。
- architecture 测试同时检查加载图和 bundle，保护跨端入口及 preset 的静态依赖边界。
- 创建 Editor 或 DOM fixture 时复用 `helpers/editor.ts`；Vue wrapper 由统一 setup 清理，测试只维护领域特有资源。
- 真实浏览器契约放在 `playgrounds/rich-text` 的 Chromium suite，不在本包复制。
- 优先使用角色、可访问名称、可见文本和编辑器输出定位与断言；不要为测试伪造 ARIA 状态。
- `data-test` 仅用于语义不足的目标，使用 `rich-text-` 前缀和稳定 key，不编码交互状态。
