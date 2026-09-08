/* Port of eva's REPL (src/readline.rs + the loop in src/main.rs), rebuilt on
 * node:readline instead of rustyline.
 * Original: Copyright (C) 2019 Akshay Oppiliappan <nerdypepper@tuta.io>
 * Refer to LICENSE for more information.
 */

import { closeSync, mkdirSync, openSync, readFileSync, writeFileSync, writeSync } from 'node:fs';
import { emitKeypressEvents } from 'node:readline';
import { join } from 'node:path';

import { CalcError } from './error.js';
import { displayF64 } from './float.js';
import { format } from './fmt.js';
import { highlight } from './highlight.js';
import { evalExpr } from './index.js';
import { projectDirs } from './dirs.js';

const PROMPT = '> ';
const MAX_HISTORY = 1000;

export function loadHistory(path) {
  try {
    return readFileSync(path, 'utf8').split('\n').filter((l) => l !== '');
  } catch {
    return null;
  }
}

export function saveHistory(path, history) {
  const trimmed = history.slice(-MAX_HISTORY);
  writeFileSync(path, trimmed.length ? trimmed.join('\n') + '\n' : '');
}

/**
 * Finds the completion rustyline's `HistoryHinter` would show: the tail of the
 * most recent history entry that starts with `line`.
 */
export function historyHint(history, line) {
  if (line === '') return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.startsWith(line) && entry.length > line.length) {
      return entry.slice(line.length);
    }
  }
  return null;
}

/**
 * Upstream opens this file with write+create and no truncation, so a shorter
 * answer leaves trailing bytes from a longer previous one. Reproduced here.
 */
function writePreviousAns(path, ans) {
  try {
    const fd = openSync(path, 'a+');
    closeSync(fd);
    const handle = openSync(path, 'r+');
    writeSync(handle, `${displayF64(ans)}\n`, 0);
    closeSync(handle);
  } catch (err) {
    console.log(`Error while writing previous answer to file: ${err.message}`);
  }
}

class LineEditor {
  constructor({ ctx, fix, history, onRender }) {
    this.ctx = ctx;
    this.fix = fix;
    this.history = history;
    this.onRender = onRender;
    this.line = '';
    this.cursor = 0;
    this.historyIndex = history.length;
    this.savedLine = '';
    this.prevAns = null;
  }

  render() {
    const coloured = highlight(this.ctx, this.fix, this.line, this.prevAns);
    const hint = this.cursor === this.line.length ? historyHint(this.history, this.line) : null;
    const suffix = hint ? `\x1b[90m${hint}\x1b[0m` : '';
    this.onRender(`${PROMPT}${coloured}${suffix}`, PROMPT.length + this.cursor);
  }

  insert(text) {
    this.line = this.line.slice(0, this.cursor) + text + this.line.slice(this.cursor);
    this.cursor += text.length;
  }

  recallHistory(delta) {
    if (this.historyIndex === this.history.length) this.savedLine = this.line;
    const next = this.historyIndex + delta;
    if (next < 0 || next > this.history.length) return;
    this.historyIndex = next;
    this.line = next === this.history.length ? this.savedLine : this.history[next];
    this.cursor = this.line.length;
  }
}

/**
 * Runs the interactive REPL. Resolves when the user exits with Ctrl-C or EOF.
 *
 * @param {import('./lex.js').FunctionContext} ctx
 * @param {number} fix
 * @param {number} base
 */
