import { defineAsyncComponent, readonly, ref, type Component } from 'vue'

type DrawerModule<T extends Component> = {
  default: T
}

export function useDrawer<T extends Component>(loader: () => Promise<DrawerModule<T>>) {
  const component = defineAsyncComponent(async () => (await loader()).default)
  const hasOpened = ref(false)
  const visible = ref(false)

  function open() {
    hasOpened.value = true
    visible.value = true
  }

  function close() {
    visible.value = false
  }

  return {
    component,
    hasOpened: readonly(hasOpened),
    visible,
    open,
    close,
  }
}
