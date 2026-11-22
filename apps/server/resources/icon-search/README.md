# 图标搜索维护数据

## 中文查询词典

`concepts/words.json` 收录基础概念，`concepts/phrases.json` 收录完整短语，`concepts/intent.json` 收录后台用途推荐。

一条记录通过 `zh` 保存简体中文写法和同义词，通过 `en` 保存直接等义的英文词或连字符短语，通过 `intentEn` 保存用途相关目标。每条记录至少提供一个英文目标。使用 `exclude` 排除容易误匹配的名称或词项，使用 `demoteCategories` 调低指定集合类别的英文推断结果。若完整短语也应匹配分开的基础概念，在短语的 `parts` 中声明相应的 `words.json` 键。

跨文件共用一个中文写法时，两条记录归一化后的 `zh` 必须包含同一组写法，顺序可以不同。例如给“文件恢复／恢复文件”补充用途图标时，用途词条也列出这两个写法。含义不同的词可以各写一条用途记录，推荐相同的图标。

维护词典时更新资源 `manifest.json` 的 `conceptsVersion` 并运行 `icon-search:validate`。校验会检查格式、各文件内的规范化中文键唯一性、跨文件同义词组的一致性、短语组成词以及当前锁定图标包内可检索的英文目标。开发服务重启后直接读取本目录的词典。发布时可单独更新 `dist/icon-search/concepts/` 中的三份 JSON 并重启服务，已提交的数据库索引可以直接复用。

## 官方中文快照

| 文件                       | 来源与索引字段                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `official/icon-park.json`  | ByteDance IconPark。官方中文标题进入精确键和主词项，标签进入相关词项。                               |
| `official/remix-icon.json` | RemixIcon。按基础名将中文标签写入相关词项。                                                          |
| `official/cldr-emoji.json` | Unicode CLDR 简体中文 Emoji 注释。按码点序列匹配，短名称进入精确键和主词项，注释关键词进入相关词项。 |
| `official/iso-flags.json`  | Unicode CLDR 和 ISO 3166-1 区域代码。按两位区域码将中文名称和简称写入精确键和主词项。                |

资源 `manifest.json` 记录官方快照的 SHA-256 以及上游版本、地址和原文件 SHA-256。更新上游版本时调整这些来源条目，再运行同步脚本下载并验证上游文件，重新生成快照和快照校验和。

```bash
pnpm --filter @rev30/server icon-search:sync-official
```

## 离线验证与发布

```bash
pnpm --filter @rev30/server icon-search:validate
pnpm --filter @rev30/server icon-search:build
pnpm --filter @rev30/server icon-search:verify
```

校验和构建使用本地维护数据和当前锁定的 `@iconify/json`。构建读取图标定义、隐藏定义、别名和包内分类，并合入各集合的对应官方快照。压缩 JSONL 和格式 6 的索引 manifest 生成到 `apps/server/dist/icon-search`，经校验后替换上一次产物。词典随发布目录一起复制。生成文件随 `dist` 分发，开发和发布均在 `apps/server` 下运行。

首次开发、索引产物缺失或损坏时，手动构建并重启服务。图标包、官方快照或索引派生规则变更后也需重新构建。发布构建会自动执行这一步。