export async function repl(ctx, fix, base) {
  const { dataDir, cacheDir } = projectDirs();
  let historyDir = dataDir;
  let previousAnsDir = cacheDir;
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch {
    historyDir = process.env.HOME ?? '.';
  }
  try {
    mkdirSync(cacheDir, { recursive: true });
  } catch {
    previousAnsDir = process.env.HOME ?? '.';
  }
  const historyPath = join(historyDir, 'history.txt');
  const previousAnsPath = join(previousAnsDir, 'previous_ans.txt');

  try {
    writeFileSync(previousAnsPath, '0');
  } catch (err) {
    console.log('Could not write to previous_ans_path');
    console.log(err.message);
    process.exit(1);
  }

  const loaded = loadHistory(historyPath);
  if (loaded === null) console.log('No previous history.');
  const history = loaded ?? [];

  const input = process.stdin;
  const output = process.stdout;
  const interactive = Boolean(input.isTTY);

  const editor = new LineEditor({
    ctx,
    fix,
    history,
    onRender: (text, cursorColumn) => {
      if (!interactive) return;
      output.write(`\r\x1b[K${text}\r\x1b[${cursorColumn}C`);
    },
  });

  const submit = (line) => {
    if (!(line.startsWith(' ') && line.trim() !== '')) {
      if (line !== '') history.push(line);
    }
    editor.historyIndex = history.length;

    try {
      const ans = evalExpr(ctx, fix, line, editor.prevAns);
      editor.prevAns = ans;
      output.write(format(base, fix, ans) + '\n');
      writePreviousAns(previousAnsPath, ans);
    } catch (e) {
      if (!(e instanceof CalcError)) throw e;
      output.write(e.toString() + '\n');
    }
  };

  if (!interactive) {
    await runNonInteractive(input, submit);
    saveHistory(historyPath, history);
    return;
  }

  emitKeypressEvents(input);
  input.setRawMode(true);
  input.resume();

  await new Promise((resolve) => {
    const finish = () => {
      input.setRawMode(false);
      input.pause();
      input.removeListener('keypress', onKeypress);
      resolve();
    };

    const onKeypress = (str, key) => {
      if (!key) return;

      if (key.ctrl && key.name === 'c') {
        output.write('\n');
        console.log('CTRL-C');
        return finish();
      }
      if (key.ctrl && key.name === 'd' && editor.line === '') {
        output.write('\n');
        return finish();
      }

      switch (true) {
        case key.name === 'return' || key.name === 'enter': {
          const line = editor.line;
          output.write('\n');
          editor.line = '';
          editor.cursor = 0;
          submit(line);
          break;
        }
        case key.name === 'backspace':
          if (editor.cursor > 0) {
            editor.line =
              editor.line.slice(0, editor.cursor - 1) + editor.line.slice(editor.cursor);
            editor.cursor -= 1;
          }
          break;
        case key.name === 'delete' || (key.ctrl && key.name === 'd'):
          editor.line = editor.line.slice(0, editor.cursor) + editor.line.slice(editor.cursor + 1);
          break;
        case key.name === 'left' || (key.ctrl && key.name === 'b'):
          if (editor.cursor > 0) editor.cursor -= 1;
          break;
        case key.name === 'right' || (key.ctrl && key.name === 'f'): {
          if (editor.cursor < editor.line.length) {
            editor.cursor += 1;
          } else {
            const hint = historyHint(history, editor.line);
            if (hint) {
              editor.line += hint;
              editor.cursor = editor.line.length;
            }
          }
          break;
        }
        case key.name === 'home' || (key.ctrl && key.name === 'a'):
          editor.cursor = 0;
          break;
        case key.name === 'end' || (key.ctrl && key.name === 'e'):
          editor.cursor = editor.line.length;
          break;
        case key.ctrl && key.name === 'k':
          editor.line = editor.line.slice(0, editor.cursor);
          break;
        case key.ctrl && key.name === 'u':
          editor.line = editor.line.slice(editor.cursor);
          editor.cursor = 0;
          break;
        case key.ctrl && key.name === 'w': {
          const head = editor.line.slice(0, editor.cursor).replace(/\S*\s*$/, '');
          editor.cursor = head.length;
          editor.line = head + editor.line.slice(editor.cursor);
          break;
        }
        case key.ctrl && key.name === 'l':
          output.write('\x1b[2J\x1b[H');
          break;
        case key.name === 'up' || (key.ctrl && key.name === 'p'):
          editor.recallHistory(-1);
          break;
        case key.name === 'down' || (key.ctrl && key.name === 'n'):
          editor.recallHistory(1);
          break;
        default:
          if (str && !key.ctrl && !key.meta && str >= ' ') editor.insert(str);
      }
      editor.render();
    };

    editor.render();
    input.on('keypress', onKeypress);
  });

  saveHistory(historyPath, history);
}

async function runNonInteractive(input, submit) {
  let buffer = '';
  for await (const chunk of input) {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      submit(line);
    }
  }
  if (buffer !== '') submit(buffer);
}
