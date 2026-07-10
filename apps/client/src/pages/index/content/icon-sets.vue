<script setup lang="ts">
import { ref, type HTMLAttributes } from 'vue'
import { NTabPane, NTabs } from 'naive-ui'
import { useAdminPageTitle } from '../../../composables/useAdminPageTitle'
import BuiltinIconBrowser from '../../../features/content/BuiltinIconBrowser.vue'
import CustomIconBrowser from '../../../features/content/CustomIconBrowser.vue'

type IconSetsTab = 'builtin' | 'custom'

const pageTitle = useAdminPageTitle('图标库')
const activeTab = ref<IconSetsTab>('builtin')
const builtinTabProps = { 'data-test': 'icon-sets-tab-builtin' } as unknown as HTMLAttributes
const customTabProps = { 'data-test': 'icon-sets-tab-custom' } as unknown as HTMLAttributes
</script>

<template>
  <main>
    <header>
      <h1 class="text-xl font-semibold">{{ pageTitle }}</h1>
    </header>

    <NTabs v-model:value="activeTab" type="line" animated>
      <NTabPane
        name="builtin"
        tab="内置图标"
        display-directive="show:lazy"
        :tab-props="builtinTabProps"
      >
        <BuiltinIconBrowser :active="activeTab === 'builtin'" />
      </NTabPane>
      <NTabPane
        name="custom"
        tab="自定义图标"
        display-directive="show:lazy"
        :tab-props="customTabProps"
      >
        <CustomIconBrowser :active="activeTab === 'custom'" />
      </NTabPane>
    </NTabs>
  </main>
</template>
