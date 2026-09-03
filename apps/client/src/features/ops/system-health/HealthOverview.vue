<script setup lang="ts">
import { computed, ref } from 'vue'
import { NButton, NCard, NDescriptions, NDescriptionsItem, NDivider, NTag } from 'naive-ui'
import bytes from 'bytes'
import type { SystemHealthSnapshot, SystemHealthIssue } from '@rev30/contracts'
import { formatHealthLatency, formatHealthTime } from './format'

const props = defineProps<{ snapshot: SystemHealthSnapshot }>()
const detailsVisible = ref(false)
const issueLabels: Record<SystemHealthIssue, string> = {
  database_unavailable: '数据库不可用',
  storage_unavailable: '附件存储不可用',
  scheduler_stopped: '调度器已停止',
  scheduler_query_retry: '任务调度检查失败',
  scheduler_overdue: '任务启动延迟',
}
const uptime = computed(() => {
  const seconds = props.snapshot.instance.uptimeSeconds
  return `${Math.floor(seconds / 86400)} 天 ${Math.floor((seconds % 86400) / 3600)} 小时 ${Math.floor((seconds % 3600) / 60)} 分 ${seconds % 60} 秒`
})
const schedulerHasIssue = computed(() =>
  props.snapshot.issues.some((issue) => issue.startsWith('scheduler_')),
)
const overdueHint = computed(() => {
  const threshold = '已启用的任务超过计划时间 60 秒仍未启动'
  const oldestOverdueAt = props.snapshot.scheduler.shared.oldestOverdueAt
  return oldestOverdueAt === null
    ? threshold
    : `${threshold}\n最早计划时间：${formatHealthTime(oldestOverdueAt)}`
})
</script>

