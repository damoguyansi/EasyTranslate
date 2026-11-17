// 词典服务（主进程）：有道词典 jsonapi，为单词 / 短语提供音标、释义、同义词、短语、例句
const ENDPOINT = 'https://dict.youdao.com/jsonapi';
const VOICE = 'https://dict.youdao.com/dictvoice';
const CACHE_LIMIT = 200;

/** 是否值得查词：英文 ≤ 3 个单词，或中文 ≤ 6 个字，且不含句子标点 */
export function isLookupCandidate(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 40) return false;
  if (/^[A-Za-z][A-Za-z'’-]*(\s+[A-Za-z][A-Za-z'’-]*){0,2}$/.test(t)) return true;
  return /^[一-鿿]{1,6}$/.test(t);
}

const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '').trim();

function textOf(i) {
  if (typeof i === 'string') return i;
  if (Array.isArray(i)) return i.map(textOf).join('');
  if (i && typeof i === 'object') return i['#text'] || '';
  return '';
}

/** 把 "adj. 显著的；重要的" 拆成词性与释义 */
export function splitPos(line) {
  const m = String(line).match(/^([a-z]+\.(?:\s*&\s*[a-z]+\.)?|\[[^\]]+\])\s*(.*)$/i);
  return m ? { pos: m[1], text: m[2].trim() } : { pos: '', text: String(line).trim() };
}

/** 把有道返回的原始数据整理成界面需要的结构；没有有效词条时返回 null */
export function parseYoudao(data, query) {
  if (!data || typeof data !== 'object') return null;
  const out = { word: query, phonetics: [], defs: [], exams: [], forms: [], synonyms: [], phrases: [], examples: [] };

  const ec = data.ec?.word?.[0];
  if (ec) {
    out.word = textOf(ec['return-phrase']?.l?.i) || query;
    if (ec.ukphone) out.phonetics.push({ label: '英', text: ec.ukphone, audio: `${VOICE}?audio=${encodeURIComponent(out.word)}&type=1` });
    if (ec.usphone) out.phonetics.push({ label: '美', text: ec.usphone, audio: `${VOICE}?audio=${encodeURIComponent(out.word)}&type=2` });
    for (const tr of ec.trs || []) {
      for (const t of tr.tr || []) {
        for (const line of t.l?.i || []) if (typeof line === 'string' && line.trim()) out.defs.push(splitPos(line));
      }
    }
    out.forms = (ec.wfs || []).map((w) => ({ name: w.wf?.name, value: w.wf?.value })).filter((f) => f.name && f.value);
    out.exams = Array.isArray(data.ec.exam_type) ? data.ec.exam_type.slice(0, 8) : [];
  }

  const ce = data.ce?.word?.[0];
  if (ce) {
    out.word = textOf(ce['return-phrase']?.l?.i) || query;
    if (ce.phone) out.phonetics.push({ label: '拼音', text: ce.phone, audio: '' });
    for (const tr of ce.trs || []) {
      for (const t of tr.tr || []) {
        const l = t.l || {};
        const word = textOf(l.i).trim();
        if (word) out.defs.push({ pos: l.pos || '', text: word, note: stripTags(l['#tran']).replace(/；$/, ''), link: true });
      }
    }
  }

  for (const s of data.syno?.synos || []) {
    const words = (s.syno?.ws || []).map((w) => w.w).filter(Boolean);
    if (words.length) out.synonyms.push({ pos: s.syno.pos || '', words: words.slice(0, 8), tran: s.syno.tran || '' });
  }

  for (const p of (data.phrs?.phrs || []).slice(0, 5)) {
    const text = textOf(p.phr?.headword?.l?.i);
    const tran = textOf(p.phr?.trs?.[0]?.tr?.l?.i);
    if (text) out.phrases.push({ text, tran });
  }

  for (const s of (data.blng_sents_part?.['sentence-pair'] || []).slice(0, 2)) {
    const src = stripTags(s['sentence-eng'] || s.sentence);
    if (src) out.examples.push({ src, tran: stripTags(s['sentence-translation']) });
  }

  // 没有标准释义时，用网络释义兜底
  if (!out.defs.length) {
    const web = data.web_trans?.['web-translation']?.[0];
    const values = (web?.trans || []).map((t) => t.value).filter(Boolean).slice(0, 4);
    if (values.length) out.defs.push({ pos: '网络', text: values.join('；') });
  }

  if (!out.defs.length && !out.synonyms.length) return null;
  return out;
}

export function createDictionary(fetchImpl = globalThis.fetch) {
  const cache = new Map();

  async function lookup(text) {
    const q = String(text || '').trim();
    if (!isLookupCandidate(q)) return null;
    const key = q.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    let result = null;
    try {
      const res = await fetchImpl(`${ENDPOINT}?q=${encodeURIComponent(q)}&jsonversion=2&client=mobile`, { signal: ctrl.signal });
      if (res.ok) result = parseYoudao(await res.json(), q);
    } catch {
      result = null; // 词典只是补充信息，失败时静默
    } finally {
      clearTimeout(timer);
    }
    cache.set(key, result);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return result;
  }

  return { lookup };
}
