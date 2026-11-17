// CodeMirror 6 JSON 编辑器
import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, highlightSpecialChars, rectangularSelection
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { linter, lintGutter } from '@codemirror/lint';
import {
  syntaxHighlighting, HighlightStyle, bracketMatching, foldGutter, foldKeymap, indentOnInput, indentUnit
} from '@codemirror/language';
import { search, searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: t.propertyName, class: 'tok-key' },
  { tag: t.string, class: 'tok-str' },
  { tag: t.number, class: 'tok-num' },
  { tag: t.bool, class: 'tok-bool' },
  { tag: t.null, class: 'tok-null' }
]);

export function createEditor(parent, { onChange, onCursor } = {}) {
  const indentConf = new Compartment();
  const lintConf = new Compartment();
  const LARGE = 1_500_000;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: '',
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter({ openText: '▾', closedText: '▸' }),
        drawSelection(),
        rectangularSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        search({ top: true }),
        json(),
        syntaxHighlighting(highlight),
        lintGutter(),
        lintConf.of(linter(jsonParseLinter(), { delay: 400 })),
        indentConf.of(indentUnit.of('  ')),
        EditorView.lineWrapping,
        keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) onChange?.(u.state.doc);
          if (u.selectionSet || u.docChanged) {
            const head = u.state.selection.main.head;
            const line = u.state.doc.lineAt(head);
            onCursor?.({ line: line.number, col: head - line.from + 1, pos: head });
          }
        })
      ]
    })
  });

  let lintOn = true;
  return {
    view,
    get value() {
      return view.state.doc.toString();
    },
    setValue(text, { keepHistory = true } = {}) {
      const large = text.length > LARGE;
      if (large === lintOn) {
        lintOn = !large;
        view.dispatch({ effects: lintConf.reconfigure(lintOn ? linter(jsonParseLinter(), { delay: 400 }) : []) });
      }
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: 0 },
        scrollIntoView: true,
        ...(keepHistory ? {} : {})
      });
    },
    setIndent(unit) {
      view.dispatch({ effects: indentConf.reconfigure(indentUnit.of(unit === 'tab' ? '\t' : ' '.repeat(Number(unit) || 2))) });
    },
    goto(line, col = 1) {
      const doc = view.state.doc;
      const l = doc.line(Math.min(Math.max(1, line), doc.lines));
      const pos = Math.min(l.to, l.from + Math.max(0, col - 1));
      view.dispatch({ selection: { anchor: pos, head: Math.min(l.to, pos + 1) }, scrollIntoView: true });
      view.focus();
    },
    selection() {
      const s = view.state.selection.main;
      return s.empty ? null : { from: s.from, to: s.to, text: view.state.sliceDoc(s.from, s.to) };
    },
    replaceRange(from, to, text) {
      view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from, head: from + text.length } });
    },
    focus: () => view.focus()
  };
}
