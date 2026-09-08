/*
 *  eva - an easy to use calculator REPL similar to bc(1)
 *  Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 *  JavaScript port. Refer to LICENSE for more information.
 */

import { CalcError, MathError } from './error.js';
import { formatFixed, parseF64 } from './float.js';
import { AngleUnit, CONSTANTS, FUNCTIONS, FunctionContext, OPERATORS, lexer } from './lex.js';
import { evalPostfix, toPostfix } from './parse.js';

export { CalcError, MathError, AngleUnit, FunctionContext, CONSTANTS, FUNCTIONS, OPERATORS, lexer };
export { toPostfix, evalPostfix };
export { formatFixed };

function autobalanceParens(input) {
  let leftParens = 0;
  let rightParens = 0;
  for (const letter of input) {
    if (letter === '(') leftParens += 1;
    else if (letter === ')') rightParens += 1;
  }

  if (leftParens > rightParens) {
    return input + ')'.repeat(leftParens - rightParens);
  }
  if (leftParens === rightParens) {
    return input;
  }
  throw CalcError.Syntax('Mismatched parentheses!');
}

/**
 * Evaluate a math expression. Main entry function for eva.
 *
 * @param {FunctionContext} ctx
 * @param {number} fix decimal places used to round the result
 * @param {string} input
 * @param {number | null} prevAns
 * @returns {number}
 * @throws {CalcError}
 */
export function evalExpr(ctx, fix, input, prevAns = null) {
  const stripped = input.trim().replaceAll(' ', '');
  if (stripped === 'help') {
    throw CalcError.Help();
  }
  if (stripped === '') {
    return 0;
  }
  const balanced = autobalanceParens(stripped);
  const lexed = lexer(balanced, prevAns);
  const postfixed = toPostfix(lexed);
  const evaled = evalPostfix(ctx, postfixed);
  return parseF64Loose(formatFixed(evaled, fix));
}

function parseF64Loose(s) {
  const negative = s.startsWith('-');
  const parsed = parseF64(negative ? s.slice(1) : s);
  return negative ? -parsed : parsed;
}
