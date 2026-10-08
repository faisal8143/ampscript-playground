'use strict';
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tooling = require('./lib/tooling.js');
const functions = require('./lib/functions.js');
const { findData, stem } = require('./lib/project-data.js');
const { previewHtml } = require('./preview-html.js');

const LANGS = ['html', 'ampscript'];
const DEBOUNCE_MS = 300;

/** @type {vscode.DiagnosticCollection} */
let diagnostics;
/** @type {vscode.StatusBarItem} */
let status;
const panels = new Map();      // uri -> WebviewPanel
const selected = new Map();    // uri -> subscriber index
const mobileView = new Map();  // uri -> boolean
const timers = new Map();

function config() {
  return vscode.workspace.getConfiguration('ampscript');
}

function isCandidate(doc) {
  return doc && LANGS.includes(doc.languageId) && doc.uri.scheme === 'file';
}

function loadData(doc) {
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  let dataFile = config().get('dataFile') || '';
  if (dataFile && folder && !path.isAbsolute(dataFile)) dataFile = path.join(folder.uri.fsPath, dataFile);
  try {
    const data = findData(doc.uri.fsPath, { dataFile: dataFile || undefined, stopAt: folder ? folder.uri.fsPath : undefined });
    return { data: data || {}, source: data ? data.source : null, error: null };
  } catch (e) {
    return { data: {}, source: e.file || null, error: e.message };
  }
}

function relative(p) {
  return p ? vscode.workspace.asRelativePath(p.replace(/ \(AMPscript Core layout\)$/, ''), false) + (/AMPscript Core layout/.test(p) ? ' (AMPscript Core folders)' : '') : null;
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

function lineRange(doc, line) {
  const n = Math.min(Math.max((line || 1) - 1, 0), doc.lineCount - 1);
  const l = doc.lineAt(n);
  return new vscode.Range(n, l.firstNonWhitespaceCharacterIndex, n, l.text.length);
}

function updateDiagnostics(doc) {
  if (!isCandidate(doc)) return;
  const text = doc.getText();
  if (!config().get('diagnostics.enable', true) || !tooling.hasAmpscript(text)) {
    diagnostics.delete(doc.uri);
    return;
  }
  const { data, error } = loadData(doc);
  const showWarnings = config().get('diagnostics.warnings', true);
  const list = [];
  if (error) {
    const d = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 0), 'Test data: ' + error, vscode.DiagnosticSeverity.Warning);
    d.source = 'AMPscript';
    list.push(d);
  }
  for (const p of tooling.check(text, data)) {
    if (p.severity === 'warning' && !showWarnings) continue;
    const msg = p.message + (p.subscriber ? ` (subscriber: ${p.subscriber})` : '');
    const d = new vscode.Diagnostic(lineRange(doc, p.line), msg,
      p.severity === 'error' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning);
    d.source = 'AMPscript';
    list.push(d);
  }
  diagnostics.set(doc.uri, list);
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

function renderPanel(doc) {
  const panel = panels.get(doc.uri.toString());
  if (!panel) return;
  const { data, source, error } = loadData(doc);
  const subs = tooling.subscribersOf(data);
  const key = doc.uri.toString();
  const index = Math.min(selected.get(key) || 0, subs.length - 1);
  const result = tooling.renderWith(doc.getText(), data, index);
  panel.title = 'Preview ' + path.basename(doc.fileName);
  panel.webview.html = previewHtml({
    nonce: crypto.randomBytes(16).toString('base64'),
    cspSource: panel.webview.cspSource,
    fileName: path.basename(doc.fileName),
    subscribers: subs.map(tooling.subscriberLabel),
    selected: index,
    dataSource: relative(source),
    dataError: error,
    result,
    mobile: !!mobileView.get(key)
  });
}

