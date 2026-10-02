# 图标搜索质量实验

`sample.ts` 固定已批准设计的 12 个目标、候选表达和 30 条查询预期。候选表达仅是实验输入，不参与正式维护数据加载；不要为通过实验修改冻结预期。

当前首批实验在固定旧版派生对照上覆盖 12 个候选图标，以及前排独立复核发现的 6 个 Phosphor 原木误译。冻结样本和 30 条查询不变；这 6 项修正单独保存在 `reviewed-corrections.ts`，保留样式后缀的正确概念。它们不代表已开始全量维护。

在仓库根目录运行：

```sh
pnpm --filter @rev30/server exec tsx scripts/icon-search/quality/build-candidate.ts /private/tmp/rev30-icon-search-quality/baseline-artifacts /private/tmp/rev30-icon-search-quality/candidate-artifacts
pnpm --filter @rev30/server exec tsx scripts/icon-search/quality/index.ts /private/tmp/rev30-icon-search-quality/candidate /private/tmp/rev30-icon-search-quality/candidate-artifacts 60
```

构建脚本只接受指纹已冻结的旧派生对照，逐文件检查校验和及内容指纹，然后写入当前版本的完整实验产物。正式运行时与维护构建均没有旧格式兼容分支。查询运行器的三个参数依次为报告目录、当前规则版本的构建产物目录、每类性能采样数；后两项默认使用正式产物目录及 60 次采样。每轮为受控小样和全量数据分别创建新的 PGlite 目录，经过迁移和正式导入流程后保留数据库及导入结果，防止索引复用被计为导入耗时。

报告包括版本与机器信息、真实样本元信息和派生文档、两个搜索入口前 20 项、图库完整分页结果、指定目标位置、缺失与误关联、顺序及重复检查。预期失败会如实记录，不中断基线采集；`passed` 全部为真仅代表冻结目标检查通过，前排结果的独立语义复核仍须另行完成。入口使用真实选择器和图库服务；HTTP 校验仍由已有路由测试覆盖。

性能按查询逐项保存预热后的独立请求和每批 10 请求突发的全部耗时及 P95，包括分页、120 字符输入和多短词输入。这是 PGlite 实验，不能作为生产 PostgreSQL 的性能结论。

全量常规基准完成后，运行器另插入 3 个临时自定义图标，验证 20 对互异中文词、60 个重复汉字、以及带英文原词和其他归属英文表达的高歧义合法输入；结束后删除这些临时文档，结果单独保存在 `full-stress-performance.json`。该压力输入不写入维护数据。

旧规则的 12 图标派生数据固定在 `__tests__/fixtures/icon-search-quality-baseline.json`，连同当时的维护记录和真实分类／别名依据保留。它仅是测试对照，不构成正式应用的旧格式兼容入口。完整旧产物及一次性实验报告按设计保存在项目外。
