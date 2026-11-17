// 翻译服务（主进程）：Edge 翻译接口，无 CORS 限制，带 LRU 缓存与超时
const ENDPOINT = 'https://edge.microsoft.com/translate/translatetext';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0';
const CACHE_LIMIT = 200;

export function createTranslator(fetchImpl = globalThis.fetch) {
  const cache = new Map();

  async function translate({ text, from = '', to = 'zh-Hans' }) {
    const source = String(text || '').trim();
    if (!source) return { text: '', detected: from || '' };
    if (source.length > 5000) throw new Error('文本过长（最多 5000 字）');
    const key = `${from}|${to}|${source}`;
    if (cache.has(key)) {
      const hit = cache.get(key);
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const params = new URLSearchParams({ to, isEnterpriseClient: 'false' });
    if (from && from !== 'auto') params.set('from', from);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetchImpl(`${ENDPOINT}?${params}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=UTF-8', Accept: '*/*', 'User-Agent': UA },
        body: JSON.stringify([source]),
        signal: ctrl.signal
      });
    } catch (e) {
      throw new Error(e?.name === 'AbortError' ? '请求超时，请检查网络' : '网络错误，请检查网络连接');
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error(`翻译服务异常（${res.status}）`);
    const data = await res.json();
    const item = Array.isArray(data) ? data[0] : null;
    const out = {
      text: item?.translations?.[0]?.text ?? '',
      detected: item?.detectedLanguage?.language || from || ''
    };
    cache.set(key, out);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return out;
  }

  return { translate };
}
