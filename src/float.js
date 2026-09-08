/*
 * Exact IEEE-754 double formatting helpers that reproduce Rust's behaviour.
 *
 * Two Rust formats are needed by eva:
 *   - `format!("{:.*}", fix, x)` -> `formatFixed(x, fix)`
 *   - `format!("{}", x)`         -> `displayF64(x)`
 *
 * `Number.prototype.toFixed` cannot be used for the former: the ECMAScript
 * spec rounds exact ties *away from zero*, while Rust rounds them to *even*.
 * `(0.125).toFixed(2)` is "0.13" in JS but `format!("{:.2}", 0.125)` is "0.12"
 * in Rust. `toFixed` also bails out to exponential notation at 1e21, which
 * Rust never does. So we decompose the double and round exactly with BigInt.
 */

const F64 = new Float64Array(1);
const U64 = new BigUint64Array(F64.buffer);

/**
 * Decompose a finite double into an exact `mantissa * 2**exponent` pair.
 * @returns {{ negative: boolean, mantissa: bigint, exponent: number }}
 */
function decompose(x) {
  F64[0] = x;
  const bits = U64[0];
  const negative = (bits >> 63n) === 1n;
  const biased = Number((bits >> 52n) & 0x7ffn);
  const frac = bits & 0xfffffffffffffn;

  if (biased === 0) {
    // Subnormal (or zero): no implicit leading bit.
    return { negative, mantissa: frac, exponent: -1074 };
  }
  return { negative, mantissa: frac | (1n << 52n), exponent: biased - 1075 };
}

/**
 * Reproduces Rust's `format!("{:.*}", fix, x)` for finite doubles.
 *
 * Rounds the exact binary value to `fix` decimal places using round-half-to-even,
 * and always preserves the sign bit (so `-0.001` at fix 2 renders as "-0.00",
 * matching Rust).
 *
 * @param {number} x finite double
 * @param {number} fix number of decimal places
 * @returns {string}
 */
export function formatFixed(x, fix) {
  if (Number.isNaN(x)) return 'NaN';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : '-inf';

  const { negative, mantissa, exponent } = decompose(x);
  const pow10 = 10n ** BigInt(fix);

  let scaled; // exact value * 10**fix, rounded half-to-even to an integer
  if (exponent >= 0) {
    // Exactly representable as an integer, no rounding required.
    scaled = mantissa * (1n << BigInt(exponent)) * pow10;
  } else {
    const denominator = 1n << BigInt(-exponent);
    const numerator = mantissa * pow10;
    const quotient = numerator / denominator;
    const remainder = numerator % denominator;
    const twice = remainder * 2n;
    if (twice > denominator || (twice === denominator && (quotient & 1n) === 1n)) {
      scaled = quotient + 1n;
    } else {
      scaled = quotient;
    }
  }

  let digits = scaled.toString();
  if (fix > 0) {
    digits = digits.padStart(fix + 1, '0');
    digits = `${digits.slice(0, digits.length - fix)}.${digits.slice(digits.length - fix)}`;
  }
  return negative ? `-${digits}` : digits;
}

/**
 * Reproduces Rust's `format!("{}", x)` for doubles: the shortest decimal string
 * that round-trips, never in exponential notation.
 *
 * @param {number} x
 * @returns {string}
 */
export function displayF64(x) {
  if (Number.isNaN(x)) return 'NaN';
  if (x === Infinity) return 'inf';
  if (x === -Infinity) return '-inf';
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';

  const negative = x < 0;
  const abs = Math.abs(x);

  // `toExponential()` with no argument yields the shortest round-tripping digits,
  // the same digit sequence Rust's Display uses.
  const [mantissa, exp] = abs.toExponential().split('e');
  const exponent = Number(exp);
  const digits = mantissa.replace('.', '');

  let out;
  if (exponent >= 0) {
    if (exponent + 1 >= digits.length) {
      out = digits + '0'.repeat(exponent + 1 - digits.length);
    } else {
      out = `${digits.slice(0, exponent + 1)}.${digits.slice(exponent + 1)}`;
    }
  } else {
    out = `0.${'0'.repeat(-exponent - 1)}${digits}`;
  }
  return negative ? `-${out}` : out;
}

/**
 * Reproduces Rust's `str::parse::<f64>()` for the digit/dot strings the lexer
 * accumulates. Returns `null` where Rust would return `Err`.
 *
 * Rust accepts "1", "1.", ".5", "1.5" but rejects "", ".", "1.2.3".
 *
 * @param {string} s
 * @returns {number | null}
 */
export function parseF64(s) {
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Rust's `f64::round`: round half away from zero (JS `Math.round` is half up). */
export function rustRound(x) {
  if (!Number.isFinite(x)) return x;
  const r = Math.sign(x) * Math.round(Math.abs(x));
  return r;
}

/** Rust's `f64::fract`: `self - self.trunc()` (NaN for infinities). */
export function fract(x) {
  return x - Math.trunc(x);
}
