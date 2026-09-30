import assert from 'node:assert/strict'

import { test } from 'vitest'

import { hasWindowsPathPrefix, isExternalVenvHolder, isJinOwnedVenvDaemon } from './venv-holder-select'

const SCRIPTS = 'C:\\Jin\\venv\\Scripts'

test('matches the hindsight daemon shim (exe under venv Scripts + hindsight cmdline)', () => {
  assert.equal(
    isJinOwnedVenvDaemon(
      'C:\\Jin\\venv\\Scripts\\pythonw.exe',
      'C:\\Jin\\venv\\Scripts\\pythonw.exe -m hindsight_api.main --daemon --idle-timeout 300 --port 9177',
      SCRIPTS
    ),
    true
  )
})

test('Windows path prefix match is ordinal case-insensitive', () => {
  assert.equal(
    isJinOwnedVenvDaemon(
      'c:\\jin\\venv\\scripts\\python.exe',
      'python.exe -m hindsight_api.main --daemon',
      'C:\\Jin\\venv\\Scripts'
    ),
    true
  )
})

test('excludes external venv holders that are not the hindsight daemon', () => {
  // a user terminal running the jin CLI from the venv — must NOT be killed
  assert.equal(isJinOwnedVenvDaemon('C:\\Jin\\venv\\Scripts\\jin.exe', 'jin chat -q "hi"', SCRIPTS), false)
  // an unrelated python script using the venv interpreter
  assert.equal(
    isJinOwnedVenvDaemon('C:\\Jin\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
})

test('excludes exes outside the venv even when the cmdline mentions hindsight', () => {
  assert.equal(
    isJinOwnedVenvDaemon('C:\\Other\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('prefix boundary: sibling dirs (ScriptsX) do not match', () => {
  assert.equal(hasWindowsPathPrefix('C:\\Jin\\venv\\ScriptsX\\python.exe', SCRIPTS), false)
  assert.equal(hasWindowsPathPrefix('C:\\Jin\\venv\\Scripts\\python.exe', SCRIPTS), true)
})

test('null/undefined fields never match', () => {
  assert.equal(isJinOwnedVenvDaemon(null, 'x', SCRIPTS), false)
  assert.equal(isJinOwnedVenvDaemon('C:\\Jin\\venv\\Scripts\\pythonw.exe', null, SCRIPTS), false)
  assert.equal(isJinOwnedVenvDaemon(undefined, undefined, SCRIPTS), false)
})

// --- isExternalVenvHolder (#62311) ------------------------------------------

test('matches the autostart gateway shim (jin.exe under venv Scripts)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\Jin\\venv\\Scripts\\jin.exe',
      '"C:\\Jin\\venv\\Scripts\\jin.exe" gateway run --external-supervisor',
      SCRIPTS
    ),
    true
  )
})

test('matches the dashboard scheduled task (python -m jin_cli / -m jin)', () => {
  assert.equal(
    isExternalVenvHolder(
      'C:\\Jin\\venv\\Scripts\\python.exe',
      '"C:\\Jin\\venv\\Scripts\\python.exe" -m jin_cli.main dashboard',
      SCRIPTS
    ),
    true
  )
  assert.equal(
    isExternalVenvHolder('C:\\Jin\\venv\\Scripts\\pythonw.exe', 'pythonw.exe -m jin serve', SCRIPTS),
    true
  )
})

test('never matches an unrelated process that merely borrows the venv interpreter', () => {
  // a user's own script running on the venv python — NOT Jin, must NOT be killed
  assert.equal(
    isExternalVenvHolder('C:\\Jin\\venv\\Scripts\\python.exe', 'python C:\\tools\\import.py', SCRIPTS),
    false
  )
  // hindsight daemon is selected by isJinOwnedVenvDaemon, not here
  assert.equal(
    isExternalVenvHolder('C:\\Jin\\venv\\Scripts\\pythonw.exe', 'pythonw -m hindsight_api.main --daemon', SCRIPTS),
    false
  )
})

test('never matches a process outside the venv, even with jin in the cmdline', () => {
  // an editor / shell whose command line mentions the install root (#62445 regression guard)
  assert.equal(
    isExternalVenvHolder('C:\\Windows\\System32\\cmd.exe', 'cmd /c cd C:\\Jin\\venv\\Scripts && dir', SCRIPTS),
    false
  )
  assert.equal(isExternalVenvHolder('C:\\Other\\jin.exe', 'jin gateway run', SCRIPTS), false)
})

test('sibling-dir and boundary safety for the external selector', () => {
  assert.equal(isExternalVenvHolder('C:\\Jin\\venv\\ScriptsX\\jin.exe', 'jin gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder(null, 'jin gateway run', SCRIPTS), false)
  assert.equal(isExternalVenvHolder('C:\\Jin\\venv\\Scripts\\jin.exe', null, SCRIPTS), false)
})
