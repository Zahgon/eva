import { describe, expect, it } from 'vitest';

import { CalcError, MathError } from '../src/error.js';
import { displayF64, formatFixed, parseF64, rustRound } from '../src/float.js';
import { format } from '../src/fmt.js';

describe('formatFixed matches Rust\'s {:.*}', () => {
  it('rounds exact ties to even, unlike toFixed', () => {
    expect(formatFixed(0.125, 2)).toBe('0.12');
    expect((0.125).toFixed(2)).toBe('0.13');
    expect(formatFixed(0.375, 2)).toBe('0.38');
  });

  it('rounds non-ties by true binary value', () => {
    expect(formatFixed(0.135, 2)).toBe('0.14');
    expect(formatFixed(2.675, 2)).toBe('2.67');
    expect(formatFixed(1.0005, 2)).toBe('1.00');
  });

  it('keeps the sign of negatives that round to zero', () => {
    expect(formatFixed(-0.001, 2)).toBe('-0.00');
    expect(formatFixed(-0, 2)).toBe('-0.00');
    expect(formatFixed(0, 2)).toBe('0.00');
  });

  it('never falls back to exponential notation', () => {
    expect(formatFixed(1e21, 1)).toBe('1000000000000000000000.0');
    expect((1e21).toFixed(1)).toBe('1e+21');
  });

  it('prints large integral doubles exactly', () => {
    expect(formatFixed(51090942171709440000, 10)).toBe('51090942171709440000.0000000000');
  });
});

describe('displayF64 matches Rust\'s {}', () => {
  it('expands large values without an exponent', () => {
    const max = displayF64(Number.MAX_VALUE);
    expect(max.startsWith('17976931348623157')).toBe(true);
    expect(max).toHaveLength(309);
    expect(max).not.toContain('e');
  });

  it('expands small values without an exponent', () => {
    expect(displayF64(1e-10)).toBe('0.0000000001');
    expect(displayF64(-2.5)).toBe('-2.5');
    expect(displayF64(1)).toBe('1');
  });
});

describe('parseF64 matches Rust str::parse', () => {
  it('accepts what Rust accepts', () => {
    expect(parseF64('1')).toBe(1);
    expect(parseF64('1.')).toBe(1);
    expect(parseF64('.5')).toBe(0.5);
    expect(parseF64('1.5')).toBe(1.5);
  });

  it('rejects what Rust rejects', () => {
    for (const bad of ['', '.', '..', '1.2.3']) {
      expect(parseF64(bad)).toBeNull();
    }
  });
});

describe('rustRound rounds half away from zero', () => {
  it('differs from Math.round on negative halves', () => {
    expect(rustRound(-2.5)).toBe(-3);
    expect(Math.round(-2.5)).toBe(-2);
    expect(rustRound(2.5)).toBe(3);
    expect(rustRound(0.5)).toBe(1);
  });
});

describe('radix conversion', () => {
  it('renders decimal with thousand separators', () => {
    expect(format(10, 10, 1234567.5)).toBe('1,234,567.5000000000');
  });

  it('reproduces the padded, comma-riddled non-decimal output', () => {
    expect(format(2, 10, 10.25)).toBe(' ,   ,  1,010.01');
    expect(format(16, 10, 255)).toBe(' ,   ,   , FF.0');
    expect(format(36, 10, 1295.5)).toBe(' ,   ,   , ZZ.I');
  });

  it('places the sign next to the digits, inside the padding', () => {
    expect(format(16, 10, -255.5)).toBe(' ,   ,   ,-FF.8');
  });

  it('renders non-finite results', () => {
    expect(format(10, 10, Infinity)).toBe('inf');
    expect(format(10, 10, -Infinity)).toBe('-inf');
    expect(format(10, 10, NaN)).toBe('nan');
  });

  it('reports UnknownBase instead of hanging on base 1', () => {
    let caught;
    try {
      format(1, 10, 5);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(CalcError);
    expect(caught.mathError).toBe(MathError.UnknownBase);
  });
});
