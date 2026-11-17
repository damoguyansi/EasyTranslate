// 弹窗 JSON 视图：快速格式化 / 压缩 / 转义，复杂处理一键转到工作台
import { api } from '../ui/api.js';
import { $, debounce, copyText, toast, enableTabIndent } from '../ui/dom.js';
import {
  formatJson, minifyJson, validateJson, escapeJsonString, unescapeJsonString, textStats, formatBytes
} from '../core/json.js';

export function initJson() {
  const ta = $('#jsonText');
  const stateEl = $('#jsonState');
  const stats = $('#jsonStats');
  let errorPos = null;
  enableTabIndent(ta);

  function setText(text) {
    // 使用 execCommand 以保留撤销栈（⌘Z 可撤回格式化）
    ta.focus();
    ta.select();
    if (!document.execCommand('insertText', false, text)) ta.value = text;
    ta.setSelectionRange(0, 0);
    ta.scrollTop = 0;
    refresh();
  }

  function setState(kind, msg) {
    stateEl.className = 'state' + (kind ? ' ' + kind : '');
    stateEl.textContent = msg || '';
    stateEl.title = msg || '';
  }

  const refresh = debounce(() => {
    const s = textStats(ta.value);
    stats.textContent = s.chars ? `${s.lines} 行 · ${formatBytes(s.bytes)}` : '';
    errorPos = null;
    if (!ta.value.trim()) return setState('', '');
    if (ta.value.length > 3_000_000) return setState('', '内容较大，建议在工作台中处理');
    const v = validateJson(ta.value);
    if (v.ok) setState('ok', '有效 JSON');
    else {
      errorPos = v.error;
      setState('err', `${v.error.line ? `第 ${v.error.line} 行 ${v.error.column} 列：` : ''}${v.error.message}`);
    }
  }, 160);
  const saveDraft = debounce(() => api.invoke('draft:set', 'popup-json', ta.value), 600);

  ta.addEventListener('input', () => {
    refresh();
    saveDraft();
  });
  stateEl.addEventListener('click', () => {
    if (!errorPos?.line) return;
    const lines = ta.value.split('\n');
    let idx = 0;
    for (let i = 0; i < errorPos.line - 1; i++) idx += lines[i].length + 1;
    idx += (errorPos.column || 1) - 1;
    ta.focus();
    ta.setSelectionRange(idx, idx + 1);
  });

  function format() {
    if (!ta.value.trim()) return toast('请先输入 JSON', 'error');
    const r = formatJson(ta.value, { indent: 2 });
    if (!r.ok) return toast(r.error.message, 'error');
    setText(r.text);
    if (r.loose) toast('不是标准 JSON，已按结构排版');
    else if (r.unwrapped) toast(`已自动去除 ${r.unwrapped} 层转义`);
  }

  $('#jsonFormat').addEventListener('click', format);
  $('#jsonMinify').addEventListener('click', () => {
    const r = minifyJson(ta.value);
    r.ok ? setText(r.text) : toast(r.error.message, 'error');
  });
  $('#jsonEscape').addEventListener('click', () => ta.value && setText(escapeJsonString(ta.value)));
  $('#jsonUnescape').addEventListener('click', () => {
    try {
      ta.value && setText(unescapeJsonString(ta.value));
    } catch (e) {
      toast(e.message, 'error');
    }
  });
  $('#jsonCopy').addEventListener('click', () => copyText(ta.value));
  $('#jsonClear').addEventListener('click', () => setText(''));
  $('#jsonOpen').addEventListener('click', () => api.invoke('workspace:open', { tool: 'json', text: ta.value }));

  ta.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      format();
    }
  });
  // 粘贴后若内容就是 JSON，自动格式化
  ta.addEventListener('paste', () => {
    setTimeout(() => {
      const t = ta.value.trim();
      if (t && t.length < 2_000_000 && !t.includes('\n') && validateJson(t).ok) format();
    }, 0);
  });

  api.invoke('draft:get', 'popup-json').then((v) => {
    if (v && !ta.value) {
      ta.value = v;
      refresh();
    }
  });

  return { focus: () => ta.focus() };
}
