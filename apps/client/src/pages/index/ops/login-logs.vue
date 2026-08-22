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
  NPagination,
  NSelect,
  NTag,
} from 'naive-ui'
import {
  LOGIN_LOG_RESULT_SUCCESS,
  type LoginFailureReason,
  type LoginLogListItem,
  type LoginLogListQuery,
  type LoginLogListResponse,
  type LoginLogResult,
} from '@rev30/contracts'
import { formatDisplayDateTime } from '@rev30/utils'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import {
  UserAgentSummary,
  clientIpSourceLabels,
  listLoginLogs,
  loginFailureReasonLabels,
  loginFailureReasonOptions,
  loginLogResultLabels,
  loginLogResultOptions,
} from '../../../features/ops'
import { getErrorMessage } from '../../../utils/error'

const pageTitle = useAdminPageTitle('登录日志')

const username = ref('')
const result = ref<LoginLogResult | null>(null)
const failureReason = ref<LoginFailureReason | null>(null)
const clientIp = ref('')
const occurredRange = ref<[number, number] | null>(null)
const query = ref<LoginLogListQuery>({
  page: 1,
  pageSize: 20,
})
const emptyData: LoginLogListResponse = {
  list: [],
  total: 0,
  page: 1,
  pageSize: query.value.pageSize,
}

watch(result, (value) => {
  if (value === LOGIN_LOG_RESULT_SUCCESS) {
    failureReason.value = null
  }
})

const {
  data: response,
  error,
  isLoading,
} = useQuery({
  key: () => [
    'ops',
    'login-logs',
    'list',
    query.value.page,
    query.value.pageSize,
    query.value.username ?? '',
    query.value.result ?? null,
    query.value.failureReason ?? null,
    query.value.clientIp ?? '',
    query.value.occurredFrom ?? '',
    query.value.occurredTo ?? '',
  ],
  placeholderData: () => emptyData,
  query: () => listLoginLogs(query.value),
})
const data = computed(() => response.value ?? emptyData)
const loadErrorMessage = computed(() =>
  error.value === null ? '' : getErrorMessage(error.value, '加载登录日志失败'),
)

function handleSearch() {
  const nextUsername = username.value.trim()
  const nextClientIp = clientIp.value.trim()
  const range = occurredRange.value

  query.value = {
    page: 1,
    pageSize: query.value.pageSize,
    ...(nextUsername.length === 0 ? {} : { username: nextUsername }),
    ...(result.value === null ? {} : { result: result.value }),
    ...(failureReason.value === null ? {} : { failureReason: failureReason.value }),
    ...(nextClientIp.length === 0 ? {} : { clientIp: nextClientIp }),
    ...(range === null
      ? {}
      : {
          occurredFrom: new Date(range[0]).toISOString(),
          occurredTo: new Date(range[1]).toISOString(),
        }),
  }
}

function handleReset() {
  username.value = ''
  result.value = null
  failureReason.value = null
  clientIp.value = ''
  occurredRange.value = null
  query.value = { page: 1, pageSize: query.value.pageSize }
}

const columns: DataTableColumns<LoginLogListItem> = [
  {
    title: '登录时间',
    key: 'createdAt',
    minWidth: 180,
    render: (item) => formatDisplayDateTime(item.createdAt),
  },
  { title: '用户名', key: 'username', minWidth: 140 },
  {
    title: '结果',
    key: 'result',
    width: 90,
    render: (item) =>
      h(
        NTag,
        { type: item.result === LOGIN_LOG_RESULT_SUCCESS ? 'success' : 'error', size: 'small' },
        () => loginLogResultLabels[item.result],
      ),
  },
  {
    title: '失败原因',
    key: 'failureReason',
    minWidth: 120,
    render: (item) =>
      item.failureReason === null ? '-' : loginFailureReasonLabels[item.failureReason],
  },
  {
    title: '客户端 IP',
    key: 'clientIp',
    minWidth: 150,
    render: (item) =>
      h('span', { title: clientIpSourceLabels[item.clientIpSource] }, item.clientIp ?? '-'),
  },
  {
    title: '设备',
    key: 'userAgent',
    minWidth: 260,
    render: (item) => h(UserAgentSummary, { userAgent: item.userAgent }),
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
          <NFormItemGi label="用户名" span="1 640:4 1024:4" class="min-w-0">
            <NInput
              v-model:value="username"
              data-test="login-logs-username"
              clearable
              placeholder="请输入用户名"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="结果" span="1 640:3 1024:3" class="min-w-0">
            <NSelect
              v-model:value="result"
              data-test="login-logs-result"
              clearable
              :options="loginLogResultOptions"
              placeholder="全部"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="失败原因" span="1 640:5 1024:4" class="min-w-0">
            <NSelect
              v-model:value="failureReason"
              data-test="login-logs-failure-reason"
              clearable
              :disabled="result === LOGIN_LOG_RESULT_SUCCESS"
              :options="loginFailureReasonOptions"
              placeholder="全部"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="客户端 IP" span="1 640:4 1024:4" class="min-w-0">
            <NInput
              v-model:value="clientIp"
              data-test="login-logs-client-ip"
              clearable
              placeholder="请输入客户端 IP"
              class="w-full!"
            />
          </NFormItemGi>
          <NFormItemGi label="发生时间" span="1 640:6 1024:6" class="min-w-0">
            <NDatePicker
              v-model:value="occurredRange"
              data-test="login-logs-occurred-range"
              type="datetimerange"
              clearable
              class="w-full!"
            />
          </NFormItemGi>
          <NGridItem suffix span="1 640:2 1024:3">
            <div class="flex h-full items-center justify-end gap-2">
              <NButton data-test="login-logs-search" type="primary" @click="handleSearch"
                >查询</NButton
              >
              <NButton data-test="login-logs-reset" @click="handleReset">重置</NButton>
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
        :row-key="(item: LoginLogListItem) => item.id"
      />
      <div class="mt-4 flex justify-end">
        <NPagination
          v-model:page="query.page"
          :page-size="query.pageSize"
          :item-count="data.total"
        />
      </div>
    </section>
  </main>
</template>