<template>
  <NCard title="运行概况" size="small">
    <template #header-extra>
      <NButton
        text
        :aria-expanded="detailsVisible"
        aria-controls="system-health-diagnostics"
        @click="detailsVisible = !detailsVisible"
      >
        {{ detailsVisible ? '收起详情' : '诊断详情' }}
        <span
          aria-hidden="true"
          class="ml-1 i-[lucide--chevron-down] size-4"
          :class="{ 'rotate-180': detailsVisible }"
        />
      </NButton>
    </template>
    <div v-if="snapshot.issues.length > 0" class="mb-4 flex flex-wrap gap-2">
      <NTag
        v-for="issue in snapshot.issues"
        :key="issue"
        :type="issue === 'database_unavailable' ? 'error' : 'warning'"
        :bordered="false"
        >{{ issueLabels[issue] }}</NTag
      >
    </div>
    <div class="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
      <section class="min-w-0">
        <h3 class="mb-3 font-medium">当前实例</h3>
        <p class="text-2xl font-semibold tabular-nums">
          {{ bytes(snapshot.instance.memory.rssBytes) }}
          <span class="text-sm font-normal text-stone-500 dark:text-zinc-400">RSS</span>
        </p>
        <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">
          Heap 已用 {{ bytes(snapshot.instance.memory.heapUsedBytes) }}
        </p>
        <p class="mt-2 text-sm tabular-nums">已运行 {{ uptime }}</p>
      </section>
      <section class="min-w-0">
        <div class="mb-3 flex items-center gap-2">
          <h3 class="font-medium">数据库</h3>
          <NTag
            :type="snapshot.database.status === 'healthy' ? 'success' : 'error'"
            :bordered="false"
            size="small"
            >{{ snapshot.database.status === 'healthy' ? '正常' : '不可用' }}</NTag
          >
        </div>
        <p class="text-2xl font-semibold tabular-nums">
          {{ formatHealthLatency(snapshot.database.latencyMs) }}
        </p>
        <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">测试查询耗时</p>
      </section>
      <section class="min-w-0">
        <div class="mb-3 flex items-center gap-2">
          <h3 class="font-medium">附件存储</h3>
          <NTag
            :type="snapshot.storage.status === 'healthy' ? 'success' : 'warning'"
            :bordered="false"
            size="small"
            >{{ snapshot.storage.status === 'healthy' ? '正常' : '不可用' }}</NTag
          >
        </div>
        <p class="text-2xl font-semibold tabular-nums">
          {{ formatHealthLatency(snapshot.storage.latencyMs) }}
        </p>
        <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">文件读写检查耗时</p>
      </section>
      <section class="min-w-0">
        <div class="mb-3 flex items-center gap-2">
          <h3 class="font-medium">任务调度</h3>
          <NTag :type="schedulerHasIssue ? 'warning' : 'success'" :bordered="false" size="small">{{
            snapshot.scheduler.runtimeStatus === 'running' ? '运行中' : '已停止'
          }}</NTag>
        </div>
        <dl class="grid grid-cols-2 gap-3">
          <div>
            <dt class="text-sm text-stone-500 dark:text-zinc-400">运行中（共享）</dt>
            <dd class="mt-1 text-2xl font-semibold tabular-nums">
              {{ snapshot.scheduler.shared.runningCount ?? '不可用' }}
            </dd>
          </div>
          <div>
            <dt class="text-sm text-stone-500 dark:text-zinc-400" :title="overdueHint">
              延迟启动（共享）
            </dt>
            <dd class="mt-1 text-2xl font-semibold tabular-nums">
              {{ snapshot.scheduler.shared.overdueCount ?? '不可用' }}
            </dd>
          </div>
        </dl>
        <p class="mt-2 text-sm text-stone-500 dark:text-zinc-400">
          自动执行 {{ snapshot.scheduler.automaticRunning }} 个，上限
          {{ snapshot.scheduler.automaticCapacity }} 个
        </p>
      </section>
    </div>
    <section v-if="detailsVisible" id="system-health-diagnostics">
      <NDivider />
      <div class="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section>
          <h3 class="mb-3 font-medium">运行环境</h3>
          <NDescriptions :column="1" label-placement="left">
            <NDescriptionsItem label="启动时间">{{
              formatHealthTime(snapshot.instance.startedAt)
            }}</NDescriptionsItem>
            <NDescriptionsItem label="Node / 平台 / 架构">
              {{ snapshot.instance.nodeVersion }} / {{ snapshot.instance.platform }} /
              {{ snapshot.instance.arch }}
            </NDescriptionsItem>
            <NDescriptionsItem label="Heap 总量">{{
              bytes(snapshot.instance.memory.heapTotalBytes)
            }}</NDescriptionsItem>
            <NDescriptionsItem label="外部内存">{{
              bytes(snapshot.instance.memory.externalBytes)
            }}</NDescriptionsItem>
          </NDescriptions>
        </section>
        <section>
          <h3 class="mb-3 font-medium">数据库与存储检查</h3>
          <NDescriptions :column="1" label-placement="left">
            <NDescriptionsItem label="数据库检查时间">{{
              formatHealthTime(snapshot.database.checkedAt)
            }}</NDescriptionsItem>
            <NDescriptionsItem label="存储检查时间">{{
              formatHealthTime(snapshot.storage.checkedAt)
            }}</NDescriptionsItem>
            <NDescriptionsItem label="存储类型">{{ snapshot.storage.provider }}</NDescriptionsItem>
            <NDescriptionsItem label="存储结果来源">{{
              snapshot.storage.cached ? '最近 30 秒内的检查' : '本次检查'
            }}</NDescriptionsItem>
          </NDescriptions>
        </section>
        <section>
          <h3 class="mb-3 font-medium">任务启动与恢复</h3>
          <NDescriptions :column="1" label-placement="left">
            <NDescriptionsItem label="手动启动处理中">
              {{ snapshot.scheduler.manualStarting }} 个请求
            </NDescriptionsItem>
            <NDescriptionsItem label="重启后待恢复任务">
              {{ snapshot.scheduler.recoveryQueued }} 个
            </NDescriptionsItem>
            <NDescriptionsItem label="最近调度检查">
              {{
                snapshot.scheduler.lastPollStatus === null
                  ? '尚未完成首次检查'
                  : `${formatHealthTime(snapshot.scheduler.lastPollAt)} · ${snapshot.scheduler.lastPollStatus === 'success' ? '成功' : '失败'}`
              }}
            </NDescriptionsItem>
            <NDescriptionsItem label="下次调度检查">
              {{
                snapshot.scheduler.nextWakeAt === null
                  ? '尚未安排'
                  : formatHealthTime(snapshot.scheduler.nextWakeAt)
              }}
              <span v-if="snapshot.scheduler.retryPending"> · 重试</span>
            </NDescriptionsItem>
          </NDescriptions>
        </section>
      </div>
    </section>
  </NCard>
</template>
