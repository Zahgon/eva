/* Port of eva's src/lex.rs
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { CalcError, MathError } from './error.js';
import { fract, parseF64, rustRound } from './float.js';

/** Mirrors the Rust `AngleUnit` enum. */
export const AngleUnit = Object.freeze({
  Degree: 'Degree',
  Radian: 'Radian',
  Gradian: 'Gradian',
});

/** Mirrors the Rust `FunctionContext` struct. `Degree` is the default. */
export class FunctionContext {
  constructor(angleUnit = AngleUnit.Degree) {
    this.angleUnit = angleUnit;
  }
}

/* -------------------------------------------------------------------------- */
/* Tokens                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Tokens are plain tagged objects. `kind` is one of
 * `num` | `op` | `fn` | `lparen` | `rparen` | `comma`.
 */
export const Token = {
  num: (value) => ({ kind: 'num', value }),
  lparen: () => ({ kind: 'lparen' }),
  rparen: () => ({ kind: 'rparen' }),
  comma: () => ({ kind: 'comma' }),
  fromOp: (token, operation, precedence, isLeftAssociative) => ({
    kind: 'op',
    token,
    operation,
    precedence,
    isLeftAssociative,
  }),
  fn: (token, relation, arity) => ({ kind: 'fn', token, relation, arity }),
};

/**
 * Mirrors `Operator::operate`.
 *
 * @param {object} op an `op` token
 * @param {number} x
 * @param {number} y
 * @returns {number}
 * @throws {CalcError}
 */
export function operate(op, x, y) {
  if (op.token === '/' && y === 0) {
    throw CalcError.Math(MathError.DivideByZero);
  } else if (op.token === '!' && (x < 0 || fract(x) !== 0)) {
    throw CalcError.Math(MathError.OutOfBounds);
  } else if (op.token === '!' && x === 0) {
    // Must return 1 manually as 0..=n where n is 0.0 doesn't work AFAIK.
    return 1;
  }
  const result = op.operation(x, y);
  if (!Number.isFinite(result)) {
    throw CalcError.Math(MathError.TooLarge);
  }
  return result;
}

/**
 * Mirrors `Function::apply`.
 *
 * @param {object} func a `fn` token
 * @param {FunctionContext} ctx
 * @param {number[]} args
 * @returns {number}
 * @throws {CalcError}
 */
export function apply(func, ctx, args) {
  const result =
    func.arity === 1 ? func.relation(ctx, args[0]) : func.relation(ctx, args[0], args[1]);
  if (Number.isFinite(result)) return result;
  throw CalcError.Math(MathError.OutOfBounds);
}

/* -------------------------------------------------------------------------- */
/* Tables                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Rust's `HashMap` iteration order is randomised per process, so `eva help`
 * lists functions in a different order on every run. `Map` preserves insertion
 * order, which makes the help output deterministic here. Insertion order below
 * matches the order of the `add_fn` / `add_op` calls in lex.rs.
 */
export const CONSTANTS = new Map([
  ['e', Token.num(Math.E)],
  ['pi', Token.num(Math.PI)],
]);

/** Rust's `f64::to_radians`: `self * (PI / 180)`. */
const toRadians = (x) => x * (Math.PI / 180);
/** Rust's `f64::to_degrees`: `self * (180 / PI)`. */
const toDegrees = (x) => x * (180 / Math.PI);

/** Convert to radian if radian_mode is enabled. */
function rad(ctx, x) {
  // TODO gradian
  return ctx.angleUnit === AngleUnit.Radian ? x : toRadians(x);
}

