/* Port of eva's src/error.rs
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { CONSTANTS, FUNCTIONS, OPERATORS } from './lex.js';
import { displayF64 } from './float.js';

/** Math related errors. */
export const MathError = Object.freeze({
  DivideByZero: 'DivideByZero',
  OutOfBounds: 'OutOfBounds',
  UnknownBase: 'UnknownBase',
  TooLarge: 'TooLarge',
});

/**
 * Generic calculation errors.
 *
 * Mirrors the Rust `CalcError` enum. The `kind` discriminant is one of
 * `Math` / `Syntax` / `Parser` / `Help`.
 */
export class CalcError extends Error {
  constructor(kind, payload) {
    super(CalcError.render(kind, payload));
    this.name = 'CalcError';
    this.kind = kind;
    // `mathError` for Math, `details` for Syntax/Parser, unused for Help.
    if (kind === 'Math') this.mathError = payload;
    else if (kind === 'Syntax' || kind === 'Parser') this.details = payload;
  }

  static Math(mathError) {
    return new CalcError('Math', mathError);
  }

  static Syntax(details) {
    return new CalcError('Syntax', details);
  }

  static Parser(details) {
    return new CalcError('Parser', details);
  }

  static Help() {
    return new CalcError('Help', undefined);
  }

  /** Structural equality, mirroring `#[derive(PartialEq)]` on the Rust enum. */
  equals(other) {
    if (!(other instanceof CalcError) || other.kind !== this.kind) return false;
    switch (this.kind) {
      case 'Math':
        return this.mathError === other.mathError;
      case 'Syntax':
      case 'Parser':
        return this.details === other.details;
      default:
        return true;
    }
  }

  /** Mirrors `impl fmt::Display for CalcError`. */
  toString() {
    return CalcError.render(this.kind, this.kind === 'Math' ? this.mathError : this.details);
  }

  static render(kind, payload) {
    switch (kind) {
      case 'Math':
        switch (payload) {
          case MathError.DivideByZero:
            return 'Math Error: Divide by zero error!';
          case MathError.OutOfBounds:
            return 'Domain Error: Out of bounds!';
          case MathError.UnknownBase:
            return 'Base too large! Accepted ranges: 0 - 36';
          case MathError.TooLarge:
            return `Error: to large to process! Max value: ${displayF64(Number.MAX_VALUE)}`;
          default:
            return 'Math Error';
        }
      case 'Syntax':
        return `Syntax Error: ${payload}`;
      case 'Parser':
        return `Parser Error: ${payload}`;
      case 'Help':
        return renderHelp();
      default:
        return 'Error';
    }
  }
}

function renderHelp() {
  // Calculate max width but ideally this should be calculated once.
  let maxWidth = 79; // capped at 79
  const w = process.stdout && process.stdout.columns;
  if (typeof w === 'number' && w > 0 && w < maxWidth) maxWidth = w;

  const operators = [...OPERATORS.keys()];
  return (
    `Constants\n${blocks(maxWidth, [...CONSTANTS.keys()])}\n` +
    `Functions\n${blocks(maxWidth, [...FUNCTIONS.keys()])}\n` +
    `Operators\n${operators.join(' ')}\n`
  );
}

/** Convert a list into strings of chunks of 8, right aligned with spaces. */
function blocks(maxWidth, items) {
  // Multiply by eight since we are formatting it into chunks of 8.
  const itemsPerLine = Math.floor(maxWidth / 8);
  const partBytes = (items.length % itemsPerLine) * 8; // leftovers
  const nNewlines = Math.floor(items.length / itemsPerLine) + (partBytes > 0 ? 1 : 0);

  let s = '';
  let i = 0;
  for (let line = 0; line < nNewlines; line++) {
    for (let n = 0; n < itemsPerLine && i < items.length; n++, i++) {
      s += items[i].padStart(8, ' ');
    }
    s += '\n';
  }
  return s;
}
