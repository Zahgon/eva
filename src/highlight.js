/* Port of the LineHighlighter in eva's src/readline.rs
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { CalcError } from './error.js';
import { CONSTANTS, FUNCTIONS } from './lex.js';
import { evalExpr } from './index.js';

/**
 * The upstream regex `[\+-/\*%\^!]` spells `\+-/` as a *range* from '+' (0x2B)
 * to '/' (0x2F), so it also covers ',', '-' and '.'. The set is reproduced
 * literally here so that e.g. the '.' in "1.5" is highlighted as upstream does.
 */
const OPERATOR_CLASS = '[+,\\-./*%^!]';
const OPERATOR_RE = new RegExp(OPERATOR_CLASS, 'g');

const CONSTANT_RES = [...CONSTANTS.keys()].map(
  (c) => new RegExp(`(${c})((\\x1b\\[35m)?(${OPERATOR_CLASS}| |$))`, 'g'),
);

const FUNCTION_RES = [...FUNCTIONS.keys()].map((f) => new RegExp(`(${f})((\\(|$))`, 'g'));

/**
 * Colourises an input line the way eva's rustyline highlighter does:
 * operators magenta, constants yellow, functions blue, `help` cyan, and the
 * whole line red while it does not evaluate.
 *
 * @param {import('./lex.js').FunctionContext} ctx
 * @param {number} fix
 * @param {string} line
 * @param {number | null} prevAns
 * @returns {string}
 */
export function highlight(ctx, fix, line, prevAns) {
  try {
    evalExpr(ctx, fix, line, prevAns);
  } catch (e) {
    if (e instanceof CalcError && e.kind === 'Help') {
      return line.replaceAll('help', '\x1b[36mhelp\x1b[0m');
    }
    return `\x1b[31m${line}\x1b[0m`;
  }

  let coloured = line.replace(OPERATOR_RE, '\x1b[35m$&\x1b[0m');
  for (const re of CONSTANT_RES) {
    coloured = coloured.replace(re, '\x1b[33m$1\x1b[0m$2');
  }
  for (const re of FUNCTION_RES) {
    coloured = coloured.replace(re, '\x1b[34m$1\x1b[0m$2');
  }
  return coloured;
}
