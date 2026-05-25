<script setup lang="ts">
import { NDrawer, NDrawerContent, NEmpty, NSpin, NTag } from 'naive-ui'
import type { AnnouncementMyDetail } from '@rev30/contracts'
import { announcementTypeLabels, formatDateTime } from '.'

defineProps<{
  detail: AnnouncementMyDetail | null
  loading?: boolean
}>()

const show = defineModel<boolean>('show', { required: true })
</script>

<template>
  <NDrawer
    v-model:show="show"
    data-test="announcement-detail-drawer"
    placement="right"
    :width="560"
  >
    <NDrawerContent title="通知公告" closable>
      <NSpin :show="loading === true">
        <div v-if="detail" class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <NTag :bordered="false">
              {{ announcementTypeLabels[detail.type] }}
            </NTag>
            <NTag v-if="detail.pinned" type="warning" :bordered="false">置顶</NTag>
          </div>

          <div class="space-y-2">
            <h2 class="text-xl font-semibold text-stone-900 dark:text-zinc-100">
              {{ detail.title }}
            </h2>
            <p class="text-sm text-stone-500 dark:text-zinc-400">
              {{ formatDateTime(detail.publishedAt) }}
            </p>
          </div>

          <p
            v-if="detail.summary"
            class="rounded-ui bg-stone-50 px-4 py-3 text-sm leading-6 text-stone-600 dark:bg-zinc-900 dark:text-zinc-300"
          >
            {{ detail.summary }}
          </p>

          <article
            data-test="announcement-detail-content"
            class="prose prose-sm max-w-none leading-6 dark:prose-invert"
            v-html="detail.contentHtml"
          />
        </div>

        <NEmpty v-else-if="loading !== true" description="暂无详情" />
      </NSpin>
    </NDrawerContent>
  </NDrawer>
</template>
