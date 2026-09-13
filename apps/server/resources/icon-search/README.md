# 图标搜索维护数据

此目录保存经过确认的英文元信息关系和中文译文，不保存全量图标清单或 SVG。全量定义、隐藏定义和别名始终在构建时从当前锁定的 `@iconify/json` 读取。

当前 `chinese-1` 批次包含 23 个 Lucide 图标名称译文，以及 MDI `Account / User` 分类中 `account`、`user` 两个源词的译文。分类译文只应用于 `english/mdi.jsonl` 已逐项记录且仍能由当前包验证的 `mdi:account` 和 `mdi:account-alert`，不会自动应用到该分类的其他成员。该批次没有从 `bell` 推导“通知”“提醒”等用途词，也没有加入其他同义词。

维护文件是按归属和英文源文稳定排序的 JSONL。图标译文的 `owner` 是完整图标 ID；分类译文的 `owner` 明确保存 `prefix` 和分类名。`source` 必须是对应图标的完整名称或名称词，或者对应分类的完整原文或词项。翻译仅表达该源文已有含义。

`manifest.json` 记录格式版本、维护时的图标包版本、数据版本、文件路径和 SHA-256。修改 JSONL 后必须更新数据版本和对应校验和，再运行：

```bash
pnpm --filter @rev30/server icon-search:validate
pnpm --filter @rev30/server icon-search:build
pnpm --filter @rev30/server icon-search:verify
```

校验和格式损坏、重复记录或声明文件缺失会使构建失败。图标包升级时，维护版本可以暂时滞后；缺少维护记录不阻断构建。已不存在的归属、源文或分类关系会列入构建输出的 `excluded` 并暂不进入产物，修正维护文件后再恢复。生成的压缩 JSONL 位于 `apps/server/generated/icon-search`，不纳入 Git；发布构建会将其复制到 `dist/icon-search`。
