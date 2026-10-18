(function () {
  const t = KB.t;
  const $ = (sel) => document.querySelector(sel);
  const STORE_WS = 'kaffeeblock.workspace';
  const STORE_LANG = 'kaffeeblock.lang';
  const TERM_LIMIT = 200000;

  const store = {
    get(key) {
      try { return localStorage.getItem(key); } catch (e) { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
    },
  };

  const darkQuery = matchMedia('(prefers-color-scheme: dark)');
  const themes = {};
  const theme = () => {
    const mode = darkQuery.matches ? 'dark' : 'light';
    return themes[mode] || (themes[mode] = KB.makeTheme(mode));
  };

  let ws = null;
  let latest = { java: '', errors: [], className: 'Main' };
  let runtime = null;
  let pendingRead = null;
  let refreshTimer = 0;
  let warned = new Map();

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function translateUI() {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.dataset.i18nTitle);
      el.setAttribute('aria-label', el.title);
    });
    document.querySelectorAll('.seg [data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === KB.lang));
    $('#run span').textContent = t(runtime ? 'stop' : 'run');
    $('#answer').placeholder = t('inputHint');

    const select = $('#examples');
    select.innerHTML = '';
    select.add(new Option(t('examples'), '', true, true));
    select.options[0].disabled = true;
    Object.entries(KB.examples).forEach(([key, ex]) => select.add(new Option(ex.title(), key)));
  }

  async function setLanguage(lang) {
    KB.lang = lang;
    store.set(STORE_LANG, lang);
    document.documentElement.lang = lang;
    // Blockly's own strings (context menus, built-in blocks) live in Blockly.Msg.
    await loadScript(`vendor/blockly/msg/${lang}.js`);
    Object.assign(Blockly.Msg, {
      LISTS_CREATE_WITH_INPUT_WITH: t('blkArrayWith'),
      LISTS_CREATE_EMPTY_TITLE: t('blkArrayEmpty'),
      LISTS_CREATE_WITH_CONTAINER_TITLE_ADD: t('blkArrayItems'),
    });
    translateUI();
    if (ws) {
      const state = Blockly.serialization.workspaces.save(ws);
      ws.updateToolbox(KB.toolbox());
      loadState(state);
    }
  }

  function ensureMain() {
    if (!ws.getBlocksByType('k_main', false).length) {
      Blockly.serialization.blocks.append({ type: 'k_main', x: 40, y: 40 }, ws);
    }
  }

  function loadState(state) {
    Blockly.Events.disable();
    try {
      Blockly.serialization.workspaces.load(state, ws);
    } finally {
      Blockly.Events.enable();
    }
    warned = new Map();
    ensureMain();
    refresh();
  }

  function highlight(src) {
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const span = (cls, s) => `<span class="${cls}">${esc(s)}</span>`;
    const keywords = /^(public|class|static|final|void|int|double|boolean|if|else|for|while|return|new|import|break|continue|true|false)$/;
    const re = /(\/\/[^\n]*)|("(?:\\.|[^"\\\n])*")|(\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
      out += esc(src.slice(last, m.index));
      if (m[1]) out += span('c', m[1]);
      else if (m[2]) out += span('s', m[2]);
      else if (m[3]) out += span('n', m[3]);
      else if (keywords.test(m[4])) out += span('k', m[4]);
      else if (/^[A-Z]/.test(m[4])) out += span('t', m[4]);
      else out += esc(m[4]);
      last = re.lastIndex;
    }
    return out + esc(src.slice(last));
  }

  function markErrors(errors) {
    const next = new Map();
    errors.forEach((e) => {
      if (e.block && !next.has(e.block.id)) next.set(e.block.id, e.msg);
    });
    warned.forEach((msg, id) => {
      if (!next.has(id)) {
        const b = ws.getBlockById(id);
        if (b) b.setWarningText(null);
      }
    });
    next.forEach((msg, id) => {
      if (warned.get(id) !== msg) ws.getBlockById(id).setWarningText(msg);
    });
    warned = next;
  }

  function refresh() {
    clearTimeout(refreshTimer);
    latest = KB.compile(ws);
    $('#filename').textContent = latest.className + '.java';
    $('#code code').innerHTML = highlight(latest.java);
    markErrors(latest.errors);
    const badge = $('#problems');
    badge.hidden = !latest.errors.length;
    badge.textContent = latest.errors.length;
    store.set(STORE_WS, JSON.stringify(Blockly.serialization.workspaces.save(ws)));
  }

  function selectBlock(block) {
    if (!block || block.disposed) return;
    ws.centerOnBlock(block.id);
    block.select();
  }

  const term = {
    el: $('#term'),
    buffer: '',
    size: 0,
    scheduled: false,
    write(text) {
      term.buffer += text;
      if (!term.scheduled) {
        term.scheduled = true;
        requestAnimationFrame(term.flush);
      }
    },
    flush() {
      term.scheduled = false;
      if (!term.buffer) return;
      const last = term.el.lastChild;
      if (last && last.nodeType === Node.TEXT_NODE) last.appendData(term.buffer);
      else term.el.appendChild(document.createTextNode(term.buffer));
      term.size += term.buffer.length;
      term.buffer = '';
      while (term.size > TERM_LIMIT && term.el.firstChild) {
        const first = term.el.firstChild;
        const excess = term.size - TERM_LIMIT;
        if (first.nodeType === Node.TEXT_NODE && first.length > excess) {
          first.deleteData(0, excess);
          term.size -= excess;
        } else {
          term.size -= first.textContent.length;
          first.remove();
        }
      }
      term.scroll();
    },
    line(text, cls, block) {
      term.flush();
      const tail = term.el.textContent;
      if (tail && !tail.endsWith('\n')) term.el.appendChild(document.createTextNode('\n'));
      const el = document.createElement(block === undefined ? 'span' : 'button');
      el.className = cls;
      el.textContent = block === undefined ? text + '\n' : text;
      if (block) el.onclick = () => selectBlock(block);
      term.el.appendChild(el);
      term.size += text.length + 1;
      term.scroll();
    },
    clear() {
      term.el.textContent = '';
      term.buffer = '';
      term.size = 0;
    },
    scroll() {
      const box = $('#console');
      box.scrollTop = box.scrollHeight;
    },
  };

  function readLine() {
    const form = $('#ask');
    const input = $('#answer');
    term.flush();
    form.hidden = false;
    input.value = '';
    input.focus({ preventScroll: true });
    term.scroll();
    return new Promise((resolve) => {
      pendingRead = (value) => {
        pendingRead = null;
        form.hidden = true;
        resolve(value);
      };
    });
  }

  function setRunning(on) {
    $('#run').classList.toggle('running', on);
    $('#run span').textContent = t(on ? 'stop' : 'run');
  }

  async function run() {
    if (runtime) {
      runtime.stop();
      if (pendingRead) pendingRead('');
      return;
    }
    refresh();
    term.clear();
    if (latest.errors.length) {
      term.line(t('problems'), 'err');
      latest.errors.forEach((e) => term.line(e.msg, 'problem', e.block));
      selectBlock(latest.errors[0].block);
      return;
    }
    runtime = KB.createRuntime({ write: term.write, flush: term.flush, read: readLine });
    setRunning(true);
    const result = await runtime.run(latest.js);
    term.flush();
    if (result.status === 'error') term.line(result.message, 'err');
    else term.line(t(result.status), 'sys');
    runtime = null;
    $('#ask').hidden = true;
    setRunning(false);
  }

  async function saveText(name, text, ext) {
    if (window.Neutralino && window.NL_PORT) {
      try {
        const path = await Neutralino.os.showSaveDialog(name, { defaultPath: name, filters: [{ name: ext, extensions: [ext] }] });
        if (path) await Neutralino.filesystem.writeFile(path, text);
        return;
      } catch (e) { /* fall back to a browser download */ }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  async function copyCode() {
    const btn = $('#copy');
    try {
      await navigator.clipboard.writeText(latest.java);
    } catch (e) {
      const area = document.createElement('textarea');
      area.value = latest.java;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    btn.classList.add('done');
    btn.title = t('copied');
    setTimeout(() => {
      btn.classList.remove('done');
      btn.title = t('copy');
    }, 1400);
  }

  function openProject(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const state = data.workspace || data;
        if (!state.blocks) throw new Error('no blocks');
        loadState(state);
      } catch (e) {
        alert(t('badFile'));
      }
    };
    reader.readAsText(file);
  }

  function bind() {
    $('#run').onclick = run;
    $('#clear').onclick = () => term.clear();
    $('#copy').onclick = copyCode;
    $('#export').onclick = () => saveText(latest.className + '.java', latest.java, 'java');
    $('#save').onclick = () => {
      const data = { app: 'KaffeeBlock', version: 1, workspace: Blockly.serialization.workspaces.save(ws) };
      saveText(latest.className + '.kblock', JSON.stringify(data, null, 2), 'kblock');
    };
    $('#open').onclick = () => $('#file').click();
    $('#file').onchange = (e) => {
      if (e.target.files[0]) openProject(e.target.files[0]);
      e.target.value = '';
    };
    $('#problems').onclick = () => latest.errors[0] && selectBlock(latest.errors[0].block);
    $('#examples').onchange = (e) => {
      const ex = KB.examples[e.target.value];
      e.target.selectedIndex = 0;
      if (ex && confirm(t('replaceConfirm'))) loadState(ex.build());
    };
    document.querySelectorAll('.seg [data-lang]').forEach((b) => {
      b.onclick = () => b.dataset.lang !== KB.lang && setLanguage(b.dataset.lang);
    });
    $('#ask').onsubmit = (e) => {
      e.preventDefault();
      if (pendingRead) pendingRead($('#answer').value);
    };
    $('#console').onclick = () => !$('#ask').hidden && $('#answer').focus();
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        run();
      }
    });
    darkQuery.addEventListener('change', () => ws.setTheme(theme()));
  }

  async function boot() {
    const saved = store.get(STORE_LANG);
    const lang = saved || ((navigator.language || 'en').toLowerCase().startsWith('es') ? 'es' : 'en');
    await setLanguage(lang);

    ws = Blockly.inject($('#workspace'), {
      toolbox: KB.toolbox(),
      theme: theme(),
      renderer: 'zelos',
      media: 'vendor/blockly/media/',
      grid: { spacing: 24, length: 2, colour: '#e3e0d9', snap: false },
      zoom: { controls: true, wheel: false, startScale: 0.8, maxScale: 2, minScale: 0.4, scaleSpeed: 1.15, pinch: true },
      move: { scrollbars: true, drag: true, wheel: true },
      trashcan: true,
      sounds: false,
      maxInstances: { k_main: 1 },
    });
    ws.registerToolboxCategoryCallback('KB_VARIABLES', KB.variablesFlyout);
    ws.registerButtonCallback('KB_NEW_VAR', () => Blockly.Variables.createVariableButtonHandler(ws));
    ws.addChangeListener(Blockly.Events.disableOrphans);
    ws.addChangeListener((e) => {
      if (e.isUiEvent || ws.isDragging()) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 150);
    });
    new ResizeObserver(() => Blockly.svgResize(ws)).observe($('#workspace'));

    let state = null;
    try { state = JSON.parse(store.get(STORE_WS)); } catch (e) { /* corrupted autosave */ }
    loadState(state && state.blocks ? state : KB.examples.hello.build());

    bind();
    term.line(t('ready'), 'sys');

    if (window.NL_PORT) {
      await loadScript('vendor/neutralino.js');
      Neutralino.init();
    }
  }

  boot();
})();
