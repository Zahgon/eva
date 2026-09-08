import { describe, expect, it } from 'vitest';

import { highlight } from '../src/highlight.js';
import { FunctionContext } from '../src/lex.js';
import { historyHint } from '../src/repl.js';

const ctx = new FunctionContext();
const colour = (line, prevAns = null) => highlight(ctx, 10, line, prevAns);

describe('highlighting', () => {
  it('paints operators magenta', () => {
    expect(colour('1+1')).toBe('1\x1b[35m+\x1b[0m1');
  });

  it('paints the dot in a decimal, because upstream\'s class spans + through /', () => {
    expect(colour('1.5')).toBe('1\x1b[35m.\x1b[0m5');
  });

  it('paints constants yellow', () => {
    expect(colour('e+1')).toContain('\x1b[33me\x1b[0m');
    expect(colour('pi')).toBe('\x1b[33mpi\x1b[0m');
  });

  it('paints functions blue without mistaking them for constants', () => {
    const painted = colour('exp(1)');
    expect(painted).toContain('\x1b[34mexp\x1b[0m');
    expect(painted).not.toContain('\x1b[33me\x1b[0m');
  });

  it('paints the whole line red when it does not evaluate', () => {
    expect(colour('1+')).toBe('\x1b[31m1+\x1b[0m');
    expect(colour('sqrt(-1)')).toBe('\x1b[31msqrt(-1)\x1b[0m');
  });

  it('paints help cyan', () => {
    expect(colour('help')).toBe('\x1b[36mhelp\x1b[0m');
  });

  it('treats _ as valid only when a previous answer exists', () => {
    expect(colour('_+1')).toBe('\x1b[31m_+1\x1b[0m');
    expect(colour('_+1', 9)).toContain('\x1b[35m+\x1b[0m');
  });
});

describe('history hints', () => {
  const history = ['1+1', '2+2', '2+2*3'];

  it('suggests the most recent matching entry', () => {
    expect(historyHint(history, '2')).toBe('+2*3');
    expect(historyHint(history, '1')).toBe('+1');
  });

  it('suggests nothing without a match or on an empty line', () => {
    expect(historyHint(history, '9')).toBeNull();
    expect(historyHint(history, '')).toBeNull();
    expect(historyHint(history, '2+2*3')).toBeNull();
  });
});
