<script setup lang="ts">
import { computed } from 'vue'
import { NCard, NEmpty, useThemeVars } from 'naive-ui'
import { use } from 'echarts/core'
import type { EChartsCoreOption } from 'echarts/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
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
  TooltipComponent,
  CanvasRenderer,
])
const props = defineProps<{
  title: string
  option: EChartsCoreOption
  summary: string
  empty: boolean
  emptyText?: string
}>()
const theme = useThemeStore()
const vars = useThemeVars()
const option = computed<EChartsCoreOption>(() => ({
  ...props.option,
  backgroundColor: 'transparent',
  color: [
    vars.value.infoColor,
    vars.value.successColor,
    vars.value.errorColor,
    vars.value.warningColor,
    vars.value.textColor3,
    vars.value.primaryColor,
  ],
  aria: {
    enabled: true,
    label: { description: `${props.title}。${props.summary}` },
    decal: { show: true },
  },
}))
</script>

<template>
  <NCard :title="title" size="small" class="min-w-0">
    <NEmpty v-if="empty" :description="emptyText ?? '暂无统计数据'" class="py-16" />
    <div v-else class="h-72 w-full">
      <VChart :option="option" :theme="theme.isDark ? 'dark' : 'default'" autoresize />
    </div>
    <p class="mt-3 text-sm text-stone-500 dark:text-zinc-400">{{ summary }}</p>
  </NCard>
</template>