const FUNCTION_DEFS = [
  ['sin', 1, (ctx, x) => Math.sin(rad(ctx, x))],
  ['cos', 1, (ctx, x) => Math.cos(rad(ctx, x))],
  ['tan', 1, (ctx, x) => Math.tan(rad(ctx, x))],
  ['csc', 1, (ctx, x) => 1 / Math.sin(rad(ctx, x))],
  ['sec', 1, (ctx, x) => 1 / Math.cos(rad(ctx, x))],
  ['cot', 1, (ctx, x) => 1 / Math.tan(rad(ctx, x))],
  ['sinh', 1, (_ctx, x) => Math.sinh(x)],
  ['cosh', 1, (_ctx, x) => Math.cosh(x)],
  ['tanh', 1, (_ctx, x) => Math.tanh(x)],
  ['ln', 1, (_ctx, x) => Math.log(x)],
  ['log2', 1, (_ctx, x) => Math.log2(x)],
  ['log10', 1, (_ctx, x) => Math.log10(x)],
  ['sqrt', 1, (_ctx, x) => Math.sqrt(x)],
  ['ceil', 1, (_ctx, x) => Math.ceil(x)],
  ['floor', 1, (_ctx, x) => Math.floor(x)],
  ['rad', 1, (_ctx, x) => toRadians(x)],
  ['deg', 1, (_ctx, x) => toDegrees(x)],
  ['abs', 1, (_ctx, x) => Math.abs(x)],
  ['asin', 1, (_ctx, x) => Math.asin(x)],
  ['acos', 1, (_ctx, x) => Math.acos(x)],
  ['atan', 1, (_ctx, x) => Math.atan(x)],
  ['acsc', 1, (_ctx, x) => Math.asin(1 / x)],
  ['asec', 1, (_ctx, x) => Math.acos(1 / x)],
  ['acot', 1, (_ctx, x) => Math.atan(1 / x)],
  ['exp', 1, (_ctx, x) => Math.exp(x)],
  ['exp2', 1, (_ctx, x) => Math.pow(2, x)],
  ['round', 1, (_ctx, x) => rustRound(x)],
  // Rust's `f64::log(self, base)` is `self.ln() / base.ln()`.
  ['log', 2, (_ctx, x, y) => Math.log(x) / Math.log(y)],
  ['nroot', 2, (_ctx, x, y) => Math.pow(x, 1 / y)],
];

export const FUNCTIONS = new Map(
  FUNCTION_DEFS.map(([token, arity, relation]) => [token, Token.fn(token, relation, arity)]),
);

/**
 * Mirrors the Rust `factorial` helper.
 *
 * The Rust version iterates `1..=n.round() as u128`, which spins forever for
 * huge inputs. The product saturates to infinity after 171 steps and infinity
 * is absorbing, so bailing out early yields the identical result without the
 * hang.
 */
function factorial(n) {
  const limit = rustRound(n);
  let answer = 1;
  for (let i = 1; i <= limit; i++) {
    answer *= i;
    if (!Number.isFinite(answer)) return Infinity;
  }
  if (answer === 0) return Infinity;
  return answer;
}

const OPERATOR_DEFS = [
  ['+', (x, y) => x + y, 2, true],
  ['-', (x, y) => x - y, 2, true],
  ['*', (x, y) => x * y, 3, true],
  ['/', (x, y) => x / y, 3, true],
  ['%', (x, y) => x % y, 3, true],
  ['^', (x, y) => Math.pow(x, y), 4, false],
  ['!', (x, _y) => factorial(x), 4, true],
];

export const OPERATORS = new Map(
  OPERATOR_DEFS.map(([token, operation, precedence, isLeft]) => [
    token,
    Token.fromOp(token, operation, precedence, isLeft),
  ]),
);

