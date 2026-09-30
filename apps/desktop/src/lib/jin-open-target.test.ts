import { describe, expect, it } from 'vitest'

import {
  normalizeJinOpenString,
  pathFromJinDeepLink,
  pathFromOpenDeepLink,
  resolveJinOpenPath
} from './jin-open-target'

describe('normalizeJinOpenString', () => {
  it('accepts hash-router paths and strips a leading hash', () => {
    expect(normalizeJinOpenString('/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeJinOpenString('#/index-network/intent/1')).toBe('/index-network/intent/1')
  })

  it('maps plugin-scoped jin:// deep links to the same path', () => {
    expect(normalizeJinOpenString('jin://index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeJinOpenString('jin://index-network/intent/1?focus=true')).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('maps jin://open/… deep links by stripping the open host', () => {
    expect(normalizeJinOpenString('jin://open/index-network/intent/1')).toBe('/index-network/intent/1')
    expect(normalizeJinOpenString('jin://open/settings/plugins')).toBe('/settings/plugins')
  })

  it('rejects reserved jin kinds and unsafe paths', () => {
    expect(normalizeJinOpenString('jin://blueprint/morning-brief')).toBeNull()
    expect(normalizeJinOpenString('jin://plugin/install')).toBeNull()
    expect(normalizeJinOpenString('https://example.com/x')).toBeNull()
    expect(normalizeJinOpenString('/../etc/passwd')).toBeNull()
    expect(normalizeJinOpenString('index-network')).toBeNull()
  })
})

describe('resolveJinOpenPath', () => {
  it('merges structured path + params', () => {
    expect(resolveJinOpenPath({ path: '/index-network/intent/1', params: { focus: 'true' } })).toBe(
      '/index-network/intent/1?focus=true'
    )
  })

  it('resolves href the same as a bare string', () => {
    expect(resolveJinOpenPath({ href: 'jin://index-network/intent/1' })).toBe('/index-network/intent/1')
  })
})

describe('pathFromJinDeepLink', () => {
  it('builds the navigate path from a plugin-scoped deep-link payload', () => {
    expect(pathFromJinDeepLink('index-network', 'intent/1')).toBe('/index-network/intent/1')
  })

  it('builds the navigate path from jin://open/… payloads', () => {
    expect(pathFromOpenDeepLink('index-network/intent/1')).toBe('/index-network/intent/1')
    expect(pathFromJinDeepLink('open', 'agent/42')).toBe('/agent/42')
  })

  it('ignores reserved kinds', () => {
    expect(pathFromJinDeepLink('blueprint', 'morning-brief')).toBeNull()
    expect(pathFromJinDeepLink('plugin', 'install')).toBeNull()
    expect(pathFromJinDeepLink('skill', 'install')).toBeNull()
  })
})
