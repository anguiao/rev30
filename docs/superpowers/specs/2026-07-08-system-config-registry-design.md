# 系统配置注册表改造设计

## 背景

现有系统配置模块已经提供配置列表、新增、编辑和软删除能力，数据表 `system_configs` 存储完整配置定义，包括分组、配置键、名称、值类型、值、说明、状态和排序。这个模型适合自由 KV 管理，但 Rev30 后续要承接的是系统运行参数。运行参数只有被代码读取、校验并接入业务逻辑后才有意义，允许管理员自由新增配置项容易形成不会生效的参数。

当前还没有实际配置数据，因此可以直接调整数据模型和接口语义，不需要兼容旧记录。

## 目标

- 将系统配置从自由 KV 改为内建配置覆盖层。
- 用代码注册表声明所有可管理的内建配置项。
- 数据库只保存自定义覆盖值，不保存配置定义元数据。
- 前端始终展示全部内建配置，无新增、删除和分页概念。
- 编辑表单支持选择使用默认值或自定义值。
- 暂不迁移具体环境变量，不接入实际运行时配置读取。

## 非目标

- 不支持管理员自由新增配置项。
- 不支持敏感配置值、脱敏、加密或密钥轮换。
- 不提供配置分组管理、变更历史或审批流。
- 不在本次改造中迁移 `AUTH_*`、`ATTACHMENT_*`、`JWT_*` 等现有环境变量。
- 不提前设计通用 runtime reader 公共 API。

## 核心模型

系统配置项来自代码注册表，不来自数据库。数据库只表达某个内建配置是否有自定义覆盖值。

配置当前生效值按以下规则计算：

```ts
value = customValue ?? defaultValue
```

其中 `defaultValue` 来自注册表，`customValue` 来自数据库覆盖记录。没有覆盖记录时，系统使用默认值。

## 数据模型

将 `system_configs` 调整为覆盖值表，并重命名为 `system_config_overrides`。

字段：

| 字段 | 说明 |
| --- | --- |
| `id` | UUID 主键。 |
| `key` | 内建配置键，来自代码注册表，全局唯一。 |
| `value` | 自定义覆盖值，统一存字符串。 |
| `created_at` | 创建时间。 |
| `updated_at` | 更新时间。 |

约束：

- `key` 唯一。
- `value` 不允许为空字符串，除非对应配置的 schema 明确允许空字符串；第一阶段默认不允许。
- 不再需要 `group_code`、`name`、`value_type`、`description`、`status`、`sort_order`、`deleted_at`。
- 不使用软删除；使用默认值即删除覆盖记录。

## 配置注册表

在服务端系统配置模块内新增注册表，例如 `apps/server/src/modules/system/configs/registry.ts`。

注册表类型命名为 `ConfigSpec`：

```ts
type ConfigSpec = {
  key: string
  name: string
  description: string
  valueType: ConfigValueType
  defaultValue: string
  schema: z.ZodType
}
```

字段职责：

- `key`：业务稳定标识，命名中体现领域，例如 `auth.loginFailureMaxAttempts`。
- `name`：后台展示名称；单位可以直接写在名称中。
- `description`：给管理员说明配置影响范围。
- `valueType`：决定基础控件和基础格式。
- `defaultValue`：系统默认值。
- `schema`：该配置项自己的校验规则。

第一阶段不引入 `groupCode`、分组标签、`sortOrder`、`unit`、`editable`、`deletable` 和 `effect`。列表顺序使用注册表数组顺序。

注册表测试需要保证：

- `key` 不重复。
- `key` 符合点分命名规则。
- 每个 `defaultValue` 都能通过对应 `schema`。
- 每个 `schema` 与 `valueType` 的基础格式一致。

## 接口契约

