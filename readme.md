# eva

Simple calculator REPL, similar to `bc(1)`, with syntax highlighting and persistent history.

A JavaScript (Node, ESM) port of [eva](https://github.com/oppiliappan/eva) by
Akshay Oppiliappan. Numeric output and error messages are byte-identical to the
Rust original.

### installation

```shell
$ npx eva-calc
```

- manual
```shell
$ git clone <this repo>
$ cd eva-js
$ node ./bin/eva.js
```

Requires Node 18 or newer. It has no runtime dependencies; `vitest` is the only
devDependency.

### usage

```
Calculator REPL similar to bc(1)

Usage: eva [OPTIONS] [INPUT]

Arguments:
  [INPUT]  Optional expression string to run eva in command mode

Options:
  -f, --fix <FIX>                Number of decimal places in output (1 - 64) [default: 10]
  -b, --base <RADIX>             Radix of calculation output (1 - 36) [default: 10]
  -a, --angle_unit <angle_unit>  Angle unit [default: degree] [possible values: degree, radian, gradian]
  -r, --radian                   Shorthand for --angle_unit radian
  -h, --help                     Print help
  -V, --version                  Print version
```

Type out an expression and hit enter, repeat.

```shell
> 1 + sin(30)
1.5000000000
> floor(sqrt(3^2 + 5^2))
5.0000000000
> 5sin(45) + cos(0)
4.5355339059
```

Pass an expression as an argument to run a single calculation and exit:

```shell
$ eva "1 + sin(30)"
1.5000000000
```

### operators

 - binary operators: `+ - * / % ^ **`
 - unary operators: `+ -`
 - postfix: `!` (factorial)

`^` and `**` are equivalent and right associative, so `2 ** 2 ** 3` is 256.

### constants

```
e      pi
```

examples:
```
pi * 5^2  # πr²
```

### functions

All trigonometric functions expect input in degrees unless `--radian` (or
`--angle_unit radian`) is given.

```
1 argument:
sin    cos     tan    csc    sec    cot    sinh   cosh   tanh
asin   acos    atan   acsc   asec   acot   ln     log2   log10
sqrt   ceil    floor  abs    exp    exp2   round

2 arguments:
log    nroot

deg(x) - convert x to degrees
rad(x) - convert x to radians
```

examples:
```
sqrt(sin(30)) # parentheses are mandatory for functions

log10100      # no
log10(100)    # yes

log(1, 10)    # function with two arguments
```

Type `help` in the REPL to list the constants, functions and operators.

### quality of life features

 - auto insertion of `*` operator
```
>12sin(45(2))             # 12 * sin(45 * (2))
12.0000000000
```

 - auto balancing of parentheses
```
>ceil(sqrt(3^2 + 5^2      # ceil(sqrt(3^2 + 5^2))
6.0000000000
```

 - use previous answer with `_`
```
> sin(pi)
0.0548036651
> _^2
0.0030034417
```

- super neat error handling
```
> 1 + ln(-1)
Domain Error: Out of bounds!
```

 - syntax highlighting
 - persistent history, shared with the Rust build

### differences from the Rust original

The evaluator is a faithful port: the lexer, shunting-yard parser, RPN
evaluator, function and constant tables, formatting and error strings all match.
A differential harness (`tools/difftest.mjs`) checks this port against a build
of the Rust binary across 152 expressions and 11 flag combinations; all 1672
comparisons match exactly.

A few deliberate deviations:

- **`help` ordering is deterministic.** Upstream iterates a Rust `HashMap`, so
  the function list is shuffled differently on every run. This port lists them
  in table-definition order.
- **`--base 1` reports an error** (`Base too large! Accepted ranges: 0 - 36`)
  instead of hanging. The upstream conversion loop divides by the radix until
  the value drops below it, which never terminates for base 1.
- **Huge factorials return infinity immediately.** Upstream iterates
  `1..=n.round()`, which spins for a very long time on something like `1e18!`.
  The product saturates to infinity after 171 steps and infinity is absorbing,
  so this port stops there and produces the same result.
- **`-r`/`--radian` is accepted** in addition to `--angle_unit radian`. The
  upstream readme documents `--radian`, but its current `main.rs` only
  implements `--angle_unit`; both work here.
- **Tab does not complete filenames.** Upstream wires rustyline's
  `FilenameCompleter` into the REPL; filename completion has no meaning in a
  calculator, so it is omitted.

Things upstream does not support, and so neither does this port: radix
*literals* (`0x10`, `0b101`, `0o17` are syntax errors — `--base` only affects
output), and `nCr`/`nPr`.

### tests

```shell
$ npm test          # vitest, 78 tests
```

To re-run the differential comparison you need a build of the Rust original:

```shell
$ EVA_RUST_BIN=/path/to/eva node tools/difftest.mjs
```

### license

MIT, retaining the copyright of the original author. See `LICENSE`.
