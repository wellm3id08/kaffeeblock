(function () {
  const t = KB.t;
  const TYPES = ['int', 'double', 'String', 'boolean'];
  const ARRAY_TYPES = TYPES.map((ty) => ty + '[]');
  const CHECK = { int: 'Number', double: 'Number', String: 'String', boolean: 'Boolean' };
  ARRAY_TYPES.forEach((ty) => { CHECK[ty] = 'Array'; });

  const typeOptions = (list) => list.map((ty) => [ty, ty]);

  function define(type, json, extra) {
    Blockly.Blocks[type] = Object.assign(
      {
        init() {
          this.jsonInit(typeof json === 'function' ? json() : json);
          if (this.setup) this.setup();
        },
      },
      extra
    );
  }

  // Blockly connects a loaded block to its parent before it loads the block's
  // fields, so the output type also travels in extraState, which loads first.
  const typedOutput = {
    setup() {
      this.getField('TYPE').setValidator((v) => {
        this.outputConnection.setCheck(CHECK[v]);
        return v;
      });
    },
    saveExtraState() {
      return { type: this.getFieldValue('TYPE') };
    },
    loadExtraState(state) {
      if (state && CHECK[state.type]) this.outputConnection.setCheck(CHECK[state.type]);
    },
  };

  define('k_main', () => ({
    message0: t('blkMain'),
    args0: [{ type: 'field_input', name: 'NAME', text: 'Main', spellcheck: false }],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'BODY' }],
    style: 'event_blocks',
    tooltip: t('blkMainTip'),
  }), {
    setup() {
      this.setDeletable(false);
    },
  });

  define('k_print', () => ({
    message0: '%1 %2',
    args0: [
      { type: 'field_dropdown', name: 'MODE', options: [[t('blkPrintLine'), 'ln'], [t('blkPrint'), 'raw']] },
      { type: 'input_value', name: 'VALUE' },
    ],
    previousStatement: null,
    nextStatement: null,
    style: 'io_blocks',
    tooltip: t('blkPrintTip'),
  }));

  define('k_input', () => ({
    message0: t('blkInput'),
    args0: [
      { type: 'input_value', name: 'PROMPT', check: 'String' },
      { type: 'field_dropdown', name: 'TYPE', options: typeOptions(['int', 'double', 'String']) },
    ],
    output: 'Number',
    inputsInline: true,
    style: 'io_blocks',
    tooltip: t('blkInputTip'),
  }), typedOutput);

  define('k_comment', () => ({
    message0: t('blkComment'),
    args0: [{ type: 'field_input', name: 'TEXT', text: '' }],
    previousStatement: null,
    nextStatement: null,
    style: 'comment_blocks',
    tooltip: t('blkCommentTip'),
  }));

  define('k_declare', () => ({
    message0: t('blkDeclare'),
    args0: [
      { type: 'field_dropdown', name: 'TYPE', options: typeOptions(TYPES.concat(ARRAY_TYPES)) },
      { type: 'field_variable', name: 'VAR', variable: 'x' },
      { type: 'input_value', name: 'VALUE', check: 'Number' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'variable_blocks',
    tooltip: t('blkDeclareTip'),
  }), {
    setup() {
      this.getField('TYPE').setValidator((v) => {
        const input = this.getInput('VALUE');
        if (input) input.setCheck(CHECK[v]);
        return v;
      });
    },
  });

  define('k_set', () => ({
    message0: t('blkSet'),
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'x' },
      { type: 'input_value', name: 'VALUE' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'variable_blocks',
    tooltip: t('blkSetTip'),
  }));

  define('k_change', () => ({
    message0: t('blkChange'),
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'x' },
      { type: 'input_value', name: 'VALUE' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'variable_blocks',
    tooltip: t('blkChangeTip'),
  }));

  define('k_get', () => ({
    message0: '%1',
    args0: [{ type: 'field_variable', name: 'VAR', variable: 'x' }],
    output: null,
    style: 'variable_blocks',
    tooltip: t('blkGetTip'),
  }));

  define('k_cast', () => ({
    message0: t('blkCast'),
    args0: [
      { type: 'input_value', name: 'VALUE' },
      { type: 'field_dropdown', name: 'TYPE', options: typeOptions(TYPES) },
    ],
    inputsInline: true,
    output: 'Number',
    style: 'math_blocks',
    tooltip: t('blkCastTip'),
  }), typedOutput);

  define('k_array_new', () => ({
    message0: t('blkArrayNew'),
    args0: [{ type: 'input_value', name: 'SIZE', check: 'Number' }],
    inputsInline: true,
    output: 'Array',
    style: 'list_blocks',
    tooltip: t('blkArrayNewTip'),
  }));

  define('k_array_get', () => ({
    message0: '%1 [ %2 ]',
    args0: [
      { type: 'input_value', name: 'ARRAY', check: 'Array' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
    ],
    inputsInline: true,
    output: null,
    style: 'list_blocks',
    tooltip: t('blkArrayGetTip'),
  }));

  define('k_array_set', () => ({
    message0: t('blkArraySet'),
    args0: [
      { type: 'input_value', name: 'ARRAY', check: 'Array' },
      { type: 'input_value', name: 'INDEX', check: 'Number' },
      { type: 'input_value', name: 'VALUE' },
    ],
    inputsInline: true,
    previousStatement: null,
    nextStatement: null,
    style: 'list_blocks',
    tooltip: t('blkArraySetTip'),
  }));

  define('k_array_length', () => ({
    message0: t('blkArrayLength'),
    args0: [{ type: 'input_value', name: 'ARRAY', check: 'Array' }],
    output: 'Number',
    style: 'list_blocks',
    tooltip: t('blkArrayLengthTip'),
  }));

  define('k_array_text', () => ({
    message0: t('blkArrayText'),
    args0: [{ type: 'input_value', name: 'ARRAY', check: 'Array' }],
    output: 'String',
    style: 'list_blocks',
    tooltip: t('blkArrayTextTip'),
  }));

  define('k_for_each', () => ({
    message0: t('blkForEach'),
    args0: [
      { type: 'field_variable', name: 'VAR', variable: 'item' },
      { type: 'input_value', name: 'ARRAY', check: 'Array' },
    ],
    message1: '%1',
    args1: [{ type: 'input_statement', name: 'DO' }],
    previousStatement: null,
    nextStatement: null,
    style: 'loop_blocks',
    tooltip: t('blkForEachTip'),
  }));

  const palette = {
    light: {
      program: '#8d5b3c', io: '#2f7fe0', variable: '#e0712a', logic: '#7657d1',
      loop: '#16917e', math: '#3a9a48', text: '#cc4677', comment: '#8a8f98', array: '#b07c0c',
      ui: {
        workspaceBackgroundColour: '#f6f5f2', toolboxBackgroundColour: '#ffffff',
        toolboxForegroundColour: '#2b2a28', flyoutBackgroundColour: '#efeee9',
        flyoutForegroundColour: '#2b2a28', flyoutOpacity: 1, scrollbarColour: '#c9c5bd',
        scrollbarOpacity: 0.5, insertionMarkerColour: '#000000', insertionMarkerOpacity: 0.2,
      },
    },
    dark: {
      program: '#9a6748', io: '#3d7fd0', variable: '#d06a2a', logic: '#7259c4',
      loop: '#168a78', math: '#378f45', text: '#bd4470', comment: '#6d727b', array: '#9c6e0c',
      ui: {
        workspaceBackgroundColour: '#1b1b1d', toolboxBackgroundColour: '#202023',
        toolboxForegroundColour: '#e8e6e1', flyoutBackgroundColour: '#26262a',
        flyoutForegroundColour: '#e8e6e1', flyoutOpacity: 1, scrollbarColour: '#4a4a50',
        scrollbarOpacity: 0.6, insertionMarkerColour: '#ffffff', insertionMarkerOpacity: 0.25,
      },
    },
  };

  KB.makeTheme = function (mode) {
    const p = palette[mode];
    const style = (c, extra) => Object.assign({ colourPrimary: c }, extra);
    return Blockly.Theme.defineTheme('kaffee-' + mode, {
      base: Blockly.Themes.Classic,
      blockStyles: {
        event_blocks: style(p.program, { hat: 'cap' }),
        io_blocks: style(p.io),
        comment_blocks: style(p.comment),
        variable_blocks: style(p.variable),
        logic_blocks: style(p.logic),
        loop_blocks: style(p.loop),
        math_blocks: style(p.math),
        text_blocks: style(p.text),
        list_blocks: style(p.array),
      },
      categoryStyles: {
        program_category: { colour: p.program },
        variable_category: { colour: p.variable },
        logic_category: { colour: p.logic },
        loop_category: { colour: p.loop },
        math_category: { colour: p.math },
        text_category: { colour: p.text },
        array_category: { colour: p.array },
      },
      componentStyles: p.ui,
      fontStyle: { family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', weight: '600', size: 11 },
      startHats: true,
    });
  };

  const num = (n) => ({ shadow: { type: 'math_number', fields: { NUM: n } } });
  const str = (s) => ({ shadow: { type: 'text', fields: { TEXT: s } } });
  const nums = () => ({ block: { type: 'k_get', fields: { VAR: { name: 'nums' } } } });

  KB.toolbox = function () {
    return {
      kind: 'categoryToolbox',
      contents: [
        {
          kind: 'category', name: t('catProgram'), categorystyle: 'program_category',
          contents: [
            { kind: 'block', type: 'k_print', inputs: { VALUE: str('Hello') } },
            { kind: 'block', type: 'k_input', inputs: { PROMPT: str('?') } },
            { kind: 'block', type: 'k_comment' },
          ],
        },
        { kind: 'category', name: t('catVariables'), categorystyle: 'variable_category', custom: 'KB_VARIABLES' },
        {
          kind: 'category', name: t('catLogic'), categorystyle: 'logic_category',
          contents: [
            { kind: 'block', type: 'controls_if' },
            { kind: 'block', type: 'controls_if', extraState: { hasElse: true } },
            { kind: 'block', type: 'logic_compare' },
            { kind: 'block', type: 'logic_operation' },
            { kind: 'block', type: 'logic_negate' },
            { kind: 'block', type: 'logic_boolean' },
            { kind: 'block', type: 'logic_ternary' },
          ],
        },
        {
          kind: 'category', name: t('catLoops'), categorystyle: 'loop_category',
          contents: [
            { kind: 'block', type: 'controls_repeat_ext', inputs: { TIMES: num(10) } },
            { kind: 'block', type: 'controls_whileUntil' },
            {
              kind: 'block', type: 'controls_for',
              fields: { VAR: { name: 'i' } },
              inputs: { FROM: num(1), TO: num(10), BY: num(1) },
            },
            { kind: 'block', type: 'controls_flow_statements' },
          ],
        },
        {
          kind: 'category', name: t('catMath'), categorystyle: 'math_category',
          contents: [
            { kind: 'block', type: 'math_number', fields: { NUM: 0 } },
            { kind: 'block', type: 'math_arithmetic', inputs: { A: num(1), B: num(1) } },
            { kind: 'block', type: 'math_modulo', inputs: { DIVIDEND: num(10), DIVISOR: num(3) } },
            { kind: 'block', type: 'math_single', inputs: { NUM: num(9) } },
            { kind: 'block', type: 'math_round', inputs: { NUM: num(3.5) } },
            { kind: 'block', type: 'math_random_int', inputs: { FROM: num(1), TO: num(100) } },
            { kind: 'block', type: 'k_cast', fields: { TYPE: 'int' } },
          ],
        },
        {
          kind: 'category', name: t('catText'), categorystyle: 'text_category',
          contents: [
            { kind: 'block', type: 'text' },
            { kind: 'block', type: 'text_join' },
            { kind: 'block', type: 'text_length', inputs: { VALUE: str('abc') } },
            { kind: 'block', type: 'k_cast', fields: { TYPE: 'String' } },
          ],
        },
        {
          kind: 'category', name: t('catArrays'), categorystyle: 'array_category',
          contents: [
            {
              kind: 'block', type: 'k_declare', fields: { TYPE: 'int[]', VAR: { name: 'nums' } },
              inputs: { VALUE: { block: { type: 'lists_create_with', extraState: { itemCount: 3 }, inputs: { ADD0: num(4), ADD1: num(8), ADD2: num(15) } } } },
            },
            {
              kind: 'block', type: 'k_declare', fields: { TYPE: 'int[]', VAR: { name: 'nums' } },
              inputs: { VALUE: { block: { type: 'k_array_new', inputs: { SIZE: num(5) } } } },
            },
            { kind: 'block', type: 'lists_create_with', extraState: { itemCount: 3 } },
            { kind: 'block', type: 'k_array_new', inputs: { SIZE: num(5) } },
            { kind: 'block', type: 'k_array_get', inputs: { ARRAY: nums(), INDEX: num(0) } },
            { kind: 'block', type: 'k_array_set', inputs: { ARRAY: nums(), INDEX: num(0), VALUE: num(1) } },
            { kind: 'block', type: 'k_array_length', inputs: { ARRAY: nums() } },
            { kind: 'block', type: 'k_for_each', fields: { VAR: { name: 'n' } }, inputs: { ARRAY: nums() } },
            { kind: 'block', type: 'k_array_text', inputs: { ARRAY: nums() } },
          ],
        },
      ],
    };
  };

  KB.variablesFlyout = function (ws) {
    const vars = ws.getAllVariables().slice().sort((a, b) => a.name.localeCompare(b.name));
    const items = [{ kind: 'button', text: t('newVar'), callbackkey: 'KB_NEW_VAR' }];
    const first = vars[0] ? { VAR: { name: vars[0].name } } : undefined;
    items.push({ kind: 'block', type: 'k_declare', fields: Object.assign({ TYPE: 'int' }, first), inputs: { VALUE: num(0) } });
    if (!vars.length) return items;
    items.push({ kind: 'block', type: 'k_set', fields: first });
    items.push({ kind: 'block', type: 'k_change', fields: first, inputs: { VALUE: num(1) } });
    vars.forEach((v) => items.push({ kind: 'block', type: 'k_get', fields: { VAR: { name: v.name } } }));
    return items;
  };
})();
