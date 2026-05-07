<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useForm } from '@tanstack/vue-form'
import { z } from 'zod'
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
  NTree,
  type TreeOption,
} from 'naive-ui'
import {
  ROLE_STATUS_DISABLED,
  ROLE_STATUS_ENABLED,
  roleCreateSchema,
  roleResourceIdsSchema,
  roleStatusSchema,
  roleUpdateSchema,
  type ResourceTreeNode,
  type Role,
  type RoleCreateInput,
} from '@rev30/shared'
import {
  SystemRequestError,
  createRole,
  getResourceTree,
  getRole,
  getSystemErrorMessage,
  updateRole,
} from '.'
import { statusLabels } from './labels'
import { formItemValidationProps, setServerFieldError } from '../../utils/form'

type RoleFormData = {
  name: string
  code: string
  status: RoleCreateInput['status']
  sortOrder: number
  resourceIds: string[]
}

const props = defineProps<{
  show: boolean
  roleId: string | null
}>()

const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
}>()

const defaultFormValues: RoleFormData = {
  name: '',
  code: '',
  status: ROLE_STATUS_ENABLED,
  sortOrder: 0,
  resourceIds: [],
}

const roleFormSchema = z.object({
  name: z.string().trim().min(1, '请输入角色名称'),
  code: z.string().trim().min(1, '请输入角色编码'),
  status: roleStatusSchema,
  sortOrder: z.number('排序必须是数字').int('排序必须是整数'),
  resourceIds: roleResourceIdsSchema,
})

const statusOptions = [
  {
    label: statusLabels[ROLE_STATUS_ENABLED],
    value: ROLE_STATUS_ENABLED,
  },
  {
    label: statusLabels[ROLE_STATUS_DISABLED],
    value: ROLE_STATUS_DISABLED,
  },
]

const resourceTree = ref<TreeOption[]>([])
const loadError = ref<string | null>(null)
const formError = ref<string | null>(null)
const loading = ref(false)
const saving = ref(false)
const loadToken = ref(0)
const saveToken = ref(0)

const drawerTitle = computed(() => (props.roleId === null ? '新增角色' : '编辑角色'))

function isActiveSave(currentSaveToken: number, submittedRoleId: string | null) {
  return saveToken.value === currentSaveToken && props.show && props.roleId === submittedRoleId
}

function handleSubmit() {
  if (loading.value || saving.value || loadError.value !== null) {
    return
  }

  void form.handleSubmit()
}

const form = useForm({
  defaultValues: defaultFormValues,
  validators: {
    onSubmit: roleFormSchema,
  },
  async onSubmit({ value }) {
    const currentSaveToken = saveToken.value + 1
    const submittedRoleId = props.roleId

    saveToken.value = currentSaveToken
    formError.value = null
    saving.value = true

    try {
      if (submittedRoleId === null) {
        await createRole(roleCreateSchema.parse(value))
      } else {
        await updateRole(submittedRoleId, roleUpdateSchema.parse(value))
      }

      if (!isActiveSave(currentSaveToken, submittedRoleId)) {
        return
      }

      emit('saved')
      emit('update:show', false)
    } catch (error) {
      if (!isActiveSave(currentSaveToken, submittedRoleId)) {
        return
      }

      if (error instanceof SystemRequestError && error.field !== undefined) {
        setServerFieldError(form, error.field as keyof RoleFormData, error.message)
        return
      }

      formError.value = getSystemErrorMessage(error, '保存角色失败')
    } finally {
      if (isActiveSave(currentSaveToken, submittedRoleId)) {
        saving.value = false
      }
    }
  },
})

function applyFormValues(values: RoleFormData) {
  form.reset()
  form.setFieldValue('name', values.name)
  form.setFieldValue('code', values.code)
  form.setFieldValue('status', values.status)
  form.setFieldValue('sortOrder', values.sortOrder)
  form.setFieldValue('resourceIds', values.resourceIds)
}

function resetDrawerState() {
  loadToken.value += 1
  saveToken.value += 1
  form.reset()
  resourceTree.value = []
  loadError.value = null
  formError.value = null
  loading.value = false
  saving.value = false
}

