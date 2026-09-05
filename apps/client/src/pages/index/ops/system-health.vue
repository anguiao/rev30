<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useDocumentVisibility } from '@vueuse/core'
import { NAlert, NButton, NTag } from 'naive-ui'
import type { SystemHealthRecentAnomaly } from '@rev30/contracts'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import { useDrawer } from '../../../composables/useDrawer'
import {
  getSystemHealth,
  getSystemHealthJobStatistics,
} from '../../../features/ops/system-health/requests'
import { useHealthQuery } from '../../../features/ops/system-health/useHealthQuery'
import {
  appendHealthSnapshot,
  createHealthHistory,
} from '../../../features/ops/system-health/history'
import { formatHealthDateTime } from '../../../features/ops/system-health/format'
import {
  systemHealthStatusLabels,
  systemHealthStatusTagTypes,
} from '../../../features/ops/system-health/labels'
import HealthOverview from '../../../features/ops/system-health/HealthOverview.vue'
import HealthStatistics from '../../../features/ops/system-health/HealthStatistics.vue'
import HealthTrends from '../../../features/ops/system-health/HealthTrends.vue'

const pageTitle = useAdminPageTitle('系统健康')

const documentVisibility = useDocumentVisibility()
const visible = computed(() => documentVisibility.value === 'visible')

const history = reactive(createHealthHistory())

const {
  data: snapshot,
  error: snapshotError,
  isLoading: snapshotLoading,
  refresh: refreshSnapshot,
} = useHealthQuery('snapshot', getSystemHealth, visible, 10_000)

const {
  data: statistics,
  error: statisticsError,
  isLoading: statisticsLoading,
  refresh: refreshStatistics,
} = useHealthQuery('statistics', getSystemHealthJobStatistics, visible, 60_000)

watch(snapshot, (value) => {
  if (value && visible.value) {
    appendHealthSnapshot(history, value)
  }
})

function refresh() {
  void refreshSnapshot()
  void refreshStatistics()
}

const {
  component: ScheduledJobRunLogDrawer,
  hasOpened,
  visible: drawerVisible,
  open,
} = useDrawer(() => import('../../../features/ops/ScheduledJobRunLogDrawer.vue'))

const selectedAnomaly = ref<SystemHealthRecentAnomaly | null>(null)

function openAnomaly(anomaly: SystemHealthRecentAnomaly) {
  selectedAnomaly.value = anomaly
  open()
}
</script>

<template>
  <section class="space-y-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex flex-wrap items-center gap-3">
          <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
          <NTag
            v-if="snapshot"
            :type="systemHealthStatusTagTypes[snapshot.status]"
            :bordered="false"
            size="small"
            >{{ systemHealthStatusLabels[snapshot.status] }}</NTag
          >
        </div>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          {{
            snapshot
              ? `快照时间：${formatHealthDateTime(snapshot.observedAt)} · 每 10 秒自动刷新`
              : snapshotLoading
                ? '正在加载当前实例…'
                : '尚无健康快照'
          }}
        </p>
      </div>
      <NButton type="primary" @click="refresh">立即刷新</NButton>
    </header>
    <NAlert v-if="snapshotError" type="error">{{
      snapshot
        ? `刷新失败，数据截至 ${formatHealthDateTime(snapshot.observedAt)}`
        : '加载系统健康失败，请重试'
    }}</NAlert>
    <HealthOverview v-if="snapshot" :snapshot="snapshot" />
    <HealthTrends v-if="snapshot" :history="history" />

    <section aria-labelledby="system-health-statistics-title" class="space-y-4">
      <div>
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="system-health-statistics-title" class="text-lg font-semibold">任务运行统计</h2>
          <p v-if="statistics" class="text-sm text-stone-500 dark:text-zinc-400">
            统计时间：{{ formatHealthDateTime(statistics.generatedAt) }} · 每 60 秒自动刷新
          </p>
        </div>
        <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
          按当前留存日志统计，已清理记录不计入统计；统计时区为上海时间（Asia/Shanghai）
        </p>
      </div>
      <NAlert v-if="statisticsError" type="error">{{
        statistics
          ? `统计刷新失败，数据截至 ${formatHealthDateTime(statistics.generatedAt)}`
          : '加载任务统计失败，请重试'
      }}</NAlert>
      <p v-else-if="statisticsLoading && !statistics">正在加载任务统计…</p>
      <HealthStatistics v-if="statistics" :statistics="statistics" @open-run-log="openAnomaly" />
    </section>
    <ScheduledJobRunLogDrawer
      v-if="hasOpened && selectedAnomaly"
      v-model:show="drawerVisible"
      :task-key="selectedAnomaly.taskKey"
      :task-name="selectedAnomaly.taskName"
      :initial-run-id="selectedAnomaly.runId"
    />
  </section>
</template>
