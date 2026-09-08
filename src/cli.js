/* Port of eva's argument parsing (src/main.rs, via clap).
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { AngleUnit } from './lex.js';

export const NAME = 'eva';
export const VERSION = '0.3.1';
const ABOUT = 'Calculator REPL similar to bc(1)';
const USAGE = 'Usage: eva [OPTIONS] [INPUT]';

const ANGLE_UNITS = new Map([
  ['degree', AngleUnit.Degree],
  ['radian', AngleUnit.Radian],
  ['gradian', AngleUnit.Gradian],
]);

export const HELP = `${ABOUT}

${USAGE}

Arguments:
  [INPUT]  Optional expression string to run eva in command mode

Options:
  -f, --fix <FIX>                Number of decimal places in output (1 - 64) [default: 10]
  -b, --base <RADIX>             Radix of calculation output (1 - 36) [default: 10]
  -a, --angle_unit <angle_unit>  Angle unit [default: degree] [possible values: degree, radian, gradian]
  -r, --radian                   Shorthand for --angle_unit radian
  -h, --help                     Print help
  -V, --version                  Print version
`;

/** Thrown for any usage error; carries clap's exit code of 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

/** Signals `--help` / `--version`, which clap prints to stdout and exits 0. */
export class EarlyExit extends Error {
  constructor(output) {
    super(output);
    this.name = 'EarlyExit';
    this.output = output;
    this.exitCode = 0;
  }
}

const TRY_HELP = "For more information, try '--help'.";

function invalidValue(value, arg, reason) {
  return new UsageError(`error: invalid value '${value}' for '${arg}': ${reason}\n\n${TRY_HELP}\n`);
}

function unexpectedArgument(arg) {
  const tip = arg.startsWith('-') ? `\n  tip: to pass '${arg}' as a value, use '-- ${arg}'\n` : '';
  return new UsageError(
    `error: unexpected argument '${arg}' found\n${tip}\n${USAGE}\n\n${TRY_HELP}\n`,
  );
}

function missingValue(arg) {
  return new UsageError(
    `error: a value is required for '${arg}' but none was supplied\n\n${TRY_HELP}\n`,
  );
}

/**
 * Parses a bounded integer the way clap's `RangedU64ValueParser` does, including
 * its two distinct failure messages.
 */
function parseRanged(raw, argLabel, min, max) {
  if (!/^[+-]?\d+$/.test(raw)) {
    throw invalidValue(raw, argLabel, 'invalid digit found in string');
  }
  const n = Number(raw);
  if (n < min || n > max) {
    throw invalidValue(raw, argLabel, `${raw} is not in ${min}..=${max}`);
  }
  return n;
}

/**
 * @param {string[]} argv arguments after the executable and script names
 * @returns {{ angleUnit: string, fix: number, base: number, input: string }}
 * @throws {UsageError | EarlyExit}
 */
export function parseArguments(argv) {
  const config = { angleUnit: AngleUnit.Degree, fix: 10, base: 10, input: '' };
  let inputSeen = false;
  let noMoreFlags = false;

  const takeValue = (i, label) => {
    if (i + 1 >= argv.length) throw missingValue(label);
    return argv[i + 1];
  };

  const setPositional = (value) => {
    if (inputSeen) throw unexpectedArgument(value);
    inputSeen = true;
    config.input = value;
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (noMoreFlags) {
      setPositional(arg);
      continue;
    }
    if (arg === '--') {
      noMoreFlags = true;
      continue;
    }

    let name = arg;
    let inlineValue = null;
    const eq = arg.indexOf('=');
    if (arg.startsWith('--') && eq !== -1) {
      name = arg.slice(0, eq);
      inlineValue = arg.slice(eq + 1);
    }

    switch (name) {
      case '-h':
      case '--help':
        throw new EarlyExit(HELP);
      case '-V':
      case '--version':
        throw new EarlyExit(`${NAME} ${VERSION}\n`);
      case '-r':
      case '--radian':
        config.angleUnit = AngleUnit.Radian;
        break;
      case '-f':
      case '--fix': {
        const raw = inlineValue ?? takeValue(i, '--fix <FIX>');
        if (inlineValue === null) i++;
        config.fix = parseRanged(raw, '--fix <FIX>', 1, 64);
        break;
      }
      case '-b':
      case '--base': {
        const raw = inlineValue ?? takeValue(i, '--base <RADIX>');
        if (inlineValue === null) i++;
        config.base = parseRanged(raw, '--base <RADIX>', 1, 36);
        break;
      }
      case '-a':
      case '--angle_unit': {
        const raw = inlineValue ?? takeValue(i, '--angle_unit <angle_unit>');
        if (inlineValue === null) i++;
        const unit = ANGLE_UNITS.get(raw);
        if (unit === undefined) {
          throw new UsageError(
            `error: invalid value '${raw}' for '--angle_unit <angle_unit>'\n` +
              `  [possible values: degree, radian, gradian]\n\n${TRY_HELP}\n`,
          );
        }
        config.angleUnit = unit;
        break;
      }
      default:
        if (arg.startsWith('-') && arg !== '-') throw unexpectedArgument(arg);
        setPositional(arg);
    }
  }

  return config;
}
