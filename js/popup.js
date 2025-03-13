document.addEventListener('DOMContentLoaded', () => {
    const inputText = document.getElementById('inputText');
    const outputText = document.getElementById('outputText');
    const sourceLang = document.getElementById('sourceLang');
    const targetLang = document.getElementById('targetLang');
    const switchLang = document.getElementById('switchLang');
    const charCount = document.getElementById('charCount');

    // 字符计数
    inputText.addEventListener('input', () => {
        const length = inputText.value.length;
        charCount.textContent = `${length}/500`;
        if (length > 500) {
            inputText.value = inputText.value.substring(0, 500);
            charCount.textContent = `500/500`;
        }

        // 自动检测语言并更新下拉框
        const text = inputText.value.trim();
        if (text) {
            const detectedLang = detectLanguage(text); // 调用已定义的 detectLanguage 方法
            sourceLang.value = detectedLang;
            // 根据检测到的源语言设置目标语言
            targetLang.value = detectedLang === 'en' ? 'zh-Hans' : 'en';
            // 触发翻译
            debouncedTranslate(text, sourceLang.value, targetLang.value);
        } else {
            outputText.value = ''; // 清空输出框
        }
    });

    // 防抖函数，延迟执行翻译
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    };

    // 翻译函数，在用户停止输入 500ms 后触发
    const debouncedTranslate = debounce((text, fromLang, toLang) => {
        if (text) {
            outputText.value = '加载中...'; // 显示加载状态
            translateText(text, fromLang, toLang)
                .then(translated => {
                    outputText.value = translated;
                })
                .catch(error => {
                    outputText.value = '翻译失败: ' + error.message;
                });
        } else {
            outputText.value = ''; // 清空输出框
        }
    }, 500);

    // 监听下拉框选项变更，触发翻译
    sourceLang.addEventListener('change', () => {
        const text = inputText.value.trim();
        if (text) {
            outputText.value = '加载中...'; // 显示加载状态
            translateText(text, sourceLang.value, targetLang.value)
                .then(translated => {
                    outputText.value = translated;
                })
                .catch(error => {
                    outputText.value = '翻译失败: ' + error.message;
                });
        }
    });

    targetLang.addEventListener('change', () => {
        const text = inputText.value.trim();
        if (text) {
            outputText.value = '加载中...'; // 显示加载状态
            translateText(text, sourceLang.value, targetLang.value)
                .then(translated => {
                    outputText.value = translated;
                })
                .catch(error => {
                    outputText.value = '翻译失败: ' + error.message;
                });
        }
    });

    // 切换语言
    switchLang.addEventListener('click', () => {
        const sourceValue = sourceLang.value;
        const targetValue = targetLang.value;
        sourceLang.value = targetValue;
        targetLang.value = sourceValue;

        // 切换语言后立即翻译
        const text = inputText.value.trim();
        if (text) {
            outputText.value = '加载中...'; // 显示加载状态
            translateText(text, sourceLang.value, targetLang.value)
                .then(translated => {
                    outputText.value = translated;
                })
                .catch(error => {
                    outputText.value = '翻译失败: ' + error.message;
                });
        }
    });
});