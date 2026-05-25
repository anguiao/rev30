<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useMutation, useQuery, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NSwitch,
} from 'naive-ui'
import {
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TYPE_NOTICE,
  announcementCreateSchema,
  announcementFormSchema,
  announcementUpdateSchema,
  type AnnouncementFormInput,
  type TiptapDocument,
} from '@rev30/contracts'
import RichTextEditor from './RichTextEditor.vue'
import {
  ContentRequestError,
  createAnnouncement,
  getAnnouncement,
  getContentErrorMessage,
  updateAnnouncement,
} from '.'
import { announcementTypeSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

const props = defineProps<{
  announcementId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() =>
  props.announcementId === null ? '新增通知公告' : '编辑通知公告',
)

const emptyDocument: TiptapDocument = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

const defaultFormValues: AnnouncementFormInput = {
  type: ANNOUNCEMENT_TYPE_NOTICE,
  title: '',
  summary: null,
  contentJson: emptyDocument,
  pinned: false,
  publish: false,
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['content', 'announcement-form', props.announcementId ?? 'create'],
  enabled: () => show.value,
  async query() {
    const announcementId = props.announcementId

    if (announcementId === null) {
      return {
        formValues: defaultFormValues,
        status: null,
      }
    }

    const announcement = await getAnnouncement(announcementId)

    return {
      status: announcement.status,
      formValues: {
        type: announcement.type,
        title: announcement.title,
        summary: announcement.summary,
        contentJson: announcement.contentJson,
        pinned: announcement.pinned,
        publish: false,
      } satisfies AnnouncementFormInput,
    }
  },
})
const isPublishedAnnouncement = computed(
  () => formData.value?.status === ANNOUNCEMENT_STATUS_PUBLISHED,
)

const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getContentErrorMessage(formLoadError.value, '加载通知公告信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: announcementFormSchema,
    onSubmit: announcementFormSchema,
  },
  onSubmit({ value }) {
    const announcementId = props.announcementId

    formError.value = null

    saveAnnouncementMutation.mutate({ announcementId, value })
  },
})

const { isLoading: isSaving, ...saveAnnouncementMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({
    announcementId,
    value,
  }: {
    announcementId: string | null
    value: AnnouncementFormInput
  }) =>
    announcementId === null
      ? createAnnouncement(announcementCreateSchema.parse(value))
      : updateAnnouncement(announcementId, announcementUpdateSchema.parse(value)),
  onSuccess(_, { announcementId }, { sessionId }) {
    if (
      !show.value ||
      props.announcementId !== announcementId ||
      sessionId !== drawerSessionId.value
    ) {
      return
    }

    if (announcementId !== null) {
      void queryCache.invalidateQueries({
        key: ['content', 'announcement-form', announcementId],
        exact: true,
      })
    }

    emit('saved')
    show.value = false
  },
  onError(error, { announcementId }, { sessionId }) {
    if (
      !show.value ||
      props.announcementId !== announcementId ||
      sessionId !== drawerSessionId.value
    ) {
      return
    }

    if (
      error instanceof ContentRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getContentErrorMessage(error, '保存通知公告失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  form.setFieldValue('publish', false)
  void form.handleSubmit()
}

function handleSubmitAndPublish() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  form.setFieldValue('publish', true)
  void form.handleSubmit()
}

watch(
  () => [show.value, props.announcementId] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    saveAnnouncementMutation.reset()
    formError.value = null
    form.reset(defaultFormValues)
  },
  {
    immediate: true,
  },
)

watch(
  () => [show.value, formData.value?.formValues] as const,
  ([isVisible, formValues]) => {
    if (!isVisible || formValues === undefined) {
      return
    }

    form.reset(formValues)
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer v-model:show="show" placement="right" :width="720">
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="type" v-slot="{ field, state }">
            <NFormItem label="类型" v-bind="formItemValidationProps(state.meta)">
              <NSelect
                data-test="announcement-form-type"
                :disabled="isLoading || isSaving"
                :options="announcementTypeSelectOptions"
                :value="state.value"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="title" v-slot="{ field, state }">
            <NFormItem label="标题" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="announcement-form-title"
                :disabled="isLoading || isSaving"
                :value="state.value"
                placeholder="请输入标题"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="summary" v-slot="{ field, state }">
            <NFormItem label="摘要" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="announcement-form-summary"
                :disabled="isLoading || isSaving"
                :value="state.value ?? ''"
                type="textarea"
                placeholder="请输入摘要"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="contentJson" v-slot="{ field, state }">
            <NFormItem
              data-test="announcement-form-content-item"
              label="正文"
              v-bind="formItemValidationProps(state.meta)"
            >
              <RichTextEditor
                :disabled="isLoading || isSaving"
                :model-value="state.value"
                @blur="field.handleBlur"
                @update:model-value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="pinned" v-slot="{ field, state }">
            <NFormItem label="置顶展示" v-bind="formItemValidationProps(state.meta)">
              <NSwitch
                data-test="announcement-form-pinned"
                :disabled="isLoading || isSaving"
                :value="state.value"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton data-test="announcement-form-cancel" @click="show = false"> 取消 </NButton>
          <NButton
            v-if="isPublishedAnnouncement"
            data-test="announcement-form-save"
            type="primary"
            :disabled="isLoading || isSaving || loadError !== null"
            @click="handleSubmit"
          >
            保存
          </NButton>
          <template v-else>
            <NButton
              data-test="announcement-form-save-draft"
              :disabled="isLoading || isSaving || loadError !== null"
              @click="handleSubmit"
            >
              保存草稿
            </NButton>
            <NButton
              data-test="announcement-form-save-publish"
              type="primary"
              :disabled="isLoading || isSaving || loadError !== null"
              @click="handleSubmitAndPublish"
            >
              保存并发布
            </NButton>
          </template>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
