import { addAPIProvider } from '@iconify/vue'

addAPIProvider('', {
  resources: [window.location.origin],
  path: '/api/icons/',
})
