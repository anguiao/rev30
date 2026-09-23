<script setup lang="ts">
import { KeepAlive, ref } from 'vue'
import { NTab, NTabs } from 'naive-ui'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import IconBrowser from '../../../features/icons/browser/IconBrowser.vue'

type IconSetsTab = 'builtin' | 'custom'

const pageTitle = useAdminPageTitle('图标库')
const activeTab = ref<IconSetsTab>('builtin')
</script>

<template>
  <main>
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
    </header>

    <NTabs v-model:value="activeTab" type="line" class="mb-3">
      <NTab name="builtin" data-test="icon-sets-tab-builtin">内置图标</NTab>
      <NTab name="custom" data-test="icon-sets-tab-custom">自定义图标</NTab>
    </NTabs>

    <KeepAlive>
      <IconBrowser :key="activeTab" :source="activeTab" />
    </KeepAlive>
  </main>
</template>
