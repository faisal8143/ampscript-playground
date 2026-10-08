'use strict';
// Downloads VS Code and runs the extension inside it. Used in CI (needs a display: xvfb-run on Linux).
const path = require('path');
const fs = require('fs');
const os = require('os');
const { runTests } = require('@vscode/test-electron');

async function main() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'amp-ws-'));
  const fixtures = path.join(__dirname, '..', '..', 'test', 'fixtures', 'json');
  for (const f of fs.readdirSync(fixtures)) fs.copyFileSync(path.join(fixtures, f), path.join(workspace, f));
  try {
    await runTests({
      extensionDevelopmentPath: path.join(__dirname, '..'),
      extensionTestsPath: path.join(__dirname, 'suite', 'index.js'),
      launchArgs: [workspace, '--disable-extensions', '--skip-welcome', '--skip-release-notes']
    });
  } catch (err) {
    console.error('Integration tests failed');
    process.exit(1);
  }
}

main();
