import { describe, expect, it } from 'vitest';

import { AngleUnit, CalcError, FunctionContext, MathError, evalExpr, formatFixed } from '../src/index.js';

const FIX = 10;

/** Mirrors the `eval` helper in the Rust test module. */
function evaluate(input, prevAns = null, ctx = new FunctionContext()) {
  const ans = evalExpr(ctx, FIX, input, prevAns);
  return Number(formatFixed(ans, FIX));
}

function errorOf(input, prevAns = null, ctx = new FunctionContext()) {
  try {
    evaluate(input, prevAns, ctx);
  } catch (e) {
    if (e instanceof CalcError) return e;
    throw e;
  }
  throw new Error(`expected ${input} to fail`);
}

describe('ported Rust unit tests', () => {
  it('basic_ops', () => {
    expect(evaluate('6*2 + 3 + 12 -3', 0)).toBe(24);
  });

  it('trignometric_fns', () => {
    expect(evaluate('sin(30) + tan(45', 0)).toBe(1.5);
  });

  it('brackets', () => {
    expect(evaluate('(((1 + 2 + 3) ^ 2 ) - 4)', 0)).toBe(32);
  });

  it('exponentiation is right associative', () => {
    expect(evaluate('2 ** 2 ** 3')).toBe(256);
  });

  it('floating_ops', () => {
    expect(evaluate('1.2816 + 1 + 1.2816/1.2', 0)).toBe(3.3496);
  });

  it('inverse_trignometric_fns', () => {
    expect(evaluate('deg(asin(1) + acos(1))', 0)).toBe(90);
  });

  it('sigmoid_fns', () => {
    expect(evaluate('1 / (1 + e^-7)', 0)).toBe(0.9990889488);
  });

  it('prev_ans', () => {
    expect(evaluate('_ + 9', 9)).toBe(18);
  });

  it('eval_with_zero_prev', () => {
    expect(evaluate('9 + _ ', 0)).toBe(9);
  });

  it('eval_const_multiplication', () => {
    expect(evaluate('e2')).toBe(5.4365636569);
  });

  it('eval_round', () => {
    expect(evaluate('round(0.5)+round(2.4)')).toBe(3);
  });

  it('eval_exp2', () => {
    expect(evaluate('exp2(8)')).toBe(256);
  });

  it('eval_exp', () => {
    expect(evaluate('exp(3)')).toBe(20.0855369232);
  });

  it('eval_e_times_n', () => {
    expect(evaluate('e0')).toBe(0);
  });

  it('eval_factorial_large', () => {
    expect(evaluate('21!')).toBe(51090942171709440000);
  });

  it('eval_nroot', () => {
    expect(evaluate('nroot(27, 3)')).toBe(3);
  });

  it('eval_log_n_base', () => {
    expect(evaluate('log(2^16,4)')).toBe(8);
  });

  it('eval_log_n_brackets', () => {
    expect(evaluate('log(1+(2^16),4)')).toBe(8.0000110068);
  });

  it('eval_mismatched_parens_in_multiarg_fn', () => {
    expect(errorOf('log(1+(2^16, 4)').equals(CalcError.Syntax('Mismatched parentheses!'))).toBe(true);
  });

  it('eval_comma_without_multiarg_fn', () => {
    expect(errorOf('1+(2^16, 4)').equals(CalcError.Syntax('Mismatched parentheses!'))).toBe(true);
  });

  it('eval_unexpected_comma', () => {
    expect(
      errorOf('(1+1,2+2)').equals(CalcError.Parser('Too many operators, too few operands')),
    ).toBe(true);
  });

  it('eval_nroot_expr_on_both_sides', () => {
    expect(evaluate('nroot(2+2,4+e^2)')).toBe(1.1294396449);
  });

  it('eval_comma_left_paren_mixup', () => {
    expect(errorOf('exp 2,3)').equals(CalcError.Syntax('Mismatched parentheses!'))).toBe(true);
    expect(errorOf('exp,2,3)').equals(CalcError.Syntax('Mismatched parentheses!'))).toBe(true);
  });

  it('eval_log2', () => {
    expect(evaluate('log2(1024)')).toBe(10);
  });

  it('eval_log10', () => {
    expect(evaluate('log10(1000)')).toBe(3);
  });

  it('eval_empty_argument', () => {
    expect(errorOf('log(2,,3)').equals(CalcError.Syntax('Empty argument'))).toBe(true);
  });

  it('eval_mismatched_args', () => {
    expect(
      errorOf('nroot(23,3,4)').equals(CalcError.Parser('Too many operators, too few operands')),
    ).toBe(true);
    expect(
      errorOf('nroot(23)').equals(CalcError.Parser('To few arguments for function, need 2')),
    ).toBe(true);
  });

  it('eval_negative_factorial', () => {
    expect(errorOf('-1!').equals(CalcError.Math(MathError.OutOfBounds))).toBe(true);
  });
});

