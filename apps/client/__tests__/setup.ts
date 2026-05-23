import { afterEach } from 'vitest'
import { disposeActiveTestPinia } from './helpers/pinia'

afterEach(() => {
  disposeActiveTestPinia()
  Reflect.deleteProperty(navigator, 'clipboard')
  document.body.innerHTML = ''
})