function toTreeOptions(nodes: ResourceTreeNode[]): TreeOption[] {
  return nodes.map((node) => ({
    key: node.id,
    label: `${node.name} (${node.code})`,
    children: toTreeOptions(node.children),
  }))
}

function toRoleFormValues(role: Role): RoleFormData {
  return {
    name: role.name,
    code: role.code,
    status: role.status,
    sortOrder: role.sortOrder,
    resourceIds: role.resources.map((resource) => resource.id),
  }
}

async function loadForm() {
  const currentLoadToken = loadToken.value + 1
  const loadRoleId = props.roleId

  loadToken.value = currentLoadToken
  loading.value = true
  loadError.value = null
  formError.value = null

  try {
    const [resources, role] = await Promise.all([
      getResourceTree(),
      loadRoleId === null ? Promise.resolve(null) : getRole(loadRoleId),
    ])

    if (loadToken.value !== currentLoadToken || !props.show || props.roleId !== loadRoleId) {
      return
    }

    resourceTree.value = toTreeOptions(resources)

    if (role === null) {
      applyFormValues(defaultFormValues)
      return
    }

    applyFormValues(toRoleFormValues(role))
  } catch (error) {
    if (loadToken.value !== currentLoadToken || !props.show || props.roleId !== loadRoleId) {
      return
    }

    loadError.value = getSystemErrorMessage(error, '加载角色表单失败')
  } finally {
    if (loadToken.value === currentLoadToken) {
      loading.value = false
    }
  }
}

watch(
  () => [props.show, props.roleId] as const,
  ([show, roleId], previousValue) => {
    if (!show) {
      resetDrawerState()
      return
    }

    const previousShow = previousValue?.[0]
    const previousRoleId = previousValue?.[1]

    if (!previousShow || previousRoleId !== roleId) {
      saveToken.value += 1
      saving.value = false
      void loadForm()
    }
  },
  {
    immediate: true,
  },
)
</script>

<template>
  <NDrawer
    :show="show"
    placement="right"
    :width="640"
    @update:show="emit('update:show', $event)"
  >
    <NDrawerContent :title="drawerTitle" closable>
      <div class="flex flex-col gap-4">
        <NAlert v-if="loadError" type="error" :show-icon="false">
          {{ loadError }}
        </NAlert>

        <NAlert v-if="formError" type="error" :show-icon="false">
          {{ formError }}
        </NAlert>

        <NForm class="flex flex-col gap-4" @submit.prevent="handleSubmit">
          <form.Field name="name" v-slot="{ field, state }">
            <NFormItem
              label="角色名称"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="role-form-name"
                :value="state.value"
                placeholder="请输入角色名称"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="code" v-slot="{ field, state }">
            <NFormItem
              label="角色编码"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInput
                data-test="role-form-code"
                :value="state.value"
                placeholder="请输入角色编码"
                @blur="field.handleBlur"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="status" v-slot="{ field, state }">
            <NFormItem
              label="状态"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NSelect
                data-test="role-form-status"
                :value="state.value"
                :options="statusOptions"
                @update:value="field.handleChange"
              />
            </NFormItem>
          </form.Field>

          <form.Field name="sortOrder" v-slot="{ field, state }">
            <NFormItem
              label="排序"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NInputNumber
                data-test="role-form-sort-order"
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

          <form.Field name="resourceIds" v-slot="{ field, state }">
            <NFormItem
              label="资源权限"
              v-bind="formItemValidationProps(state.meta.errors, state.meta.errorMap.onServer)"
            >
              <NTree
                data-test="role-form-resources"
                block-line
                checkable
                cascade
                :data="resourceTree"
                :checked-keys="state.value"
                @update:checked-keys="
                  (keys) => {
                    field.handleChange(keys.map(String))
                  }
                "
              />
            </NFormItem>
          </form.Field>

          <div class="flex justify-end">
            <NButton
              data-test="role-form-submit"
              type="primary"
              attr-type="submit"
              :loading="saving"
              :disabled="loading || loadError !== null"
            >
              保存
            </NButton>
          </div>
        </NForm>
      </div>
    </NDrawerContent>
  </NDrawer>
</template>