保留系统配置业务路径，但调整为内建配置查询和覆盖值更新。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/api/system/configs` | 获取全部内建配置。 |
| `GET` | `/api/system/configs/:key` | 获取单个内建配置。 |
| `PUT` | `/api/system/configs/:key` | 设置自定义值或恢复默认值。 |

去掉：

- `POST /api/system/configs`
- `DELETE /api/system/configs/:id`
- 分页查询参数

列表不分页，响应直接返回数组，保持与现有不分页 tree/options 接口风格一致：

```ts
type ConfigListResponse = Config[]
```

配置响应：

```ts
type Config = {
  key: string
  name: string
  description: string
  valueType: ConfigValueType
  defaultValue: string
  customValue: string | null
  value: string
}
```

更新请求：

```ts
type ConfigUpdateInput = {
  customValue: string | null
}
```

服务端行为：

- `customValue` 为字符串时，按 `key` 对应的 `ConfigSpec.schema` 校验，通过后 upsert 覆盖记录。
- `customValue` 为 `null` 时，删除覆盖记录，回到默认值。
- `key` 不存在于注册表时返回 `404 配置不存在`。
- 自定义值校验失败时返回 `400`，并包含 `field: 'customValue'`。
- 恢复默认值时即使覆盖记录不存在，也返回最新配置响应。

权限沿用系统配置权限，但不再需要创建和删除语义：

- `system:config:list`：列表和详情。
- `system:config:update`：设置自定义值或恢复默认值。

迁移和访问资源种子只保留 `system:config:list`、`system:config:update`。如果迁移运行在已经写入旧资源的数据库上，先删除 `system:config:create`、`system:config:delete` 对应的角色授权关联，再物理删除这两个操作资源，避免前端或角色授权继续暴露不存在的操作。

## 服务端结构

建议保留现有模块边界：

- `registry.ts`：声明 `ConfigSpec`、注册表数组、按 key 查询 spec、校验 registry 自身。
- `repository.ts`：只负责 `system_config_overrides` 的批量查询、按 key 查询、upsert 和删除。
- `service.ts`：合并 registry 与 override，计算 `value`，执行每项 schema 校验。
- `routes.ts`：Hono 路由、权限、参数和请求体校验、错误映射。
- `mapper.ts`：把 `ConfigSpec` 与 override 行映射为 API `Config`。
- `errors.ts`：保留配置不存在和配置值无效等领域错误。

## 前端交互

系统配置页改为展示全部内建配置。

页面移除：

- 新增按钮
- 删除按钮
- 分页器
- 分组编码筛选
- 值类型筛选
- 状态筛选

页面保留关键词搜索，前端本地匹配 `key`、`name`、`description`。

表格列：

| 列 | 说明 |
| --- | --- |
| 配置键 | 展示 `key`。 |
| 配置名称 | 展示 `name`。 |
| 配置值 | 展示当前生效值 `value`。 |
| 值类型 | 展示类型标签。 |
| 操作 | 仅保留编辑。 |

列表不展示默认值、自定义值、更新时间和自定义标签。管理员需要判断值来源时进入编辑抽屉。

编辑抽屉展示：

- 配置键，只读。
- 配置名称，只读。
- 配置说明，只读。
- 值类型，只读。
- 默认值，只读。
- 单选项：使用默认值 / 使用自定义值。
- 自定义值输入控件。

打开表单时：

- `customValue === null`：默认选中“使用默认值”，自定义草稿值初始化为 `defaultValue`。
- `customValue !== null`：默认选中“使用自定义值”，自定义草稿值初始化为 `customValue`。

控件规则：

- `string`：普通输入框。
- `number`：普通输入框，仍按字符串提交，由服务端 schema 校验。
- `boolean`：`NRadioGroup`，选项为 `true` / `false`。
- `json`：textarea。

提交规则：

- 选择“使用默认值”时提交 `{ customValue: null }`。
- 选择“使用自定义值”时提交 `{ customValue: draftValue }`。
- 保存成功后关闭抽屉、刷新配置列表，并提示“系统配置已保存”。

## 校验策略

校验分为两层：

1. 通用基础格式：由 `valueType` 决定，确保 `number`、`boolean`、`json` 的基础格式正确。
2. 单项 schema：由 `ConfigSpec.schema` 决定，约束整数、范围、JSON 结构等具体规则。

更新接口必须使用单项 schema 校验 `customValue`。默认值也必须通过 registry 测试验证。

前端只做基础交互和已有共享 schema 能表达的校验，服务端是最终边界。

## 测试策略

共享契约：

- `Config` 响应 schema 支持 `defaultValue`、`customValue` 和派生 `value`。
- `ConfigUpdateInput` 只接受 `customValue: string | null`。
- 列表响应是不分页数组。

服务端：

- registry key 唯一、格式合法、默认值合法。
- 列表返回全部 registry 配置，即使没有覆盖记录。
- 详情返回指定 registry 配置。
- 更新自定义值会 upsert override 并返回派生后的配置。
- `customValue: null` 删除 override 并返回默认配置。
- 未注册 key 返回 404。
- 非法自定义值返回字段级错误。

前端：

- 页面加载全部配置并本地关键词筛选。
- 页面无新增、删除、分页、值类型筛选、状态筛选。
- 表格展示当前生效值。
- 编辑抽屉能在默认值和自定义值之间切换。
- boolean 使用 `NRadioGroup`。
- 保存默认值提交 `customValue: null`。
- 保存自定义值提交字符串值。

## 迁移与兼容

当前没有实际配置数据，因此可以直接修改表结构和契约。迁移删除旧 `system_configs` 并创建 `system_config_overrides`；如果本阶段同步维护开发基线迁移，基线也应直接呈现新表结构。

后续迁移具体环境变量时，再逐项加入 registry，并在业务模块中接入读取逻辑。
