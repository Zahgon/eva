import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AngleUnit, CalcError, FunctionContext, evalExpr } from '../src/index.js';
import { format } from '../src/fmt.js';

const RUST_BIN = process.env.EVA_RUST_BIN;
if (!RUST_BIN) throw new Error('set EVA_RUST_BIN');

const EXPRESSIONS = [
  '6*2 + 3 + 12 -3', 'sin(30) + tan(45', '(((1 + 2 + 3) ^ 2 ) - 4)', '2 ** 2 ** 3',
  '1.2816 + 1 + 1.2816/1.2', 'deg(asin(1) + acos(1))', '1 / (1 + e^-7)', 'e2', 'e0',
  'round(0.5)+round(2.4)', 'exp2(8)', 'exp(3)', '21!', 'nroot(27, 3)', 'log(2^16,4)',
  'log(1+(2^16),4)', 'log(1+(2^16, 4)', '1+(2^16, 4)', '(1+1,2+2)', 'nroot(2+2,4+e^2)',
  'exp 2,3)', 'exp,2,3)', 'log2(1024)', 'log10(1000)', 'log(2,,3)', 'nroot(23,3,4)',
  'nroot(23)', '-1!', '5!', '0!', '1!', '170!', '171!', '3.5!', '-0!',
  '1/0', '0/0', '1+ln(-1)', 'sqrt(-1)', 'ln(0)', 'log(0,10)', 'asin(2)', 'acos(5)',
  '5sin(45) + cos(0)', '12sin(45(2))', 'ceil(sqrt(3^2 + 5^2', 'pi * 5^2', 'log10100',
  'sin2', 'exp2', 'log2', 'exp23', 'log23', '2,3', '(2,3)', 'exp2,3',
  'pi', 'e', 'pi2', '2pi', '2e', 'pie', 'epi', 'e+1', '1+e', 'e*2',
  '--1', '+-1', '-+1', '---1', '- 1', '+1', '-1', '2--1', '2-+1', '2*-1', '2^-1',
  '1+', '+', '*', '()', '(', ')', '1..2', '.5', '5.', '1.2.3', '.', '..',
  '2^3^2', '2^2^3', '100%7', '-100%7', '10%3.5', '2**3', '2***3', '2**-1',
  'sin(0)', 'cos(0)', 'tan(0)', 'csc(30)', 'sec(60)', 'cot(45)',
  'sinh(1)', 'cosh(1)', 'tanh(1)', 'asin(1)', 'acos(0)', 'atan(1)',
  'acsc(2)', 'asec(2)', 'acot(1)', 'ln(e)', 'sqrt(2)', 'abs(0-5)',
  'ceil(1.2)', 'floor(1.8)', 'round(2.5)', 'round(3.5)', 'round(0-2.5)',
  'rad(180)', 'deg(3.14159)', 'exp2(0.5)', 'nroot(8,3)', 'log(8,2)',
  '1e5', '0x10', '0b101', '0o17', '1_000',
  '123456789*987654321', '0.1+0.2', '1/3', '2/3', '1/7', '99999999999999999999',
  'sin(30)+sin(30)+sin(30)', '((((1))))', '(1)(2)', '2(3)', '(2)3',
  '1+2*3-4/2^2', 'sqrt(sin(30))', 'unknownfn(2)', 'foo', 'sin', 'help',
  '3!+2', '3!*2', '2^3!', '3!^2', '(2+3)!',
];

const FLAG_SETS = [
  [], ['-f', '2'], ['-f', '1'], ['-f', '20'], ['-b', '2'], ['-b', '16'], ['-b', '8'],
  ['-b', '36'], ['-a', 'radian'], ['-a', 'gradian'], ['-b', '16', '-f', '4'],
];

const CAPTURE = join(tmpdir(), `eva-difftest-${process.pid}`);

/**
 * Runs the reference binary with stdout and stderr pointed at one real file
 * rather than at pipes. Piped capture is not reliable across every runtime this
 * harness runs under: buffered child output can be lost when the child exits,
 * which shows up as a sporadic empty reading and an apparent mismatch on a
 * different expression each run. A file descriptor has no such race, and
 * sharing one fd across both streams preserves their interleaving.
 */
function runRust(args, expr) {
  const fd = openSync(CAPTURE, 'w+');
  let status;
  try {
    status = spawnSync(RUST_BIN, [...args, '--', expr], { stdio: ['ignore', fd, fd] }).status;
  } finally {
    closeSync(fd);
  }
  return { code: status ?? -1, out: readFileSync(CAPTURE, 'utf8') };
}

function runJs(args, expr) {
  let fix = 10;
  let base = 10;
  let unit = AngleUnit.Degree;
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '-f') fix = Number(args[i + 1]);
    else if (args[i] === '-b') base = Number(args[i + 1]);
    else if (args[i] === '-a') {
      unit = { degree: AngleUnit.Degree, radian: AngleUnit.Radian, gradian: AngleUnit.Gradian }[
        args[i + 1]
      ];
    }
  }
  const ctx = new FunctionContext(unit);
  try {
    const ans = evalExpr(ctx, fix, expr, 0);
    return { code: 0, out: format(base, fix, ans) + '\n' };
  } catch (e) {
    if (e instanceof CalcError) return { code: 1, out: e.toString() + '\n' };
    throw e;
  }
}

let pass = 0;
const failures = [];
for (const flags of FLAG_SETS) {
  for (const expr of EXPRESSIONS) {
    const r = runRust(flags, expr);
    const j = runJs(flags, expr);
    // `help` lists functions in a random order upstream (Rust HashMap); compare
    // as a sorted multiset of words instead of verbatim.
    const norm = (s) => (expr === 'help' ? s.split(/\s+/).sort().join(' ') : s);
    if (norm(r.out) === norm(j.out)) pass++;
    else failures.push({ flags: flags.join(' '), expr, rust: r.out, js: j.out });
  }
}

rmSync(CAPTURE, { force: true });

console.log(`pass ${pass} / ${pass + failures.length}`);
for (const f of failures.slice(0, 60)) {
  console.log(`--- [${f.flags}] ${JSON.stringify(f.expr)}`);
  console.log(`  rust: ${JSON.stringify(f.rust)}`);
  console.log(`  js:   ${JSON.stringify(f.js)}`);
}
if (failures.length) console.log(`total failures: ${failures.length}`);
