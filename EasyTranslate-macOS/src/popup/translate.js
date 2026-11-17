// 翻译视图：即时翻译（防抖 + 过期请求丢弃）、语言选择、朗读、历史
import { api } from '../ui/api.js';
import { $, esc, debounce, copyText, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { LANGUAGES, languageName, detectLanguage, resolveTarget } from '../core/language.js';
import { state } from './state.js';

const MAX = 5000;

export function initTranslate() {
  const src = $('#srcText');
  const dst = $('#dstText');
  const card = $('#resultCard');
  const srcLang = $('#srcLang');
  const dstLang = $('#dstLang');
  const detected = $('#detected');
  const resultState = $('#resultState');
  const count = $('#srcCount');
  const historyList = $('#historyList');
  const dictCard = $('#dictCard');

  /* ---------- 词典：单词 / 短语时显示音标、释义、同义词等 ---------- */
  async function lookup(text, id) {
    const d = await api.invoke('dict:lookup', text).catch(() => null);
    if (id !== seq) return;
    if (!d) {
      dictCard.hidden = true;
      return;
    }
    dictCard.innerHTML = renderDict(d);
    dictCard.hidden = false;
  }

  dictCard.addEventListener('click', (e) => {
    const audio = e.target.closest('[data-audio]');
    if (audio) return playAudio(audio.dataset.audio, audio.dataset.text);
    const w = e.target.closest('[data-word]');
    if (w) {
      src.value = w.dataset.word;
      updateCount();
      last = null;
      debounced.cancel();
      run();
      src.focus();
    }
  });
  let seq = 0;
  let last = null;

  srcLang.innerHTML =
    '<option value="auto">自动检测</option>' + LANGUAGES.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');
  dstLang.innerHTML =
    '<option value="auto">自动</option>' + LANGUAGES.map((l) => `<option value="${l.code}">${l.name}</option>`).join('');

  function setResult(text, mode = '') {
    dst.textContent = text;
    card.classList.toggle('loading', mode === 'loading');
    card.classList.toggle('error', mode === 'error');
  }

  async function run() {
    const text = src.value.trim();
    const id = ++seq;
    if (!text) {
      setResult('');
      dictCard.hidden = true;
      detected.textContent = '';
      resultState.textContent = '';
      last = null;
      return;
    }
    const from = srcLang.value;
    const guess = from === 'auto' ? detectLanguage(text) : from;
    const to = resolveTarget(guess, { preferredForeign: state.settings.translate?.foreignTarget || 'en', requested: dstLang.value });
    if (last && last.source === text && last.to === to && last.from === from) return;
    card.classList.add('loading');
    lookup(text, id);
    resultState.textContent = '翻译中…';
    try {
      const res = await api.invoke('translate:run', { text, from: from === 'auto' ? '' : from, to });
      if (id !== seq) return; // 已有更新的请求
      // 自动检测结果与本地猜测不一致（例如源语言就是目标语言），按真实语言重新确定目标
      const real = res.detected || guess;
      if (from === 'auto' && dstLang.value === 'auto' && real === to) {
        const fixed = resolveTarget(real, { preferredForeign: state.settings.translate?.foreignTarget || 'en' });
        if (fixed !== to) {
          const again = await api.invoke('translate:run', { text, from: real, to: fixed });
          if (id !== seq) return;
          return done(text, from, real, fixed, again.text);
        }
      }
      done(text, from, real, to, res.text);
    } catch (e) {
      if (id !== seq) return;
      setResult(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'error');
      resultState.textContent = '翻译失败';
    }
  }

  function done(text, from, real, to, out) {
    setResult(out);
    detected.textContent = from === 'auto' && real ? `检测到 ${languageName(real)}` : '';
    resultState.textContent = `${languageName(real)} → ${languageName(to)}`;
    last = { source: text, from, to, target: out };
    api.invoke('history:add', { source: text, target: out, from: real, to }).then(renderHistory);
    if (state.settings.translate?.autoCopy) copyText(out, '译文已复制');
  }

  const debounced = debounce(run, 420);

  function updateCount() {
    count.textContent = src.value.length ? `${src.value.length} / ${MAX}` : '';
  }

  src.addEventListener('input', () => {
    if (src.value.length > MAX) src.value = src.value.slice(0, MAX);
    updateCount();
    if (!src.value.trim()) {
      debounced.cancel();
      run();
    } else debounced();
  });
  src.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !(e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      debounced.cancel();
      last = null;
      run();
    }
  });
  srcLang.addEventListener('change', () => ((last = null), run()));
  dstLang.addEventListener('change', () => ((last = null), run()));
  $('#swapLang').addEventListener('click', () => {
    const real = last ? last.to : null;
    const prevFrom = srcLang.value === 'auto' ? detectLanguage(src.value) : srcLang.value;
    if (last?.target) src.value = last.target;
    srcLang.value = real || (dstLang.value === 'auto' ? 'auto' : dstLang.value);
    dstLang.value = prevFrom;
    updateCount();
    last = null;
    run();
    src.focus();
  });
  $('#clearSrc').addEventListener('click', () => {
    src.value = '';
    updateCount();
    run();
    src.focus();
  });
  $('#copyDst').addEventListener('click', () => copyText(dst.textContent, '译文已复制'));
  $('#speakSrc').addEventListener('click', () => speak(src.value, srcLang.value === 'auto' ? detectLanguage(src.value) : srcLang.value));
  $('#speakDst').addEventListener('click', () => speak(dst.textContent, last?.to));

  document.addEventListener('keydown', (e) => {
    if (!$('#view-translate').classList.contains('on')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      copyText(dst.textContent, '译文已复制');
    }
  });

  /* ---------- 历史 ---------- */
  async function renderHistory(list) {
    if (!Array.isArray(list)) list = await api.invoke('history:list');
    if (!list.length) {
      historyList.innerHTML = `<div class="empty">${icon('clock')}<span>翻译记录会显示在这里</span></div>`;
      return;
    }
    historyList.innerHTML = list
      .slice(0, 30)
      .map(
        (h) => `<div class="h-item" data-ts="${h.ts}" title="点击恢复">
          <div class="s">${esc(h.source)}</div><div class="t">${esc(h.target)}</div>
          <div class="meta"><span class="badge">${shortLang(h.from)}→${shortLang(h.to)}</span><span class="time">${ago(h.ts)}</span></div>
          <button class="icon-btn sm del" data-del="${h.ts}" title="删除">${icon('x')}</button></div>`
      )
      .join('');
    historyList.__list = list;
  }
  historyList.addEventListener('click', async (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      renderHistory(await api.invoke('history:remove', Number(del.dataset.del)));
      return;
    }
    const item = e.target.closest('.h-item');
    const h = item && historyList.__list?.find((x) => String(x.ts) === item.dataset.ts);
    if (!h) return;
    src.value = h.source;
    updateCount();
    setResult(h.target);
    resultState.textContent = `${languageName(h.from)} → ${languageName(h.to)}`;
    last = { source: h.source, from: srcLang.value, to: h.to, target: h.target };
    lookup(h.source, ++seq);
    src.focus();
  });
  $('#clearHistory').addEventListener('click', async () => {
    renderHistory(await api.invoke('history:clear'));
    toast('已清空记录');
  });
  renderHistory();

  return {
    focus(select) {
      src.focus();
      if (select && src.value) src.select();
    },
    onReveal(msg) {
      if (msg.notice === 'accessibility') {
        toast('划词翻译需要「辅助功能」权限，请在设置中授权', 'error');
      }
      if (msg.text) {
        src.value = msg.text.slice(0, MAX);
        updateCount();
        last = null;
        debounced.cancel();
        run();
        src.focus();
      }
    }
  };
}