describe('edge cases', () => {
  it('divides by zero', () => {
    expect(errorOf('1/0').toString()).toBe('Math Error: Divide by zero error!');
    expect(errorOf('0/0').toString()).toBe('Math Error: Divide by zero error!');
  });

  it('reports domain errors', () => {
    expect(errorOf('1+ln(-1)').toString()).toBe('Domain Error: Out of bounds!');
    expect(errorOf('sqrt(-1)').toString()).toBe('Domain Error: Out of bounds!');
    expect(errorOf('asin(2)').toString()).toBe('Domain Error: Out of bounds!');
  });

  it('reports overflow for unrepresentable factorials', () => {
    // eva multiplies f64s in sequence, so rounding accumulates and the result
    // differs from the mathematically exact 170! (...999e306). Rust does the
    // same, and both land on this value.
    expect(evaluate('170!')).toBe(7.257415615307994e306);
    expect(errorOf('171!').toString()).toMatch(/^Error: to large to process! Max value: 17976931/);
  });

  it('rejects fractional and negative factorials', () => {
    expect(errorOf('3.5!').equals(CalcError.Math(MathError.OutOfBounds))).toBe(true);
    expect(evaluate('0!')).toBe(1);
  });

  it('rejects malformed input', () => {
    expect(errorOf('1..2').toString()).toBe('Parser Error: Too many operators, too few operands');
    expect(errorOf('unknownfn(2)').toString()).toBe("Syntax Error: Unknown function 'unknownfn'");
    expect(errorOf('log10100').toString()).toBe("Syntax Error: Function 'log10' expected parentheses");
    expect(errorOf('sin2').toString()).toBe("Syntax Error: Function 'sin' expected parentheses");
    expect(errorOf('2,3').toString()).toBe('Syntax Error: Mismatched parentheses!');
    expect(errorOf(')').toString()).toBe('Syntax Error: Mismatched parentheses!');
  });

  it('has no previous answer binding by default', () => {
    expect(errorOf('_ + 1').toString()).toBe('Syntax Error: No previous answer!');
  });

  it('treats an empty expression as zero', () => {
    expect(evaluate('')).toBe(0);
    expect(evaluate('   ')).toBe(0);
  });

  it('signals help', () => {
    expect(errorOf('help').kind).toBe('Help');
    expect(errorOf('help').toString()).toContain('Constants');
    expect(errorOf('help').toString()).toContain('Operators');
  });

  it('auto-inserts multiplication and balances parens', () => {
    expect(evaluate('12sin(45(2))')).toBe(12);
    expect(evaluate('ceil(sqrt(3^2 + 5^2')).toBe(6);
    expect(evaluate('5sin(45) + cos(0)')).toBe(4.5355339059);
    expect(evaluate('2(3)')).toBe(6);
    expect(evaluate('(2)(3)')).toBe(6);
  });

  it('handles unary operators', () => {
    expect(evaluate('-1')).toBe(-1);
    expect(evaluate('--1')).toBe(1);
    expect(evaluate('2--1')).toBe(3);
    expect(evaluate('2^-1')).toBe(0.5);
  });

  it('honours the angle unit', () => {
    const radian = new FunctionContext(AngleUnit.Radian);
    expect(evaluate('sin(0)', null, radian)).toBe(0);
    expect(evaluate('cos(0)', null, radian)).toBe(1);
    expect(evaluate('sin(30)')).toBe(0.5);
    const gradian = new FunctionContext(AngleUnit.Gradian);
    expect(evaluate('sin(30)', null, gradian)).toBe(0.5);
  });

  it('does not support radix literals, matching upstream', () => {
    expect(errorOf('0x10').toString()).toBe("Syntax Error: Unexpected character 'x1'");
    expect(errorOf('0b101').toString()).toBe("Syntax Error: Unexpected character 'b1'");
    expect(errorOf('0o17').toString()).toBe("Syntax Error: Unexpected character 'o1'");
  });
});
