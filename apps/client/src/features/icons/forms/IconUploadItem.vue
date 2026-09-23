<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useObjectUrl } from '@vueuse/core'
import bytes from 'bytes'
import {
  NButton,
  NFormItem,
  NTag,
  NText,
  NUpload,
  type TagProps,
  type UploadOnChange,
} from 'naive-ui'
import type { CustomIconUploadResult } from '@rev30/contracts'
import IconKeywordsInput from './IconKeywordsInput.vue'

const props = defineProps<{
  file: File
  result: CustomIconUploadResult | null
  uploading: boolean
  disabled: boolean
  keywordError: string | null
}>()
const keywords = defineModel<string[] | undefined>('keywords', { required: true })
const emit = defineEmits<{
  remove: []
  replace: []
  reselect: [file: File]
}>()

const previewUrl = useObjectUrl(() => props.file)
const previewFailed = ref(false)
const expanded = ref(false)
const succeeded = computed(
  () => props.result?.status === 'created' || props.result?.status === 'replaced',
)
const editable = computed(() => !props.disabled && !succeeded.value)
const status = computed(() => (props.uploading ? 'uploading' : (props.result?.status ?? 'pending')))
const statusTags = {
  pending: { label: '待上传', type: 'default' },
  uploading: { label: '上传中', type: 'info' },
  created: { label: '已新增', type: 'success' },
  replaced: { label: '已替换', type: 'success' },
  skipped: { label: '已跳过', type: 'warning' },
  failed: { label: '上传失败', type: 'error' },
} satisfies Record<typeof status.value, { label: string; type: TagProps['type'] }>

const reselectFile: UploadOnChange = ({ file }) => {
  if (file.file instanceof File && !props.disabled) emit('reselect', file.file)
}

watch(
  () => props.file,
  () => {
    previewFailed.value = false
  },
)
watch(
  () => props.keywordError,
  (error) => {
    if (error) expanded.value = true
  },
)
</script>

<template>
  <li class="rounded-ui border border-stone-200 p-3 dark:border-zinc-800" :aria-label="file.name">
    <div class="flex items-center gap-3">
      <div
        class="flex size-10 shrink-0 items-center justify-center rounded-ui border border-stone-200 bg-white dark:border-zinc-700"
      >
        <img
          v-if="!previewFailed"
          :src="previewUrl"
          alt=""
          class="size-6 object-contain"
          @error="previewFailed = true"
        />
        <span v-else class="i-[lucide--file-code] text-xl text-stone-400" aria-hidden="true" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="truncate text-sm font-medium" :title="file.name">{{ file.name }}</div>
        <div class="text-xs text-stone-500 dark:text-zinc-400">{{ bytes(file.size) }}</div>
      </div>
      <NTag size="small" :type="statusTags[status].type" :bordered="false">{{
        statusTags[status].label
      }}</NTag>
      <NButton
        v-if="!succeeded"
        quaternary
        circle
        size="small"
        :disabled="disabled"
        :aria-label="`移除 ${file.name}`"
        @click="emit('remove')"
      >
        <template #icon><span class="i-[lucide--x]" aria-hidden="true" /></template>
      </NButton>
    </div>

    <NFormItem
      class="mt-3"
      label="关键词（可选）"
      :show-label="expanded && editable"
      :show-feedback="keywordError !== null"
      v-bind="
        keywordError === null ? {} : { feedback: keywordError, validationStatus: 'error' as const }
      "
    >
      <div class="w-full min-w-0 space-y-2">
        <div class="flex flex-wrap items-center gap-2">
          <span v-if="!keywords?.length" class="text-xs text-stone-500 dark:text-zinc-400"
            >未设置关键词</span
          >
          <template v-else-if="!expanded || !editable">
            <NTag
              v-for="keyword in keywords"
              :key="keyword"
              size="small"
              :bordered="false"
              class="max-w-full [&_.n-tag\_\_content]:truncate"
              :title="keyword"
            >
              {{ keyword }}
            </NTag>
          </template>
          <NButton
            v-if="!succeeded"
            text
            type="primary"
            size="small"
            :disabled="disabled"
            :aria-expanded="expanded"
            @click="expanded = !expanded"
          >
            {{ expanded ? '收起' : keywords?.length ? '编辑' : '添加关键词' }}
          </NButton>
        </div>
        <template v-if="expanded && editable">
          <IconKeywordsInput
            :model-value="keywords ?? []"
            @update:model-value="(value) => (keywords = value)"
          />
          <NButton v-if="keywords !== undefined" text size="small" @click="keywords = undefined"
            >恢复默认</NButton
          >
        </template>
      </div>
    </NFormItem>

    <div
      v-if="result?.status === 'skipped'"
      class="mt-3 flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-zinc-400"
    >
      <span class="break-all">图标 {{ result.name }} 已存在</span>
      <NButton text type="primary" size="small" :disabled="disabled" @click="emit('replace')"
        >替换此项</NButton
      >
    </div>
    <div v-else-if="result?.status === 'failed'" class="mt-3 space-y-2">
      <NText type="error" tag="div" class="text-xs" role="alert">{{ result.message }}</NText>
      <NUpload
        accept=".svg,image/svg+xml"
        :file-list="[]"
        :default-upload="false"
        :show-file-list="false"
        :disabled="disabled"
        @change="reselectFile"
      >
        <NButton text type="primary" size="small" :disabled="disabled">重新选择</NButton>
      </NUpload>
    </div>
  </li>
</template>
