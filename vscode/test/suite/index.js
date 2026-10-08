'use strict';
// Runs inside a real VS Code instance (see ../runIntegration.js).
const assert = require('assert');
const path = require('path');
const vscode = require('vscode');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, label, timeout = 10000) {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - start > timeout) throw new Error('Timed out waiting for ' + label);
    await sleep(100);
  }
}

const tests = {
  async 'extension activates on an HTML file'() {
    const folder = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const doc = await vscode.workspace.openTextDocument(path.join(folder, 'offer.html'));
    await vscode.window.showTextDocument(doc);
    const ext = vscode.extensions.getExtension('faisal8143.ampscript-playground');
    assert.ok(ext, 'extension found');
    await waitFor(() => ext.isActive, 'activation');
  },

  async 'errors appear in the Problems panel'() {
    const doc = vscode.window.activeTextEditor.document;
    const diags = await waitFor(() => {
      const d = vscode.languages.getDiagnostics(doc.uri);
      return d.length ? d : null;
    }, 'diagnostics');
    const err = diags.find((d) => d.severity === vscode.DiagnosticSeverity.Error);
    assert.ok(err, 'has an error');
    assert.strictEqual(err.range.start.line, 4);
    assert.match(err.message, /not a valid number \(subscriber: Bo\)/);
  },

  async 'completion offers AMPscript functions inside code'() {
    const doc = vscode.window.activeTextEditor.document;
    const list = await vscode.commands.executeCommand('vscode.executeCompletionItemProvider', doc.uri, new vscode.Position(1, 12));
    const labels = list.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label));
    assert.ok(labels.includes('Lookup'), 'Lookup offered');
  },

  async 'hover shows the function signature'() {
    const doc = vscode.window.activeTextEditor.document;
    const line = doc.lineAt(2).text;
    const col = line.indexOf('Lookup') + 2;
    const hovers = await vscode.commands.executeCommand('vscode.executeHoverProvider', doc.uri, new vscode.Position(2, col));
    const text = hovers.map((h) => h.contents.map((c) => c.value || c).join('')).join('');
    assert.match(text, /Lookup\(deName, returnField/);
  },

  async 'preview command opens a webview'() {
    await vscode.commands.executeCommand('ampscript.openPreview');
    await waitFor(() => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => /^Preview offer\.html/.test(t.label))), 'preview tab');
  },

  async 'diagnostics clear when the error is fixed'() {
    const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
    const doc = editor.document;
    const text = doc.getText().replace('FormatNumber(@points, "N0")', 'v(@points)');
    const edit = new vscode.WorkspaceEdit();
    edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
    await vscode.workspace.applyEdit(edit);
    await waitFor(() => !vscode.languages.getDiagnostics(doc.uri).some((d) => d.severity === vscode.DiagnosticSeverity.Error), 'errors cleared');
  }
};

async function run() {
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn();
      console.log('  ✓ ' + name);
    } catch (e) {
      failed++;
      console.error('  ✗ ' + name + '\n    ' + (e && e.stack || e));
    }
  }
  if (failed) throw new Error(failed + ' integration test(s) failed');
}

module.exports = { run };