/** Does any function name start with `prefix`? */
function anyFunctionStartsWith(prefix) {
  for (const key of FUNCTIONS.keys()) {
    if (key.startsWith(prefix)) return true;
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* Lexer                                                                       */
/* -------------------------------------------------------------------------- */

const isDigitOrDot = (c) => (c >= '0' && c <= '9') || c === '.';
const isAlpha = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

/**
 * Mirrors `lex::lexer`.
 *
 * @param {string} input
 * @param {number | null} prevAns
 * @returns {object[]} token list
 * @throws {CalcError}
 */
export function lexer(input, prevAns) {
  let numVec = '';
  let charVec = '';
  const result = [];
  let lastCharIsOp = true;

  const drainStack = () => {
    const parsed = parseF64(numVec);
    if (parsed !== null) {
      result.push(Token.num(parsed));
      numVec = '';
    } else if (CONSTANTS.has(charVec)) {
      result.push(CONSTANTS.get(charVec));
      charVec = '';
    }
  };

  // Iterate by code point, matching Rust's `chars()`.
  const chars = Array.from(input);

  for (let i = 0; i < chars.length; i++) {
    let letter = chars[i];

    if (isDigitOrDot(letter)) {
      if (charVec !== '') {
        if (FUNCTIONS.has(charVec)) {
          charVec += letter;
          if (!FUNCTIONS.has(charVec) && !anyFunctionStartsWith(charVec)) {
            throw CalcError.Syntax(
              `Function '${charVec.slice(0, charVec.length - 1)}' expected parentheses`,
            );
          }
        } else if (CONSTANTS.has(charVec)) {
          result.push(CONSTANTS.get(charVec));
          result.push(OPERATORS.get('*'));
          charVec = '';
          numVec += letter;
          lastCharIsOp = false;
        } else {
          charVec += letter;
          if (!FUNCTIONS.has(charVec)) {
            throw CalcError.Syntax(`Unexpected character '${charVec}'`);
          }
        }
      } else {
        numVec += letter;
        lastCharIsOp = false;
      }
    } else if (letter === '_') {
      if (prevAns === null || prevAns === undefined) {
        throw CalcError.Syntax('No previous answer!');
      }
      if (charVec !== '') {
        if (FUNCTIONS.has(charVec)) {
          throw CalcError.Syntax(`Function '${charVec}' expected parentheses`);
        } else {
          throw CalcError.Syntax(`Unexpected character '${charVec}'`);
        }
      }
      const parsed = parseF64(numVec);
      if (parsed !== null) {
        result.push(Token.num(parsed));
        result.push(OPERATORS.get('*'));
        numVec = '';
      }
      lastCharIsOp = false;
      result.push(Token.num(prevAns));
    } else if (isAlpha(letter)) {
      const parsed = parseF64(numVec);
      if (parsed !== null) {
        result.push(Token.num(parsed));
        result.push(OPERATORS.get('*'));
        numVec = '';
      }
      charVec += letter;
      lastCharIsOp = false;
    } else if (letter === '+' || letter === '-') {
      const opToken = OPERATORS.get(letter);
      const parsed = parseF64(numVec);
      if (!lastCharIsOp) {
        if (parsed !== null) {
          result.push(Token.num(parsed));
          numVec = '';
          lastCharIsOp = true;
        } else if (CONSTANTS.has(charVec)) {
          result.push(CONSTANTS.get(charVec));
          charVec = '';
          lastCharIsOp = true;
        }
        result.push(opToken);
      } else {
        // Unary plus/minus: rewrite as `(±1) *` with a high-precedence `*`.
        result.push(Token.lparen());
        result.push(Token.num(Number(`${letter}1`)));
        result.push(Token.rparen());
        result.push(Token.fromOp('*', (x, y) => x * y, 10, true));
      }
    } else if (
      letter === '/' ||
      letter === '*' ||
      letter === '%' ||
      letter === '^' ||
      letter === '!'
    ) {
      drainStack();
      if (letter === '*' && chars[i + 1] === '*') {
        // Accept `**` operator as meaning `^` (exponentation).
        i += 1;
        letter = '^';
      }
      result.push(OPERATORS.get(letter));
      lastCharIsOp = true;
      if (letter === '!') {
        result.push(Token.num(1));
        lastCharIsOp = false;
      }
    } else if (letter === '(') {
      if (charVec !== '') {
        if (FUNCTIONS.has(charVec)) {
          result.push(FUNCTIONS.get(charVec));
        } else {
          throw CalcError.Syntax(`Unknown function '${charVec}'`);
        }
        charVec = '';
      } else {
        const parsed = parseF64(numVec);
        if (parsed !== null) {
          result.push(Token.num(parsed));
          result.push(OPERATORS.get('*'));
          numVec = '';
        }
      }

      const last = result[result.length - 1];
      if (last && last.kind === 'rparen') {
        result.push(OPERATORS.get('*'));
      }
      result.push(Token.lparen());
      lastCharIsOp = true;
    } else if (letter === ',') {
      drainStack();
      result.push(Token.comma());
    } else if (letter === ')') {
      drainStack();
      result.push(Token.rparen());
      lastCharIsOp = false;
    } else if (letter === ' ') {
      // skip
    } else {
      throw CalcError.Syntax(`Unexpected token: '${letter}'`);
    }
  }

  drainStack();
  return result;
}
