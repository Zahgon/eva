/* Port of eva's src/fmt.rs
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { CalcError, MathError } from './error.js';
import { formatFixed, parseF64 } from './float.js';

const TABLE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Walks left from the decimal point inserting a comma every three characters.
 *
 * Applied to the space-padded string produced for non-decimal bases, this also
 * inserts commas into the padding, which is why `eva -b 16 255` prints
 * " ,   ,   , FF.0". That is upstream behaviour and is reproduced here.
 */
function thousandSep(s) {
  const inc = 3;
  let end = s.indexOf('.');
  const sign = s.startsWith('-') ? 1 : 0;
  const iterations = Math.floor((end - sign - 1) / inc);
  for (let i = 0; i < iterations; i++) {
    end -= inc;
    s = s.slice(0, end) + ',' + s.slice(end);
  }
  return s;
}

/**
 * Renders a result the way eva prints it.
 *
 * @param {number} base output radix, 2 - 36 (10 uses the decimal path)
 * @param {number} fix decimal places
 * @param {number} ans
 * @returns {string} the line that `pprint` would print
 * @throws {CalcError} for bases below 2, where the upstream loop cannot terminate
 */
export function format(base, fix, ans) {
  if (!Number.isFinite(ans)) {
    if (Number.isNaN(ans)) return 'nan';
    return ans > 0 ? 'inf' : '-inf';
  }

  if (base === 10) {
    return thousandSep(formatFixed(ans, fix));
  }

  if (base < 2) {
    // Upstream divides by the radix until the value drops below it, which never
    // happens for base 1: `eva -b 1 5` hangs forever. Report the (otherwise
    // unused) UnknownBase error instead of hanging.
    throw CalcError.Math(MathError.UnknownBase);
  }

  const rounded = parseSigned(formatFixed(ans, fix));
  const negative = isSignNegative(rounded);

  let integral = BigInt(Math.trunc(Math.abs(rounded)));
  const radix = BigInt(base);
  let obaseInt = '';
  while (integral >= radix) {
    obaseInt += TABLE[Number(integral % radix)];
    integral /= radix;
  }
  obaseInt += TABLE[Number(integral)];
  if (negative) obaseInt += '-';
  obaseInt = [...obaseInt].reverse().join('');

  let frac = Math.abs(rounded) - Math.trunc(Math.abs(rounded));
  let obaseFract = '';
  let i = 0;
  for (;;) {
    frac *= base;
    obaseFract += TABLE[Math.trunc(frac)];
    i += 1;
    const rest = frac - Math.trunc(frac);
    if (rest === 0 || i >= fix) break;
    frac = rest;
  }

  return thousandSep(`${obaseInt.padStart(10, ' ')}.${obaseFract}`);
}

/** Prints a result exactly as the Rust `pprint` does. */
export function pprint(base, fix, ans) {
  process.stdout.write(format(base, fix, ans) + '\n');
}

function parseSigned(s) {
  const negative = s.startsWith('-');
  const magnitude = parseF64(negative ? s.slice(1) : s);
  return negative ? -magnitude : magnitude;
}

function isSignNegative(x) {
  return x < 0 || Object.is(x, -0);
}
