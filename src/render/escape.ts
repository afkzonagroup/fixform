/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/**
 * Escapes text for Markdown (CommonMark and GitHub Flavored Markdown): every
 * ASCII punctuation character that can start markup gets a backslash, and
 * raw HTML is impossible because `<` and `&` are escaped too. Colons are
 * escaped so that addresses in the data never become automatic links, and
 * equals signs so that a line of them never turns a line into a heading.
 */
export function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]()#+\-.!|<>~&:=]/gu, (ch) => `\\${ch}`);
}
