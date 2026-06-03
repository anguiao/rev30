# 富文本图片上传设计

## 背景

当前 `@rev30/rich-text` 已经承载公告正文的编辑器、toolbar preset、服务端 HTML 派生和 sanitize 策略。公告表单通过 `RichTextEditor` 和 `compactRichTextEditorPreset` 编辑 `contentJson`，服务端通过 `compactRichTextServerPreset` 从 Tiptap JSON 派生 `contentText` 与 `contentHtml`，详情页直接渲染服务端保存的 HTML。

附件模块已经支持 `readPolicy`。本次富文本图片只使用 `authenticated` 附件，不使用 `signed` 附件。图片 URL 使用稳定内容入口 `/api/attachments/:id/content`，浏览器请求时由同源 `attachment_token` cookie 完成读取鉴权。

前一次附件读取策略设计没有实现富文本 image node、图片 toolbar 或富文本附件引用关系。本次设计补齐富文本图片上传能力，同时保持边界清楚：富文本包不认识附件模块，附件上传和 URL 生成由应用层适配。

## 目标

- 在 `@rev30/rich-text` 中新增 image feature，支持图片节点、插入命令、属性编辑、HTML 输出和服务端 sanitize。
- 使用 preset factory 让业务层向 compact editor preset 注入图片上传配置。
- 不再保留静态 `compactRichTextEditorPreset` 和 `compactRichTextServerPreset` public API；compact preset 统一通过 factory 创建，且 compact preset 始终包含图片能力。
- 图片上传配置使用入口无关的 `upload(file)` contract，第一版只从 toolbar 文件选择触发，后续粘贴和拖拽可复用同一 contract。
- `apps/client` 负责把 `File` 上传为 `authenticated` 附件，并把附件 ID 转为稳定内容 URL。
- `contentJson` 与 `contentHtml` 中存储稳定 URL，不存 `attachmentId`。
- 图片支持说明文本和固定比例尺寸编辑。
- image feature 自己输出防溢出样式，使用方不需要知道图片可能撑破内容区域。
- 保持公告详情页当前渲染方式，不新增 `RichTextContent` 组件。

## 非目标

本阶段不实现：

- `signed` 富文本图片。
- 外部图片 URL 插入。
- 粘贴图片上传。
- 拖拽图片上传。
- 图片裁剪、压缩、旋转、替换和批量上传。
- 任意解除长宽比锁定的自由拉伸。
- 富文本附件引用关系表。
- 未引用附件自动清理。
- 图片标题 `title` 字段或 hover tooltip。
- 新的只读富文本渲染组件。
- 将附件上传 helper 或 read policy 常量导入 `packages/rich-text`。

## 核心决策

### 存储稳定 URL

图片节点存储稳定 authenticated 内容 URL：

```json
{
  "type": "image",
  "attrs": {
    "src": "/api/attachments/6c4a5ff2-f627-45fe-8f96-359a0b60da51/content",
    "alt": "avatar.png",
    "width": 640,
    "height": 360
  }
}
```

不存 `attachmentId`，也不同时存 `attachmentId` 和 `src`。`src` 是富文本内容的一部分，`attachmentId` 是附件业务身份。后续如需附件引用统计，由内容业务层从 `/api/attachments/:id/content` URL 反解附件 ID，不把反解逻辑放进 `@rev30/rich-text`。

### 富文本包不拥有附件逻辑

`@rev30/rich-text` 只知道外部传入的上传函数能把 `File` 转成 image attrs：

```ts
export interface RichTextImageAttrs {
  src: string
  alt?: string
  width?: number
  height?: number
}

export type RichTextImageUpload = (file: File) => Promise<RichTextImageAttrs>
```

它不导入 `uploadAttachment`、`getAttachmentContentUrl`、`ATTACHMENT_READ_POLICY_AUTHENTICATED` 或任何附件 contract。`readPolicy` 固定为 `authenticated` 是应用层 adapter 的职责。

### 同名 preset 功能必须固定

启用本设计后，`compact` 就是含图片能力的 preset。`image` 配置必填；后续若需要不含图片的富文本场景，应定义新的 preset。

### 尺寸是内容属性，防溢出是 image feature 的输出约束

`width` 和 `height` 表示用户选择的图片展示尺寸，属于富文本内容属性。用户可以编辑宽度或高度，但二者始终按图片原始比例联动，不支持独立自由设置。

图片渲染必须防止撑破容器。这个约束由 image feature 自己输出并由服务端 policy 规范化，不要求使用方额外包一层组件或记住 CSS 细节。

## 架构

### Rich-text 层

新增 image feature：

```txt
packages/rich-text/src/features/image/
  shared.ts
  server.ts
  vue.ts
  vue/ImageToolbarControl.vue
  vue/ImageDialog.vue
```

职责：

