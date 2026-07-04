<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMutation } from '@pinia/colada'
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
import type { CustomIconDuplicateStrategy, CustomIconUploadResponse } from '@rev30/contracts'
import { uploadCustomIcons } from './requests'
import { getErrorMessage } from '../../utils/error'

const props = defineProps<{
  prefix: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  uploaded: [result: CustomIconUploadResponse]
}>()

const drawerSessionId = ref(0)

const duplicateStrategy = ref<CustomIconDuplicateStrategy>('skip')
const fileList = ref<UploadFileInfo[]>([])

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
  }: {
    prefix: string
    duplicateStrategy: CustomIconDuplicateStrategy
    files: File[]
  }) =>
    uploadCustomIcons(prefix, {
      duplicateStrategy,
      files,
    }),
  onSuccess(result, { prefix }, { sessionId }) {
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
  const files = fileList.value.map((item) => item.file).filter((file) => file instanceof File)

  if (prefix === null || files.length === 0 || isUploading.value) {
    return
  }

  uploadError.value = null
  uploadResult.value = null
  uploadMutation.mutate({
    prefix,
    duplicateStrategy: duplicateStrategy.value,
    files,
  })
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
  <NDrawer v-model:show="show" placement="right" :width="560">
    <NDrawerContent title="上传 SVG 图标" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="uploadError" type="error" :show-icon="false">
          {{ uploadError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <NFormItem label="重复图标">
            <NRadioGroup
              data-test="icon-upload-duplicate-strategy"
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
              data-test="icon-upload-files"
              accept=".svg,image/svg+xml"
              multiple
              :default-upload="false"
              v-model:file-list="fileList"
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
