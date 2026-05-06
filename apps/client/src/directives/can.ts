import {
  effectScope,
  ref,
  watchEffect,
  type EffectScope,
  type ObjectDirective,
  type Ref,
} from 'vue'
import { useAuthStore } from '../stores/auth'

type CanValue = string | string[]
type CanModifiers = Partial<Record<string, boolean>>
type CanDirectiveState = {
  anchor: Comment
  scope: EffectScope
  value: Ref<CanValue>
  modifiers: Ref<CanModifiers>
}

const directiveStateMap = new WeakMap<HTMLElement, CanDirectiveState>()

function normalizeCodes(value: CanValue) {
  return typeof value === 'string' ? [value] : value
}

function hasPermission(value: CanValue, modifiers: CanModifiers) {
  const auth = useAuthStore()
  const codes = normalizeCodes(value)

  if (codes.length === 0) {
    return false
  }

  if (typeof value === 'string') {
    return auth.can(value)
  }

  return modifiers.any ? auth.canAny(value) : auth.canAll(value)
}

function syncElement(el: HTMLElement, anchor: Comment, value: CanValue, modifiers: CanModifiers) {
  if (!hasPermission(value, modifiers)) {
    el.remove()
    return
  }

  const parentNode = anchor.parentNode

  if (parentNode === null || el.parentNode === parentNode) {
    return
  }

  parentNode.insertBefore(el, anchor.nextSibling)
}

function createDirectiveState(el: HTMLElement, value: CanValue, modifiers: CanModifiers) {
  const anchor = document.createComment('v-can')
  el.parentNode?.insertBefore(anchor, el)

  const state: CanDirectiveState = {
    anchor,
    scope: effectScope(),
    value: ref(value),
    modifiers: ref(modifiers),
  }

  state.scope.run(() => {
    watchEffect(() => {
      syncElement(el, state.anchor, state.value.value, state.modifiers.value)
    })
  })

  directiveStateMap.set(el, state)
}

function updateDirectiveState(el: HTMLElement, value: CanValue, modifiers: CanModifiers) {
  const state = directiveStateMap.get(el)

  if (state === undefined) {
    return
  }

  state.value.value = value
  state.modifiers.value = modifiers
}

function disposeDirectiveState(el: HTMLElement) {
  const state = directiveStateMap.get(el)

  if (state === undefined) {
    return
  }

  state.scope.stop()
  state.anchor.remove()
  directiveStateMap.delete(el)
}

export const can: ObjectDirective<HTMLElement, CanValue> = {
  mounted(el, binding) {
    createDirectiveState(el, binding.value, binding.modifiers)
  },
  updated(el, binding) {
    updateDirectiveState(el, binding.value, binding.modifiers)
  },
  unmounted(el) {
    disposeDirectiveState(el)
  },
}
