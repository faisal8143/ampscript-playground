#!/usr/bin/env node
/*!
 * ampscript — render and check AMPscript from the command line or in CI.
 * MIT License (c) Faisal Irfan
 */
'use strict';
const fs = require('fs');
const path = require('path');
const AMPscript = require('../src/ampscript.js');
const tooling = require('../src/tooling.js');
const { findData, stem } = require('../src/project-data.js');
const pkg = require('../package.json');

const HELP = `ampscript ${pkg.version}

Render and check Salesforce Marketing Cloud AMPscript locally.

Usage
  ampscript render <file> [--data <file>] [--subscriber <n>] [--now <date>] [--out <file>]
  ampscript check <files or folders...> [--data <file>] [--strict] [--format text|github]
  ampscript init <file>

Commands
  render   Render a template and print the HTML (or write it with --out).
  check    Render every template against every test subscriber and report errors.
           Exits with code 1 when there are errors (or warnings, with --strict).
  init     Create <file>.data.json with test data guessed from the template.

Test data
  Found automatically: <name>.data.json next to the template, the nearest
  ampscript.data.json, or an AMPscript Core folder (subscriber.json,
  DataExtensions/*.csv, Content/*). See https://github.com/faisal8143/ampscript-playground

Options
  --data <file>        Use this data file.
  --subscriber <n>     Which test subscriber to render (1 = first).
  --now <date>         What Now() returns, e.g. 2026-12-24T09:00.
  --out <file>         Write rendered HTML to a file.
  --strict             Treat warnings as failures.
  --format github      Print GitHub Actions annotations.
  -v, --version        Show the version.
  -h, --help           Show this help.
`;

const TEMPLATE_EXT = /\.(html?|amp|ampscript)$/i;

function parseArgs(argv) {
  const args = { _: [], strict: false, format: 'text' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) fail(`${a} needs a value`);
      return argv[++i];
    };
    switch (a) {
      case '--data': args.data = next(); break;
      case '--subscriber': args.subscriber = parseInt(next(), 10); break;
      case '--now': args.now = next(); break;
      case '--out': args.out = next(); break;
      case '--format': args.format = next(); break;
      case '--strict': args.strict = true; break;
      case '-h': case '--help': args.help = true; break;
      case '-v': case '--version': args.version = true; break;
      default:
        if (a.startsWith('-')) fail(`Unknown option ${a}. Run ampscript --help`);
        args._.push(a);
    }
  }
  return args;
}

function fail(message) {
  process.stderr.write(`ampscript: ${message}\n`);
  process.exit(2);
}

function collectFiles(inputs) {
  const files = [];
  const walk = (p) => {
    if (!fs.existsSync(p)) fail(`${p} not found`);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        if (f === 'node_modules' || f.startsWith('.') || f === 'Content') continue;
        walk(path.join(p, f));
      }
    } else if (TEMPLATE_EXT.test(p)) files.push(p);
  };
  inputs.forEach(walk);
  return files;
}

function dataFor(file, args) {
  try {
    const data = findData(file, { dataFile: args.data }) || {};
    if (args.now) data.now = args.now;
    return data;
  } catch (e) {
    fail(e.message);
  }
}

function render(args) {
  const file = args._[1];
  if (!file) fail('render needs a file. Example: ampscript render email.html');
  const text = fs.readFileSync(file, 'utf8');
  const data = dataFor(file, args);
  const result = tooling.renderWith(text, data, (args.subscriber || 1) - 1);
  result.warnings.forEach((w) => process.stderr.write(`warning: ${w}\n`));
  result.log.forEach((l) => process.stderr.write(`data: ${l}\n`));
  if (result.errors.length) {
    result.errors.forEach((e) => process.stderr.write(`${file}${e.line ? ':' + e.line : ''}: error: ${e.message}\n`));
    process.exit(1);
  }
  if (args.out) {
    fs.writeFileSync(args.out, result.html);
    process.stderr.write(`Wrote ${args.out}\n`);
  } else {
    process.stdout.write(result.html);
  }
}

function check(args) {
  const inputs = args._.slice(1);
  if (!inputs.length) inputs.push('.');
  const files = collectFiles(inputs).filter((f) => tooling.hasAmpscript(fs.readFileSync(f, 'utf8')));
  let errors = 0, warnings = 0;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8');
    const data = dataFor(file, args);
    const problems = tooling.check(text, data);
    for (const p of problems) {
      if (p.severity === 'error') errors++; else warnings++;
      const who = p.subscriber ? ` [${p.subscriber}]` : '';
      if (args.format === 'github') {
        const level = p.severity === 'error' || args.strict ? 'error' : 'warning';
        process.stdout.write(`::${level} file=${file}${p.line ? ',line=' + p.line : ''}::${(p.message + who).replace(/\r?\n/g, ' ')}\n`);
      } else {
        process.stdout.write(`${file}${p.line ? ':' + p.line : ''}: ${p.severity}: ${p.message}${who}\n`);
      }
    }
  }
  const summary = `Checked ${files.length} template${files.length === 1 ? '' : 's'}: ${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`;
  process.stderr.write(summary + '\n');
  if (errors || (args.strict && warnings)) process.exit(1);
}

function init(args) {
  const file = args._[1];
  if (!file) fail('init needs a template. Example: ampscript init email.html');
  const target = path.join(path.dirname(file), stem(file) + '.data.json');
  if (fs.existsSync(target)) fail(`${target} already exists`);
  const data = tooling.scaffoldData(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  process.stderr.write(`Created ${target}. Edit the sample values, then run: ampscript render ${file}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.version) return process.stdout.write(pkg.version + '\n');
  if (args.help || !args._.length) return process.stdout.write(HELP);
  switch (args._[0]) {
    case 'render': return render(args);
    case 'check': return check(args);
    case 'init': return init(args);
    default: fail(`Unknown command "${args._[0]}". Run ampscript --help`);
  }
}

main();
