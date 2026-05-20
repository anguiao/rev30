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
  dictionaryUpdateSchema,
  type DictionaryCreateInput,
  type DictionaryDetail,
  type DictionaryUpdateInput,
} from '@rev30/shared'
import type { ZodIssue } from 'zod'
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

type DictionaryFormValues = Omit<DictionaryUpdateInput, 'items'>
type DictionaryItemInput = DictionaryUpdateInput['items'][number]
type DictionaryFormData = {
  formValues: DictionaryFormValues
  items: DictionaryUpdateInput['items']
}

const defaultFormValues: DictionaryFormValues = {
  code: '',
  name: '',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 0,
}

const defaultItemValues: Omit<DictionaryItemInput, 'id'> = {
  label: '',
  value: '',
  description: null,
  status: DICTIONARY_STATUS_ENABLED,
  sortOrder: 0,
}

function toDictionaryFormData(dictionary: DictionaryDetail): DictionaryFormData {
  return {
    formValues: {
      code: dictionary.code,
      name: dictionary.name,
      description: dictionary.description,
      status: dictionary.status,
      sortOrder: dictionary.sortOrder,
    },
    items: dictionary.items.map((item) => ({
      id: item.id,
      label: item.label,
      value: item.value,
      description: item.description,
      status: item.status,
      sortOrder: item.sortOrder,
    })),
  }
}

const items = ref<DictionaryUpdateInput['items']>([])
const queryCache = useQueryCache()

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
        items: [],
      }
    }

    return toDictionaryFormData(await getDictionary(dictionaryId))
  },
})

const loadError = computed(() =>
  isLoading.value || formLoadError.value === null
    ? null
    : getSystemErrorMessage(formLoadError.value, '加载数据字典信息失败'),
)

const formError = ref<string | null>(null)
const itemsError = ref<string | null>(null)
const drawerSessionId = ref(0)

function setLocalValidationErrors(issues: ZodIssue[]) {
  let fallbackMessage: string | null = null

  for (const issue of issues) {
    const field = issue.path[0]

    if (field === 'items') {
      itemsError.value ??= issue.message
      continue
    }

    if (typeof field === 'string' && setServerFieldError(form, field, issue.message)) {
      continue
    }

    fallbackMessage ??= issue.message
  }

  formError.value = fallbackMessage ?? '保存数据字典失败'
}

const form = useForm({
  defaultValues: defaultFormValues,
  onSubmit({ value }) {
    const dictionaryId = props.dictionaryId
    const sessionId = drawerSessionId.value
    formError.value = null
    itemsError.value = null

    const payload = {
      ...value,
      items: items.value,
    }

    const parseResult =
      dictionaryId === null
        ? dictionaryCreateSchema.safeParse(payload)
        : dictionaryUpdateSchema.safeParse(payload)

    if (!parseResult.success) {
      setLocalValidationErrors(parseResult.error.issues)
      return
    }

    saveDictionaryMutation.mutate(
      dictionaryId === null
        ? {
            dictionaryId: null,
            sessionId,
            value: parseResult.data,
          }
        : {
            dictionaryId,
            sessionId,
            value: parseResult.data,
          },
    )
  },
})

type DictionarySavePayload =
  | { dictionaryId: null; sessionId: number; value: DictionaryCreateInput }
  | { dictionaryId: string; sessionId: number; value: DictionaryUpdateInput }

const { isLoading: isSaving, ...saveDictionaryMutation } = useMutation({
  mutation: ({ dictionaryId, value }: DictionarySavePayload) =>
    dictionaryId === null ? createDictionary(value) : updateDictionary(dictionaryId, value),
  onSuccess(savedDictionary, { dictionaryId, sessionId }) {
    if (!show.value || props.dictionaryId !== dictionaryId || sessionId !== drawerSessionId.value) {
      return
    }

    queryCache.setQueryData(
      ['system', 'dictionary-form', savedDictionary.id],
      toDictionaryFormData(savedDictionary),
    )
    emit('saved')
    show.value = false
  },
  onError(error, { dictionaryId, sessionId }) {
    if (!show.value || props.dictionaryId !== dictionaryId || sessionId !== drawerSessionId.value) {
      return
    }

    if (error instanceof SystemRequestError && error.field === 'items') {
      itemsError.value = error.message
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
  items.value = items.value.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...value } : item,
  )
}

function addItem() {
  items.value = [...items.value, { ...defaultItemValues }]
}

function removeItem(index: number) {
  items.value = items.value.filter((_, itemIndex) => itemIndex !== index)
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
    itemsError.value = null
    form.reset(defaultFormValues)
    items.value = []
  },
  {
    immediate: true,
  },
)

watch(
  () => [show.value, formData.value] as const,
  ([isVisible, value]) => {
    if (!isVisible || value === undefined) {
      return
    }

    form.reset(value.formValues)
    items.value = value.items
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

          <NFormItem label="字典项">
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
                v-for="(item, index) in items"
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

              <NAlert
                v-if="itemsError"
                data-test="dictionary-items-error"
                type="error"
                :show-icon="false"
              >
                {{ itemsError }}
              </NAlert>
            </div>
          </NFormItem>

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
