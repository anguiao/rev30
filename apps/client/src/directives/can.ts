import type { ObjectDirective } from 'vue'
import { useAuthStore } from '../stores/auth'

type CanValue = string | string[]
type CanModifiers = Partial<Record<string, boolean>>

function normalizeCodes(value: CanValue) {
  return typeof value === 'string' ? [value] : value
}

function hasPermission(value: CanValue, modifiers: CanModifiers) {
  const auth = useAuthStore()

  if (typeof value === 'string') {
    return auth.can(value)
  }

  return modifiers.any ? auth.canAny(value) : auth.canAll(value)
}

function removeIfUnauthorized(el: HTMLElement, value: CanValue, modifiers: CanModifiers) {
  if (normalizeCodes(value).length > 0 && hasPermission(value, modifiers)) {
    return
  }

  el.remove()
}

export const can: ObjectDirective<HTMLElement, CanValue> = {
  mounted(el, binding) {
    removeIfUnauthorized(el, binding.value, binding.modifiers)
  },
  updated(el, binding) {
    removeIfUnauthorized(el, binding.value, binding.modifiers)
  },
}
