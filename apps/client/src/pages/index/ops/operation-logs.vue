<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NDatePicker,
  NForm,
  NFormItemGi,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NPagination,
  NSelect,
  NTag,
} from 'naive-ui'
import {
  OPERATION_LOG_RESULT_SUCCESS,
  type OperationLogAction,
  type OperationLogListItem,
  type OperationLogListQuery,
  type OperationLogListResponse,
  type OperationLogModule,
  type OperationLogResult,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { useDrawer } from '../../../composables/useDrawer'
import {
  formatOperationLogTarget,
  listOperationLogs,
  operationLogActionLabels,
  operationLogActionOptions,
  operationLogModuleLabels,
  operationLogModuleOptions,
  operationLogResultLabels,
  operationLogResultOptions,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'
import { renderTableActionButton, renderTableActions } from '../../../utils/ui'

const pageTitle = useAdminPageTitle('操作日志')

const actorKeyword = ref('')
const actorSessionId = ref('')
const module = ref<OperationLogModule | null>(null)
const action = ref<OperationLogAction | null>(null)
const result = ref<OperationLogResult | null>(null)
const httpStatus = ref<number | null>(null)
const targetKeyword = ref('')
const clientIp = ref('')
const requestId = ref('')
const occurredRange = ref<[number, number] | null>(null)
const query = ref<OperationLogListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyData: OperationLogListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

const actionOptions = computed(() =>
  module.value === null
    ? operationLogActionOptions
    : operationLogActionOptions.filter(({ value }) => value.startsWith(`${module.value}:`)),
)
watch(module, (value) => {
  if (action.value !== null && value !== null && !action.value.startsWith(`${value}:`)) {
    action.value = null
  }
})

const {
  data: response,
  error,
  isLoading,
} = useQuery({
  key: () => [
    'ops',
    'operation-logs',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.actorKeyword ?? '',
    query.value.actorSessionId ?? '',
    query.value.module ?? null,
    query.value.action ?? null,
    query.value.result ?? null,
    query.value.httpStatus ?? null,
    query.value.targetKeyword ?? '',
    query.value.clientIp ?? '',
    query.value.requestId ?? '',
    query.value.occurredFrom ?? '',
    query.value.occurredTo ?? '',
  ],
  placeholderData: () => emptyData,
  query: () => listOperationLogs(query.value),
})
const data = computed(() => response.value ?? emptyData)
const loadErrorMessage = computed(() =>
  error.value === null ? '' : getErrorMessage(error.value, '加载操作日志失败'),
)

function handleSearch() {
  const nextActorKeyword = actorKeyword.value.trim()
  const nextActorSessionId = actorSessionId.value.trim()
  const nextTargetKeyword = targetKeyword.value.trim()
  const nextClientIp = clientIp.value.trim()
  const nextRequestId = requestId.value.trim()
  const range = occurredRange.value

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextActorKeyword.length === 0 ? {} : { actorKeyword: nextActorKeyword }),
    ...(nextActorSessionId.length === 0 ? {} : { actorSessionId: nextActorSessionId }),
    ...(module.value === null ? {} : { module: module.value }),
    ...(action.value === null ? {} : { action: action.value }),
    ...(result.value === null ? {} : { result: result.value }),
    ...(httpStatus.value === null ? {} : { httpStatus: httpStatus.value }),
    ...(nextTargetKeyword.length === 0 ? {} : { targetKeyword: nextTargetKeyword }),
    ...(nextClientIp.length === 0 ? {} : { clientIp: nextClientIp }),
    ...(nextRequestId.length === 0 ? {} : { requestId: nextRequestId }),
    ...(range === null
      ? {}
      : {
          occurredFrom: new Date(range[0]).toISOString(),
          occurredTo: new Date(range[1]).toISOString(),
        }),
  }
}

function handleReset() {
  actorKeyword.value = ''
  actorSessionId.value = ''
  module.value = null
  action.value = null
  result.value = null
  httpStatus.value = null
  targetKeyword.value = ''
  clientIp.value = ''
  requestId.value = ''
  occurredRange.value = null
  query.value = { page: 1, pageSize: query.value.pageSize }
}

const {
  component: OperationLogDetailDrawer,
  hasOpened: hasOpenedDetailDrawer,
  visible: isDetailDrawerVisible,
  open: showDetailDrawer,
} = useDrawer(() => import('../../../features/ops/OperationLogDetailDrawer.vue'))
const selectedOperationLogId = ref<string | null>(null)
function openOperationLogDetail(operationLogId: string) {
  selectedOperationLogId.value = operationLogId
  showDetailDrawer()
}

