#!/usr/bin/env node
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const checker = path.join(root, 'bin/check-definition-system.cjs');

assert.strictEqual(run(root).status, 0, run(root).stderr);

const countRoot = fixture();
replace(countRoot, 'workflow/core/capability-manifest.yaml', 'capability_count: 31', 'capability_count: 30');
assert.notStrictEqual(run(countRoot).status, 0, 'capability_count mismatch must fail');

const referenceRoot = fixture();
replace(referenceRoot, 'workflow/core/rules/definition-quality-catalog.yaml', 'capabilities: ["business-value-validator"]', 'capabilities: ["missing-capability"]');
const reference = run(referenceRoot);
assert.notStrictEqual(reference.status, 0, 'missing capability reference must fail');
assert.match(reference.stderr, /不存在的 capability/);

const cycleRoot = fixture();
replace(cycleRoot, 'workflow/core/policy-packs/standard.yaml', 'extends: []', 'extends: ["standard"]');
const cycle = run(cycleRoot);
assert.notStrictEqual(cycle.status, 0, 'policy pack cycle must fail');
assert.match(cycle.stderr, /extends 自身|extends 循环/);

const enforcementRoot = fixture();
replace(enforcementRoot, 'workflow/core/rules/definition-quality-catalog.yaml', 'enforcement_count: 24', 'enforcement_count: 23');
const enforcement = run(enforcementRoot);
assert.notStrictEqual(enforcement.status, 0, 'definition enforcement mapping mismatch must fail');
assert.match(enforcement.stderr, /enforcement_count/);

const unknownMechanismRoot = fixture();
replace(unknownMechanismRoot, 'workflow/core/rules/definition-quality-catalog.yaml', '"runner:permit"', '"runner:not-real"');
const unknownMechanism = run(unknownMechanismRoot);
assert.notStrictEqual(unknownMechanism.status, 0, 'unknown enforcement mechanism must fail');
assert.match(unknownMechanism.stderr, /未知 enforcement mechanism/);

console.log('Definition system test passed.');

function fixture() {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'owk-definition-system-'));
  fs.mkdirSync(path.join(target, 'workflow'), { recursive: true });
  fs.cpSync(path.join(root, 'workflow/core'), path.join(target, 'workflow/core'), { recursive: true });
  return target;
}

function replace(target, rel, before, after) {
  const file = path.join(target, rel);
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(source.includes(before), `${rel} fixture missing ${before}`);
  fs.writeFileSync(file, source.replace(before, after));
}

function run(target) {
  return spawnSync(process.execPath, [checker, '--root', target], { encoding: 'utf8' });
}
