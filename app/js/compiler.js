(function () {
  const t = KB.t;

  // Java operator precedence, higher binds tighter. Used to emit only the
  // parentheses Java actually needs; the JS side is always fully parenthesized.
  const P = { TERN: 3, OR: 4, AND: 5, EQ: 9, REL: 10, ADD: 12, MUL: 13, UNARY: 15, ATOM: 20 };

  const JAVA_RESERVED = new Set(('abstract assert boolean break byte case catch char class const continue default do double ' +
    'else enum extends final finally float for goto if implements import instanceof int interface long native new ' +
    'package private protected public return short static strictfp super switch synchronized this throw throws ' +
    'transient try void volatile while true false null var record yield sealed permits main args IN').split(' '));

  const DEFAULTS = {
    int: { j: '0', s: '0', t: 'int', p: P.ATOM, simple: true },
    double: { j: '0.0', s: '0', t: 'double', p: P.ATOM, simple: true },
    String: { j: '""', s: '""', t: 'String', p: P.ATOM, simple: true },
    boolean: { j: 'false', s: 'false', t: 'boolean', p: P.ATOM, simple: true },
  };

  const isNum = (ty) => ty === 'int' || ty === 'double';
  const isArr = (ty) => typeof ty === 'string' && ty.endsWith('[]');
  const elemOf = (ty) => ty.slice(0, -2);
  const def = (ty) => DEFAULTS[ty] || (isArr(ty)
    ? { j: `new ${elemOf(ty)}[0]`, s: `J.newArray(0, "${elemOf(ty)}")`, t: ty, p: P.ATOM }
    : DEFAULTS.int);
  const promote = (a, b) => (a === 'double' || b === 'double' ? 'double' : 'int');

  function ident(name) {
    const parts = String(name).split(/[^\p{L}\p{N}_$]+/u).filter(Boolean);
    let id = parts.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1) : p)).join('') || 'value';
    if (/^\p{N}/u.test(id)) id = '_' + id;
    if (JAVA_RESERVED.has(id)) id += '_';
    return id;
  }

  function className(name) {
    const id = ident(name || 'Main').replace(/_$/, '');
    return id[0].toUpperCase() + id.slice(1);
  }

  function javaString(s) {
    return '"' + String(s).replace(/[\\"\u0000-\u001f]/g, (c) => {
      const map = { '\\': '\\\\', '"': '\\"', '\n': '\\n', '\r': '\\r', '\t': '\\t' };
      return map[c] || '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
    }) + '"';
  }

  const wrap = (x, min) => (x.p < min ? '(' + x.j + ')' : x.j);
  const js = (x) => '(' + x.s + ')';
  const jsStr = (x) => (x.t === 'String' ? js(x) : 'J.str(' + x.s + ', "' + x.t + '")');

  class Compiler {
    constructor(ws) {
      this.ws = ws;
      this.errors = [];
      this.scopes = [];
      this.helpers = new Set();
      this.loops = [];
      this.taken = new Set(ws.getAllVariables().map((v) => ident(v.name)));
    }

    error(block, key, params) {
      this.errors.push({ block, msg: t(key, params) });
    }

    lookup(name) {
      for (let i = this.scopes.length - 1; i >= 0; i--) {
        if (this.scopes[i].has(name)) return this.scopes[i].get(name);
      }
      return null;
    }

    declare(block, name, type) {
      if (this.lookup(name)) this.error(block, 'errDuplicate', { name });
      this.scopes[this.scopes.length - 1].set(name, { type });
    }

    freshName(base, avoid) {
      for (let n = 1; ; n++) {
        for (const c of base) {
          const name = n === 1 ? c : c + n;
          if (!this.taken.has(name) && !this.lookup(name) && name !== avoid) return name;
        }
      }
    }

    varName(block) {
      const v = block.getField('VAR').getVariable();
      return ident(v ? v.name : 'x');
    }

    // Reads an input. `want` is the expected Java type and is only used to pick
    // a sensible default for an empty socket and to report type mismatches.
    value(block, input, want) {
      const target = block.getInputTargetBlock(input);
      if (!target || !target.isEnabled()) return def(want || 'int');
      const x = this.expr(target, want);
      if (want && x.t !== want && x.t !== 'error') {
        if (want === 'double' && x.t === 'int') return x;
        const key = { int: 'errInt', double: 'errNumber', boolean: 'errBoolean', String: 'errString' }[want] || 'errArray';
        this.error(target, key, { type: x.t });
      }
      return x;
    }

    number(block, input) {
      const target = block.getInputTargetBlock(input);
      const x = this.value(block, input);
      if (!isNum(x.t) && x.t !== 'error') this.error(target, 'errNumber', { type: x.t });
      return x;
    }

    // `want` is the type the surrounding block expects. Only array literals use
    // it, because `{1, 2}` or `new array with 5 items` has no type on its own.
    expr(b, want) {
      const fn = this['e_' + b.type];
      if (!fn) {
        this.error(b, 'errUnsupported');
        return { j: '0', s: '0', t: 'error', p: P.ATOM };
      }
      return fn.call(this, b, want);
    }

    array(block, input) {
      const target = block.getInputTargetBlock(input);
      const x = this.value(block, input);
      if (!isArr(x.t) && x.t !== 'error') {
        this.error(target || block, 'errArray', { type: target ? x.t : '—' });
        return Object.assign({}, x, { t: 'error' });
      }
      return x;
    }

    e_k_array_new(b, want) {
      if (!isArr(want)) {
        this.error(b, 'errArrayContext');
        return { j: '0', s: '0', t: 'error', p: P.ATOM };
      }
      const n = this.value(b, 'SIZE', 'int');
      const el = elemOf(want);
      return { j: `new ${el}[${n.j}]`, s: `J.newArray(${n.s}, "${el}")`, t: want, p: P.ATOM };
    }

    e_lists_create_with(b, want) {
      if (!isArr(want)) {
        this.error(b, 'errArrayContext');
        return { j: '0', s: '0', t: 'error', p: P.ATOM };
      }
      const el = elemOf(want);
      const items = [];
      for (let i = 0; i < b.itemCount_; i++) items.push(this.widen(this.value(b, 'ADD' + i, el), el));
      const list = items.map((x) => x.j).join(', ');
      return { j: `new ${el}[]{${list}}`, brace: `{${list}}`, s: `[${items.map((x) => x.s).join(', ')}]`, t: want, p: P.ATOM };
    }

    e_k_array_get(b) {
      const a = this.array(b, 'ARRAY');
      const i = this.value(b, 'INDEX', 'int');
      return { j: `${wrap(a, P.ATOM)}[${i.j}]`, s: `J.aget(${a.s}, ${i.s})`, t: a.t === 'error' ? 'error' : elemOf(a.t), p: P.ATOM };
    }

    e_k_array_length(b) {
      const a = this.array(b, 'ARRAY');
      return { j: `${wrap(a, P.ATOM)}.length`, s: `${js(a)}.length`, t: 'int', p: P.ATOM };
    }

    e_k_array_text(b) {
      const a = this.array(b, 'ARRAY');
      this.helpers.add('Arrays');
      const el = a.t === 'error' ? 'int' : elemOf(a.t);
      return { j: `Arrays.toString(${a.j})`, s: `J.arrayText(${a.s}, "${el}")`, t: 'String', p: P.ATOM };
    }

    e_math_number(b) {
      const n = Number(b.getFieldValue('NUM'));
      if (Number.isInteger(n) && Math.abs(n) <= 2147483647) {
        return { j: String(n), s: String(n), t: 'int', p: n < 0 ? P.UNARY : P.ATOM, simple: true, lit: n };
      }
      let lit = String(n);
      if (!/[.eE]/.test(lit)) lit += '.0';
      return { j: lit, s: String(n), t: 'double', p: n < 0 ? P.UNARY : P.ATOM, simple: true, lit: n };
    }

    e_math_arithmetic(b) {
      const op = b.getFieldValue('OP');
      const a = this.number(b, 'A');
      const c = this.number(b, 'B');
      if (op === 'POWER') {
        return { j: `Math.pow(${a.j}, ${c.j})`, s: `Math.pow(${a.s}, ${c.s})`, t: 'double', p: P.ATOM };
      }
      const sym = { ADD: '+', MINUS: '-', MULTIPLY: '*', DIVIDE: '/' }[op];
      const prec = op === 'ADD' || op === 'MINUS' ? P.ADD : P.MUL;
      const ty = promote(a.t, c.t);
      let s;
      // int arithmetic has to wrap around and truncate exactly like the JVM does.
      if (ty === 'int') {
        if (op === 'MULTIPLY') s = `Math.imul(${a.s}, ${c.s})`;
        else if (op === 'DIVIDE') s = `J.idiv(${a.s}, ${c.s})`;
        else s = `(${js(a)} ${sym} ${js(c)}) | 0`;
      } else {
        s = `${js(a)} ${sym} ${js(c)}`;
      }
      return { j: `${wrap(a, prec)} ${sym} ${wrap(c, prec + 1)}`, s, t: ty, p: prec };
    }

    e_math_modulo(b) {
      const a = this.number(b, 'DIVIDEND');
      const c = this.number(b, 'DIVISOR');
      const ty = promote(a.t, c.t);
      const s = ty === 'int' ? `J.imod(${a.s}, ${c.s})` : `${js(a)} % ${js(c)}`;
      return { j: `${wrap(a, P.MUL)} % ${wrap(c, P.MUL + 1)}`, s, t: ty, p: P.MUL };
    }

    e_math_single(b) {
      const op = b.getFieldValue('OP');
      const x = this.number(b, 'NUM');
      if (op === 'NEG') {
        const s = x.t === 'int' ? `(-${js(x)}) | 0` : `-${js(x)}`;
        return { j: '-' + wrap(x, P.UNARY + 1), s, t: x.t, p: P.UNARY };
      }
      if (op === 'ABS') {
        const s = x.t === 'int' ? `Math.abs(${x.s}) | 0` : `Math.abs(${x.s})`;
        return { j: `Math.abs(${x.j})`, s, t: x.t, p: P.ATOM };
      }
      if (op === 'POW10') return { j: `Math.pow(10, ${x.j})`, s: `Math.pow(10, ${x.s})`, t: 'double', p: P.ATOM };
      const fn = { ROOT: 'sqrt', LN: 'log', LOG10: 'log10', EXP: 'exp' }[op];
      return { j: `Math.${fn}(${x.j})`, s: `Math.${fn}(${x.s})`, t: 'double', p: P.ATOM };
    }

    e_math_round(b) {
      const fn = { ROUND: 'round', ROUNDUP: 'ceil', ROUNDDOWN: 'floor' }[b.getFieldValue('OP')];
      const x = this.number(b, 'NUM');
      return { j: `(int) Math.${fn}(${x.j})`, s: `J.d2i(Math.${fn}(${x.s}))`, t: 'int', p: P.UNARY };
    }

    e_math_random_int(b) {
      const a = this.value(b, 'FROM', 'int');
      const c = this.value(b, 'TO', 'int');
      this.helpers.add('randomInt');
      return { j: `randomInt(${a.j}, ${c.j})`, s: `J.randomInt(${a.s}, ${c.s})`, t: 'int', p: P.ATOM };
    }

    e_text(b) {
      const v = b.getFieldValue('TEXT');
      return { j: javaString(v), s: JSON.stringify(v), t: 'String', p: P.ATOM, simple: true };
    }

    e_text_join(b) {
      const parts = [];
      for (let i = 0; i < b.itemCount_; i++) {
        const target = b.getInputTargetBlock('ADD' + i);
        if (target && target.isEnabled()) parts.push(this.expr(target));
      }
      if (!parts.length) return DEFAULTS.String;
      if (parts.length === 1 && parts[0].t === 'String') return parts[0];
      if (parts.length === 1) {
        return { j: `String.valueOf(${parts[0].j})`, s: jsStr(parts[0]), t: 'String', p: P.ATOM };
      }
      // Java's + is left-associative: 1 + 2 + "a" is "3a", so force string mode up front.
      const needsLead = parts[0].t !== 'String' && parts[1].t !== 'String';
      const j = (needsLead ? ['""'] : []).concat(parts.map((x) => wrap(x, P.ADD + 1))).join(' + ');
      return { j, s: parts.map(jsStr).join(' + '), t: 'String', p: P.ADD };
    }

    e_text_length(b) {
      const x = this.value(b, 'VALUE', 'String');
      return { j: `${wrap(x, P.ATOM)}.length()`, s: `${js(x)}.length`, t: 'int', p: P.ATOM };
    }

    e_logic_boolean(b) {
      const v = b.getFieldValue('BOOL') === 'TRUE' ? 'true' : 'false';
      return { j: v, s: v, t: 'boolean', p: P.ATOM, simple: true };
    }

    e_logic_negate(b) {
      const x = this.value(b, 'BOOL', 'boolean');
      return { j: '!' + wrap(x, P.UNARY), s: '!' + js(x), t: 'boolean', p: P.UNARY };
    }

    e_logic_operation(b) {
      const and = b.getFieldValue('OP') === 'AND';
      const prec = and ? P.AND : P.OR;
      const sym = and ? '&&' : '||';
      const a = this.value(b, 'A', 'boolean');
      const c = this.value(b, 'B', 'boolean');
      return { j: `${wrap(a, prec)} ${sym} ${wrap(c, prec + 1)}`, s: `${js(a)} ${sym} ${js(c)}`, t: 'boolean', p: prec };
    }

    e_logic_compare(b) {
      const op = b.getFieldValue('OP');
      const ta = b.getInputTargetBlock('A');
      const tc = b.getInputTargetBlock('B');
      let a = ta && ta.isEnabled() ? this.expr(ta) : null;
      let c = tc && tc.isEnabled() ? this.expr(tc) : null;
      a = a || def(c && c.t !== 'error' ? c.t : 'int');
      c = c || def(a.t !== 'error' ? a.t : 'int');
      const sym = { EQ: '==', NEQ: '!=', LT: '<', LTE: '<=', GT: '>', GTE: '>=' }[op];
      const jsSym = { EQ: '===', NEQ: '!==' }[op] || sym;
      const res = (j, p) => ({ j, s: `${js(a)} ${jsSym} ${js(c)}`, t: 'boolean', p });
      const equality = op === 'EQ' || op === 'NEQ';
      if (a.t === 'error' || c.t === 'error') return res('false', P.ATOM);
      if (isNum(a.t) && isNum(c.t)) return res(`${wrap(a, equality ? P.EQ : P.REL)} ${sym} ${wrap(c, (equality ? P.EQ : P.REL) + 1)}`, equality ? P.EQ : P.REL);
      if (a.t === 'String' && c.t === 'String') {
        // == on Strings compares references in Java; teach the right habit instead.
        if (op === 'EQ') return res(`${wrap(a, P.ATOM)}.equals(${c.j})`, P.ATOM);
        if (op === 'NEQ') return res(`!${wrap(a, P.ATOM)}.equals(${c.j})`, P.UNARY);
        return res(`${wrap(a, P.ATOM)}.compareTo(${c.j}) ${sym} 0`, P.REL);
      }
      if (a.t === 'boolean' && c.t === 'boolean') {
        if (!equality) this.error(b, 'errOrder');
        return res(`${wrap(a, P.EQ)} ${sym} ${wrap(c, P.EQ + 1)}`, P.EQ);
      }
      // Arrays compare by reference in Java, which is exactly what === does.
      if (isArr(a.t) && a.t === c.t && equality) return res(`${wrap(a, P.EQ)} ${sym} ${wrap(c, P.EQ + 1)}`, P.EQ);
      this.error(b, 'errCompare', { a: a.t, b: c.t });
      return res('false', P.ATOM);
    }

    e_logic_ternary(b) {
      const cond = this.value(b, 'IF', 'boolean');
      const ta = b.getInputTargetBlock('THEN');
      const tc = b.getInputTargetBlock('ELSE');
      let a = ta && ta.isEnabled() ? this.expr(ta) : null;
      let c = tc && tc.isEnabled() ? this.expr(tc) : null;
      a = a || def(c ? c.t : 'int');
      c = c || def(a.t);
      let ty = a.t;
      if (a.t !== c.t) {
        if (isNum(a.t) && isNum(c.t)) ty = 'double';
        else this.error(b, 'errTernary', { a: a.t, b: c.t });
      }
      return {
        j: `${wrap(cond, P.TERN + 1)} ? ${wrap(a, P.TERN + 1)} : ${wrap(c, P.TERN)}`,
        s: `${js(cond)} ? ${js(a)} : ${js(c)}`,
        t: ty,
        p: P.TERN,
      };
    }

    e_k_get(b) {
      const name = this.varName(b);
      const v = this.lookup(name);
      if (!v) {
        this.error(b, 'errUndeclared', { name });
        return { j: name, s: '0', t: 'error', p: P.ATOM };
      }
      return { j: name, s: 'v_' + name, t: v.type, p: P.ATOM, simple: true };
    }

    e_k_input(b) {
      const prompt = this.value(b, 'PROMPT', 'String');
      const ty = b.getFieldValue('TYPE');
      const fn = { int: 'readInt', double: 'readDouble', String: 'readLine' }[ty];
      this.helpers.add(fn);
      return { j: `${fn}(${prompt.j})`, s: `(await J.input(${prompt.s}, "${ty}"))`, t: ty, p: P.ATOM };
    }

    e_k_cast(b) {
      const to = b.getFieldValue('TYPE');
      const x = this.value(b, 'VALUE');
      const from = x.t;
      if (from === to || from === 'error') return Object.assign({}, x, { t: from === 'error' ? 'error' : to });
      if (from === 'double' && to === 'int') return { j: '(int) ' + wrap(x, P.UNARY), s: `J.d2i(${x.s})`, t: to, p: P.UNARY };
      if (from === 'int' && to === 'double') return { j: '(double) ' + wrap(x, P.UNARY), s: x.s, t: to, p: P.UNARY };
      if (to === 'String') return { j: `String.valueOf(${x.j})`, s: jsStr(x), t: to, p: P.ATOM };
      if (from === 'String') {
        const fn = { int: ['Integer.parseInt', 'J.parseInt'], double: ['Double.parseDouble', 'J.parseDouble'], boolean: ['Boolean.parseBoolean', 'J.parseBoolean'] }[to];
        return { j: `${fn[0]}(${x.j})`, s: `${fn[1]}(${x.s})`, t: to, p: P.ATOM };
      }
      this.error(b, 'errCast', { from, to });
      return Object.assign({}, x, { t: to });
    }

    // Statements produce parallel line arrays for Java and JS.
    // `jumps` mirrors the JLS "cannot complete normally" rule, so statements
    // after a break or an endless loop are reported like javac would.
    body(first) {
      const out = { j: [], s: [], jumps: false };
      for (let b = first; b; b = b.getNextBlock()) {
        if (!b.isEnabled()) continue;
        if (out.jumps) this.error(b, 'errUnreachable');
        const fn = this['s_' + b.type];
        if (!fn) {
          this.error(b, 'errUnsupported');
          continue;
        }
        const r = fn.call(this, b);
        out.j.push(...r.j);
        out.s.push(...r.s);
        if (r.jumps) out.jumps = true;
      }
      return out;
    }

    block(b, input, before) {
      this.scopes.push(new Map());
      if (before) before();
      const r = this.body(b.getInputTargetBlock(input));
      this.scopes.pop();
      const ind = (l) => '    ' + l;
      return { j: r.j.map(ind), s: r.s.map(ind), jumps: r.jumps };
    }

    loop(b, input, before) {
      this.loops.push({ broke: false });
      const r = this.block(b, input, before);
      r.broke = this.loops.pop().broke;
      r.s.unshift('    await J.tick();');
      return r;
    }

    s_k_print(b) {
      const ln = b.getFieldValue('MODE') === 'ln';
      const target = b.getInputTargetBlock('VALUE');
      if (!target || !target.isEnabled()) {
        return { j: [ln ? 'System.out.println();' : 'System.out.print("");'], s: [`J.out("", ${ln});`] };
      }
      const x = this.expr(target);
      return { j: [`System.out.${ln ? 'println' : 'print'}(${x.j});`], s: [`J.out(${jsStr(x)}, ${ln});`] };
    }

    s_k_comment(b) {
      const text = b.getFieldValue('TEXT').trim();
      return { j: [text ? '// ' + text : '//'], s: [] };
    }

    assignable(b, name, to, x) {
      if (x.t === to || x.t === 'error' || (to === 'double' && x.t === 'int')) return true;
      if (to === 'int' && x.t === 'double') this.error(b, 'errAssignInt', { name });
      else this.error(b, 'errAssign', { name, from: x.t, to });
      return false;
    }

    // Spell int literals stored in doubles as 0.0 so the Java reads like a human wrote it.
    widen(x, to) {
      if (to === 'double' && x.t === 'int' && typeof x.lit === 'number') return Object.assign({}, x, { j: x.lit + '.0', t: 'double' });
      return x;
    }

    s_k_declare(b) {
      const ty = b.getFieldValue('TYPE');
      const name = this.varName(b);
      const target = b.getInputTargetBlock('VALUE');
      const v = this.widen(target && target.isEnabled() ? this.expr(target, ty) : def(ty), ty);
      this.assignable(b, name, ty, v);
      this.declare(b, name, ty);
      return { j: [`${ty} ${name} = ${v.brace || v.j};`], s: [`let v_${name} = ${v.s};`] };
    }

    s_k_set(b) {
      const name = this.varName(b);
      const v = this.lookup(name);
      const target = b.getInputTargetBlock('VALUE');
      const x = target && target.isEnabled() ? this.expr(target, v && v.type) : def(v ? v.type : 'int');
      if (!v) this.error(b, 'errUndeclared', { name });
      else this.assignable(b, name, v.type, x);
      const out = v ? this.widen(x, v.type) : x;
      return { j: [`${name} = ${out.j};`], s: [`v_${name} = ${out.s};`] };
    }

    s_k_change(b) {
      const name = this.varName(b);
      const v = this.lookup(name);
      const x = this.value(b, 'VALUE', null);
      if (!v) {
        this.error(b, 'errUndeclared', { name });
        return { j: [`${name} += ${x.j};`], s: [] };
      }
      const id = 'v_' + name;
      if (v.type === 'String') {
        return { j: [`${name} += ${x.j};`], s: [`${id} = ${id} + ${jsStr(x)};`] };
      }
      if (!isNum(v.type) || (!isNum(x.t) && x.t !== 'error')) {
        this.error(b, 'errChange');
        return { j: [`${name} += ${x.j};`], s: [] };
      }
      let j = `${name} += ${x.j};`;
      if (x.lit === 1) j = `${name}++;`;
      else if (x.lit === -1) j = `${name}--;`;
      else if (typeof x.lit === 'number' && x.lit < 0) j = `${name} -= ${x.j.slice(1)};`;
      // Compound assignment on an int narrows silently in Java: i += 1.5 is (int) (i + 1.5).
      let s;
      if (v.type === 'double') s = `${id} = ${id} + ${js(x)};`;
      else if (x.t === 'int') s = `${id} = (${id} + ${js(x)}) | 0;`;
      else s = `${id} = J.d2i(${id} + ${js(x)});`;
      return { j: [j], s: [s] };
    }

    s_k_array_set(b) {
      const a = this.array(b, 'ARRAY');
      const i = this.value(b, 'INDEX', 'int');
      const el = a.t === 'error' ? null : elemOf(a.t);
      const target = b.getInputTargetBlock('VALUE');
      let x = target && target.isEnabled() ? this.expr(target) : def(el || 'int');
      const slot = `${a.j}[${i.j}]`;
      if (el) {
        this.assignable(b, slot, el, x);
        x = this.widen(x, el);
      }
      return { j: [`${wrap(a, P.ATOM)}[${i.j}] = ${x.j};`], s: [`J.aset(${a.s}, ${i.s}, ${x.s});`] };
    }

    s_k_for_each(b) {
      const name = this.varName(b);
      const a = this.array(b, 'ARRAY');
      const el = a.t === 'error' ? 'int' : elemOf(a.t);
      const r = this.loop(b, 'DO', () => this.declare(b, name, el));
      return {
        j: [`for (${el} ${name} : ${a.j}) {`, ...r.j, '}'],
        s: [`for (let v_${name} of ${js(a)}) {`, ...r.s, '}'],
      };
    }

    s_controls_if(b) {
      const j = [];
      const s = [];
      let jumps = true;
      for (let i = 0; i <= (b.elseifCount_ || 0); i++) {
        const c = this.value(b, 'IF' + i, 'boolean');
        const r = this.block(b, 'DO' + i);
        j.push(`${i ? '} else ' : ''}if (${c.j}) {`, ...r.j);
        s.push(`${i ? '} else ' : ''}if (${c.s}) {`, ...r.s);
        jumps = jumps && r.jumps;
      }
      if (b.elseCount_) {
        const r = this.block(b, 'ELSE');
        j.push('} else {', ...r.j);
        s.push('} else {', ...r.s);
        jumps = jumps && r.jumps;
      } else {
        jumps = false;
      }
      j.push('}');
      s.push('}');
      return { j, s, jumps };
    }

    s_controls_repeat_ext(b) {
      const n = this.value(b, 'TIMES', 'int');
      const i = this.freshName(['i', 'j', 'k']);
      let jHead;
      let sHead;
      if (n.simple) {
        jHead = `for (int ${i} = 0; ${i} < ${n.j}; ${i}++) {`;
        sHead = `for (let c_${i} = 0; c_${i} < ${n.s}; c_${i}++) {`;
      } else {
        // Java re-evaluates the condition every lap; the block means "evaluate once".
        const limit = this.freshName(['n', 'times'], i);
        jHead = `for (int ${i} = 0, ${limit} = ${n.j}; ${i} < ${limit}; ${i}++) {`;
        sHead = `for (let c_${i} = 0, c_${limit} = ${n.s}; c_${i} < c_${limit}; c_${i}++) {`;
      }
      const r = this.loop(b, 'DO', () => this.scopes[this.scopes.length - 1].set(i, { type: 'int', hidden: true }));
      return { j: [jHead, ...r.j, '}'], s: [sHead, ...r.s, '}'] };
    }

    s_controls_whileUntil(b) {
      const until = b.getFieldValue('MODE') === 'UNTIL';
      const c = this.value(b, 'BOOL', 'boolean');
      const r = this.loop(b, 'DO');
      const jc = until ? '!' + wrap(c, P.ATOM) : c.j;
      const forever = c.j === (until ? 'false' : 'true');
      if (c.j === (until ? 'true' : 'false')) this.error(b, 'errUnreachable');
      return {
        j: [`while (${jc}) {`, ...r.j, '}'],
        s: [`while (${until ? '!' : ''}${js(c)}) {`, ...r.s, '}'],
        jumps: forever && !r.broke,
      };
    }

    s_controls_for(b) {
      const name = this.varName(b);
      const from = this.number(b, 'FROM');
      const to = this.number(b, 'TO');
      const by = this.number(b, 'BY');
      const ty = [from, to, by].some((x) => x.t === 'double') ? 'double' : 'int';
      const literal = [from, to, by].every((x) => typeof x.lit === 'number');
      const down = literal && from.lit > to.lit;
      const step = literal ? Math.abs(by.lit) : null;
      const cmp = down ? '>=' : '<=';
      let jStep;
      if (literal && step === 1) jStep = down ? `${name}--` : `${name}++`;
      else if (literal) jStep = `${name} ${down ? '-=' : '+='} ${String(step) + (ty === 'double' && Number.isInteger(step) ? '.0' : '')}`;
      else jStep = `${name} += ${by.j}`;
      const id = 'v_' + name;
      const delta = literal ? (down ? -step : step) : js(by);
      const sStep = ty === 'int' ? `${id} = (${id} + ${delta}) | 0` : `${id} = ${id} + ${delta}`;
      const r = this.loop(b, 'DO', () => this.declare(b, name, ty));
      return {
        j: [`for (${ty} ${name} = ${from.j}; ${name} ${cmp} ${wrap(to, P.REL + 1)}; ${jStep}) {`, ...r.j, '}'],
        s: [`for (let ${id} = ${from.s}; ${id} ${cmp} ${js(to)}; ${sStep}) {`, ...r.s, '}'],
      };
    }

    s_controls_flow_statements(b) {
      const loop = this.loops[this.loops.length - 1];
      const brk = b.getFieldValue('FLOW') === 'BREAK';
      if (!loop) {
        this.error(b, 'errLoopOnly');
        return { j: [], s: [] };
      }
      if (brk) loop.broke = true;
      const kw = brk ? 'break;' : 'continue;';
      return { j: [kw], s: [kw], jumps: true };
    }

    run() {
      const main = this.ws.getBlocksByType('k_main', false)[0];
      if (!main) {
        this.errors.push({ block: null, msg: t('errNoMain') });
        return { java: '', js: '', errors: this.errors, className: 'Main' };
      }
      const cls = className(main.getFieldValue('NAME'));
      this.scopes.push(new Map());
      const r = this.body(main.getInputTargetBlock('BODY'));
      const ind = (n) => (l) => ' '.repeat(n) + l;
      const h = this.helpers;
      const usesInput = h.has('readInt') || h.has('readDouble') || h.has('readLine');

      const java = [];
      const imports = [];
      if (h.has('Arrays')) imports.push('import java.util.Arrays;');
      if (usesInput) imports.push('import java.util.Scanner;');
      if (imports.length) java.push(...imports, '');
      java.push(`public class ${cls} {`, '');
      if (usesInput) java.push('    static final Scanner IN = new Scanner(System.in);', '');
      java.push('    public static void main(String[] args) {', ...r.j.map(ind(8)), '    }');
      const helper = (name, sig, lines) => {
        if (h.has(name)) java.push('', `    static ${sig} {`, ...lines.map(ind(8)), '    }');
      };
      helper('readInt', 'int readInt(String prompt)', ['System.out.print(prompt);', 'return Integer.parseInt(IN.nextLine().trim());']);
      helper('readDouble', 'double readDouble(String prompt)', ['System.out.print(prompt);', 'return Double.parseDouble(IN.nextLine().trim());']);
      helper('readLine', 'String readLine(String prompt)', ['System.out.print(prompt);', 'return IN.nextLine();']);
      helper('randomInt', 'int randomInt(int min, int max)', ['return min + (int) (Math.random() * (max - min + 1));']);
      java.push('}', '');

      return { java: java.join('\n'), js: r.s.join('\n'), errors: this.errors, className: cls };
    }
  }

  KB.compile = (ws) => new Compiler(ws).run();
})();
