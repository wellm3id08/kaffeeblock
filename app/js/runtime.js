(function () {
  const INT_MAX = 2147483647;
  const INT_MIN = -2147483648;

  class JavaException extends Error {
    constructor(type, message) {
      super(message);
      this.javaType = type;
    }
    toString() {
      return `Exception in thread "main" ${this.javaType}${this.message ? ': ' + this.message : ''}`;
    }
  }

  class Stopped extends Error {}

  const numberFormat = (s) => new JavaException('java.lang.NumberFormatException', `For input string: "${s}"`);

  // Matches Java's Double.toString: plain notation in [1e-3, 1e7), otherwise
  // "computerized scientific notation" like 1.0E7.
  function formatDouble(v) {
    if (Number.isNaN(v)) return 'NaN';
    if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
    if (v === 0) return Object.is(v, -0) ? '-0.0' : '0.0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e7) {
      const s = String(v);
      return s.includes('.') ? s : s + '.0';
    }
    let [m, e] = v.toExponential().split('e');
    if (!m.includes('.')) m += '.0';
    return m + 'E' + (e[0] === '+' ? e.slice(1) : e);
  }

  function parseInt32(s) {
    if (!/^[+-]?\d+$/.test(s)) throw numberFormat(s);
    const n = Number(s);
    if (n > INT_MAX || n < INT_MIN) throw numberFormat(s);
    return n;
  }

  function parseDouble(s) {
    const x = s.trim();
    if (/^[+-]?(NaN|Infinity)$/.test(x)) return Number(x.replace('+', ''));
    if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?[dDfF]?$/.test(x)) throw numberFormat(s);
    return Number(x.replace(/[dDfF]$/, ''));
  }

  const DEFAULT_ITEM = { int: 0, double: 0, boolean: false, String: null };
  const ARRAY_TAG = { int: '[I', double: '[D', boolean: '[Z', String: '[Ljava.lang.String;' };
  const hashes = new WeakMap();

  // Java prints an array as its type tag and identity hash, e.g. [I@1b6d3586.
  // The hash differs on every JVM run, so a random stable one per array is faithful.
  function arrayName(a, type) {
    if (a === null) return 'null';
    if (!hashes.has(a)) hashes.set(a, (Math.random() * 0x7fffffff >>> 0).toString(16));
    return ARRAY_TAG[type.slice(0, -2)] + '@' + hashes.get(a);
  }

  function checkIndex(a, i) {
    if (i < 0 || i >= a.length) {
      throw new JavaException('java.lang.ArrayIndexOutOfBoundsException', `Index ${i} out of bounds for length ${a.length}`);
    }
  }

  KB.createRuntime = function (io) {
    let stopped = false;
    let lastYield = performance.now();
    let ticks = 0;

    const J = {
      str(v, type) {
        if (type.endsWith('[]')) return arrayName(v, type);
        return type === 'double' ? formatDouble(v) : String(v);
      },
      newArray(n, type) {
        if (n < 0) throw new JavaException('java.lang.NegativeArraySizeException', String(n));
        return new Array(n).fill(DEFAULT_ITEM[type]);
      },
      aget(a, i) {
        checkIndex(a, i);
        return a[i];
      },
      aset(a, i, v) {
        checkIndex(a, i);
        a[i] = v;
      },
      arrayText(a, type) {
        if (a === null) return 'null';
        return '[' + a.map((v) => J.str(v, type)).join(', ') + ']';
      },
      out(text, newline) {
        io.write(newline ? text + '\n' : text);
      },
      idiv(a, b) {
        if (b === 0) throw new JavaException('java.lang.ArithmeticException', '/ by zero');
        return (a / b) | 0;
      },
      imod(a, b) {
        if (b === 0) throw new JavaException('java.lang.ArithmeticException', '/ by zero');
        return (a % b) | 0;
      },
      d2i(x) {
        if (Number.isNaN(x)) return 0;
        if (x >= INT_MAX) return INT_MAX;
        if (x <= INT_MIN) return INT_MIN;
        return Math.trunc(x) | 0;
      },
      randomInt(min, max) {
        return (min + J.d2i(Math.random() * (max - min + 1))) | 0;
      },
      parseInt: parseInt32,
      parseDouble,
      parseBoolean: (s) => s.toLowerCase() === 'true',
      async input(prompt, type) {
        io.write(prompt);
        const raw = await io.read();
        if (stopped) throw new Stopped();
        io.write(raw + '\n');
        if (type === 'int') return parseInt32(raw.trim());
        if (type === 'double') return parseDouble(raw);
        return raw;
      },
      // Called once per loop lap. Yields to the browser every ~30ms so endless
      // loops stay stoppable and output keeps streaming.
      tick() {
        if (stopped) throw new Stopped();
        if (++ticks % 1000 !== 0) return;
        const now = performance.now();
        if (now - lastYield < 30) return;
        lastYield = now;
        return new Promise((resolve) => setTimeout(resolve, 0)).then(() => {
          io.flush();
          if (stopped) throw new Stopped();
        });
      },
    };

    return {
      async run(code) {
        const program = new Function('J', `"use strict";\nreturn (async () => {\n${code}\n})();`);
        try {
          await program(J);
          return { status: 'finished' };
        } catch (e) {
          if (e instanceof Stopped) return { status: 'stopped' };
          if (e instanceof JavaException) return { status: 'error', message: e.toString() };
          // Reading .length or calling a method on a null String element.
          if (e instanceof TypeError) return { status: 'error', message: 'Exception in thread "main" java.lang.NullPointerException' };
          return { status: 'error', message: String(e) };
        }
      },
      stop() {
        stopped = true;
      },
    };
  };

})();
