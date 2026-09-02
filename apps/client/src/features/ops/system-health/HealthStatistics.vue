<script setup lang="ts">
import { computed } from 'vue'
import type { EChartsCoreOption } from 'echarts/core'
import type { TooltipComponentOption } from 'echarts/components'
import type { SystemHealthJobStatistics } from '@rev30/contracts'
import { scheduledJobErrorCategoryLabels, scheduledJobRunStatusLabels } from '../labels'
import HealthChart from './HealthChart.vue'

const props = defineProps<{ statistics: SystemHealthJobStatistics }>()
const statuses = ['running', 'success', 'failure', 'skipped', 'cancelled', 'interrupted'] as const
const charts = computed(() => {
  const stats = props.statistics
  const statusData = statuses.map((status) => ({
    name: scheduledJobRunStatusLabels[status],
    value: stats.statusDistribution[status],
  }))
  const failureData = stats.failureCategories.map((item) => ({
    name: scheduledJobErrorCategoryLabels[item.category],
    value: item.count,
  }))
  const dailyTotals = statuses.map((status) => ({
    name: scheduledJobRunStatusLabels[status],
    value: stats.dailyRuns.reduce((total, day) => total + day[status], 0),
  }))
  function summary(data: Array<{ name: string; value: number }>) {
    return data.map((item) => `${item.name} ${item.value} 次`).join('；')
  }
  function donut(data: Array<{ name: string; value: number }>): EChartsCoreOption {
    return {
      tooltip: {
        trigger: 'item',
        valueFormatter: (
          value: Parameters<NonNullable<TooltipComponentOption['valueFormatter']>>[0],
        ) => `${value} 次`,
      },
      legend: { bottom: 0 },
      series: [
        {
          type: 'pie',
          radius: ['38%', '62%'],
          center: ['50%', '42%'],
          label: { show: false },
          data,
        },
      ],
    }
  }
  return [
    {
      title: '近 7 日任务运行结果',
      summary: summary(dailyTotals),
      empty: dailyTotals.every((item) => item.value === 0),
      option: {
        tooltip: { trigger: 'axis' },
        legend: { bottom: 0 },
        grid: { left: 45, right: 16, top: 20, bottom: 70 },
        xAxis: { type: 'category', data: stats.dailyRuns.map((day) => day.date.slice(5)) },
        yAxis: { type: 'value', name: '次', minInterval: 1 },
        series: statuses.map((status) => ({
          type: 'bar',
          stack: 'runs',
          name: scheduledJobRunStatusLabels[status],
          data: stats.dailyRuns.map((day) => day[status]),
        })),
      } as EChartsCoreOption,
    },
    {
      title: '近 30 日状态分布',
      summary: summary(statusData),
      empty: statusData.every((item) => item.value === 0),
      option: donut(statusData),
    },
    {
      title: '近 30 日失败分类',
      summary: summary(failureData),
      empty: failureData.every((item) => item.value === 0),
      option: donut(failureData),
    },
    {
      title: '成功任务平均耗时 Top 5（近 30 日）',
      summary:
        stats.averageDurations.length === 0
          ? '无成功任务耗时样本'
          : stats.averageDurations
              .map(
                (item) => `${item.taskName}：${item.averageDurationMs} ms（${item.runCount} 次）`,
              )
              .join('；'),
      empty: stats.averageDurations.length === 0,
      option: {
        tooltip: {
          trigger: 'axis',
          valueFormatter: (
            value: Parameters<NonNullable<TooltipComponentOption['valueFormatter']>>[0],
          ) => `${value} ms`,
        },
        legend: { bottom: 0 },
        grid: { left: 130, right: 24, top: 20, bottom: 65 },
        xAxis: { type: 'value', name: 'ms' },
        yAxis: {
          type: 'category',
          inverse: true,
          data: stats.averageDurations.map((item) => item.taskName),
        },
        series: [
          {
            name: '成功平均耗时',
            type: 'bar',
            data: stats.averageDurations.map((item) => item.averageDurationMs),
          },
        ],
      } as EChartsCoreOption,
    },
  ]
})
</script>

<template>
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-2">
    <HealthChart v-for="chart in charts" :key="chart.title" v-bind="chart" />
  </div>
</template>
