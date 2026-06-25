/**
 * 调用 Edge 微软翻译接口进行翻译。
 * @param {string} text
 * @param {string} fromLang
 * @param {string} toLang
 * @returns {Promise<string>}
 */
export async function translateText(text, fromLang, toLang) {
  const url = `https://edge.microsoft.com/translate/translatetext?from=${fromLang}&to=${toLang}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Accept: '*/*',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'cross-site'
    },
    body: JSON.stringify([text])
  });

  if (!res.ok) throw new Error('API 请求失败: ' + res.statusText);

  const data = JSON.parse(await res.text());
  return data?.[0]?.translations?.[0]?.text || '翻译结果为空';
}
