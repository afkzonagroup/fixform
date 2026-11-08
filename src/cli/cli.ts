/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The `fixform` command line tool.
 *
 *     fixform render <file> [--format html|text|md|json] [--lang <code>] [--provided-at <iso>|now] [--out <file>] [--force]
 *     fixform validate <file> [--provided-at <iso>|now]
 *     fixform verify <record.json>
 *     fixform languages
 *     fixform schema
 *
 * Input files are JSON, or YAML when the optional `yaml` package is
 * installed. Exit codes: 0 success, 1 invalid input, 2 usage or file error.
 *
 * @packageDocumentation
 */

import { annexText, isLanguage, LANGUAGES } from '../annex/index.js';
import { createRepairForm, FixformValidationError, RECORD_FORMAT, verifyRepairForm } from '../core/record.js';
import { REPAIR_FORM_SCHEMA } from '../core/schema.js';
import type { RepairFormRecord } from '../core/types.js';
import { validateRepairForm, type Issue } from '../core/validate.js';
import { renderHtml } from '../render/html.js';
import { renderMarkdown, renderText } from '../render/text.js';
import type { parse as yamlParse } from 'yaml';
import { CliFileError, readInputFile, safeOutputPath, writeOutputFile } from './files.js';

export interface CliIo {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  /** Base directory for output files. Default `process.cwd()`. */
  readonly cwd?: string;
  /** Clock for `--provided-at now`. Default `Date.now`. */
  readonly now?: () => number;
}

export const VERSION = '0.1.0';

const USAGE = `Usage:
  fixform render <file> [--format html|text|md|json] [--lang <code>] [--provided-at <iso>|now] [--out <file>] [--force]
  fixform validate <file> [--provided-at <iso>|now]
  fixform verify <record.json>
  fixform languages
  fixform schema

<file> is a form (JSON or YAML) or, for render, a record created earlier (JSON).
--provided-at sets when the form is provided; the file must then not contain validity.providedAt.
--out writes inside the current directory only; an existing file is replaced only with --force.
`;

class UsageError extends Error {}

interface Parsed {
  readonly command: string;
  readonly file: string | undefined;
  readonly flags: ReadonlyMap<string, string | true>;
}

const VALUE_FLAGS = new Set(['--format', '--lang', '--provided-at', '--out']);
const BOOLEAN_FLAGS = new Set(['--force']);

function parseArgs(argv: readonly string[]): Parsed {
  const [command = '', ...rest] = argv;
  const flags = new Map<string, string | true>();
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (VALUE_FLAGS.has(arg)) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`${arg} needs a value`);
      if (flags.has(arg)) throw new UsageError(`${arg} given twice`);
      flags.set(arg, value);
      i += 1;
    } else if (BOOLEAN_FLAGS.has(arg)) {
      flags.set(arg, true);
    } else if (arg.startsWith('--')) {
      throw new UsageError(`unknown option ${arg}`);
    } else {
      positional.push(arg);
    }
  }
  if (positional.length > 1) throw new UsageError('too many arguments');
  return { command, file: positional[0], flags };
}

function flag(parsed: Parsed, name: string): string | undefined {
  const value = parsed.flags.get(name);
  return typeof value === 'string' ? value : undefined;
}

function allowFlags(parsed: Parsed, allowed: readonly string[]): void {
  for (const name of parsed.flags.keys()) if (!allowed.includes(name)) throw new UsageError(`${name} is not valid for ${parsed.command}`);
}

async function parseFile(path: string): Promise<unknown> {
  const text = await readInputFile(path);
  if (/\.ya?ml$/iu.test(path)) {
    let parse: typeof yamlParse;
    try {
      // Constant module name: the optional peer dependency, loaded only for YAML files.
      ({ parse } = await import('yaml'));
    } catch {
      throw new UsageError('reading YAML needs the optional package "yaml": npm install yaml');
    }
    try {
      // Core schema (no custom tags, no timestamps), unique keys, no aliases (no entity expansion).
      return parse(text, { schema: 'core', strict: true, uniqueKeys: true, maxAliasCount: 0, merge: false, prettyErrors: false });
    } catch {
      throw new UsageError(`${path} is not valid YAML (aliases and duplicate keys are not allowed)`);
    }
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new UsageError(`${path} is not valid JSON`);
  }
}

function providedAtOption(parsed: Parsed, io: CliIo): string | undefined {
  const value = flag(parsed, '--provided-at');
  if (value === undefined) return undefined;
  return value === 'now' ? new Date((io.now ?? Date.now)()).toISOString() : value;
}

function formatIssues(issues: readonly Issue[]): string {
  return issues.map((i) => `  ${i.path || '(input)'}: ${i.code} - ${i.message}\n`).join('');
}

