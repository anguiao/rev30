# utils 测试边界

- `tree.test.ts`：验证树转换、过滤、裁剪、计数和勾选键规范化等可复用行为；共享只读树夹具，并显式验证转换不会修改输入。
- `date-time.test.ts`：验证日期时间解析、序列化、运算、过期判断和 Unix 时间转换。

不为简单透传或 JavaScript 内建行为添加测试；每个用例应保护公共转换、边界值或输入不变性。

## 运行方式

```bash
pnpm --filter @rev30/utils test
pnpm --filter @rev30/utils test __tests__/tree.test.ts
pnpm --filter @rev30/utils coverage
```

覆盖率只用于诊断公共工具入口和分支盲区，不设置百分比门槛。HTML 报告生成在 `packages/utils/coverage/`。
