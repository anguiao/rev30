#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const deprecatedDiagnosticCodes = new Set([6385, 6387])
const ignoredDirectories = new Set([
  '.git',
  '.pglite',
  '.worktrees',
  'coverage',
  'dist',
  'node_modules',
])

function isDeprecatedDiagnostic(diagnostic) {
  return deprecatedDiagnosticCodes.has(diagnostic.code)
}

function formatMessage(message) {
  return ts.flattenDiagnosticMessageText(message, ' ')
}

function collectTsconfigPaths(root) {
  const configPaths = []

  function visit(directory) {
    if (!fs.existsSync(directory)) {
      return
    }

    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name)

      if (entry.isDirectory()) {
        if (!ignoredDirectories.has(entry.name)) {
          visit(entryPath)
        }

        continue
      }

      if (entry.isFile() && /^tsconfig(?:\..*)?\.json$/.test(entry.name)) {
        configPaths.push(entryPath)
      }
    }
  }

  for (const workspaceDirectory of ['apps', 'packages']) {
    visit(path.join(root, workspaceDirectory))
  }

  return configPaths
}

function parseTsconfig(configPath) {
  const configFile = ts.readConfigFile(configPath, (fileName) => ts.sys.readFile(fileName))

  if (configFile.error) {
    throw new Error(formatMessage(configFile.error.messageText))
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(configPath),
  )

  if (parsedConfig.errors.length > 0) {
    throw new Error(parsedConfig.errors.map((error) => formatMessage(error.messageText)).join('\n'))
  }

  return parsedConfig
}

function createLanguageService(root, parsedConfig) {
  const snapshots = new Map()

  const host = {
    getCompilationSettings: () => parsedConfig.options,
    getCurrentDirectory: () => root,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getDirectories: (directoryName) => ts.sys.getDirectories(directoryName),
    getScriptFileNames: () => parsedConfig.fileNames,
    getScriptSnapshot: (fileName) => {
      if (!fs.existsSync(fileName)) {
        return undefined
      }

      if (!snapshots.has(fileName)) {
        snapshots.set(fileName, fs.readFileSync(fileName, 'utf8'))
      }

      return ts.ScriptSnapshot.fromString(snapshots.get(fileName))
    },
    getScriptVersion: () => '0',
    directoryExists: (directoryName) => ts.sys.directoryExists(directoryName),
    fileExists: (fileName) => ts.sys.fileExists(fileName),
    readDirectory: (...args) => ts.sys.readDirectory(...args),
    readFile: (fileName) => ts.sys.readFile(fileName),
    realpath: (fileName) => ts.sys.realpath(fileName),
  }

  return ts.createLanguageService(host, ts.createDocumentRegistry())
}

function formatDiagnostic(root, result) {
  const sourceFile = result.diagnostic.file
  const location = sourceFile?.getLineAndCharacterOfPosition(result.diagnostic.start ?? 0)
  const relativeFileName = path.relative(root, sourceFile?.fileName ?? result.fileName)
  const line = location ? location.line + 1 : 1
  const column = location ? location.character + 1 : 1
  const message = formatMessage(result.diagnostic.messageText)

  return `${relativeFileName}:${line}:${column} TS${result.diagnostic.code} ${message}`
}

export function findDeprecatedApiDiagnostics(options = {}) {
  const root = options.root ?? process.cwd()
  const configPaths = options.configPaths ?? collectTsconfigPaths(root)
  const results = []

  for (const configPath of configPaths) {
    const parsedConfig = parseTsconfig(configPath)
    const service = createLanguageService(root, parsedConfig)

    for (const fileName of parsedConfig.fileNames) {
      const diagnostics = service.getSuggestionDiagnostics(fileName)

      for (const diagnostic of diagnostics) {
        if (isDeprecatedDiagnostic(diagnostic)) {
          results.push({
            configPath,
            diagnostic,
            fileName,
          })
        }
      }
    }
  }

  return results
}

function main() {
  const root = process.cwd()
  const configPaths =
    process.argv.length > 2
      ? process.argv.slice(2).map((configPath) => path.resolve(root, configPath))
      : collectTsconfigPaths(root)

  if (configPaths.length === 0) {
    console.error('No tsconfig files found under apps or packages.')
    process.exit(1)
  }

  try {
    const diagnostics = findDeprecatedApiDiagnostics({ configPaths, root })

    if (diagnostics.length === 0) {
      console.log('No deprecated API suggestions in workspace tsconfigs.')
      return
    }

    console.error('Deprecated API suggestions found:')
    for (const diagnostic of diagnostics) {
      console.error(formatDiagnostic(root, diagnostic))
    }
    process.exit(1)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
