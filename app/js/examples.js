(function () {
  const t = KB.t;

  const blk = (type, fields, inputs, extra) => Object.assign({ type }, fields && { fields }, inputs && { inputs }, extra);
  const val = (b) => ({ block: b });
  const seq = (...blocks) => blocks.reduceRight((next, b) => (next ? Object.assign({}, b, { next: { block: next } }) : b), null);
  const num = (x) => blk('math_number', { NUM: x });
  const str = (x) => blk('text', { TEXT: x });
  const v = (name) => ({ id: 'var_' + name });
  const get = (name) => blk('k_get', { VAR: v(name) });
  const print = (x) => blk('k_print', { MODE: 'ln' }, { VALUE: val(x) });
  const declare = (type, name, x) => blk('k_declare', { TYPE: type, VAR: v(name) }, { VALUE: val(x) });
  const compare = (op, a, b) => blk('logic_compare', { OP: op }, { A: val(a), B: val(b) });
  const mod = (a, b) => blk('math_modulo', null, { DIVIDEND: val(a), DIVISOR: val(b) });
  const ask = (prompt, type) => blk('k_input', { TYPE: type }, { PROMPT: val(str(prompt)) }, { extraState: { type } });
  const at = (name, i) => blk('k_array_get', null, { ARRAY: val(get(name)), INDEX: val(i) });
  const join = (...items) => blk('text_join', null, Object.fromEntries(items.map((x, i) => ['ADD' + i, val(x)])), { extraState: { itemCount: items.length } });

  const program = (vars, ...body) => ({
    blocks: {
      languageVersion: 0,
      blocks: [blk('k_main', { NAME: 'Main' }, body.length ? { BODY: val(seq(...body)) } : null, { x: 40, y: 40 })],
    },
    variables: vars.map((name) => ({ name, id: 'var_' + name })),
  });

  KB.examples = {
    hello: {
      title: () => t('exHello'),
      build: () => program([], print(str(t('sHello')))),
    },
    fizz: {
      title: () => t('exFizz'),
      build: () => program(['i'],
        blk('controls_for', { VAR: v('i') }, {
          FROM: val(num(1)), TO: val(num(30)), BY: val(num(1)),
          DO: val(blk('controls_if', null, {
            IF0: val(compare('EQ', mod(get('i'), num(15)), num(0))), DO0: val(print(str('FizzBuzz'))),
            IF1: val(compare('EQ', mod(get('i'), num(3)), num(0))), DO1: val(print(str('Fizz'))),
            IF2: val(compare('EQ', mod(get('i'), num(5)), num(0))), DO2: val(print(str('Buzz'))),
            ELSE: val(print(get('i'))),
          }, { extraState: { elseIfCount: 2, hasElse: true } })),
        })
      ),
    },
    average: {
      title: () => t('exAverage'),
      build: () => program(['n', 'sum', 'x'],
        declare('int', 'n', ask(t('sHowMany'), 'int')),
        declare('double', 'sum', num(0)),
        blk('controls_repeat_ext', null, {
          TIMES: val(get('n')),
          DO: val(seq(
            declare('double', 'x', ask(t('sNumber'), 'double')),
            blk('k_change', { VAR: v('sum') }, { VALUE: val(get('x')) })
          )),
        }),
        print(join(str(t('sAverage')), blk('math_arithmetic', { OP: 'DIVIDE' }, { A: val(get('sum')), B: val(get('n')) })))
      ),
    },
    arrays: {
      title: () => t('exArrays'),
      build: () => program(['scores', 'best', 'total', 's', 'squares', 'i'],
        declare('int[]', 'scores', blk('lists_create_with', null,
          { ADD0: val(num(72)), ADD1: val(num(95)), ADD2: val(num(58)), ADD3: val(num(88)) }, { extraState: { itemCount: 4 } })),
        declare('int', 'best', at('scores', num(0))),
        declare('int', 'total', num(0)),
        blk('k_for_each', { VAR: v('s') }, {
          ARRAY: val(get('scores')),
          DO: val(seq(
            blk('k_change', { VAR: v('total') }, { VALUE: val(get('s')) }),
            blk('controls_if', null, {
              IF0: val(compare('GT', get('s'), get('best'))),
              DO0: val(blk('k_set', { VAR: v('best') }, { VALUE: val(get('s')) })),
            })
          )),
        }),
        print(join(str(t('sScores')), blk('k_array_text', null, { ARRAY: val(get('scores')) }))),
        print(join(str(t('sBest')), get('best'))),
        print(join(str(t('sAverage')), blk('math_arithmetic', { OP: 'DIVIDE' }, {
          A: val(blk('k_cast', { TYPE: 'double' }, { VALUE: val(get('total')) }, { extraState: { type: 'double' } })),
          B: val(blk('k_array_length', null, { ARRAY: val(get('scores')) })),
        }))),
        declare('int[]', 'squares', blk('k_array_new', null, { SIZE: val(num(5)) })),
        blk('controls_for', { VAR: v('i') }, {
          FROM: val(num(0)),
          TO: val(blk('math_arithmetic', { OP: 'MINUS' }, { A: val(blk('k_array_length', null, { ARRAY: val(get('squares')) })), B: val(num(1)) })),
          BY: val(num(1)),
          DO: val(blk('k_array_set', null, {
            ARRAY: val(get('squares')), INDEX: val(get('i')),
            VALUE: val(blk('math_arithmetic', { OP: 'MULTIPLY' }, { A: val(get('i')), B: val(get('i')) })),
          })),
        }),
        print(join(str(t('sSquares')), blk('k_array_text', null, { ARRAY: val(get('squares')) })))
      ),
    },
    guess: {
      title: () => t('exGuess'),
      build: () => program(['secret', 'guess', 'tries'],
        declare('int', 'secret', blk('math_random_int', null, { FROM: val(num(1)), TO: val(num(100)) })),
        declare('int', 'guess', num(0)),
        declare('int', 'tries', num(0)),
        blk('controls_whileUntil', { MODE: 'WHILE' }, {
          BOOL: val(compare('NEQ', get('guess'), get('secret'))),
          DO: val(seq(
            blk('k_set', { VAR: v('guess') }, { VALUE: val(ask(t('sGuess'), 'int')) }),
            blk('k_change', { VAR: v('tries') }, { VALUE: val(num(1)) }),
            blk('controls_if', null, {
              IF0: val(compare('LT', get('guess'), get('secret'))), DO0: val(print(str(t('sHigher')))),
              IF1: val(compare('GT', get('guess'), get('secret'))), DO1: val(print(str(t('sLower')))),
            }, { extraState: { elseIfCount: 1 } })
          )),
        }),
        print(join(str(t('sGotIt')), get('tries'), str(t('sTries'))))
      ),
    },
  };
})();
