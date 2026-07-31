import { PiniaColada } from '@pinia/colada'
import { createPinia } from 'pinia'
import { createApp } from 'vue'
import App from './App.vue'
import { canDirective } from './directives/can'
import './plugins/iconify'
import { createAppRouter } from './router'
import './style.css'

const app = createApp(App)
const pinia = createPinia()
const router = createAppRouter(pinia)

app.use(pinia)
app.use(PiniaColada)
app.use(router)
app.directive('can', canDirective)

app.mount('#app')
