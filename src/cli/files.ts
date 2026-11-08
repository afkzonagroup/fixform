/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File access for the CLI, with path safety:
 *
 * - input must be a regular file (no devices, FIFOs or directories) of at
 *   most {@link MAX_INPUT_BYTES}; the size is checked on the open file
 *   descriptor and again while reading;
 * - output must stay inside the base directory (the current directory by
 *   default), also after resolving symbolic links of the parent directory;
 * - output is created exclusively (`O_EXCL`, `O_NOFOLLOW`) with mode 0600;
 *   an existing file is replaced only with `--force`, and never through a
 *   symbolic link.
 *
 * @packageDocumentation
 */

import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Largest accepted input file. */
export const MAX_INPUT_BYTES = 256 * 1024;

export class CliFileError extends Error {}

/** An `fs.constants` flag, or 0 where the platform does not have it (O_NOFOLLOW and O_NONBLOCK on Windows). */
function osFlag(name: 'O_NOFOLLOW' | 'O_NONBLOCK'): number {
  return (constants as Partial<Record<string, number>>)[name] ?? 0;
}

/** Reads a UTF-8 input file with the checks described above. */
export async function readInputFile(path: string): Promise<string> {
  if (path.includes('\0')) throw new CliFileError('invalid path');
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | osFlag('O_NONBLOCK'));
  } catch {
    throw new CliFileError(`cannot open ${path}`);
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new CliFileError(`${path} is not a regular file`);
    // The size is enforced while reading (not only from stat), so a file that grows cannot exceed it.
    const buffer = Buffer.alloc(MAX_INPUT_BYTES + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buffer, total, buffer.length - total, null);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total > MAX_INPUT_BYTES) throw new CliFileError(`${path} is larger than ${String(MAX_INPUT_BYTES)} bytes`);
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, total));
    } catch {
      throw new CliFileError(`${path} is not valid UTF-8`);
    }
  } finally {
    await handle.close();
  }
}

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

/**
 * Resolves an output path and checks that it stays inside `baseDir`. Returns
 * the absolute path with the parent directory's symbolic links resolved.
 */
export async function safeOutputPath(path: string, baseDir: string): Promise<string> {
  if (path === '' || path.includes('\0')) throw new CliFileError('invalid output path');
  const base = await realpath(baseDir);
  const target = resolve(base, path);
  let parent: string;
  try {
    parent = await realpath(dirname(target));
  } catch {
    throw new CliFileError('the output directory does not exist');
  }
  const final = join(parent, basename(target));
  if (!isInside(base, final)) throw new CliFileError('the output path must be inside the current directory');
  return final;
}

/** Writes `content` to `path` (already checked by {@link safeOutputPath}). */
export async function writeOutputFile(path: string, content: string, force: boolean): Promise<void> {
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | osFlag('O_NOFOLLOW');
  let existing;
  try {
    existing = await lstat(path);
  } catch {
    existing = undefined;
  }
  if (!existing) {
    // O_EXCL: fails if the file (or a symbolic link) appeared since the check.
    let handle;
    try {
      handle = await open(path, flags, 0o600);
    } catch {
      throw new CliFileError(`cannot create ${path}`);
    }
    try {
      await handle.writeFile(content, 'utf8');
    } finally {
      await handle.close();
    }
    return;
  }
  if (!force) throw new CliFileError(`${path} exists; use --force to replace it`);
  if (!existing.isFile()) throw new CliFileError(`${path} is not a regular file`);
  // Write a new file next to the target and rename it over the target: a symbolic
  // link planted at the target path is replaced, never followed.
  const temp = join(dirname(path), `.${basename(path)}.${String(process.pid)}.${String(Date.now())}.tmp`);
  const handle = await open(temp, flags, 0o600);
  try {
    await handle.writeFile(content, 'utf8');
  } catch (error) {
    await handle.close();
    await unlink(temp).catch(() => undefined);
    throw error;
  }
  await handle.close();
  await rename(temp, path);
}