- `shared.ts` 定义 image node extension 和 attrs。
- `vue.ts` 定义 toolbar component control。
- `ImageToolbarControl.vue` 处理 toolbar 图片按钮、当前 image selection 判断和打开图片弹窗。
- `ImageDialog.vue` 统一处理插入和编辑。插入模式在弹窗内选择文件、上传、预览和确认插入；编辑模式修改已有图片的说明和尺寸。
- `server.ts` 定义图片 HTML 白名单、URL 校验、尺寸和样式规范化。

### Client 层

公告表单创建业务 adapter：

```ts
async function uploadAnnouncementRichTextImage(file: File) {
  const attachment = await uploadAttachment(file, {
    usage: 'announcement-content-image',
    readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
  })

  return {
    src: getAttachmentContentUrl(attachment.id),
    alt: file.name,
  }
}
```

然后通过 preset factory 注入：

```ts
const announcementRichTextEditorPreset = createCompactRichTextEditorPreset({
  image: {
    accept: 'image/*',
    upload: uploadAnnouncementRichTextImage,
    onError: showUploadError,
  },
})
```

`announcementRichTextEditorPreset` 必须保持稳定引用，不能在模板渲染过程中反复创建，避免 `useRichTextEditor` 因 preset 变化重建 editor。

### Server 层

server preset 也使用 factory 启用 image feature：

```ts
const announcementRichTextServerPreset = createCompactRichTextServerPreset({
  image: {
    isAllowedSrc: isAuthenticatedAttachmentContentUrl,
  },
})
```

服务端只校验 URL 是否是允许的内部 authenticated 附件内容 URL，不生成 URL，也不解析附件权限。附件读取鉴权仍由 `/api/attachments/:id/content` 自己完成。

## Public API

### Editor preset factory

`@rev30/rich-text/vue/presets` 新增：

```ts
export interface RichTextImageUploadResult {
  src: string
  alt?: string
}

export interface RichTextImageUploadOptions {
  accept?: string
  upload: (file: File) => Promise<RichTextImageUploadResult>
  onError?: (error: unknown) => void
}

export interface CompactRichTextEditorPresetOptions {
  image: RichTextImageUploadOptions
}

export function createCompactRichTextEditorPreset(
  options: CompactRichTextEditorPresetOptions,
): RichTextEditorPreset
```

`@rev30/rich-text/vue/presets` 不再导出 `compactRichTextEditorPreset`。所有 compact editor preset 都通过 `createCompactRichTextEditorPreset({ image })` 创建，且 `image` 是必填配置。

第一版上传结果不暴露 `title`。图片说明写入 `alt`。尺寸由 image feature 在弹窗上传成功后读取 `naturalWidth` 和 `naturalHeight` 得到，不要求业务 adapter 返回。

### Server preset factory

`@rev30/rich-text/server/presets` 新增：

```ts
export interface RichTextImageServerOptions {
  isAllowedSrc: (src: string) => boolean
}

export interface CompactRichTextServerPresetOptions {
  image: RichTextImageServerOptions
}

export function createCompactRichTextServerPreset(
  options: CompactRichTextServerPresetOptions,
): RichTextServerPreset
```

`@rev30/rich-text/server/presets` 不再导出 `compactRichTextServerPreset`。所有 compact server preset 都通过 `createCompactRichTextServerPreset({ image })` 创建，且 `image` 是必填配置。Vue preset 和 server preset 对同一个 `compact` 功能集合保持一致。

## 交互设计

### 图片弹窗

toolbar 新增图片按钮，图标使用 `i-[lucide--image]`。点击按钮始终打开 `ImageDialog`：

- 未选中图片时进入插入模式。
- 选中已有图片时进入编辑模式。

弹窗字段：

- 图片说明：写入 `alt`。
- 宽度：数字输入。
- 高度：数字输入。
- 重置尺寸：恢复原始比例下的原始宽高。

不显示 `title` 字段。不显示“锁定比例”开关，比例始终锁定。

### 插入图片

1. 未选中图片时点击图片按钮，打开插入模式弹窗。
2. 弹窗内提供文件选择入口，使用 `accept`，公告传入 `image/*`。
3. 选择文件后，弹窗调用外部 `upload(file)`。
4. 上传期间弹窗内上传入口进入 loading/disabled 状态，避免重复上传。
5. 上传成功后，弹窗显示图片预览，并加载图片 URL 读取 `naturalWidth` 和 `naturalHeight`。
6. 弹窗默认填入图片说明、宽度和高度。图片说明优先使用上传结果的 `alt`，否则使用文件名。
7. 用户确认后，创建 image node 并插入编辑器。
8. 用户取消时不插入节点；第一版不自动删除已经上传成功但未引用的附件。
9. 上传失败时不插入节点。若传入 `onError`，调用 `onError(error)`；否则弹窗保留在可重试状态。

### 编辑图片属性

1. 用户选中已有图片时点击图片按钮，打开编辑模式弹窗。
2. 弹窗显示当前图片预览和现有 attrs。
3. 修改宽度时，根据原始比例重新计算高度。
4. 修改高度时，根据原始比例重新计算宽度。
5. 保存时只更新当前 image node attrs，不重新上传。
6. 取消时不修改当前 image node attrs。

