import { ref, watchEffect, type DirectiveBinding, type ObjectDirective, type Ref } from 'vue'
import { useAuthStore } from '../stores/auth'

type CanValue = string | string[]
type CanModifier = 'all' | 'any'
type CanBinding = DirectiveBinding<CanValue, CanModifier>
type DirectiveState = {
  anchor: Comment
  stop: ReturnType<typeof watchEffect>
  value: Ref<CanValue>
  modifiers: Ref<CanBinding['modifiers']>
}

const directiveStateMap = new WeakMap<HTMLElement, DirectiveState>()

function hasPermission(value: CanValue, modifiers: CanBinding['modifiers']) {
  const auth = useAuthStore()

  if (typeof value === 'string') {
    return auth.can(value)
  }

  if (value.length === 0) {
    return false
  }

  return modifiers.any ? auth.canAny(value) : auth.canAll(value)
}

function syncElement(el: HTMLElement, anchor: Comment, allowed: boolean) {
  if (!allowed) {
    el.remove()
    return
  }

  const parentNode = anchor.parentNode

  if (parentNode === null || el.previousSibling === anchor) {
    return
  }

  parentNode.insertBefore(el, anchor.nextSibling)
}

function createDirectiveState(el: HTMLElement, { value, modifiers }: CanBinding) {
  const anchor = document.createComment('v-can')
  const valueRef = ref(value)
  const modifiersRef = ref(modifiers)

  el.parentNode?.insertBefore(anchor, el)

  const state: DirectiveState = {
    anchor,
    stop: watchEffect(() => {
      syncElement(el, anchor, hasPermission(valueRef.value, modifiersRef.value))
    }),
    value: valueRef,
    modifiers: modifiersRef,
  }

  directiveStateMap.set(el, state)
}

function updateDirectiveState(el: HTMLElement, { value, modifiers }: CanBinding) {
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

  state.stop()
  state.anchor.remove()
  directiveStateMap.delete(el)
}

export const canDirective: ObjectDirective<HTMLElement, CanValue, CanModifier> = {
  mounted: createDirectiveState,
  updated: updateDirectiveState,
  unmounted: disposeDirectiveState,
}
