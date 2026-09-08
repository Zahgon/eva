/*
 *  eva - an easy to use calculator REPL similar to bc(1)
 *  Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 *  JavaScript port. Refer to LICENSE for more information.
 */

import { EarlyExit, UsageError, parseArguments } from './cli.js';
import { CalcError } from './error.js';
import { format } from './fmt.js';
import { evalExpr } from './index.js';
import { FunctionContext } from './lex.js';
import { repl } from './repl.js';

export async function main(argv = process.argv.slice(2)) {
  let config;
  try {
    config = parseArguments(argv);
  } catch (e) {
    if (e instanceof EarlyExit) {
      process.stdout.write(e.output);
      return 0;
    }
    if (e instanceof UsageError) {
      process.stderr.write(e.message);
      return e.exitCode;
    }
    throw e;
  }

  const ctx = new FunctionContext(config.angleUnit);

  if (config.input !== '') {
    try {
      const ans = evalExpr(ctx, config.fix, config.input, 0);
      process.stdout.write(format(config.base, config.fix, ans) + '\n');
      return 0;
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      process.stderr.write(e.toString() + '\n');
      return 1;
    }
  }

  await repl(ctx, config.fix, config.base);
  return 0;
}
