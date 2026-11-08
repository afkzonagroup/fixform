/*
 * Copyright 2026 MB AFKzona Group
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * References to the official texts this package implements. Every rule in the
 * code cites one of these.
 *
 * @packageDocumentation
 */

/** Directive (EU) 2024/1799 on common rules promoting the repair of goods, OJ L, 2024/1799, 10.7.2024. */
export const DIRECTIVE_2024_1799 = {
  celex: '32024L1799',
  eli: 'http://data.europa.eu/eli/dir/2024/1799/oj',
  url: 'https://eur-lex.europa.eu/eli/dir/2024/1799/oj',
  /** Member States apply their national measures from this date (Article 22(1), third subparagraph). */
  applicationDate: '2026-07-31',
} as const;

/** Directive (EU) 2019/771, Article 2(11): the definition of "durable medium" used by Article 2(12) of Directive (EU) 2024/1799. */
export const DIRECTIVE_2019_771 = {
  celex: '32019L0771',
  url: 'https://eur-lex.europa.eu/eli/dir/2019/771/oj',
} as const;

/** Regulation (EEC, Euratom) No 1182/71, Article 3: how periods expressed in days are counted in EU acts. */
export const REGULATION_1182_71 = {
  celex: '31971R1182',
  url: 'https://eur-lex.europa.eu/eli/reg/1971/1182/oj',
} as const;

/** The minimum period of validity of the form: Article 4(5) of Directive (EU) 2024/1799. */
export const MINIMUM_VALIDITY_DAYS = 30;
