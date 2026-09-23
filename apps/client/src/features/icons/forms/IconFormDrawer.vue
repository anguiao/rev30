<script setup lang="ts">
import { ref, watch } from 'vue'
import { useMutation, useQueryCache } from '@pinia/colada'
import { useForm } from '@tanstack/vue-form'
import { NAlert, NButton, NDrawer, NDrawerContent, NForm, NFormItem, NInput } from 'naive-ui'
import {
  customIconFormSchema,
  type CustomIconFormInput,
  type CustomIconItem,
} from '@rev30/contracts'
import { useDrawerUnsavedChangesGuard } from '../../../composables/useDrawerUnsavedChangesGuard'
import { getErrorMessage } from '../../../utils/error'
import { formItemValidationProps, setServerFieldError } from '../../../utils/form'
import { ApiRequestError } from '../../../utils/request'
import { refreshCustomIconCaches } from '../cache'
import IconKeywordsInput from './IconKeywordsInput.vue'
import { updateCustomIcon } from '../requests'

const props = defineProps<{
  icon: CustomIconItem | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const defaultFormValues: CustomIconFormInput = {
  name: '',
  keywords: [],
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)
const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  onSubmit({ value }) {
    const icon = props.icon
    if (icon === null) return

    formError.value = null
    saveIconMutation.mutate({ icon, value })
  },
})

const { isLoading: isSaving, ...saveIconMutation } = useMutation({
  onMutate() {
    return { sessionId: drawerSessionId.value }
  },
  mutation: ({ icon, value }: { icon: CustomIconItem; value: CustomIconFormInput }) =>
    updateCustomIcon(icon.prefix, icon.name, customIconFormSchema.parse(value)),
  onSuccess(_, { icon }, { sessionId }) {
    void refreshCustomIconCaches(queryCache)

    if (!show.value || props.icon?.icon !== icon.icon || sessionId !== drawerSessionId.value) {
      return
    }

    emit('saved')
    show.value = false
  },
  onError(error, { icon }, { sessionId }) {
    if (!show.value || props.icon?.icon !== icon.icon || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof ApiRequestError && setServerFieldError(form, error.field, error.message)) {
      return
    }

    formError.value = getErrorMessage(error, '编辑图标失败')
  },
})

function handleSubmit() {
  if (props.icon === null || isSaving.value) return

  void form.handleSubmit()
}

watch(
  [show, () => props.icon?.icon],
  ([isVisible]) => {
    const icon = props.icon
    if (!isVisible || icon === null) return

    drawerSessionId.value += 1
    saveIconMutation.reset()
    formError.value = null
    form.reset({ name: icon.name, keywords: [...icon.keywords] })
  },
  { immediate: true },
)

const isFormDirty = form.useSelector((state) => !state.isDefaultValue)
const { requestClose, handleDrawerShowUpdate } = useDrawerUnsavedChangesGuard({
  show,
  isDirty: isFormDirty,
})
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    width="min(520px, 100vw)"
    :mask-closable="false"
    :close-on-esc="false"
    @update:show="handleDrawerShowUpdate"
  >
    <NDrawerContent title="编辑图标" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field
            name="name"
            :validators="{ onChange: customIconFormSchema.shape.name }"
            v-slot="{ field, state }"
          >
            <NFormItem label="名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                :value="state.value"
                placeholder="请输入图标名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field
            name="keywords"
            :validators="{ onChange: customIconFormSchema.shape.keywords }"
            v-slot="{ field, state }"
          >
            <NFormItem label="关键词（可选）" v-bind="formItemValidationProps(state.meta)">
              <IconKeywordsInput
                class="w-full min-w-0"
                :model-value="state.value"
                @update:model-value="field.handleChange"
              />
            </NFormItem>
          </form.Field>
        </NForm>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3">
          <NButton @click="requestClose">取消</NButton>
          <NButton
            type="primary"
            :disabled="icon === null || isSaving"
            :loading="isSaving"
            @click="handleSubmit"
          >
            保存
          </NButton>
        </div>
      </template>
    </NDrawerContent>
  </NDrawer>
</template>
