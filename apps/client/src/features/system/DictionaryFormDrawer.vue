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
  NInputNumber,
  NPopconfirm,
  NSelect,
} from 'naive-ui'
import {
  DICTIONARY_STATUS_ENABLED,
  dictionaryCreateSchema,
  dictionaryFormSchema,
  dictionaryUpdateSchema,
  type DictionaryFormInput,
} from '@rev30/contracts'
import {
  SystemRequestError,
  createDictionary,
  getDictionary,
  getSystemErrorMessage,
  updateDictionary,
} from '.'
import { statusSelectOptions } from './labels'
import {
  formItemValidationFeedback,
  formItemValidationProps,
  setServerFieldError,
} from '../../utils/form'

const props = defineProps<{
  dictionaryId: string | null
}>()

const show = defineModel<boolean>('show', { required: true })

const emit = defineEmits<{
  saved: []
}>()

const drawerTitle = computed(() => (props.dictionaryId === null ? '新增数据字典' : '编辑数据字典'))

type DictionaryItemInput = DictionaryFormInput['items'][number]

const defaultFormValues: DictionaryFormInput = {
  code: '',
  name: '',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 0,
  items: [],
}

const defaultItemValues: Omit<DictionaryItemInput, 'id'> = {
  label: '',
  value: '',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 0,
}

const queryCache = useQueryCache()
const drawerSessionId = ref(0)

const {
  data: formData,
  error: formLoadError,
  isLoading,
} = useQuery({
  key: () => ['system', 'dictionary-form', props.dictionaryId ?? 'create'],
  enabled: () => show.value,
  async query() {
    const dictionaryId = props.dictionaryId
    if (dictionaryId === null) {
      return {
        formValues: defaultFormValues,
      }
    }

    const dictionary = await getDictionary(dictionaryId)

    return {
      formValues: {
        code: dictionary.code,
        name: dictionary.name,
        description: dictionary.description,
        status: dictionary.status,
        sortOrder: dictionary.sortOrder,
        items: dictionary.items.map((item) => ({
          id: item.id,
          label: item.label,
          value: item.value,
          description: item.description,
          status: item.status,
          sortOrder: item.sortOrder,
        })),
      },
    }
  },
})
const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载数据字典信息失败'),
)

const formError = ref<string | null>(null)

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onChange: dictionaryFormSchema,
    onSubmit: dictionaryFormSchema,
  },
  onSubmit({ value }) {
    const dictionaryId = props.dictionaryId

    formError.value = null

    saveDictionaryMutation.mutate({ dictionaryId, value })
  },
})

const { isLoading: isSaving, ...saveDictionaryMutation } = useMutation({
  onMutate() {
    return {
      sessionId: drawerSessionId.value,
    }
  },
  mutation: ({
    dictionaryId,
    value,
  }: {
    dictionaryId: string | null
    value: DictionaryFormInput
  }) =>
    dictionaryId === null
      ? createDictionary(dictionaryCreateSchema.parse(value))
      : updateDictionary(dictionaryId, dictionaryUpdateSchema.parse(value)),
  onSuccess(_, { dictionaryId }, { sessionId }) {
    if (!show.value || props.dictionaryId !== dictionaryId || sessionId !== drawerSessionId.value) {
      return
    }

    if (dictionaryId !== null) {
      void queryCache.invalidateQueries({
        key: ['system', 'dictionary-form', dictionaryId],
        exact: true,
      })
    }

    emit('saved')
    show.value = false
  },
  onError(error, { dictionaryId }, { sessionId }) {
    if (!show.value || props.dictionaryId !== dictionaryId || sessionId !== drawerSessionId.value) {
      return
    }

    if (
      error instanceof SystemRequestError &&
      setServerFieldError(form, error.field, error.message)
    ) {
      return
    }

    formError.value = getSystemErrorMessage(error, '保存数据字典失败')
  },
})

function handleSubmit() {
  if (isLoading.value || isSaving.value || loadError.value) {
    return
  }

  void form.handleSubmit()
}

function addItem() {
  form.setFieldValue('items', [...form.getFieldValue('items'), { ...defaultItemValues }], {
    dontUpdateMeta: true,
    dontValidate: true,
  })
}

function removeItem(index: number) {
  form.setFieldValue(
    'items',
    form.getFieldValue('items').filter((_, itemIndex) => itemIndex !== index),
  )
}

const fieldMeta = form.useStore((state) => state.fieldMeta)
const itemsValidationProps = computed(() => {
  const parentMeta = fieldMeta.value.items

  if (parentMeta !== undefined) {
    const parentFeedback = formItemValidationFeedback(parentMeta)

    if (parentFeedback !== undefined) {
      return { feedback: parentFeedback, validationStatus: 'error' as const }
    }
  }

  for (const [field, meta] of Object.entries(fieldMeta.value)) {
    if (!field.startsWith('items[') || meta === undefined) {
      continue
    }

    const feedback = formItemValidationFeedback(meta)

    if (feedback !== undefined) {
      return { feedback, validationStatus: 'error' as const }
    }
  }

  return {}
})