function openPreview(uri) {
  const editor = vscode.window.activeTextEditor;
  const doc = uri ? vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString()) : editor && editor.document;
  if (!doc || !LANGS.includes(doc.languageId)) {
    vscode.window.showInformationMessage('Open an HTML or AMPscript file to preview it.');
    return;
  }
  const key = doc.uri.toString();
  const existing = panels.get(key);
  if (existing) {
    existing.reveal(vscode.ViewColumn.Beside, true);
    return;
  }
  const panel = vscode.window.createWebviewPanel('ampscriptPreview', 'Preview ' + path.basename(doc.fileName),
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true, localResourceRoots: [] });
  panels.set(key, panel);
  panel.onDidDispose(() => panels.delete(key));
  panel.webview.onDidReceiveMessage((m) => {
    if (m.type === 'subscriber') selected.set(key, m.index);
    if (m.type === 'mobile') mobileView.set(key, !!m.value);
    renderPanel(doc);
    updateStatus();
  });
  renderPanel(doc);
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function createDataFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !LANGS.includes(editor.document.languageId) || editor.document.uri.scheme !== 'file') {
    vscode.window.showInformationMessage('Open a saved HTML or AMPscript file first.');
    return;
  }
  const doc = editor.document;
  const target = path.join(path.dirname(doc.fileName), stem(doc.fileName) + '.data.json');
  if (fs.existsSync(target)) {
    await vscode.window.showTextDocument(vscode.Uri.file(target), { viewColumn: vscode.ViewColumn.Beside });
    return;
  }
  const data = tooling.scaffoldData(doc.getText());
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  await vscode.window.showTextDocument(vscode.Uri.file(target), { viewColumn: vscode.ViewColumn.Beside });
  vscode.window.showInformationMessage('Created ' + path.basename(target) + ' from the attributes and data extensions this template uses. Replace the sample values.');
  refreshAll();
}

async function chooseSubscriber() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isCandidate(editor.document)) return;
  const doc = editor.document;
  const subs = tooling.subscribersOf(loadData(doc).data);
  const pick = await vscode.window.showQuickPick(
    subs.map((s, i) => ({ label: tooling.subscriberLabel(s, i), description: 'Subscriber ' + (i + 1), index: i })),
    { placeHolder: 'Preview as which test subscriber?' });
  if (!pick) return;
  selected.set(doc.uri.toString(), pick.index);
  renderPanel(doc);
  updateStatus();
}

// ---------------------------------------------------------------------------
// Status bar
// ---------------------------------------------------------------------------

function updateStatus() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isCandidate(editor.document) || !tooling.hasAmpscript(editor.document.getText())) {
    status.hide();
    return;
  }
  const { data, source } = loadData(editor.document);
  if (!source) {
    status.text = '$(beaker) AMPscript: no test data';
    status.tooltip = 'Create a test data file for this template';
    status.command = 'ampscript.createDataFile';
  } else {
    const subs = tooling.subscribersOf(data);
    const i = Math.min(selected.get(editor.document.uri.toString()) || 0, subs.length - 1);
    status.text = '$(account) ' + tooling.subscriberLabel(subs[i], i) + (subs.length > 1 ? ` (${i + 1}/${subs.length})` : '');
    status.tooltip = 'AMPscript test subscriber. Data: ' + relative(source) + (subs.length > 1 ? '\nClick to switch' : '');
    status.command = subs.length > 1 ? 'ampscript.chooseSubscriber' : 'ampscript.openPreview';
  }
  status.show();
}

// ---------------------------------------------------------------------------
// Completion and hover
// ---------------------------------------------------------------------------

