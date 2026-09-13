<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMutation, useQueryCache } from '@pinia/colada'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NRadio,
  NRadioGroup,
  NText,
  NUpload,
  NUploadDragger,
  type UploadFileInfo,
} from 'naive-ui'
import {
  customIconKeywordsSchema,
  type CustomIconDuplicateStrategy,
  type CustomIconUploadMetadata,
  type CustomIconUploadResponse,
} from '@rev30/contracts'
import { uploadCustomIcons } from './requests'
import { getErrorMessage } from '../../utils/error'
import { refreshCustomIconCaches } from './cache'
import IconKeywordsInput from './IconKeywordsInput.vue'

const props = defineProps<{
  prefix: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  uploaded: [result: CustomIconUploadResponse]
}>()

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const duplicateStrategy = ref<CustomIconDuplicateStrategy>('skip')
const fileList = ref<UploadFileInfo[]>([])
type FileKeywordState = {
  keywords: string[]
  touched: boolean
  error: string | null
}
const fileKeywordStates = ref(new Map<string, FileKeywordState>())

const uploadError = ref<string | null>(null)
const uploadResult = ref<CustomIconUploadResponse | null>(null)

const { isLoading: isUploading, ...uploadMutation } = useMutation({
  onMutate(): { sessionId: number } {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({
    prefix,
    duplicateStrategy,
    files,
    metadata,
  }: {
    prefix: string
    duplicateStrategy: CustomIconDuplicateStrategy
    files: File[]
    metadata?: CustomIconUploadMetadata
  }) =>
    uploadCustomIcons(prefix, {
      duplicateStrategy,
      files,
      ...(metadata === undefined ? {} : { metadata }),
    }),
  onSuccess(result, { prefix }, { sessionId }) {
    if (result.created.length > 0 || result.replaced.length > 0) {
      void refreshCustomIconCaches(queryCache)
    }

    if (!show.value || props.prefix !== prefix || sessionId !== drawerSessionId.value) {
      return
    }

    uploadResult.value = result
    emit('uploaded', result)

    if (result.failed.length === 0 && result.skipped.length === 0) {
      show.value = false
    }
  },
  onError(error, { prefix }, { sessionId }) {
    if (!show.value || props.prefix !== prefix || sessionId !== drawerSessionId.value) {
      return
    }

    uploadError.value = getErrorMessage(error, '上传图标失败')
  },
})

function handleSubmit() {
  const prefix = props.prefix
  const fileItems = fileList.value.filter(
    (item): item is UploadFileInfo & { file: File } => item.file instanceof File,
  )
  const files = fileItems.map((item) => item.file)

  if (prefix === null || files.length === 0 || isUploading.value) {
    return
  }

  uploadError.value = null
  uploadResult.value = null
  const metadata: CustomIconUploadMetadata = []
  let hasEditedKeywords = false

  for (const item of fileItems) {
    const state = fileKeywordStates.value.get(item.id)
    if (state === undefined || !state.touched) {
      metadata.push({})
      continue
    }

    const result = customIconKeywordsSchema.safeParse(state.keywords)
    if (!result.success) {
      state.error = result.error.issues[0]?.message ?? '关键词无效'
      return
    }

    state.keywords = result.data
    state.error = null
    hasEditedKeywords = true
    metadata.push({ keywords: result.data })
  }

  uploadMutation.mutate({
    prefix,
    duplicateStrategy: duplicateStrategy.value,
    files,
    ...(hasEditedKeywords ? { metadata } : {}),
  })
}

function handleFileListUpdate(nextFileList: UploadFileInfo[]) {
  const nextStates = new Map<string, FileKeywordState>()

  for (const item of nextFileList) {
    nextStates.set(
      item.id,
      fileKeywordStates.value.get(item.id) ?? { keywords: [], touched: false, error: null },
    )
  }

  fileList.value = nextFileList
  fileKeywordStates.value = nextStates
}

function updateKeywords(fileId: string, keywords: string[]) {
  const state = fileKeywordStates.value.get(fileId)
  if (state === undefined) return

  state.keywords = keywords
  state.touched = true
  state.error = null
}

function clearKeywords(fileId: string) {
  updateKeywords(fileId, [])
}

watch(
  () => [show.value, props.prefix] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    duplicateStrategy.value = 'skip'
    fileList.value = []
    fileKeywordStates.value = new Map()
    uploadError.value = null
    uploadResult.value = null
    uploadMutation.reset()
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer
    v-model:show="show"
    placement="right"
    :width="560"
    :mask-closable="false"
    :close-on-esc="false"
  >
    <NDrawerContent title="上传 SVG 图标" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="uploadError" type="error" :show-icon="false">
          {{ uploadError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <NFormItem label="重复图标">
            <NRadioGroup
              :value="duplicateStrategy"
              @update:value="(value) => (duplicateStrategy = value)"
            >
              <div class="flex gap-4">
                <NRadio value="skip">跳过</NRadio>
                <NRadio value="replace">替换</NRadio>
              </div>
            </NRadioGroup>
          </NFormItem>

          <NFormItem label="SVG 文件">
            <NUpload
              accept=".svg,image/svg+xml"
              multiple
              :default-upload="false"
              :file-list="fileList"
              @update:file-list="handleFileListUpdate"
            >
              <NUploadDragger>
                <div
                  class="flex flex-col items-center gap-2 py-8 text-stone-500 dark:text-zinc-400"
                >
                  <span class="i-[lucide--upload] text-2xl" aria-hidden="true" />
                  <span class="text-sm">选择 SVG 文件</span>
                </div>
              </NUploadDragger>
            </NUpload>
          </NFormItem>

          <div v-if="fileList.length > 0" class="space-y-3">
            <div
              v-for="item in fileList"
              :key="item.id"
              data-test="icon-upload-file"
              :data-file-id="item.id"
              class="rounded-ui border border-stone-200 p-3 dark:border-zinc-800"
            >
              <div class="mb-2 truncate text-sm font-medium" :title="item.name">
                {{ item.name }}
              </div>
              <div class="mb-2 text-xs text-stone-500 dark:text-zinc-400">
                关键词（可选），最多 20 项，每项最多 40 个字符
              </div>
              <IconKeywordsInput
                :model-value="fileKeywordStates.get(item.id)?.keywords ?? []"
                @update:model-value="(keywords) => updateKeywords(item.id, keywords)"
                @clear="clearKeywords(item.id)"
              />
              <div v-if="fileKeywordStates.get(item.id)?.error" class="text-error mt-1 text-xs">
                {{ fileKeywordStates.get(item.id)?.error }}
              </div>
            </div>
          </div>

          <div
            v-if="uploadResult"
            class="rounded-md border border-stone-200 p-3 dark:border-zinc-800"
          >
            <div class="text-sm font-medium text-stone-900 dark:text-zinc-100">上传结果</div>
            <div class="mt-2 flex flex-col gap-1 text-sm text-stone-600 dark:text-zinc-300">
              <NText>新增 {{ uploadResult.created.length }}</NText>
              <NText>替换 {{ uploadResult.replaced.length }}</NText>
              <NText>跳过 {{ uploadResult.skipped.length }}</NText>
              <NText>失败 {{ uploadResult.failed.length }}</NText>
            </div>
          </div>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton
            type="primary"
            :disabled="isUploading"
            :loading="isUploading"
            @click="handleSubmit"
          >
            上传
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
