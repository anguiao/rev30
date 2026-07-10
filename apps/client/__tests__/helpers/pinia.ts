import { createPinia, disposePinia, setActivePinia, type Pinia } from 'pinia'

const activeTestPiniaInstances = new Set<Pinia>()

export function createTestPinia() {
  const pinia = createPinia()
  activeTestPiniaInstances.add(pinia)
  setActivePinia(pinia)

  return pinia
}

export function disposeActiveTestPinia() {
  activeTestPiniaInstances.forEach(disposePinia)
  activeTestPiniaInstances.clear()
}