### 固定比例规则

固定比例基于图片原始尺寸：

```ts
const aspectRatio = naturalWidth / naturalHeight
```

宽度变化时：

```ts
height = Math.round(width / aspectRatio)
```

高度变化时：

```ts
width = Math.round(height * aspectRatio)
```

宽度和高度必须是正整数。输入为空、非数字或小于 1 时，图片弹窗不保存。

## HTML 输出与 sanitize

image feature 输出 `<img>`，允许属性：

```txt
src
alt
width
height
style
```

服务端 sanitize 必须：

- 只允许 `isAllowedSrc(src) === true` 的图片。
- 移除外部 URL。
- 移除 `data:`、`blob:`、`javascript:` 和协议相对 URL。
- 只允许正整数 `width` 和 `height`。
- 根据规范化后的尺寸重建 style。
- 不保留输入 HTML 中的任意额外 style。

规范化后的 style 由 image feature 统一输出：

```txt
width: <width>px; max-width: 100%; height: auto
```

如果图片没有合法宽度，则不输出 `width`、`height` 和尺寸 style，只保留 `src`、`alt` 和防溢出 style：

```txt
max-width: 100%; height: auto
```

`max-width: 100%` 和 `height: auto` 是 image feature 的安全展示约束。它们不是业务页面样式，也不是使用方需要额外记住的规则。

## 公告集成

公告编辑表单从静态 `compactRichTextEditorPreset` 切换为 `createCompactRichTextEditorPreset({ image })` 创建的 compact preset。上传 adapter 使用：

```ts
uploadAttachment(file, {
  usage: 'announcement-content-image',
  readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
})
```

并把返回 ID 转成：

```ts
getAttachmentContentUrl(id)
```

公告服务端内容派生从静态 `compactRichTextServerPreset` 切换为 `createCompactRichTextServerPreset({ image })` 创建的 compact server preset。第一版允许的图片 URL 只包括：

```txt
/api/attachments/:id/content
```

其中 `:id` 必须是合法 UUID，URL 不允许 query、hash、协议和 host。

公告详情页可以继续使用当前 `v-html` 渲染 `contentHtml`。图片自身 HTML 已经包含防溢出展示约束，因此不要求新增 `RichTextContent` 组件。

## 错误处理

- rich-text 不提前复制附件服务端校验。文件类型和大小最终由附件上传接口校验。
- 弹窗文件选择入口的 `accept` 只做文件选择提示。
- 上传失败不插入图片。
- `onError` 仅用于业务层展示提示，不改变 rich-text 的错误类型体系。
- 服务端遇到非法 image `src` 时应让内容保存失败，而不是静默清洗成缺失图片。这样用户不会以为图片保存成功。

## 测试策略

### Rich-text package

- editor preset factory 要求传入 `image` 配置。
- server preset factory 要求传入 `image` 配置。
- compact editor preset 包含 image feature 和 image toolbar control。
- image toolbar 未选中图片时打开插入模式弹窗。
- image dialog 插入模式选择文件、调用 `upload(file)`，并在确认后插入返回的 `src` 和 `alt`。
- image dialog 插入模式取消时不插入 image node。
- image toolbar 选中图片时打开编辑模式弹窗。
- image dialog 修改宽度时按原始比例更新高度。
- image dialog 修改高度时按原始比例更新宽度。
- image dialog 编辑模式保存时更新当前 image attrs。
- image server policy 允许内部 attachment content URL。
- image server policy 拒绝外部 URL、协议相对 URL、`data:` 和 `blob:`。
- image server policy 移除任意输入 style，并重建允许的尺寸和防溢出 style。

### Client package

- 公告表单使用带 image 配置的 compact editor preset。
- 公告图片 adapter 上传附件时传入 `readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED`。
- 公告图片 adapter 将上传返回 ID 转为 `getAttachmentContentUrl(id)`。
- 上传失败时触发业务提示且不修改 editor 内容。

### Server package

- 公告内容派生使用带 image policy 的 server preset。
- 保存包含合法内部图片 URL 的公告成功，并持久化包含 `<img>` 的 `contentHtml`。
- 保存包含外部图片 URL 的公告失败。
- 保存包含非法 image style 的公告成功，但 `contentHtml` 只保留 image policy 重建的允许 style。

## 后续扩展

- 粘贴图片上传：从 paste event 取 `File` 后进入 `ImageDialog` 插入模式，复用同一个 `image.upload(file)` contract。
- 拖拽图片上传：从 drop event 取 `File` 后进入 `ImageDialog` 插入模式，复用同一个 `image.upload(file)` contract。
- 附件引用统计：业务层从 `contentJson` 或 `contentHtml` 中提取 `/api/attachments/:id/content`。
- 图片替换：`ImageDialog` 编辑模式新增替换入口，仍通过 `image.upload(file)` 得到新 `src`。
- 图片删除确认：如果后续需要，可在 `ImageDialog` 中增加删除按钮。
