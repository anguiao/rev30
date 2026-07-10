import { mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

const nodeTestFiles = [
  '__tests__/api.test.ts',
  '__tests__/features/{attachments,auth,content,system}/requests.test.ts',
  '__tests__/router/{guards,redirect}.test.ts',
  '__tests__/stores/auth.test.ts',
  '__tests__/utils/{error,menu,request,ui}.test.ts',
]

export default mergeConfig(viteConfig, {
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: nodeTestFiles,
          setupFiles: ['./__tests__/setup.node.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'happy-dom',
          exclude: nodeTestFiles,
          include: ['__tests__/**/*.test.ts'],
          sequence: {
            hooks: 'list',
          },
          setupFiles: ['./__tests__/setup.ts'],
        },
      },
    ],
    unstubGlobals: true,
  },
})
