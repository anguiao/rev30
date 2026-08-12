import { defineConfig } from 'eslint/config'
import tseslint from 'typescript-eslint'
import vueParser from 'vue-eslint-parser'

export default defineConfig(
  {
    name: 'rev30/vue-deprecated/ignores',
    ignores: ['**/*.{js,mjs,cjs}', '**/coverage/**', '**/dist/**'],
  },
  {
    name: 'rev30/vue-deprecated',
    files: ['{apps,packages,playgrounds}/**/*.vue'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parser: vueParser,
      parserOptions: {
        parser: tseslint.parser,
        projectService: true,
        extraFileExtensions: ['.vue'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@typescript-eslint/no-deprecated': 'error',
    },
  },
)
