const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('dist/Code.gs is up to date with server sources', () => {
  assert.doesNotThrow(() => execFileSync('node', [path.join(__dirname, '../scripts/build-gas.mjs'), '--check'], { stdio: 'pipe' }));
});
