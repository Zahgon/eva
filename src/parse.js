/* Port of eva's src/parse.rs
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { CalcError } from './error.js';
import { apply, operate } from './lex.js';

/**
 * Shunting-yard: convert an infix token list to postfix (RPN).
 *
 * @param {object[]} tokens
 * @returns {object[]}
 * @throws {CalcError}
 */
export function toPostfix(tokens) {
  const postfixed = [];
  const opStack = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    switch (token.kind) {
      case 'num':
        postfixed.push(token);
        break;

      case 'fn':
        opStack.push(token);
        break;

      case 'op': {
        while (opStack.length > 0) {
          const topOp = opStack[opStack.length - 1];
          if (topOp.kind === 'lparen' || topOp.kind === 'comma') break;
          if (topOp.kind === 'op') {
            const tp = topOp.precedence;
            const cp = token.precedence;
            if (tp > cp || (tp === cp && topOp.isLeftAssociative)) {
              postfixed.push(opStack.pop());
            } else {
              break;
            }
          } else if (topOp.kind === 'fn') {
            postfixed.push(opStack.pop());
          } else {
            throw new Error('unreachable');
          }
        }
        opStack.push(token);
        break;
      }

      case 'lparen':
        opStack.push(token);
        break;

      case 'rparen':
      case 'comma': {
        let pushUntilParen = false;
        while (opStack.length > 0) {
          const popped = opStack.pop();
          const nextTop = opStack[opStack.length - 1];
          const topIsFnOrEmpty = nextTop === undefined || nextTop.kind === 'fn';
          if ((topIsFnOrEmpty && popped.kind === 'comma') || popped.kind === 'lparen') {
            pushUntilParen = true;
            break;
          }
          postfixed.push(popped);
        }
        if (!pushUntilParen) {
          throw CalcError.Syntax('Mismatched parentheses!');
        }
        if (token.kind === 'comma') {
          const peeked = tokens[i + 1];
          if (peeked !== undefined && peeked.kind === 'comma') {
            throw CalcError.Syntax('Empty argument');
          }
          opStack.push(token);
        }
        break;
      }

      default:
        throw new Error('unreachable');
    }
  }

  while (opStack.length > 0) {
    postfixed.push(opStack.pop());
  }
  return postfixed;
}

/**
 * Evaluate a postfix token list.
 *
 * @param {import('./lex.js').FunctionContext} ctx
 * @param {object[]} postfixed
 * @returns {number}
 * @throws {CalcError}
 */
export function evalPostfix(ctx, postfixed) {
  const numStack = [];
  const args = [];

  for (const token of postfixed) {
    switch (token.kind) {
      case 'num':
        numStack.push(token.value);
        break;

      case 'op': {
        if (numStack.length === 0) {
          throw CalcError.Parser('Too many operators, too few operands');
        }
        const n2 = numStack.pop();
        if (numStack.length === 0) {
          throw CalcError.Parser('Too many operators, too few operands');
        }
        const n1 = numStack.pop();
        numStack.push(operate(token, n1, n2));
        break;
      }

      case 'fn': {
        const arity = token.arity;
        for (let i = 0; i < arity; i++) {
          if (numStack.length === 0) {
            throw CalcError.Parser(`To few arguments for function, need ${arity}`);
          }
          args.unshift(numStack.pop());
        }
        numStack.push(apply(token, ctx, args));
        args.length = 0;
        break;
      }

      default:
        throw new Error('unreachable: wut');
    }
  }

  if (numStack.length === 1) {
    return numStack[0];
  }
  throw CalcError.Parser('Too many operators, too few operands');
}
