import { describe, expect, it } from 'vitest';

import { EarlyExit, HELP, UsageError, VERSION, parseArguments } from '../src/cli.js';
import { AngleUnit } from '../src/lex.js';

function usageError(argv) {
  try {
    parseArguments(argv);
  } catch (e) {
    if (e instanceof UsageError) return e.message;
    throw e;
  }
  throw new Error(`expected ${argv.join(' ')} to fail`);
}

describe('defaults', () => {
  it('matches the Rust defaults', () => {
    expect(parseArguments([])).toEqual({
      angleUnit: AngleUnit.Degree,
      fix: 10,
      base: 10,
      input: '',
    });
  });

  it('reads a one-shot expression', () => {
    expect(parseArguments(['1 + 1']).input).toBe('1 + 1');
  });

  it('accepts an expression after --', () => {
    expect(parseArguments(['--', '-1']).input).toBe('-1');
  });
});

describe('flags', () => {
  it('parses short and long forms', () => {
    expect(parseArguments(['-f', '2']).fix).toBe(2);
    expect(parseArguments(['--fix', '2']).fix).toBe(2);
    expect(parseArguments(['--fix=2']).fix).toBe(2);
    expect(parseArguments(['-b', '16']).base).toBe(16);
    expect(parseArguments(['--base=16']).base).toBe(16);
  });

  it('parses the angle unit', () => {
    expect(parseArguments(['-a', 'radian']).angleUnit).toBe(AngleUnit.Radian);
    expect(parseArguments(['-a', 'gradian']).angleUnit).toBe(AngleUnit.Gradian);
    expect(parseArguments(['--angle_unit=degree']).angleUnit).toBe(AngleUnit.Degree);
  });

  it('accepts --radian as documented in the readme', () => {
    expect(parseArguments(['-r']).angleUnit).toBe(AngleUnit.Radian);
    expect(parseArguments(['--radian']).angleUnit).toBe(AngleUnit.Radian);
  });
});

describe('clap-compatible errors', () => {
  it('rejects out-of-range values', () => {
    expect(usageError(['-f', '0'])).toBe(
      "error: invalid value '0' for '--fix <FIX>': 0 is not in 1..=64\n\nFor more information, try '--help'.\n",
    );
    expect(usageError(['-f', '65'])).toContain('65 is not in 1..=64');
    expect(usageError(['-b', '40'])).toContain('40 is not in 1..=36');
  });

  it('rejects non-numeric values', () => {
    expect(usageError(['-b', 'abc'])).toBe(
      "error: invalid value 'abc' for '--base <RADIX>': invalid digit found in string\n\nFor more information, try '--help'.\n",
    );
  });

  it('rejects an unknown angle unit', () => {
    expect(usageError(['-a', 'foo'])).toBe(
      "error: invalid value 'foo' for '--angle_unit <angle_unit>'\n" +
        '  [possible values: degree, radian, gradian]\n\n' +
        "For more information, try '--help'.\n",
    );
  });

  it('reports a missing value', () => {
    expect(usageError(['-f'])).toBe(
      "error: a value is required for '--fix <FIX>' but none was supplied\n\nFor more information, try '--help'.\n",
    );
  });

  it('reports unexpected arguments, with a tip for flag-like ones', () => {
    expect(usageError(['--nope'])).toBe(
      "error: unexpected argument '--nope' found\n\n" +
        "  tip: to pass '--nope' as a value, use '-- --nope'\n\n" +
        'Usage: eva [OPTIONS] [INPUT]\n\n' +
        "For more information, try '--help'.\n",
    );
    expect(usageError(['1', '2'])).toBe(
      "error: unexpected argument '2' found\n\n" +
        'Usage: eva [OPTIONS] [INPUT]\n\n' +
        "For more information, try '--help'.\n",
    );
  });

  it('exits 2 like clap', () => {
    try {
      parseArguments(['-f', '0']);
    } catch (e) {
      expect(e.exitCode).toBe(2);
    }
  });
});

describe('early exits', () => {
  it('prints help', () => {
    try {
      parseArguments(['--help']);
    } catch (e) {
      expect(e).toBeInstanceOf(EarlyExit);
      expect(e.output).toBe(HELP);
      expect(e.exitCode).toBe(0);
    }
  });

  it('prints the version', () => {
    try {
      parseArguments(['-V']);
    } catch (e) {
      expect(e.output).toBe(`eva ${VERSION}\n`);
    }
  });
});
