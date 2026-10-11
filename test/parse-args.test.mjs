/**
 * Every tool's `parseArgs` rejects unknown flags, flags that are missing their
 * value, and bare non-flag tokens, and parses a normal `--flag value` pair.
 *
 * Why the tools export `parseArgs` at all: argument parsing is the one piece of
 * each tool that is pure, and it is the piece whose failure mode is silent — a
 * typo'd flag that is ignored rather than rejected would make a tool run with
 * defaults the caller did not ask for. The export exists for these tests and
 * changes nothing else about the tools' behaviour.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { parseArgs as parsePortPatch } from '../tools/port-patch.mjs'
import { parseArgs as parseVerifyPatch, resolveRuntime } from '../tools/verify-patch.mjs'
import { parseArgs as parseDeriveBaseline } from '../tools/derive-baseline.mjs'
import { parseArgs as parseCheckPackage } from '../tools/check-package.mjs'

/** The four tools, with a flag/value pair each of them accepts. */
const TOOLS = [
  { name: 'port-patch.mjs', parseArgs: parsePortPatch, flag: '--src', value: 'a-directory', expected: { src: 'a-directory' } },
  { name: 'verify-patch.mjs', parseArgs: parseVerifyPatch, flag: '--patch', value: 'a-file.yml', expected: { patch: 'a-file.yml' } },
  { name: 'derive-baseline.mjs', parseArgs: parseDeriveBaseline, flag: '--patch', value: 'a-file.yml', expected: { patch: 'a-file.yml' } },
  { name: 'check-package.mjs', parseArgs: parseCheckPackage, flag: '--patch', value: 'a-file.yml', expected: { patch: 'a-file.yml' } },
]

for (const tool of TOOLS) {
  test(`${tool.name}: an unknown flag throws`, () => {
    assert.throws(() => tool.parseArgs(['--definitely-not-a-flag', 'x']), /unknown flag/)
  })

  test(`${tool.name}: a flag missing its value throws`, () => {
    assert.throws(() => tool.parseArgs([tool.flag]), /needs a value/)
  })

  test(`${tool.name}: a bare non-flag token throws`, () => {
    assert.throws(() => tool.parseArgs(['bare-token']), /unexpected argument/)
  })

  test(`${tool.name}: a normal --flag value pair parses`, () => {
    assert.deepEqual(tool.parseArgs([tool.flag, tool.value]), tool.expected)
  })
}

test('port-patch.mjs: several flags parse together', () => {
  assert.deepEqual(parsePortPatch(['--src', 'in', '--out', 'out', '--package', '@scope/name']), {
    src: 'in',
    out: 'out',
    package: '@scope/name',
  })
})

test('check-package.mjs: the bare --quiet flag parses without a value', () => {
  assert.deepEqual(parseCheckPackage(['--quiet']), { quiet: true })
})

test('derive-baseline.mjs: the bare --check flag parses without a value', () => {
  assert.deepEqual(parseDeriveBaseline(['--check']), { check: true })
})

test('verify-patch.mjs: the bare --quiet flag combines with a value flag, and resolveRuntime resolves the runtime', () => {
  assert.deepEqual(parseVerifyPatch(['--legacy', 'a.yml', '--quiet']), { legacy: 'a.yml', quiet: true })

  // `resolveRuntime` is exported on the stated ground that this suite exercises it
  // directly rather than only through a spawned tool, so this is the assertion
  // that keeps that comment true. The environment variable is cleared for the
  // duration because an inherited `DSH_RUNTIME` would otherwise decide the first
  // case, which is the environment-sensitivity the suite already had to fix once.
  const saved = process.env.DSH_RUNTIME
  delete process.env.DSH_RUNTIME
  try {
    assert.equal(resolveRuntime(undefined), undefined, 'with no flag and no environment variable there is no runtime to guess at')
    assert.equal(resolveRuntime('/somewhere/node_modules'), '/somewhere/node_modules')
    assert.throws(() => resolveRuntime('relative/node_modules'), /must be an absolute path/)
  } finally {
    if (saved !== undefined) process.env.DSH_RUNTIME = saved
  }
})

test('importing a tool does not run it', async () => {
  // The entry-point guard exists so that importing a module for its exports does
  // not execute the tool. Without it, importing a tool whose `main` throws on
  // missing arguments would set a non-zero exit code inside the test process.
  const toolsDir = join(import.meta.dirname, '..', 'tools')
  for (const file of ['port-patch.mjs', 'verify-patch.mjs', 'derive-baseline.mjs', 'check-package.mjs']) {
    const url = pathToFileURL(join(toolsDir, file)).href
    const module = await import(url)
    assert.equal(typeof module.parseArgs, 'function', `${file} must export parseArgs`)
  }
  assert.equal(process.exitCode ?? 0, 0, 'importing a tool must not set a failing exit code')
})
