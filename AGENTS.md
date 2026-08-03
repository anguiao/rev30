# AGENTS.md

## 项目约定

- 对话和项目文档使用中文，代码与注释使用英文。
- workspace 内部依赖统一使用 `workspace:*`。
- 修改文件前，读取目标路径上尚未加载的所有 `AGENTS.md`；跨 workspace 任务分别读取相关规则。
- 共享 zod schema、请求/响应契约和 TypeScript 类型放在 `packages/contracts`，前后端尽量复用这些约束。
- 跨端纯工具函数放在 `packages/utils`，不要和接口契约混放。
- 优先复用项目和依赖提供的 TypeScript 类型，不为绕过检查自定义宽松类型。
- 只添加必要测试，优先覆盖用户可见行为、核心业务规则和回归风险；避免为纯重构、导入整理或内部实现细节添加冗余测试。
- 当用户可见功能、目录结构或项目概览发生明显变化时，按需更新 `README.md`。
- 设计 spec 统一放在 `docs/specs`，文件名使用 `YYYY-MM-DD-<topic>-design.md`。

## 常用验证

- 完整验证：`pnpm check`，需在沙箱外运行以支持其中的 Chromium 浏览器测试。
- 按需单跑：`pnpm typecheck`、`pnpm test`、`pnpm lint:check`、`pnpm format:check`。
- 定向运行 Vitest 时，使用 `pnpm --filter <pkg> test <package-relative-test-file>`，不要在 `test` 后添加 `--`。