const columns: DataTableColumns<OperationLogListItem> = [
  {
    title: '发生时间',
    key: 'createdAt',
    minWidth: 180,
    render: (item) => formatDisplayDateTime(item.createdAt),
  },
  {
    title: '操作者',
    key: 'actor',
    minWidth: 180,
    render: (item) => `${item.actorNickname}（${item.actorUsername}）`,
  },
  {
    title: '模块 / 动作',
    key: 'action',
    minWidth: 190,
    render: (item) =>
      `${operationLogModuleLabels[item.module]} · ${operationLogActionLabels[item.action]}`,
  },
  { title: '目标', key: 'target', minWidth: 180, render: formatOperationLogTarget },
  {
    title: '结果',
    key: 'result',
    width: 90,
    render: (item) =>
      h(
        NTag,
        {
          type: item.result === OPERATION_LOG_RESULT_SUCCESS ? 'success' : 'error',
          size: 'small',
        },
        () => operationLogResultLabels[item.result],
      ),
  },
  { title: '状态码', key: 'httpStatus', width: 80 },
  { title: '客户端 IP', key: 'clientIp', minWidth: 140, render: (item) => item.clientIp ?? '-' },
  { title: '耗时', key: 'durationMs', width: 90, render: (item) => `${item.durationMs} ms` },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (item) =>
      renderTableActions([
        renderTableActionButton({
          label: '查看详情',
          accessCode: 'ops:operation-log:list',
          dataTest: 'operation-log-detail',
          onClick: () => openOperationLogDetail(item.id),
        }),
      ]),
  },
]
</script>

<template>
  <main class="space-y-5">
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">共 {{ data.total }} 条</p>
    </header>

    <section
      class="rounded-ui border border-stone-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900"
    >
      <NForm label-placement="left" :show-feedback="false">
        <NGrid cols="1 640:12 1024:24" item-responsive :x-gap="16" :y-gap="12">
          <NFormItemGi label="操作者" span="1 640:6 1024:4" class="min-w-0">
            <NInput
              v-model:value="actorKeyword"
              data-test="operation-logs-actor"
              clearable
              placeholder="请输入用户名、昵称或用户 ID"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="会话 ID" span="1 640:6 1024:5" class="min-w-0">
            <NInput
              v-model:value="actorSessionId"
              data-test="operation-logs-session"
              clearable
              placeholder="请输入会话 ID"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="模块" span="1 640:4 1024:4" class="min-w-0">
            <NSelect
              v-model:value="module"
              data-test="operation-logs-module"
              clearable
              :options="operationLogModuleOptions"
              placeholder="全部"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="动作" span="1 640:8 1024:4" class="min-w-0">
            <NSelect
              v-model:value="action"
              data-test="operation-logs-action"
              clearable
              :options="actionOptions"
              placeholder="全部"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="结果" span="1 640:4 1024:3" class="min-w-0">
            <NSelect
              v-model:value="result"
              data-test="operation-logs-result"
              clearable
              :options="operationLogResultOptions"
              placeholder="全部"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="状态码" span="1 640:4 1024:4" class="min-w-0">
            <NInputNumber
              v-model:value="httpStatus"
              data-test="operation-logs-http-status"
              clearable
              :min="100"
              :max="599"
              :precision="0"
              placeholder="100–599"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="目标" span="1 640:4 1024:4" class="min-w-0">
            <NInput
              v-model:value="targetKeyword"
              data-test="operation-logs-target"
              clearable
              placeholder="请输入目标关键词"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="客户端 IP" span="1 640:6 1024:4" class="min-w-0">
            <NInput
              v-model:value="clientIp"
              data-test="operation-logs-client-ip"
              clearable
              placeholder="请输入客户端 IP"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="请求 ID" span="1 640:6 1024:5" class="min-w-0">
            <NInput
              v-model:value="requestId"
              data-test="operation-logs-request-id"
              clearable
              placeholder="请输入请求 ID"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="发生时间" span="1 640:8 1024:7" class="min-w-0">
            <NDatePicker
              v-model:value="occurredRange"
              data-test="operation-logs-occurred-range"
              type="datetimerange"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NGridItem suffix span="1 640:4 1024:4">
            <div class="flex h-full items-center justify-end gap-2">
              <NButton data-test="operation-logs-search" type="primary" @click="handleSearch"
                >查询</NButton
              >
              <NButton data-test="operation-logs-reset" @click="handleReset">重置</NButton>
            </div>
          </NGridItem>
        </NGrid>
      </NForm>
    </section>

    <NAlert v-if="loadErrorMessage" type="error">{{ loadErrorMessage }}</NAlert>

    <section>
      <NDataTable
        :columns="columns"
        :data="data.list"
        :loading="isLoading"
        :pagination="false"
        :row-key="(item: OperationLogListItem) => item.id"
      />
      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="data.total"
        />
      </div>
    </section>

    <OperationLogDetailDrawer
      v-if="hasOpenedDetailDrawer && selectedOperationLogId !== null"
      v-model:show="isDetailDrawerVisible"
      :operation-log-id="selectedOperationLogId"
    />
  </main>
</template>
