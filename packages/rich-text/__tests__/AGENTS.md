# Rich Text 测试约定

- 测试目录按被测源码职责组织：`core`、`client/editor`、`client/vue`、`server`、`features/<name>/<职责>`、`presets` 和 `architecture` 分别对应生产源码边界；`helpers` 仅是测试基础设施。
- `architecture`、`server`、`presets` 以及纯 core/不依赖浏览器的 core 契约运行在 Node；需要实例化 editor、selection、DOM 或 Vue 组件的 feature core 或 client 测试运行在 happy-dom。目录职责只描述被测层，不直接决定 Vitest environment，环境匹配在 `vitest.config.ts` 中按实际运行时显式维护。
- architecture 测试使用真实 Vite module graph 检查 public core/schema/preset、Vue、server 和 content 入口，并检查内部 headless `client/editor` graph 不加载 `client/vue`、Vue、server 或 CSS；它保护消费方可见的边界，不替代通用静态依赖扫描器。
- 创建 Editor 或 DOM fixture 时复用 `helpers/editor.ts`；Vue wrapper 由统一 setup 清理，测试只维护领域特有资源。
- 真实浏览器契约放在 `playgrounds/rich-text` 的 Chromium suite，不在本包复制。
- 优先使用角色、可访问名称、可见文本和编辑器输出定位与断言；不要为测试伪造 ARIA 状态。
- `data-test` 仅用于语义不足的目标，使用 `rich-text-` 前缀和稳定 key，不编码交互状态。