function isRecordShaped(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.hasOwn(value, 'format') && (value as { format: unknown }).format === RECORD_FORMAT;
}

function withLanguage(value: unknown, lang: string | undefined): unknown {
  if (lang === undefined) return value;
  if (!isLanguage(lang)) throw new UsageError(`--lang must be one of: ${LANGUAGES.join(', ')}`);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  // Copy own enumerable properties into a fresh object; validation rejects dangerous keys afterwards.
  return { ...(value as Record<string, unknown>), language: lang };
}

async function render(parsed: Parsed, io: CliIo): Promise<number> {
  allowFlags(parsed, ['--format', '--lang', '--provided-at', '--out', '--force']);
  if (parsed.file === undefined) throw new UsageError('render needs a file');
  const format = flag(parsed, '--format') ?? 'html';
  if (!['html', 'text', 'md', 'json'].includes(format)) throw new UsageError('--format must be html, text, md or json');
  const data = await parseFile(parsed.file);
  let record: RepairFormRecord;
  if (isRecordShaped(data)) {
    if (parsed.flags.has('--lang') || parsed.flags.has('--provided-at')) throw new UsageError('--lang and --provided-at cannot change an existing record');
    const verified = verifyRepairForm(data);
    if (!verified.ok) {
      io.stderr(`Record check failed: ${verified.reason}\n`);
      return 1;
    }
    record = verified.record;
  } else {
    try {
      const providedAt = providedAtOption(parsed, io);
      record = createRepairForm(withLanguage(data, flag(parsed, '--lang')), providedAt === undefined ? {} : { providedAt });
    } catch (error) {
      if (error instanceof FixformValidationError) {
        io.stderr(`The form is not valid:\n${formatIssues(error.issues)}`);
        return 1;
      }
      throw error;
    }
  }
  const output =
    format === 'html' ? renderHtml(record) : format === 'text' ? renderText(record) : format === 'md' ? renderMarkdown(record) : `${JSON.stringify(record, null, 2)}\n`;
  const out = flag(parsed, '--out');
  if (out === undefined) {
    io.stdout(output);
  } else {
    const target = await safeOutputPath(out, io.cwd ?? process.cwd());
    await writeOutputFile(target, output, parsed.flags.get('--force') === true);
    io.stderr(`Wrote ${target} (${record.id})\n`);
  }
  return 0;
}

async function validate(parsed: Parsed, io: CliIo): Promise<number> {
  allowFlags(parsed, ['--provided-at']);
  if (parsed.file === undefined) throw new UsageError('validate needs a file');
  const providedAt = providedAtOption(parsed, io);
  const result = validateRepairForm(await parseFile(parsed.file), providedAt === undefined ? {} : { providedAt });
  if (result.warnings.length > 0) io.stderr(`Warnings:\n${formatIssues(result.warnings)}`);
  if (!result.ok) {
    io.stderr(`The form is not valid:\n${formatIssues(result.errors)}`);
    return 1;
  }
  io.stdout('valid\n');
  return 0;
}

async function verify(parsed: Parsed, io: CliIo): Promise<number> {
  allowFlags(parsed, []);
  if (parsed.file === undefined) throw new UsageError('verify needs a file');
  const result = verifyRepairForm(await parseFile(parsed.file));
  if (!result.ok) {
    io.stderr(`Record check failed: ${result.reason}\n`);
    return 1;
  }
  io.stdout(`ok ${result.record.id} ${result.record.integrity}\n`);
  return 0;
}

/** Runs the CLI. Returns the exit code. Never throws. */
export async function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    const parsed = parseArgs(argv);
    switch (parsed.command) {
      case 'render':
        return await render(parsed, io);
      case 'validate':
        return await validate(parsed, io);
      case 'verify':
        return await verify(parsed, io);
      case 'languages':
        allowFlags(parsed, []);
        io.stdout(LANGUAGES.map((l) => `${l}\t${annexText(l).formTitle}\n`).join(''));
        return 0;
      case 'schema':
        allowFlags(parsed, []);
        io.stdout(`${JSON.stringify(REPAIR_FORM_SCHEMA, null, 2)}\n`);
        return 0;
      case '--version':
        io.stdout(`${VERSION}\n`);
        return 0;
      case '':
      case 'help':
      case '--help':
      case '-h':
        io.stdout(USAGE);
        return 0;
      default:
        throw new UsageError(`unknown command ${parsed.command}`);
    }
  } catch (error) {
    if (error instanceof UsageError || error instanceof CliFileError) {
      io.stderr(`fixform: ${error.message}\n\n${error instanceof UsageError ? USAGE : ''}`);
      return 2;
    }
    io.stderr('fixform: unexpected error\n');
    return 2;
  }
}
