'use strict';
// A small stand-in for the `vscode` module so extension.js can be unit tested in plain Node.
const fs = require('fs');
const path = require('path');

class Position { constructor(line, character) { this.line = line; this.character = character; } }
class Range {
  constructor(a, b, c, d) {
    if (a instanceof Position) { this.start = a; this.end = b; }
    else { this.start = new Position(a, b); this.end = new Position(c, d); }
  }
}
class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
class CompletionItem { constructor(label, kind) { this.label = label; this.kind = kind; } }
class SnippetString { constructor(value) { this.value = value; } }
class MarkdownString {
  constructor(v) { this.value = v || ''; }
  appendMarkdown(v) { this.value += v; return this; }
  appendCodeblock(v, lang) { this.value += '\n```' + (lang || '') + '\n' + v + '\n```\n'; return this; }
}
class Hover { constructor(contents, range) { this.contents = contents; this.range = range; } }
class SignatureHelp { constructor() { this.signatures = []; this.activeSignature = 0; this.activeParameter = 0; } }
class SignatureInformation { constructor(label, doc) { this.label = label; this.documentation = doc; this.parameters = []; } }
class ParameterInformation { constructor(label) { this.label = label; } }

const Uri = {
  file(p) { return { scheme: 'file', fsPath: p, path: p, toString: () => 'file://' + p }; }
};

function makeDocument(fsPath, languageId) {
  let text = fs.readFileSync(fsPath, 'utf8');
  const doc = {
    uri: Uri.file(fsPath),
    fileName: fsPath,
    languageId,
    getText(range) {
      if (!range) return text;
      const lines = text.split('\n');
      const out = [];
      for (let l = range.start.line; l <= range.end.line; l++) {
        const line = lines[l] || '';
        const from = l === range.start.line ? range.start.character : 0;
        const to = l === range.end.line ? range.end.character : line.length;
        out.push(line.slice(from, to));
      }
      return out.join('\n');
    },
    get lineCount() { return text.split('\n').length; },
    lineAt(n) {
      const t = text.split('\n')[n] || '';
      return { text: t, firstNonWhitespaceCharacterIndex: t.length - t.trimStart().length };
    },
    getWordRangeAtPosition(pos, re) {
      const line = text.split('\n')[pos.line] || '';
      const g = new RegExp(re.source, 'g');
      let m;
      while ((m = g.exec(line))) {
        if (pos.character >= m.index && pos.character <= m.index + m[0].length) return new Range(pos.line, m.index, pos.line, m.index + m[0].length);
        if (!m[0].length) g.lastIndex++;
      }
      return undefined;
    },
    _setText(t) { text = t; }
  };
  return doc;
}

function createMock() {
  const listeners = {};
  const on = (name) => (fn) => { (listeners[name] = listeners[name] || []).push(fn); return { dispose() {} }; };
  const state = {
    commands: {}, providers: { completion: [], hover: [], signature: [] }, panels: [], messages: [], opened: [],
    diagnostics: new Map(), config: {}, quickPick: null
  };
  const vscode = {
    Position, Range, Diagnostic, CompletionItem, SnippetString, MarkdownString, Hover,
    SignatureHelp, SignatureInformation, ParameterInformation, Uri,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    CompletionItemKind: { Function: 2, Keyword: 13 },
    ViewColumn: { Beside: -2 },
    StatusBarAlignment: { Left: 1, Right: 2 },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri, list) => state.diagnostics.set(uri.toString(), list),
        delete: (uri) => state.diagnostics.delete(uri.toString()),
        dispose() {}
      }),
      registerCompletionItemProvider: (sel, p) => { state.providers.completion.push(p); return { dispose() {} }; },
      registerHoverProvider: (sel, p) => { state.providers.hover.push(p); return { dispose() {} }; },
      registerSignatureHelpProvider: (sel, p) => { state.providers.signature.push(p); return { dispose() {} }; }
    },
    window: {
      activeTextEditor: undefined,
      createStatusBarItem: () => (state.status = { text: '', show() { this.visible = true; }, hide() { this.visible = false; }, dispose() {} }),
      showInformationMessage: (m) => { state.messages.push(m); return Promise.resolve(); },
      showQuickPick: () => Promise.resolve(state.quickPick),
      showTextDocument: (uri) => { state.opened.push(uri.fsPath || uri); return Promise.resolve(); },
      createWebviewPanel: (type, title) => {
        const handlers = { message: [], dispose: [] };
        const panel = {
          title, webview: { html: '', cspSource: 'vscode-resource:', onDidReceiveMessage: (fn) => handlers.message.push(fn) },
          reveal() { panel.revealed = true; },
          onDidDispose: (fn) => handlers.dispose.push(fn),
          _send: (m) => handlers.message.forEach((fn) => fn(m)),
          _dispose: () => handlers.dispose.forEach((fn) => fn())
        };
        state.panels.push(panel);
        return panel;
      },
      onDidChangeActiveTextEditor: on('activeEditor')
    },
    workspace: {
      textDocuments: [],
      getConfiguration: () => ({ get: (k, d) => (k in state.config ? state.config[k] : d) }),
      getWorkspaceFolder: () => undefined,
      asRelativePath: (p) => path.basename(p),
      onDidOpenTextDocument: on('open'),
      onDidChangeTextDocument: on('change'),
      onDidSaveTextDocument: on('save'),
      onDidCloseTextDocument: on('close'),
      onDidChangeConfiguration: on('config')
    },
    commands: {
      registerCommand: (id, fn) => { state.commands[id] = fn; return { dispose() {} }; }
    }
  };
  return { vscode, state, listeners, makeDocument };
}

module.exports = { createMock };