function shortLang(code) {
  const map = { 'zh-Hans': '中', 'zh-Hant': '繁', en: 'EN', ja: '日', ko: '韩', fr: 'FR', de: 'DE', es: 'ES', ru: 'RU' };
  return map[code] || String(code || '?').toUpperCase().slice(0, 2);
}

function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return '刚刚';
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} 天前`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function renderDict(d) {
  const ph = d.phonetics
    .map((p) =>
      p.audio
        ? `<button class="phon" data-audio="${esc(p.audio)}" data-text="${esc(d.word)}" title="朗读">${esc(p.label)} <span>/${esc(p.text)}/</span>${icon('speaker')}</button>`
        : `<span class="phon plain">${esc(p.label)} <span>${esc(p.text)}</span></span>`
    )
    .join('');
  const defs = d.defs
    .map((x) =>
      x.link
        ? `<div class="def"><span class="pos">${esc(x.pos)}</span><span><button class="word-link" data-word="${esc(x.text)}">${esc(x.text)}</button>${x.note ? `<span class="note">${esc(x.note)}</span>` : ''}</span></div>`
        : `<div class="def"><span class="pos">${esc(x.pos || '·')}</span><span>${esc(x.text)}</span></div>`
    )
    .join('');
  const exams = d.exams.length ? `<div class="tags">${d.exams.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '';
  const forms = d.forms.length
    ? `<div class="forms">${d.forms.map((f) => `<span><em>${esc(f.name)}</em>${esc(f.value)}</span>`).join('')}</div>`
    : '';
  const syn = d.synonyms.length
    ? `<div class="sec"><div class="sec-t">同义词</div>${d.synonyms
        .map(
          (g) => `<div class="syn">${g.pos ? `<span class="pos">${esc(g.pos)}</span>` : ''}<div class="chips">${g.words
            .map((w) => `<button class="w" data-word="${esc(w)}">${esc(w)}</button>`)
            .join('')}</div></div>`
        )
        .join('')}</div>`
    : '';
  const phr = d.phrases.length
    ? `<div class="sec"><div class="sec-t">常用短语</div>${d.phrases
        .map((x) => `<div class="phr"><button class="word-link" data-word="${esc(x.text)}">${esc(x.text)}</button><span>${esc(x.tran)}</span></div>`)
        .join('')}</div>`
    : '';
  const ex = d.examples.length
    ? `<div class="sec"><div class="sec-t">例句</div>${d.examples
        .map((x) => `<div class="ex"><div>${esc(x.src)}</div><div class="muted">${esc(x.tran)}</div></div>`)
        .join('')}</div>`
    : '';
  return `<div class="dict-head"><span class="dict-word">${esc(d.word)}</span>${ph}</div>
    <div class="defs">${defs}</div>${forms}${exams}${syn}${phr}${ex}
    <div class="dict-src">释义来自有道词典</div>`;
}

let audioEl;
function playAudio(url, text) {
  audioEl?.pause();
  audioEl = new Audio(url);
  audioEl.play().catch(() => speak(text, 'en'));
}

function speak(text, lang) {
  if (!text?.trim()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.slice(0, 1000));
  const map = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW', en: 'en-US', ja: 'ja-JP', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU' };
  u.lang = map[lang] || lang || 'en-US';
  speechSynthesis.speak(u);
}
