// 自动检测文本语言（仅支持中文和英文）
function detectLanguage(text) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return 'en'; // 空或无效文本默认返回英文
    }

    let chineseCount = 0;
    let englishCount = 0;
    const totalLength = text.length;

    for (let i = 0; i < totalLength; i++) {
        const charCode = text.charCodeAt(i);

        // 检查是否为中文字符（Unicode 范围：U+4E00 至 U+9FFF）
        if (charCode >= 0x4E00 && charCode <= 0x9FFF) {
            chineseCount++;
        }
        // 检查是否为英文字符（ASCII 字母 a-z 或 A-Z）
        else if ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
            englishCount++;
        }
    }

    // 计算比例
    const chineseRatio = chineseCount / totalLength;
    const englishRatio = englishCount / totalLength;

    // 设置阈值（例如 0.3），如果某语言比例超过阈值则认为是该语言
    const threshold = 0.3;

    if (chineseRatio > threshold && chineseRatio > englishRatio) {
        return 'zh-Hans'; // 检测为中文
    } else if (englishRatio > threshold) {
        return 'en'; // 检测为英文
    } else {
        // 如果比例都不满足阈值，默认返回英文
        console.warn('无法准确检测语言，默认使用英语');
        return 'en';
    }
}

// 暴露到全局
window.detectLanguage = detectLanguage;