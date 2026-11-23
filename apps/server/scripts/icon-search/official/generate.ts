import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { DomUtils, parseDocument } from 'htmlparser2'
import { z } from 'zod'
import type { SnapshotName } from './manifest'

type Labels = { titles: string[]; tags: string[] }
type Snapshot = Map<string, Labels | string[]>

const han = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{323af}]/u
const iconParkInput = z.array(
  z.object({ name: z.string(), title: z.string(), tag: z.array(z.string()) }),
)
const remixGroup = z.record(z.string(), z.string())
const formatter = fileURLToPath(new URL('bin/oxfmt', import.meta.resolve('oxfmt/package.json')))

function chineseLabels(values: string[]): string[] {
  // Match Unicode code point order, including characters beyond the BMP.
  return [...new Set(values.map((value) => value.trim()).filter((value) => han.test(value)))].sort(
    (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)),
  )
}

function xmlElements(xml: string, root: string, ...path: string[]) {
  const document = parseDocument(xml, { xmlMode: true })
  let elements = DomUtils.getElementsByTagName(root, document.children, false)
  for (const name of path) {
    elements = elements.flatMap((entry) =>
      DomUtils.getElementsByTagName(name, entry.children, false),
    )
  }
  if (!elements.length) throw new Error(`Missing CLDR elements: ${[root, ...path].join('/')}`)
  return elements
}

function iconPark(data: string): Snapshot {
  const result: Snapshot = new Map()
  for (const icon of iconParkInput.parse(JSON.parse(data))) {
    const titles = chineseLabels([icon.title])
    const tags = chineseLabels(icon.tag)
    if (titles.length || tags.length) result.set(icon.name, { titles, tags })
  }
  return result
}

function remixIcon(data: string): Snapshot {
  const groups = z.record(z.string(), z.unknown()).parse(JSON.parse(data))
  delete groups._comment
  const result = new Map<string, string[]>()
  for (const group of Object.values(groups)) {
    for (const [name, list] of Object.entries(remixGroup.parse(group))) {
      const tags = chineseLabels([...(result.get(name) ?? []), ...list.split(',')])
      if (tags.length) result.set(name, tags)
    }
  }
  return result
}

function cldrEmoji(sources: string[]): Snapshot {
  const annotations = new Map<string, Labels>()
  for (const data of sources) {
    for (const entry of xmlElements(data, 'ldml', 'annotations', 'annotation')) {
      const key = Array.from(entry.attribs.cp!.replaceAll('\ufe0f', ''), (character) =>
        character.codePointAt(0)!.toString(16),
      ).join('-')
      const labels = annotations.get(key) ?? { titles: [], tags: [] }
      const text = DomUtils.textContent(entry)
      if (entry.attribs.type === 'tts') labels.titles.push(text)
      else labels.tags.push(...text.split('|'))
      annotations.set(key, labels)
    }
  }
  const result: Snapshot = new Map()
  for (const [key, labels] of annotations) {
    const titles = chineseLabels(labels.titles)
    const tags = chineseLabels(labels.tags)
    if (titles.length || tags.length) result.set(key, { titles, tags })
  }
  return result
}

function isoFlags(names: string, validity: string): Snapshot {
  const codes = new Set<string>()
  for (const group of xmlElements(validity, 'supplementalData', 'idValidity', 'id')) {
    if (
      group.attribs.type !== 'region' ||
      !['regular', 'macroregion'].includes(group.attribs.idStatus!)
    )
      continue
    for (const token of DomUtils.textContent(group).trim().split(/\s+/)) {
      const range = /^([A-Z])([A-Z])(?:~([A-Z]))?$/.exec(token)
      if (!range) continue
      const [, prefix, start, end = start] = range
      for (let code = start!.charCodeAt(0); code <= end!.charCodeAt(0); code++) {
        codes.add(prefix! + String.fromCharCode(code))
      }
    }
  }
  const result = new Map<string, string[]>()
  for (const entry of xmlElements(
    names,
    'ldml',
    'localeDisplayNames',
    'territories',
    'territory',
  )) {
    const { type, alt } = entry.attribs
    if (!codes.has(type!) || (alt !== undefined && alt !== 'short')) continue
    const code = type!.toLowerCase()
    const titles = chineseLabels([...(result.get(code) ?? []), DomUtils.textContent(entry)])
    if (titles.length) result.set(code, titles)
  }
  return result
}

export function formatResourceJson(path: string, json: string): Buffer {
  return execFileSync(process.execPath, [formatter, `--stdin-filepath=${path}`], {
    input: json,
    maxBuffer: 32 * 1024 * 1024,
  })
}

export function generateSnapshot(name: SnapshotName, sources: string[], path: string): Buffer {
  const expected = name === 'cldr-emoji.json' || name === 'iso-flags.json' ? 2 : 1
  if (sources.length !== expected) throw new Error(`Expected ${expected} source files for ${name}`)
  let entries: Snapshot
  switch (name) {
    case 'icon-park.json':
      entries = iconPark(sources[0]!)
      break
    case 'remix-icon.json':
      entries = remixIcon(sources[0]!)
      break
    case 'cldr-emoji.json':
      entries = cldrEmoji(sources)
      break
    case 'iso-flags.json':
      entries = isoFlags(sources[0]!, sources[1]!)
      break
  }
  if (!entries.size) throw new Error(`Empty official snapshot: ${name}`)
  // Serializing a JS object would move digit-only CLDR keys before the other keys.
  const fields = [...entries.keys()]
    .sort()
    .map((key) => `${JSON.stringify(key)}:${JSON.stringify(entries.get(key))}`)
  return formatResourceJson(path, '{' + fields.join(',') + '}')
}
