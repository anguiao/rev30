<script setup lang="ts">
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'
import type { EChartsCoreOption } from 'echarts/core'
import type { TooltipComponentOption } from 'echarts/components'
import type { ScheduledJobRunStatus, SystemHealthJobStatistics } from '@rev30/contracts'
import { scheduledJobErrorCategoryLabels, scheduledJobRunStatusLabels } from '../labels'
import HealthChart from './HealthChart.vue'

const props = defineProps<{ statistics: SystemHealthJobStatistics }>()
const vars = useThemeVars()
const statuses = ['running', 'success', 'failure', 'skipped', 'cancelled', 'interrupted'] as const
const charts = computed(() => {
  const stats = props.statistics
  const statusColors = {
    running: vars.value.infoColor,
    success: vars.value.successColor,
    failure: vars.value.errorColor,
    skipped: vars.value.warningColor,
    cancelled: vars.value.textColor3,
    interrupted: vars.value.errorColorSuppl,
  } satisfies Record<ScheduledJobRunStatus, string>
  const legend = {
    bottom: 0,
    type: 'scroll',
    icon: 'circle',
    itemWidth: 8,
    itemHeight: 8,
    itemGap: 16,
    textStyle: { color: vars.value.textColor2 },
  } as const
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
    return data
      .filter((item) => item.value > 0)
      .map((item) => `${item.name} ${item.value} 次`)
      .join('；')
  }
  function donut(data: Array<{ name: string; value: number }>, color: string[]): EChartsCoreOption {
    return {
      color,
      title: {
        text: data.reduce((total, item) => total + item.value, 0).toLocaleString('zh-CN'),
        subtext: '总次数',
        left: 'center',
        top: '32%',
        itemGap: 6,
        textStyle: { color: vars.value.textColor1, fontSize: 28, fontWeight: 600 },
        subtextStyle: { color: vars.value.textColor3, fontSize: 12 },
      },
      tooltip: {
        trigger: 'item',
        valueFormatter: (
          value: Parameters<NonNullable<TooltipComponentOption['valueFormatter']>>[0],
        ) => `${value} 次`,
      },
      legend,
      series: [
        {
          type: 'pie',
          radius: ['48%', '68%'],
          center: ['50%', '43%'],
          label: { show: false },
          data,
        },
      ],
    }
  }
  return [
    {
      key: 'daily',
      title: '近 7 日任务运行结果',
      summary: summary(dailyTotals),
      empty: dailyTotals.every((item) => item.value === 0),
      emptyText: '近 7 日留存日志中无任务记录',
      option: {
        tooltip: { trigger: 'axis' },
        legend,
        grid: { left: 45, right: 16, top: 24, bottom: 56 },
        xAxis: { type: 'category', data: stats.dailyRuns.map((day) => day.date.slice(5)) },
        yAxis: {
          type: 'value',
          name: '次',
          minInterval: 1,
          splitLine: { lineStyle: { color: vars.value.dividerColor } },
        },
        series: statuses.map((status) => ({
          type: 'bar',
          stack: 'runs',
          barMaxWidth: 32,
          name: scheduledJobRunStatusLabels[status],
          itemStyle: { color: statusColors[status] },
          data: stats.dailyRuns.map((day) => day[status]),
        })),
      } as EChartsCoreOption,
    },
    {
      key: 'status',
      title: '近 30 日状态分布',
      summary: summary(statusData),
      empty: statusData.every((item) => item.value === 0),
      emptyText: '近 30 日留存日志中无任务记录',
      option: donut(
        statusData,
        statuses.map((status) => statusColors[status]),
      ),
    },
    {
      key: 'failure',
      title: '近 30 日失败分类',
      summary: summary(failureData),
      empty: failureData.every((item) => item.value === 0),
      emptyText: '近 30 日留存日志中无失败任务',
      option: donut(failureData, [
        vars.value.warningColor,
        vars.value.infoColor,
        vars.value.primaryColor,
        vars.value.errorColor,
      ]),
    },
    {
      key: 'durations',
      title: '成功任务平均耗时 Top 5（近 30 日）',
      summary: stats.averageDurations
        .map((item) => `${item.taskName}：${item.averageDurationMs} ms（${item.runCount} 次成功）`)
        .join('；'),
      hideSummary: true,
      empty: stats.averageDurations.length === 0,
      emptyText: '近 30 日留存日志中无成功任务耗时样本',
      option: {
        tooltip: {
          trigger: 'axis',
          valueFormatter: (
            value: Parameters<NonNullable<TooltipComponentOption['valueFormatter']>>[0],
          ) => `${value} ms`,
        },
        grid: { left: 0, right: 0, top: 12, bottom: 12, containLabel: true },
        xAxis: { type: 'value', show: false },
        yAxis: [
          {
            type: 'category',
            inverse: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: {
              color: vars.value.textColor2,
              margin: 12,
              width: 132,
              overflow: 'truncate',
            },
            data: stats.averageDurations.map((item) => item.taskName),
          },
          {
            type: 'category',
            position: 'right',
            inverse: true,
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: vars.value.textColor2, margin: 12 },
            data: stats.averageDurations.map(
              (item) => `${item.averageDurationMs} ms · ${item.runCount} 次成功`,
            ),
          },
        ],
        series: [
          {
            name: '平均耗时',
            type: 'bar',
            barMaxWidth: 16,
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
    <HealthChart v-for="{ key, ...chart } in charts" :key="key" v-bind="chart" />
  </div>
</template>
