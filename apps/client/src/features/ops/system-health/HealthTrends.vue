<script setup lang="ts">
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'
import bytes from 'bytes'
import type { EChartsCoreOption } from 'echarts/core'
import type { TooltipComponentOption } from 'echarts/components'
import HealthChart from './HealthChart.vue'
import { healthTrendData, type HealthHistory } from './history'
import { formatHealthTime } from './format'

const props = defineProps<{ history: HealthHistory }>()
const vars = useThemeVars()
const charts = computed(() => {
  const latestAt = props.history.latestAt
  const axisEnd =
    latestAt === null ? null : Math.max(latestAt, props.history.storage.at(-1)?.at ?? latestAt)
  const definitions = [
    {
      title: 'RSS 内存',
      name: 'RSS',
      data: healthTrendData(props.history.samples, 'rssBytes'),
      unit: 'bytes',
    },
    {
      title: '数据库延迟',
      name: '数据库延迟',
      data: healthTrendData(props.history.samples, 'databaseMs'),
      unit: 'ms',
    },
    {
      title: '附件存储延迟',
      name: '附件存储延迟',
      data: healthTrendData(props.history.storage, 'latencyMs'),
      unit: 'ms',
    },
  ]
  return definitions.map((item) => {
    const axisScale = item.unit === 'bytes' ? 1024 ** 2 : 1
    const available = item.data.filter((point): point is [number, number] => point[1] !== null)
    const latest = item.data.at(-1)
    const format = (value: number) => (item.unit === 'bytes' ? bytes(value)! : `${value} ms`)
    const summary =
      latest === undefined
        ? '尚无采样'
        : `最新：${latest[1] === null ? '不可用' : format(latest[1])}（${formatHealthTime(latest[0]).split(' ')[1]}） · ${available.length} 个有效样本`
    return {
      title: item.title,
      summary,
      empty: item.data.length === 0,
      emptyText: '尚无趋势样本',
      option: {
        tooltip: {
          trigger: 'axis',
          valueFormatter: (
            value: Parameters<NonNullable<TooltipComponentOption['valueFormatter']>>[0],
          ) => (typeof value === 'number' ? format(value * axisScale) : '不可用'),
        },
        grid: { left: 65, right: 20, top: 26, bottom: 28 },
        xAxis: {
          type: 'time',
          min: axisEnd === null ? undefined : axisEnd - 600_000,
          max: axisEnd ?? undefined,
          splitNumber: 3,
          axisLabel: {
            color: vars.value.textColor3,
            hideOverlap: true,
            formatter: (value: number) => formatHealthTime(value).split(' ')[1],
          },
        },
        yAxis: {
          type: 'value',
          name: item.unit === 'bytes' ? 'MB' : 'ms',
          minInterval: 1,
          splitLine: { lineStyle: { color: vars.value.dividerColor } },
          axisLabel: {
            color: vars.value.textColor3,
          },
        },
        series: [
          {
            type: 'line',
            name: item.name,
            connectNulls: false,
            showSymbol: true,
            symbolSize: 4,
            data: item.data.map(([at, value]) => [at, value === null ? null : value / axisScale]),
          },
        ],
      } as EChartsCoreOption,
    }
  })
})
</script>

<template>
  <section class="space-y-4">
    <div>
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="text-lg font-semibold">短时趋势</h2>
        <p class="text-sm text-stone-500 dark:text-zinc-400">当前响应实例 · 最近 10 分钟</p>
      </div>
      <p class="mt-1 text-sm text-stone-500 dark:text-zinc-400">
        浏览器仅保存页面可见期间的样本；不可用、隐藏或请求失败的空档显示断点。刷新、离开页面或实例重启后清空。
      </p>
    </div>
    <div class="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <HealthChart v-for="chart in charts" :key="chart.title" v-bind="chart" compact />
    </div>
  </section>
</template>