watch(
  () => [show.value, props.dictionaryId] as const,
  ([isVisible]) => {
    if (!isVisible) {
      return
    }

    drawerSessionId.value += 1
    saveDictionaryMutation.reset()
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
  <NDrawer v-model:show="show" placement="right" :width="860">
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm @submit.prevent="handleSubmit">
          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem label="字典编码" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="dictionary-form-code"
                :value="state.value"
                placeholder="请输入字典编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem label="字典名称" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="dictionary-form-name"
                :value="state.value"
                placeholder="请输入字典名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="description" v-slot="{ field, state }">
            <NFormItem label="字典说明" v-bind="formItemValidationProps(state.meta)">
              <NInput
                data-test="dictionary-form-description"
                type="textarea"
                :value="state.value ?? ''"
                :autosize="{ minRows: 3, maxRows: 6 }"
                placeholder="可选"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <div class="grid grid-cols-2 gap-3">
            <form.Field name="status" v-slot="{ field, state }">
              <NFormItem label="状态" v-bind="formItemValidationProps(state.meta)">
                <NSelect
                  data-test="dictionary-form-status"
                  :value="state.value"
                  :options="statusSelectOptions"
                  @update:value="field.handleChange"
                />
              </NFormItem>
            </form.Field>

            <form.Field name="sortOrder" v-slot="{ field, state }">
              <NFormItem label="排序" v-bind="formItemValidationProps(state.meta)">
                <NInputNumber
                  data-test="dictionary-form-sort-order"
                  class="w-full"
                  :value="state.value"
                  :precision="0"
                  :show-button="false"
                  placeholder="请输入排序"
                  @blur="field.handleBlur"
                  @update:value="field.handleChange($event ?? 0)"
                />
              </NFormItem>
            </form.Field>
          </div>

          <form.Field name="items" v-slot="{ state }">
            <NFormItem
              data-test="dictionary-items"
              label="字典项"
              content-style="align-items: flex-start;"
              v-bind="itemsValidationProps"
            >
              <div class="flex w-full flex-col gap-3">
                <div
                  class="grid grid-cols-[1.2fr_1.2fr_120px_100px_1.2fr_76px] items-center gap-2 text-sm text-stone-500 dark:text-zinc-400"
                >
                  <span>字典项值</span>
                  <span>字典项名称</span>
                  <span>状态</span>
                  <span>排序</span>
                  <span>说明</span>
                  <NButton
                    data-test="dictionary-item-add"
                    class="justify-self-start"
                    size="small"
                    tertiary
                    @click="addItem"
                  >
                    <template #icon>
                      <span class="i-[lucide--plus]"></span>
                    </template>
                    新增
                  </NButton>
                </div>

                <div
                  v-for="(item, index) in state.value"
                  :key="item.id ?? `new-${index}`"
                  data-test="dictionary-item-row"
                  class="grid grid-cols-[1.2fr_1.2fr_120px_100px_1.2fr_76px] items-start gap-2"
                >
                  <form.Field :name="`items[${index}].value`" v-slot="{ field, state }">
                    <NFormItem
                      class="m-0"
                      :show-label="false"
                      :show-feedback="false"
                      v-bind="formItemValidationProps(state.meta)"
                    >
                      <NInput
                        data-test="dictionary-item-value"
                        :value="state.value"
                        placeholder="请输入值"
                        @blur="field.handleBlur"
                        @update:value="field.handleChange"
                      />
                    </NFormItem>
                  </form.Field>

                  <form.Field :name="`items[${index}].label`" v-slot="{ field, state }">
                    <NFormItem
                      class="m-0"
                      :show-label="false"
                      :show-feedback="false"
                      v-bind="formItemValidationProps(state.meta)"
                    >
                      <NInput
                        data-test="dictionary-item-label"
                        :value="state.value"
                        placeholder="请输入标签"
                        @blur="field.handleBlur"
                        @update:value="field.handleChange"
                      />
                    </NFormItem>
                  </form.Field>

                  <form.Field :name="`items[${index}].status`" v-slot="{ field, state }">
                    <NFormItem class="m-0" :show-label="false" :show-feedback="false">
                      <NSelect
                        data-test="dictionary-item-status"
                        :value="state.value"
                        :options="statusSelectOptions"
                        @update:value="field.handleChange"
                      />
                    </NFormItem>
                  </form.Field>

                  <form.Field :name="`items[${index}].sortOrder`" v-slot="{ field, state }">
                    <NFormItem
                      class="m-0"
                      :show-label="false"
                      :show-feedback="false"
                      v-bind="formItemValidationProps(state.meta)"
                    >
                      <NInputNumber
                        data-test="dictionary-item-sort-order"
                        class="w-full"
                        :value="state.value"
                        :precision="0"
                        :show-button="false"
                        @blur="field.handleBlur"
                        @update:value="field.handleChange($event ?? 0)"
                      />
                    </NFormItem>
                  </form.Field>

                  <form.Field :name="`items[${index}].description`" v-slot="{ field, state }">
                    <NFormItem
                      class="m-0"
                      :show-label="false"
                      :show-feedback="false"
                      v-bind="formItemValidationProps(state.meta)"
                    >
                      <NInput
                        data-test="dictionary-item-description"
                        type="textarea"
                        :value="state.value ?? ''"
                        :autosize="{ minRows: 1, maxRows: 3 }"
                        placeholder="可选"
                        @blur="field.handleBlur"
                        @update:value="field.handleChange"
                      />
                    </NFormItem>
                  </form.Field>

                  <NPopconfirm
                    positive-text="删除"
                    negative-text="取消"
                    :positive-button-props="{ type: 'error' }"
                    @positive-click="removeItem(index)"
                  >
                    确定删除该字典项吗？

                    <template #trigger>
                      <NButton
                        data-test="dictionary-item-remove"
                        class="justify-self-center"
                        quaternary
                        circle
                        aria-label="删除字典项"
                        title="删除字典项"
                      >
                        <template #icon>
                          <span class="i-[lucide--trash-2]"></span>
                        </template>
                      </NButton>
                    </template>
                  </NPopconfirm>
                </div>
              </div>
            </NFormItem>
          </form.Field>

          <div class="flex justify-end gap-3">
            <NButton @click="show = false">取消</NButton>
            <NButton
              data-test="dictionary-form-submit"
              type="primary"
              attr-type="submit"
              :disabled="isLoading || isSaving || !!loadError"
              :loading="isSaving"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
