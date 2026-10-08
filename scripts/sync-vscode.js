// Copies the engine files into the VS Code extension (vscode/lib).
// Run after changing anything in src/:  npm run sync:vscode
'use strict';
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = ['ampscript.js', 'tooling.js', 'functions.js', 'project-data.js'];
const dest = path.join(root, 'vscode', 'lib');
fs.mkdirSync(dest, { recursive: true });
for (const f of files) {
  const src = fs.readFileSync(path.join(root, 'src', f), 'utf8');
  fs.writeFileSync(path.join(dest, f), '// GENERATED from src/' + f + ' by scripts/sync-vscode.js. Do not edit.\n' + src);
}
console.log('Synced ' + files.length + ' files to vscode/lib');
