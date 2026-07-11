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
  NRadio,
  NRadioGroup,
  NSelect,
  NSwitch,
  NText,
  NTreeSelect,
} from 'naive-ui'
import {
  ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  ATTACHMENT_READ_POLICY_AUTHENTICATED,
  ANNOUNCEMENT_STATUS_PUBLISHED,
  ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT,
  ANNOUNCEMENT_TARGET_TYPE_ROLE,
  ANNOUNCEMENT_TARGET_TYPE_USER,
  ANNOUNCEMENT_TYPE_NOTICE,
  ANNOUNCEMENT_VISIBILITY_ALL,
  ANNOUNCEMENT_VISIBILITY_TARGETED,
  DEPARTMENT_STATUS_ENABLED,
  ROLE_STATUS_ENABLED,
  USER_STATUS_ENABLED,
  announcementCreateSchema,
  announcementFormSchema,
  announcementUpdateSchema,
  type AnnouncementFormInput,
  type AnnouncementTarget,
  type AnnouncementTargetType,
  type AnnouncementVisibility,
  type TiptapDocument,
} from '@rev30/contracts'
import { createAllRichTextEditorPreset } from '@rev30/rich-text/vue/presets/all'
import { RichTextEditor } from '@rev30/rich-text/vue'
import {
  createAnnouncement,
  getAnnouncement,
  getAnnouncementTargetOptions,
  updateAnnouncement,
} from '.'
import { compressImageFile, getAttachmentContentUrl, uploadAttachment } from '../attachments'
import { announcementTypeSelectOptions, announcementVisibilityOptions } from './labels'
import { getErrorMessage } from '../../utils/error'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'
import { ApiRequestError } from '../../utils/request'
import { toSelectOptions, toTreeOptions } from '../../utils/ui'

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
  visibility: ANNOUNCEMENT_VISIBILITY_TARGETED,
  targets: [],
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
      const { users, departments, roles } = await getAnnouncementTargetOptions()

      return {
        users,
        departments,
        roles,
        formValues: defaultFormValues,
        status: null,
      }
    }

    const [announcement, { users, departments, roles }] = await Promise.all([
      getAnnouncement(announcementId),
      getAnnouncementTargetOptions(announcementId),
    ])

    return {
      users,
      departments,
      roles,
      status: announcement.status,
      formValues: {
        type: announcement.type,
        title: announcement.title,
        summary: announcement.summary,
        contentJson: announcement.contentJson,
        visibility: announcement.visibility,
        targets: announcement.targets,
        pinned: announcement.pinned,
        publish: false,
      } satisfies AnnouncementFormInput,
    }
  },
})
const userOptions = computed(() =>
  toSelectOptions(formData.value?.users ?? [], {
    label: (user) => `${user.nickname} (${user.username})`,
    value: (user) => user.id,
    disabled: (user) => user.status !== USER_STATUS_ENABLED,
  }),
)
const departmentTreeOptions = computed(() =>
  toTreeOptions(formData.value?.departments ?? [], {
    label: (department) => `${department.name} (${department.code})`,
    disabled: (department) => department.status !== DEPARTMENT_STATUS_ENABLED,
  }),
)
const roleOptions = computed(() =>
  toSelectOptions(formData.value?.roles ?? [], {
    label: (role) => `${role.name} (${role.code})`,
    value: (role) => role.id,
    disabled: (role) => role.status !== ROLE_STATUS_ENABLED,
  }),
)
const isPublishedAnnouncement = computed(
  () => formData.value?.status === ANNOUNCEMENT_STATUS_PUBLISHED,
)
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getErrorMessage(formLoadError.value, '加载通知公告信息失败'),
)

const formError = ref<string | null>(null)

async function uploadAnnouncementRichTextImage(file: File) {
  const compressedFile = await compressImageFile(file, {
    maxDimension: 1920,
    quality: 0.86,
  })
  const attachment = await uploadAttachment(compressedFile, {
    usage: 'announcement-content-image',
    readPolicy: ATTACHMENT_READ_POLICY_AUTHENTICATED,
    cleanupPolicy: ATTACHMENT_CLEANUP_POLICY_UNREFERENCED,
  })

  return {
    src: getAttachmentContentUrl(attachment.id),
  }
}
const richTextEditorPreset = createAllRichTextEditorPreset({
  image: {
    upload: uploadAnnouncementRichTextImage,
    onError(error) {
      formError.value = getErrorMessage(error, '上传图片失败')
    },
  },
})

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

