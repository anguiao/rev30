<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NDescriptions, NDescriptionsItem, NTag } from 'naive-ui'
import bytes from 'bytes'
import type { SystemHealthSnapshot, SystemHealthIssue } from '@rev30/contracts'
import { formatHealthLatency, formatHealthTime } from './format'

const props = defineProps<{ snapshot: SystemHealthSnapshot }>()
const issueLabels: Record<SystemHealthIssue, string> = {
  database_unavailable: '数据库不可用',
  storage_unavailable: '附件存储不可用',
  scheduler_stopped: '调度器已停止',
  scheduler_query_retry: '调度查询退避',
  scheduler_overdue: '任务明显积压',
}
const summaries = computed(() => [
  {
    label: '实例运行时间',
    value: `${Math.floor(props.snapshot.instance.uptimeSeconds / 86400)} 天 ${Math.floor((props.snapshot.instance.uptimeSeconds % 86400) / 3600)} 小时 ${Math.floor((props.snapshot.instance.uptimeSeconds % 3600) / 60)} 分 ${props.snapshot.instance.uptimeSeconds % 60} 秒`,
  },
  {
    label: 'RSS / Heap 已用',
    value: `${bytes(props.snapshot.instance.memory.rssBytes)} / ${bytes(props.snapshot.instance.memory.heapUsedBytes)}`,
  },
  { label: '数据库延迟', value: formatHealthLatency(props.snapshot.database.latencyMs) },
  {
    label: '附件存储',
    value:
      props.snapshot.storage.status === 'healthy'
        ? formatHealthLatency(props.snapshot.storage.latencyMs)
        : '不可用',
  },
  { label: '运行中任务（共享）', value: props.snapshot.scheduler.shared.runningCount ?? '不可用' },
  { label: '明显积压（共享）', value: props.snapshot.scheduler.shared.overdueCount ?? '不可用' },
])
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-wrap gap-2">
      <NTag v-for="issue in snapshot.issues" :key="issue" type="warning">{{
        issueLabels[issue]
      }}</NTag>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <NCard v-for="item in summaries" :key="item.label" :title="item.label" size="small">
        <div class="text-lg font-semibold">{{ item.value }}</div>
      </NCard>
    </div>
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <NCard title="数据库" size="small">
        <NDescriptions :column="1" label-placement="left">
          <NDescriptionsItem label="状态">{{
            snapshot.database.status === 'healthy' ? '正常' : '不可用'
          }}</NDescriptionsItem>
          <NDescriptionsItem label="轻量查询耗时">{{
            formatHealthLatency(snapshot.database.latencyMs)
          }}</NDescriptionsItem>
          <NDescriptionsItem label="探测时间">{{
            formatHealthTime(snapshot.database.checkedAt)
          }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>
      <NCard title="附件存储" size="small">
        <NDescriptions :column="1" label-placement="left">
          <NDescriptionsItem label="状态">{{
            snapshot.storage.status === 'healthy' ? '正常' : '不可用'
          }}</NDescriptionsItem>
          <NDescriptionsItem label="Provider">{{ snapshot.storage.provider }}</NDescriptionsItem>
          <NDescriptionsItem label="读写清理耗时">{{
            formatHealthLatency(snapshot.storage.latencyMs)
          }}</NDescriptionsItem>
          <NDescriptionsItem label="探测时间">{{
            formatHealthTime(snapshot.storage.checkedAt)
          }}</NDescriptionsItem>
          <NDescriptionsItem label="缓存">{{
            snapshot.storage.cached ? '复用 30 秒内结果' : '本次实际探测'
          }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>
      <NCard title="调度器（当前响应实例）" size="small">
        <NDescriptions :column="1" label-placement="left">
          <NDescriptionsItem label="状态">{{
            snapshot.scheduler.runtimeStatus === 'running' ? '运行中' : '已停止'
          }}</NDescriptionsItem>
          <NDescriptionsItem label="自动槽"
            >{{ snapshot.scheduler.automaticRunning }} /
            {{ snapshot.scheduler.automaticCapacity }}</NDescriptionsItem
          >
          <NDescriptionsItem label="手动认领 / 恢复排队"
            >{{ snapshot.scheduler.manualStarting }} /
            {{ snapshot.scheduler.recoveryQueued }}</NDescriptionsItem
          >
          <NDescriptionsItem label="查询退避">{{
            snapshot.scheduler.retryPending ? '是' : '否'
          }}</NDescriptionsItem>
          <NDescriptionsItem label="最近轮询"
            >{{ formatHealthTime(snapshot.scheduler.lastPollAt) }} ·
            {{
              snapshot.scheduler.lastPollStatus === null
                ? '尚未完成'
                : snapshot.scheduler.lastPollStatus === 'success'
                  ? '成功'
                  : '失败'
            }}</NDescriptionsItem
          >
          <NDescriptionsItem label="下次唤醒">{{
            formatHealthTime(snapshot.scheduler.nextWakeAt)
          }}</NDescriptionsItem>
        </NDescriptions>
      </NCard>
    </div>
    <NCard title="实例详情与数据库共享状态" size="small">
      <NDescriptions :column="2" label-placement="left" responsive>
        <NDescriptionsItem label="实例启动时间">{{
          formatHealthTime(snapshot.instance.startedAt)
        }}</NDescriptionsItem>
        <NDescriptionsItem label="Node / 平台 / 架构"
          >{{ snapshot.instance.nodeVersion }} / {{ snapshot.instance.platform }} /
          {{ snapshot.instance.arch }}</NDescriptionsItem
        >
        <NDescriptionsItem label="Heap 总量 / 外部内存"
          >{{ bytes(snapshot.instance.memory.heapTotalBytes) }} /
          {{ bytes(snapshot.instance.memory.externalBytes) }}</NDescriptionsItem
        >
        <NDescriptionsItem label="最早积压计划">{{
          formatHealthTime(snapshot.scheduler.shared.oldestOverdueAt)
        }}</NDescriptionsItem>
      </NDescriptions>
      <p class="mt-3 text-sm text-stone-500 dark:text-zinc-400">
        实例指标仅属于当前响应实例；运行中任务与明显积压来自数据库共享状态。启用任务超过计划时刻 60
        秒视为明显积压。
      </p>
    </NCard>
  </section>
</template>
