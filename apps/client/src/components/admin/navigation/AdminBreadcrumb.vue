<script setup lang="ts">
import type { ResourceTreeNode } from '@rev30/shared'
import { computed } from 'vue'
import { NBreadcrumb, NBreadcrumbItem } from 'naive-ui'
import { RouterLink, useRoute } from 'vue-router'
import { findMenuMatch } from '../../../utils/menu'

const props = defineProps<{
  menus: ResourceTreeNode[]
}>()

const route = useRoute()

const menuMatch = computed(() => findMenuMatch(props.menus, route.path))
const breadcrumbItems = computed(() => menuMatch.value?.breadcrumbItems ?? [])
</script>

<template>
  <NBreadcrumb v-if="breadcrumbItems.length > 0" data-test="admin-breadcrumb" separator="/">
    <NBreadcrumbItem
      v-for="(item, index) in breadcrumbItems"
      :key="item.key"
      :clickable="item.path !== null && index < breadcrumbItems.length - 1"
      :show-separator="index < breadcrumbItems.length - 1"
    >
      <RouterLink v-if="item.path !== null && index < breadcrumbItems.length - 1" :to="item.path">
        {{ item.name }}
      </RouterLink>
      <span v-else>{{ item.name }}</span>
    </NBreadcrumbItem>
  </NBreadcrumb>
</template>