const selectedVisibility = form.useStore((state) => state.values.visibility)
const isTargetedVisibility = computed(
  () => selectedVisibility.value === ANNOUNCEMENT_VISIBILITY_TARGETED,
)

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

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '保存通知公告失败')
  },
})

function getTargetIds(targets: AnnouncementTarget[], targetType: AnnouncementTargetType) {
  return targets
    .filter((target) => target.targetType === targetType)
    .map((target) => target.targetId)
}

function updateTargets(targetType: AnnouncementTargetType, targetIds: string[]) {
  const nextTargets = [
    ...(form.state.values.targets ?? []).filter((target) => target.targetType !== targetType),
    ...targetIds.map((targetId) => ({
      targetType,
      targetId,
    })),
  ]

  form.setFieldValue('targets', nextTargets)
}

function handleVisibilityChange(value: AnnouncementVisibility) {
  clearServerFieldError('targets')
  form.setFieldValue('visibility', value)

  if (value === ANNOUNCEMENT_VISIBILITY_ALL) {
    form.setFieldValue('targets', [])
  }
}

function handleTargetsChange(targetType: AnnouncementTargetType, value: string[]) {
  clearServerFieldError('targets')
  updateTargets(targetType, [...new Set(value)])
}

function clearServerFieldError(field: keyof AnnouncementFormInput) {
  form.setFieldMeta(field, (meta) => ({
    ...meta,
    errorMap: {
      ...meta.errorMap,
      onServer: undefined,
    },
  }))
}

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

    if (form.state.isDirty || !form.state.isDefaultValue) {
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
                :model-value="state.value"
                :preset="richTextEditorPreset"
                @blur="field.handleBlur"
                @update:model-value="
                  (value) => {
                    clearServerFieldError('contentJson')
                    field.handleChange(value)
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <form.Field name="visibility" v-slot="{ state }">
            <NFormItem label="可见范围" v-bind="formItemValidationProps(state.meta)">
              <NRadioGroup
                data-test="announcement-form-visibility"
                :value="state.value"
                @update:value="handleVisibilityChange"
              >
                <div class="flex flex-wrap gap-4">
                  <NRadio
                    v-for="option in announcementVisibilityOptions"
                    :key="option.value"
                    :value="option.value"
                  >
                    {{ option.label }}
                  </NRadio>
                </div>
              </NRadioGroup>
            </NFormItem>
          </form.Field>

          <form.Field name="targets" v-slot="{ state }">
            <NFormItem
              v-if="isTargetedVisibility"
              data-test="announcement-form-targets-item"
              v-bind="formItemValidationProps(state.meta)"
            >
              <template #label>
                <div class="flex items-center gap-2">
                  <span>可见对象</span>
                  <NText depth="3" class="text-xs"> 用户、部门或角色任一匹配即可查看 </NText>
                </div>
              </template>

              <div class="w-full space-y-2">
                <NSelect
                  data-test="announcement-form-target-users"
                  :options="userOptions"
                  :value="getTargetIds(state.value ?? [], ANNOUNCEMENT_TARGET_TYPE_USER)"
                  multiple
                  clearable
                  filterable
                  max-tag-count="responsive"
                  placeholder="请选择用户"
                  @update:value="handleTargetsChange(ANNOUNCEMENT_TARGET_TYPE_USER, $event ?? [])"
                />

                <NTreeSelect
                  data-test="announcement-form-target-departments"
                  multiple
                  checkable
                  clearable
                  filterable
                  default-expand-all
                  max-tag-count="responsive"
                  :options="departmentTreeOptions"
                  :value="getTargetIds(state.value ?? [], ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT)"
                  placeholder="请选择部门"
                  @update:value="
                    handleTargetsChange(ANNOUNCEMENT_TARGET_TYPE_DEPARTMENT, $event ?? [])
                  "
                />

                <NSelect
                  data-test="announcement-form-target-roles"
                  :options="roleOptions"
                  :value="getTargetIds(state.value ?? [], ANNOUNCEMENT_TARGET_TYPE_ROLE)"
                  multiple
                  clearable
                  filterable
                  max-tag-count="responsive"
                  placeholder="请选择角色"
                  @update:value="handleTargetsChange(ANNOUNCEMENT_TARGET_TYPE_ROLE, $event ?? [])"
                />
              </div>
            </NFormItem>
          </form.Field>

          <form.Field name="pinned" v-slot="{ field, state }">
            <NFormItem label="置顶展示" v-bind="formItemValidationProps(state.meta)">
              <NSwitch
                data-test="announcement-form-pinned"
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