function inCode(doc, position) {
  const before = doc.getText(new vscode.Range(new vscode.Position(Math.max(0, position.line - 200), 0), position));
  const open = Math.max(before.lastIndexOf('%%['), before.lastIndexOf('%%='));
  if (open < 0) {
    const tag = before.search(/<script[^>]*runat\s*=\s*["']?server[^>]*>(?![\s\S]*<\/script>)/i);
    return tag >= 0;
  }
  const close = Math.max(before.lastIndexOf(']%%'), before.lastIndexOf('=%%'));
  return close < open;
}

const completionProvider = {
  provideCompletionItems(doc, position) {
    if (!inCode(doc, position)) return undefined;
    return functions.list.map((f) => {
      const item = new vscode.CompletionItem(f.name, vscode.CompletionItemKind.Function);
      item.detail = functions.signature(f);
      item.documentation = new vscode.MarkdownString(f.description);
      item.insertText = new vscode.SnippetString(f.params ? f.name + '($1)' : f.name + '()');
      item.command = { command: 'editor.action.triggerParameterHints', title: 'Parameter hints' };
      return item;
    }).concat(['IF', 'THEN', 'ELSEIF', 'ELSE', 'ENDIF', 'FOR', 'TO', 'DOWNTO', 'DO', 'NEXT', 'SET', 'VAR', 'AND', 'OR', 'NOT'].map((k) =>
      new vscode.CompletionItem(k, vscode.CompletionItemKind.Keyword)));
  }
};

const hoverProvider = {
  provideHover(doc, position) {
    const range = doc.getWordRangeAtPosition(position, /[A-Za-z_]\w*(?=\s*\()/);
    if (!range) return undefined;
    const f = functions.get(doc.getText(range));
    if (!f) return undefined;
    const md = new vscode.MarkdownString();
    md.appendCodeblock(functions.signature(f), 'ampscript');
    md.appendMarkdown(f.description);
    return new vscode.Hover(md, range);
  }
};

const signatureProvider = {
  provideSignatureHelp(doc, position) {
    const line = doc.lineAt(position.line).text.slice(0, position.character);
    let depth = 0, commas = 0;
    for (let i = line.length - 1; i >= 0; i--) {
      const c = line[i];
      if (c === ')') depth++;
      else if (c === '(') {
        if (depth === 0) {
          const m = /([A-Za-z_]\w*)\s*$/.exec(line.slice(0, i));
          const f = m && functions.get(m[1]);
          if (!f) return undefined;
          const help = new vscode.SignatureHelp();
          const sig = new vscode.SignatureInformation(functions.signature(f), new vscode.MarkdownString(f.description));
          sig.parameters = f.params.split(/,\s*/).filter(Boolean).map((p) => new vscode.ParameterInformation(p));
          help.signatures = [sig];
          help.activeSignature = 0;
          help.activeParameter = Math.min(commas, Math.max(0, sig.parameters.length - 1));
          return help;
        }
        depth--;
      } else if (c === ',' && depth === 0) commas++;
    }
    return undefined;
  }
};

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function schedule(doc) {
  const key = doc.uri.toString();
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => {
    timers.delete(key);
    updateDiagnostics(doc);
    renderPanel(doc);
    updateStatus();
  }, DEBOUNCE_MS));
}

function refreshAll() {
  vscode.workspace.textDocuments.forEach((d) => {
    if (isCandidate(d)) {
      updateDiagnostics(d);
      renderPanel(d);
    }
  });
  updateStatus();
}

function activate(context) {
  diagnostics = vscode.languages.createDiagnosticCollection('ampscript');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  const selector = LANGS.map((language) => ({ language, scheme: 'file' }));

  context.subscriptions.push(
    diagnostics,
    status,
    vscode.commands.registerCommand('ampscript.openPreview', openPreview),
    vscode.commands.registerCommand('ampscript.createDataFile', createDataFile),
    vscode.commands.registerCommand('ampscript.chooseSubscriber', chooseSubscriber),
    vscode.languages.registerCompletionItemProvider(selector, completionProvider),
    vscode.languages.registerHoverProvider(selector, hoverProvider),
    vscode.languages.registerSignatureHelpProvider(selector, signatureProvider, '(', ','),
    vscode.workspace.onDidOpenTextDocument((d) => isCandidate(d) && updateDiagnostics(d)),
    vscode.workspace.onDidChangeTextDocument((e) => isCandidate(e.document) && schedule(e.document)),
    vscode.workspace.onDidSaveTextDocument((d) => {
      if (/\.data\.json$|subscriber\.json$|\.csv$/i.test(d.fileName) || /[\\/]Content[\\/]/.test(d.fileName)) refreshAll();
    }),
    vscode.workspace.onDidCloseTextDocument((d) => diagnostics.delete(d.uri)),
    vscode.window.onDidChangeActiveTextEditor(updateStatus),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('ampscript') && refreshAll())
  );

  vscode.workspace.textDocuments.forEach((d) => isCandidate(d) && updateDiagnostics(d));
  updateStatus();

  return { diagnostics, tooling };
}

function deactivate() {
  timers.forEach((t) => clearTimeout(t));
}

module.exports = { activate, deactivate, _internal: { inCode, completionProvider, hoverProvider, signatureProvider, loadData, updateDiagnostics, panels } };
