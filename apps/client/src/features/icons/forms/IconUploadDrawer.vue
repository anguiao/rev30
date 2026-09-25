<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQueryCache } from '@pinia/colada'
import { isEqual } from 'lodash-es'
import { z } from 'zod'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NRadio,
  NRadioGroup,
  NUpload,
  NUploadDragger,
  type UploadOnChange,
} from 'naive-ui'
import {
  customIconUploadMetadataItemSchema,
  type CustomIconDuplicateStrategy,
  type CustomIconUploadMetadata,
  type CustomIconUploadResult,
} from '@rev30/contracts'
import { uploadCustomIcons } from '../requests'
import { useDrawerUnsavedChangesGuard } from '../../../composables/useDrawerUnsavedChangesGuard'
import { getErrorMessage } from '../../../utils/error'
import { refreshCustomIconCaches } from '../cache'
import IconUploadItem from './IconUploadItem.vue'

const props = defineProps<{
  prefix: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

type UploadEntry = {
  id: string
  file: File
  keywords: string[] | undefined
  submittedKeywords: string[] | undefined
  keywordError: string | null
  result: CustomIconUploadResult | null
}

const queryCache = useQueryCache()
const duplicateStrategy = ref<CustomIconDuplicateStrategy>('skip')
const entries = ref<UploadEntry[]>([])
const pendingEntries = computed(() => entries.value.filter((entry) => entry.result === null))
const summary = computed(() => {
  const labels = { created: '新增', replaced: '替换', skipped: '跳过', failed: '失败' } as const
  const parts = Object.entries(labels).flatMap(([status, label]) => {
    const count = entries.value.filter((entry) => entry.result?.status === status).length
    return count > 0 ? [`${label} ${count}`] : []
  })
  return parts.length > 0 ? parts.join(' · ') : `已选择 ${entries.value.length} 个文件`
})

const {
  isLoading: isUploading,
  error: uploadError,
  variables: uploadVariables,
  ...uploadMutation
} = useMutation({
  mutation: ({
    prefix,
    duplicateStrategy,
    items,
  }: {
    prefix: string
    duplicateStrategy: CustomIconDuplicateStrategy
    items: UploadEntry[]
  }) => {
    const metadata: CustomIconUploadMetadata = items.map(({ keywords }) =>
      keywords === undefined ? {} : { keywords },
    )

    return uploadCustomIcons(prefix, {
      duplicateStrategy,
      files: items.map((item) => item.file),
      ...(metadata.some((item) => item.keywords !== undefined) ? { metadata } : {}),
    })
  },
  onSuccess({ results }, { items }) {
    if (results.some((result) => result.status === 'created' || result.status === 'replaced')) {
      void refreshCustomIconCaches(queryCache)
    }

    items.forEach((item, index) => {
      const result = results[index]!
      item.result = result
      if (result.status === 'created' || result.status === 'replaced') {
        item.keywords = result.icon.keywords
      }
      item.submittedKeywords = item.keywords?.slice()
    })
  },
  onError() {
    // The server may have committed some files before the request failed.
    void refreshCustomIconCaches(queryCache)
  },
})
const uploadingItems = computed(() => (isUploading.value ? uploadVariables.value!.items : []))

function validateKeywords(items: UploadEntry[]) {
  let valid = true

  for (const item of items) {
    if (item.keywords === undefined) continue

    const result = customIconUploadMetadataItemSchema.safeParse({ keywords: item.keywords })
    if (!result.success) {
      const { fieldErrors } = z.flattenError(result.error)
      item.keywordError = fieldErrors.keywords![0]!
      valid = false
      continue
    }

    item.keywords = result.data.keywords
    item.keywordError = null
  }

  return valid
}

function uploadItems(items: UploadEntry[], strategy: CustomIconDuplicateStrategy) {
  const prefix = props.prefix
  if (prefix === null || items.length === 0 || isUploading.value) return
  if (!validateKeywords(items)) return

  uploadMutation.mutate({
    prefix,
    duplicateStrategy: strategy,
    items,
  })
}

function handleSubmit() {
  if (isUploading.value) return
  if (pendingEntries.value.length > 0) {
    uploadItems(pendingEntries.value, duplicateStrategy.value)
  } else if (entries.value.length > 0) {
    requestClose()
  }
}

const addFile: UploadOnChange = ({ file }) => {
  if (!(file.file instanceof File) || isUploading.value) return

  entries.value.push({
    id: file.id,
    file: file.file,
    keywords: undefined,
    submittedKeywords: undefined,
    keywordError: null,
    result: null,
  })
}

function removeFile(entry: UploadEntry) {
  entries.value = entries.value.filter((item) => item.id !== entry.id)
}

function reselectFile(entry: UploadEntry, file: File) {
  entry.file = file
  entry.result = null
  entry.keywordError = null
}

watch(
  () => [show.value, props.prefix] as const,
  () => {
    duplicateStrategy.value = 'skip'
    entries.value = []
    uploadMutation.reset()
  },
)

const isDirty = computed(
  () =>
    isUploading.value ||
    entries.value.some(
      (entry) => entry.result === null || !isEqual(entry.keywords, entry.submittedKeywords),
    ),
)
const { requestClose, handleDrawerShowUpdate } = useDrawerUnsavedChangesGuard({
  show,
  isDirty,
  isSaving: isUploading,
})
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    width="min(560px, 100vw)"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="handleDrawerShowUpdate"
  >
    <NDrawerContent title="上传 SVG 图标" :closable="!isUploading">
      <div class="flex flex-col gap-4">
        <NAlert v-if="uploadError" type="error" :show-icon="false">
          {{ getErrorMessage(uploadError, '上传图标失败') }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <NFormItem label="目标图标集">
            <span class="break-all">{{ prefix }}</span>
          </NFormItem>

          <NFormItem label="重复处理" :label-props="{ id: 'icon-upload-duplicate-label' }">
            <div class="w-full space-y-2">
              <NRadioGroup
                v-model:value="duplicateStrategy"
                :disabled="isUploading"
                aria-labelledby="icon-upload-duplicate-label"
              >
                <div class="flex gap-4">
                  <NRadio value="skip">跳过</NRadio>
                  <NRadio value="replace">替换</NRadio>
                </div>
              </NRadioGroup>
              <div
                v-if="
                  duplicateStrategy === 'replace' ||
                  entries.some((entry) => entry.result?.status === 'skipped')
                "
                class="text-xs text-stone-500 dark:text-zinc-400"
              >
                替换时，未编辑关键词则保留原值；“清空关键词”会移除原有关键词。
              </div>
            </div>
          </NFormItem>

          <NFormItem label="SVG 文件">
            <div class="flex w-full min-w-0 flex-col gap-3">
              <NUpload
                accept=".svg,image/svg+xml"
                multiple
                :default-upload="false"
                :show-file-list="false"
                :file-list="[]"
                :disabled="isUploading"
                @change="addFile"
              >
                <NUploadDragger v-if="entries.length === 0">
                  <div
                    class="flex flex-col items-center gap-2 py-8 text-stone-500 dark:text-zinc-400"
                  >
                    <span class="i-[lucide--upload] text-2xl" aria-hidden="true" />
                    <span class="text-sm">点击选择或拖拽 SVG 文件到这里</span>
                  </div>
                </NUploadDragger>
                <NButton v-else :disabled="isUploading">
                  <template #icon><span class="i-[lucide--plus]" aria-hidden="true" /></template>
                  继续添加
                </NButton>
              </NUpload>

              <ul v-if="entries.length > 0" class="space-y-3" aria-label="上传文件">
                <IconUploadItem
                  v-for="entry in entries"
                  :key="entry.id"
                  v-model:keywords="entry.keywords"
                  :file="entry.file"
                  :result="entry.result"
                  :uploading="uploadingItems.includes(entry)"
                  :disabled="isUploading"
                  :keyword-error="entry.keywordError"
                  @update:keywords="entry.keywordError = null"
                  @remove="removeFile(entry)"
                  @replace="uploadItems([entry], 'replace')"
                  @reselect="(file) => reselectFile(entry, file)"
                />
              </ul>

              <div class="text-sm text-stone-500 dark:text-zinc-400" role="status">
                {{ summary }}
              </div>
            </div>
          </NFormItem>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton
            v-if="isUploading || pendingEntries.length > 0 || entries.length === 0"
            :disabled="isUploading"
            @click="requestClose"
          >
            关闭
          </NButton>
          <NButton
            type="primary"
            :disabled="isUploading || entries.length === 0 || prefix === null"
            :loading="isUploading"
            @click="handleSubmit"
          >
            {{
              isUploading
                ? '上传中…'
                : pendingEntries.length > 0
                  ? `上传 ${pendingEntries.length} 个文件`
                  : '完成'
            }}
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
