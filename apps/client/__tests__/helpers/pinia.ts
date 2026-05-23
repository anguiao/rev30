import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'

let activeTestPinia: Pinia | undefined

export function createTestPinia() {
  activeTestPinia = createPinia()
  setActivePinia(activeTestPinia)

  return activeTestPinia
}

export function disposeActiveTestPinia() {
  if (activeTestPinia === undefined) {
    return
  }

  disposePinia(activeTestPinia)
  activeTestPinia = undefined
}
