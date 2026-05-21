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
  NSelect,
} from 'naive-ui'
import {
  DICTIONARY_STATUS_ENABLED,
  dictionaryCreateSchema,
  dictionaryFormSchema,
  dictionaryUpdateSchema,
  type DictionaryFormInput,
} from '@rev30/shared'
import {
  SystemRequestError,
  createDictionary,
  getDictionary,
  getSystemErrorMessage,
  updateDictionary,
} from '.'
import { statusSelectOptions } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

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

function updateItem(index: number, value: Partial<DictionaryItemInput>) {
  const items = form.getFieldValue('items')

  form.setFieldValue(
    'items',
    items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...value } : item)),
  )
}

function addItem() {
  form.setFieldValue('items', [...form.getFieldValue('items'), { ...defaultItemValues }])
}

function removeItem(index: number) {
  form.setFieldValue(
    'items',
    form.getFieldValue('items').filter((_, itemIndex) => itemIndex !== index),
  )
}

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
              v-bind="formItemValidationProps(state.meta)"
            >
              <div class="flex w-full flex-col gap-3">
                <div class="flex justify-end">
                  <NButton data-test="dictionary-item-add" @click="addItem">新增字典项</NButton>
                </div>

                <div
                  class="grid gap-2 text-xs text-neutral-500"
                  style="grid-template-columns: 1.2fr 1.2fr 120px 100px 1.2fr 88px"
                >
                  <span>字典项值</span>
                  <span>字典项标签</span>
                  <span>状态</span>
                  <span>排序</span>
                  <span>说明</span>
                  <span>操作</span>
                </div>

                <div
                  v-for="(item, index) in state.value"
                  :key="item.id ?? `new-${index}`"
                  data-test="dictionary-item-row"
                  class="grid items-start gap-2"
                  style="grid-template-columns: 1.2fr 1.2fr 120px 100px 1.2fr 88px"
                >
                  <NInput
                    data-test="dictionary-item-value"
                    :value="item.value"
                    placeholder="请输入值"
                    @update:value="updateItem(index, { value: $event })"
                  />

                  <NInput
                    data-test="dictionary-item-label"
                    :value="item.label"
                    placeholder="请输入标签"
                    @update:value="updateItem(index, { label: $event })"
                  />

                  <NSelect
                    data-test="dictionary-item-status"
                    :value="item.status"
                    :options="statusSelectOptions"
                    @update:value="updateItem(index, { status: $event })"
                  />

                  <NInputNumber
                    data-test="dictionary-item-sort-order"
                    class="w-full"
                    :value="item.sortOrder"
                    :precision="0"
                    :show-button="false"
                    @update:value="updateItem(index, { sortOrder: $event ?? 0 })"
                  />

                  <NInput
                    data-test="dictionary-item-description"
                    type="textarea"
                    :value="item.description ?? ''"
                    :autosize="{ minRows: 1, maxRows: 3 }"
                    placeholder="可选"
                    @update:value="updateItem(index, { description: $event })"
                  />

                  <NButton
                    data-test="dictionary-item-remove"
                    type="error"
                    tertiary
                    @click="removeItem(index)"
                  >
                    删除
                  </NButton>
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
