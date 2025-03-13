function translateText(text, fromLang, toLang) {
    return new Promise((resolve, reject) => {
        fetch(`https://edge.microsoft.com/translate/translatetext?from=${fromLang}&to=${toLang}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'Accept': '*/*',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8,en-GB;q=0.7,en-US;q=0.6',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0',
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'cross-site'
            },
            body: JSON.stringify([text])
        })
        .then(response => {
            if (!response.ok) {
                throw new Error('API 请求失败: ' + response.statusText);
            }
            return response.text();
        })
        .then(textData => {
            const data = JSON.parse(textData);
            const translatedText = data[0]?.translations?.[0]?.text || '翻译结果为空';
            resolve(translatedText);
        })
        .catch(error => {
            reject(new Error('翻译失败: ' + error.message));
        });
    });
}

// 暴露到全局
window.translateText = translateText;