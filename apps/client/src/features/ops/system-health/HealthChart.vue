<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NEmpty, useThemeVars } from 'naive-ui'
import { use } from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  AriaComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import { useThemeStore } from '../../../stores/theme'

use([
  BarChart,
  LineChart,
  PieChart,
  AriaComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  CanvasRenderer,
])
const props = defineProps<{
  title: string
  option: EChartsCoreOption
  summary: string
  empty: boolean
  emptyText?: string
  compact?: boolean
  hideSummary?: boolean
}>()
const theme = useThemeStore()
const vars = useThemeVars()
const option = computed<EChartsCoreOption>(() => ({
  color: [
    vars.value.primaryColor,
    vars.value.infoColor,
    vars.value.warningColor,
    vars.value.errorColor,
  ],
  textStyle: { fontFamily: vars.value.fontFamily, color: vars.value.textColor2 },
  ...props.option,
  backgroundColor: 'transparent',
  aria: {
    enabled: true,
    label: { description: `${props.title}。${props.summary}` },
    decal: { show: false },
  },
}))
</script>

<template>
  <NCard :title="title" size="small" class="min-w-0">
    <div class="w-full" :class="compact ? 'h-52' : 'h-64'">
      <div v-if="empty" class="flex h-full items-center justify-center">
        <NEmpty :description="emptyText ?? '暂无统计数据'" />
      </div>
      <VChart v-else :option="option" :theme="theme.isDark ? 'dark' : 'default'" autoresize />
    </div>
    <p v-if="!empty && !hideSummary" class="mt-3 text-sm text-stone-500 dark:text-zinc-400">
      {{ summary }}
    </p>
  </NCard>
</template>
