// 编码视图：Base64 / URL / Unicode / HTML 实时转换 + 时间戳 + 哈希
import { $, $$, esc, debounce, copyText } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import {
  base64Encode, base64Decode, urlEncode, urlDecode, unicodeEscape, unicodeUnescape,
  htmlEscape, htmlUnescape, parseTime, hashText
} from '../core/codec.js';

const CONVERTERS = {
  base64: { encode: (t, o) => base64Encode(t, { urlSafe: o.urlSafe }), decode: base64Decode },
  url: { encode: urlEncode, decode: urlDecode },
  unicode: { encode: unicodeEscape, decode: unicodeUnescape },
  html: { encode: htmlEscape, decode: htmlUnescape }
};

export function initCodec() {
  const input = $('#codecIn');
  const out = $('#codecOut');
  const outCard = $('#codecOutCard');
  const kv = $('#codecKv');
  const st = $('#codecState');
  let mode = 'base64';
  let dir = 'encode';

  function setMode(m) {
    mode = m;
    $$('#codecMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
    const isKv = m === 'time' || m === 'hash';
    $('#codecDirWrap').classList.toggle('hidden', isKv);
    outCard.classList.toggle('hidden', isKv);
    kv.classList.toggle('hidden', !isKv);
    $('#urlSafeWrap').classList.toggle('hidden', m !== 'base64');
    input.placeholder = m === 'time' ? '输入时间戳（秒/毫秒）或日期，留空显示当前时间' : m === 'hash' ? '输入文本，计算 SHA 摘要' : '输入内容，实时转换';
    convert();
  }

  function setDir(d) {
    dir = d;
    $$('#codecDir button').forEach((b) => b.classList.toggle('on', b.dataset.dir === d));
    convert();
  }

  function renderKv(rows) {
    kv.innerHTML = rows
      .map(
        ([k, v]) => `<div class="kv"><span class="k">${esc(k)}</span><span class="v" title="${esc(v)}">${esc(v)}</span>
        <button class="icon-btn sm" data-copy="${esc(v)}" title="复制">${icon('copy')}</button></div>`
      )
      .join('');
  }

  async function convertNow() {
    const text = input.value;
    if (mode === 'time') {
      try {
        const t = parseTime(text.trim() || String(Date.now()));
        renderKv([
          ['秒', String(t.seconds)],
          ['毫秒', String(t.millis)],
          ['本地时间', t.local],
          ['ISO 8601', t.iso],
          ['相对现在', t.relative]
        ]);
      } catch (e) {
        kv.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
      }
      return;
    }
    if (mode === 'hash') {
      if (!text) return (kv.innerHTML = '<div class="empty">输入文本后显示 SHA-1 / SHA-256 / SHA-512</div>');
      const [a, b, c] = await Promise.all(['SHA-1', 'SHA-256', 'SHA-512'].map((alg) => hashText(text, alg)));
      if (input.value !== text) return;
      renderKv([['SHA-1', a], ['SHA-256', b], ['SHA-512', c]]);
      return;
    }
    outCard.classList.remove('error');
    if (!text) {
      out.textContent = '';
      st.textContent = '';
      return;
    }
    try {
      const res = CONVERTERS[mode][dir](text, { urlSafe: $('#urlSafe').checked });
      out.textContent = res;
      st.textContent = `${text.length} → ${res.length} 字符`;
    } catch (e) {
      out.textContent = e.message;
      outCard.classList.add('error');
      st.textContent = '';
    }
  }
  const convert = debounce(convertNow, 80);

  $('#codecMode').addEventListener('click', (e) => e.target.dataset.mode && setMode(e.target.dataset.mode));
  $('#codecDir').addEventListener('click', (e) => e.target.dataset.dir && setDir(e.target.dataset.dir));
  $('#urlSafe').addEventListener('change', convert);
  input.addEventListener('input', convert);
  $('#codecCopy').addEventListener('click', () => !outCard.classList.contains('error') && copyText(out.textContent));
  $('#codecSwap').addEventListener('click', () => {
    if (outCard.classList.contains('error') || !out.textContent) return;
    input.value = out.textContent;
    setDir(dir === 'encode' ? 'decode' : 'encode');
    input.focus();
  });
  kv.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy]');
    if (b) copyText(b.dataset.copy);
  });

  let clock = null;
  return {
    focus: () => input.focus(),
    onShow() {
      clock = setInterval(() => mode === 'time' && !input.value.trim() && convertNow(), 1000);
    },
    onHide() {
      clearInterval(clock);
    }
  };
}
