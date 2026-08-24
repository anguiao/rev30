<script setup lang="ts">
import { computed, h, ref, watch } from 'vue'
import { useQuery } from '@pinia/colada'
import type { DataTableColumns } from 'naive-ui'
import {
  NAlert,
  NButton,
  NDataTable,
  NDatePicker,
  NDescriptions,
  NDescriptionsItem,
  NDrawer,
  NDrawerContent,
  NForm,
  NFormItemGi,
  NGrid,
  NGridItem,
  NInput,
  NInputNumber,
  NPagination,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui'
import type {
  OperationLogAction,
  OperationLogListItem,
  OperationLogListQuery,
  OperationLogListResponse,
  OperationLogModule,
  OperationLogResult,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  UserAgentSummary,
  clientIpSourceLabels,
  getOperationLog,
  listOperationLogs,
  operationLogActionLabels,
  operationLogActionOptions,
  operationLogModuleLabels,
  operationLogModuleOptions,
  operationLogResultLabels,
  operationLogResultOptions,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'

const pageTitle = useAdminPageTitle('操作日志')
const message = useMessage()

async function copyId(value: string) {
  try {
    await navigator.clipboard.writeText(value)
    message.success('已复制')
  } catch {
    message.error('复制失败')
  }
}

function getOperationLogQueryKey(value: OperationLogListQuery) {
  return [
    value.page,
    value.pageSize,
    value.actorKeyword ?? '',
    value.actorSessionId ?? '',
    value.module ?? '',
    value.action ?? '',
    value.result ?? '',
    value.httpStatus ?? '',
    value.targetKeyword ?? '',
    value.clientIp ?? '',
    value.requestId ?? '',
    value.occurredFrom ?? '',
    value.occurredTo ?? '',
  ] as const
}

function hasSameOperationLogQuery(current: OperationLogListQuery, next: OperationLogListQuery) {
  const currentKey = getOperationLogQueryKey(current)
  const nextKey = getOperationLogQueryKey(next)

  return currentKey.every((value, index) => value === nextKey[index])
}

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
const query = ref<OperationLogListQuery>({ page: 1, pageSize: 20 })
const selectedId = ref<string | null>(null)
const showDetail = ref(false)

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

const emptyData: OperationLogListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}
const {
  data: response,
  error,
  isLoading,
  refetch: refetchList,
} = useQuery({
  key: () => ['ops', 'operation-logs', 'list', ...getOperationLogQueryKey(query.value)],
  staleTime: 0,
  placeholderData: () => emptyData,
  query: () => listOperationLogs(query.value),
})
const data = computed(() => response.value ?? emptyData)
const loadErrorMessage = computed(() =>
  error.value === null ? '' : getErrorMessage(error.value, '加载操作日志失败'),
)

const {
  data: detail,
  error: detailError,
  isLoading: isDetailLoading,
} = useQuery({
  key: () => ['ops', 'operation-logs', 'detail', selectedId.value],
  enabled: () => showDetail.value && selectedId.value !== null,
  query: () => getOperationLog(selectedId.value!),
})
const visibleDetail = computed(() =>
  showDetail.value && detail.value?.id === selectedId.value ? detail.value : null,
)
const detailErrorMessage = computed(() =>
  detailError.value === null ? '' : getErrorMessage(detailError.value, '加载操作日志详情失败'),
)

function trimmed(value: string) {
  const next = value.trim()
  return next.length === 0 ? undefined : next
}

function submitQuery(nextQuery: OperationLogListQuery) {
  if (hasSameOperationLogQuery(query.value, nextQuery)) {
    void refetchList()
    return
  }

  query.value = nextQuery
}

function handleSearch() {
  const range = occurredRange.value
  submitQuery({
    page: 1,
    pageSize: query.value.pageSize,
    ...(trimmed(actorKeyword.value) ? { actorKeyword: trimmed(actorKeyword.value) } : {}),
    ...(trimmed(actorSessionId.value) ? { actorSessionId: trimmed(actorSessionId.value) } : {}),
    ...(module.value === null ? {} : { module: module.value }),
    ...(action.value === null ? {} : { action: action.value }),
    ...(result.value === null ? {} : { result: result.value }),
    ...(httpStatus.value === null ? {} : { httpStatus: httpStatus.value }),
    ...(trimmed(targetKeyword.value) ? { targetKeyword: trimmed(targetKeyword.value) } : {}),
    ...(trimmed(clientIp.value) ? { clientIp: trimmed(clientIp.value) } : {}),
    ...(trimmed(requestId.value) ? { requestId: trimmed(requestId.value) } : {}),
    ...(range === null
      ? {}
      : {
          occurredFrom: new Date(range[0]).toISOString(),
          occurredTo: new Date(range[1]).toISOString(),
        }),
  })
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
  submitQuery({ page: 1, pageSize: query.value.pageSize })
}

function openDetail(id: string) {
  selectedId.value = id
  showDetail.value = true
}

function targetText(item: OperationLogListItem) {
  if (item.targetLabel !== null && item.targetKey !== null) {
    return `${item.targetLabel}（${item.targetKey}）`
  }
  return item.targetLabel ?? item.targetKey ?? '-'
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
  { title: '目标', key: 'target', minWidth: 180, render: targetText },
  {
    title: '结果',
    key: 'result',
    width: 90,
    render: (item) =>
      h(
        NTag,
        { type: item.result === 'success' ? 'success' : 'error', size: 'small' },
        () => operationLogResultLabels[item.result],
      ),
  },
  { title: '状态码', key: 'httpStatus', width: 80 },
  { title: '客户端 IP', key: 'clientIp', minWidth: 140, render: (item) => item.clientIp ?? '-' },
  { title: '耗时', key: 'durationMs', width: 90, render: (item) => `${item.durationMs} ms` },
  {
    title: '详情',
    key: 'detail',
    width: 100,
    render: (item) =>
      h(
        NButton,
        {
          text: true,
          type: 'primary',
          'data-test': 'operation-log-detail',
          onClick: () => openDetail(item.id),
        },
        () => '查看详情',
      ),
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
        <NGrid cols="1 640:6 1024:24" item-responsive :x-gap="16" :y-gap="12">
          <NFormItemGi label="操作者" span="1 640:3 1024:4" class="min-w-0">
            <NInput
              v-model:value="actorKeyword"
              data-test="operation-logs-actor"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="会话 ID" span="1 640:3 1024:5" class="min-w-0">
            <NInput
              v-model:value="actorSessionId"
              data-test="operation-logs-session"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="模块" span="1 640:2 1024:4" class="min-w-0">
            <NSelect
              v-model:value="module"
              data-test="operation-logs-module"
              clearable
              :options="operationLogModuleOptions"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="动作" span="1 640:4 1024:4" class="min-w-0">
            <NSelect
              v-model:value="action"
              data-test="operation-logs-action"
              clearable
              :options="actionOptions"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="结果" span="1 640:2 1024:3" class="min-w-0">
            <NSelect
              v-model:value="result"
              data-test="operation-logs-result"
              clearable
              :options="operationLogResultOptions"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="状态码" span="1 640:2 1024:4" class="min-w-0">
            <NInputNumber
              v-model:value="httpStatus"
              data-test="operation-logs-http-status"
              clearable
              :min="100"
              :max="599"
              :precision="0"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="目标" span="1 640:2 1024:4" class="min-w-0">
            <NInput
              v-model:value="targetKeyword"
              data-test="operation-logs-target"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="客户端 IP" span="1 640:3 1024:4" class="min-w-0">
            <NInput
              v-model:value="clientIp"
              data-test="operation-logs-client-ip"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="请求 ID" span="1 640:3 1024:5" class="min-w-0">
            <NInput
              v-model:value="requestId"
              data-test="operation-logs-request-id"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="发生时间" span="1 640:4 1024:7" class="min-w-0">
            <NDatePicker
              v-model:value="occurredRange"
              data-test="operation-logs-occurred-range"
              type="datetimerange"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NGridItem suffix span="1 640:2 1024:4">
            <div class="flex h-full items-center justify-end gap-2">
              <NButton data-test="operation-logs-search" type="primary" @click="handleSearch"
                >查询</NButton
              ><NButton data-test="operation-logs-reset" @click="handleReset">重置</NButton>
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

    <NDrawer
      v-model:show="showDetail"
      data-test="operation-log-detail-drawer"
      placement="right"
      :width="620"
    >
      <NDrawerContent title="操作日志详情" closable>
        <NSpin :show="isDetailLoading">
          <NAlert v-if="detailErrorMessage" type="error">{{ detailErrorMessage }}</NAlert>
          <NDescriptions v-if="visibleDetail" bordered :column="1" label-placement="left">
            <NDescriptionsItem label="发生时间">{{
              formatDisplayDateTime(visibleDetail.createdAt)
            }}</NDescriptionsItem>
            <NDescriptionsItem label="操作者"
              >{{ visibleDetail.actorNickname }}（{{
                visibleDetail.actorUsername
              }}）</NDescriptionsItem
            >
            <NDescriptionsItem label="操作者 ID"
              ><span class="inline-flex max-w-full items-center gap-2 align-middle">
                <span class="min-w-0 break-all">{{ visibleDetail.actorUserId }}</span>
                <NButton
                  quaternary
                  circle
                  type="primary"
                  size="tiny"
                  class="shrink-0"
                  aria-label="复制操作者 ID"
                  title="复制操作者 ID"
                  data-test="operation-log-copy-id"
                  @click="copyId(visibleDetail.actorUserId)"
                >
                  <span class="i-[lucide--copy]" aria-hidden="true" />
                </NButton> </span
            ></NDescriptionsItem>
            <NDescriptionsItem label="管理员快照">{{
              visibleDetail.actorIsAdmin ? '管理员' : '非管理员'
            }}</NDescriptionsItem>
            <NDescriptionsItem label="结果"
              ><NTag :type="visibleDetail.result === 'success' ? 'success' : 'error'">{{
                operationLogResultLabels[visibleDetail.result]
              }}</NTag></NDescriptionsItem
            >
            <NDescriptionsItem label="模块 / 动作"
              >{{ operationLogModuleLabels[visibleDetail.module] }} ·
              {{ operationLogActionLabels[visibleDetail.action] }}</NDescriptionsItem
            >
            <NDescriptionsItem label="目标">{{ targetText(visibleDetail) }}</NDescriptionsItem>
            <NDescriptionsItem label="状态码">{{ visibleDetail.httpStatus }}</NDescriptionsItem>
            <NDescriptionsItem label="耗时">{{ visibleDetail.durationMs }} ms</NDescriptionsItem>
            <NDescriptionsItem label="请求 ID"
              ><span class="inline-flex max-w-full items-center gap-2 align-middle">
                <span class="min-w-0 break-all">{{ visibleDetail.requestId }}</span>
                <NButton
                  quaternary
                  circle
                  type="primary"
                  size="tiny"
                  class="shrink-0"
                  aria-label="复制请求 ID"
                  title="复制请求 ID"
                  data-test="operation-log-copy-id"
                  @click="copyId(visibleDetail.requestId)"
                >
                  <span class="i-[lucide--copy]" aria-hidden="true" />
                </NButton> </span
            ></NDescriptionsItem>
            <NDescriptionsItem label="会话 ID"
              ><span class="inline-flex max-w-full items-center gap-2 align-middle">
                <span class="min-w-0 break-all">{{ visibleDetail.actorSessionId }}</span>
                <NButton
                  quaternary
                  circle
                  type="primary"
                  size="tiny"
                  class="shrink-0"
                  aria-label="复制会话 ID"
                  title="复制会话 ID"
                  data-test="operation-log-copy-id"
                  @click="copyId(visibleDetail.actorSessionId)"
                >
                  <span class="i-[lucide--copy]" aria-hidden="true" />
                </NButton> </span
            ></NDescriptionsItem>
            <NDescriptionsItem label="客户端 IP"
              >{{ visibleDetail.clientIp ?? '-' }}（{{
                clientIpSourceLabels[visibleDetail.clientIpSource]
              }}）</NDescriptionsItem
            >
            <NDescriptionsItem label="设备"
              ><UserAgentSummary :user-agent="visibleDetail.userAgent"
            /></NDescriptionsItem>
          </NDescriptions>
        </NSpin>
      </NDrawerContent>
    </NDrawer>
  </main>
</template>
