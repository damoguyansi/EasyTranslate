let icon = null;
let popup = null; // 用于存储弹窗

/**
 * create translate icon
 * @param selectedText
 * @param x
 * @param y
 */
function createIcon(selectedText, x, y) {
    if (icon) {
        icon.remove();
        icon = null;
    }

    // 创建新的图标
    icon = document.createElement('div');
    icon.id = 'custom-icon';
    icon.innerHTML = `<svg t="1741680135164" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12176" width="32" height="32"><path d="M609.28 404.39808h234.27072a58.7776 58.7776 0 0 1 58.79808 58.81856v380.80512a58.7776 58.7776 0 0 1-58.79808 58.79808H462.72512a58.7776 58.7776 0 0 1-58.79808-58.79808v-234.2912h117.1456a87.53152 87.53152 0 0 0 87.71584-87.71584v-117.61664h0.49152zM81.92 140.71808A58.7776 58.7776 0 0 1 140.71808 81.92h380.8256a58.7776 58.7776 0 0 1 58.79808 58.79808v380.8256a58.7776 58.7776 0 0 1-58.79808 58.79808H140.6976A58.7776 58.7776 0 0 1 81.92 521.54368V140.6976z m117.1456 253.25568h42.68032v-22.77376h61.6448v108.1344h45.52704v-108.1344h63.0784v18.96448h46.46912v-143.68768h-109.568v-31.29344c0-9.48224 1.4336-17.08032 3.80928-23.71584 0.47104-0.94208 0.94208-2.37568 1.4336-3.7888 0-0.96256-2.8672-1.4336-9.0112-2.37568h-42.68032v61.6448H199.0656v147.02592z m42.68032-112.39424h61.6448v55.48032h-61.6448v-55.5008z m170.25024 55.48032h-63.0784v-55.5008h63.0784v55.5008z m186.368 446.73024l17.55136-49.31584h91.99616l17.55136 49.31584h50.25792l-82.04288-232.8576h-59.26912l-84.41856 232.8576h48.37376z m30.35136-87.73632l34.14016-99.59424h1.4336l31.29344 99.59424h-66.8672z m214.8352-379.392h-58.81856c0-64.96256-52.6336-117.1456-117.1456-117.1456v-58.7776a175.88224 175.88224 0 0 1 175.96416 175.9232zM140.6976 668.07808h58.81856c0 64.96256 52.6336 117.1456 117.1456 117.1456v58.7776a175.88224 175.88224 0 0 1-175.96416-175.9232z" fill="#4CA5F7" p-id="12177"></path></svg>`; // 使用图片
    icon.style.left = `${x}px`;
    icon.style.top = `${y}px`;

    // 点击图标时显示弹框
    icon.addEventListener('click', function (event) {
        event.stopPropagation(); // 防止点击图标时触发隐藏事件
        const defaultFromLang = detectLanguage(selectedText);
        const defaultToLang = defaultFromLang === 'en' ? 'zh-Hans' : 'en';
        showTranslationPopup(selectedText, x, y + 40, defaultFromLang, defaultToLang);
    });

    document.body.appendChild(icon);
}

/**
 * show translation popup and call translation
 * @param originalText
 * @param x
 * @param y
 * @param fromLang
 * @param toLang
 */
function showTranslationPopup(originalText, x, y, fromLang, toLang) {
    closeIconAndPopup();

    // 创建弹窗
    popup = document.createElement('div');
    popup.className = 'translation-popup';
    popup.id = 'translation-popup'; // 给弹窗一个 ID，以便定位
    popup.innerHTML = `<div class="popup-header">
            <span>翻译结果</span>
            <select id="sourceLang">
                <option value="en" ${fromLang === 'en' ? 'selected' : ''}>英语</option>
                <option value="zh-Hans" ${fromLang === 'zh-Hans' ? 'selected' : ''}>中文</option>
            </select>
            <select id="targetLang">
                <option value="zh-Hans" ${toLang === 'zh-Hans' ? 'selected' : ''}>中文</option>
                <option value="en" ${toLang === 'en' ? 'selected' : ''}>英语</option>
            </select>
            <button class="refresh-btn">↻</button>
            <button class="close-btn">×</button>
        </div>
        <div class="popup-content">
            <div style="border-bottom: solid 1px #eee;padding: 10px 0px;">
                <div class="popup-content-title">原文:</div> 
                <div>${originalText}</div>
            </div>
            <div style="padding: 10px 0px;">
                <div class="popup-content-title">译文:</div> 
                <div id="translated-text">加载中...</div>
            </div>
        </div>
    `;

    // 设置弹窗基本样式
    popup.style.position = 'absolute';
    popup.style.zIndex = '10000';
    popup.style.textAlign = 'left';
    popup.style.padding = '10px';

    // 先附加到 DOM，以便获取尺寸
    document.body.appendChild(popup);

    // 计算并设置弹窗位置
    const adjustPosition = () => {
        calculatePopupPosition(popup, x, y);
    };

    // 初始调整位置
    adjustPosition();

    // 调用翻译并更新译文
    const updateTranslation = (sourceLang, targetLang) => {
        const translatedSpan = popup.querySelector('#translated-text');
        translatedSpan.textContent = '加载中...';
        window.translateText(originalText, sourceLang, targetLang)
            .then(translatedText => {
                translatedSpan.textContent = translatedText;
                adjustPosition(); // 翻译后内容可能改变高度，重新调整位置
            })
            .catch(error => {
                console.error('翻译错误:', error);
                translatedSpan.textContent = '翻译失败: ' + error.message;
                adjustPosition(); // 错误信息可能改变高度，重新调整位置
            });
    };

    // 初始翻译
    updateTranslation(fromLang, toLang);

    // 关闭按钮
    popup.querySelector('.close-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        popup.remove();
        popup = null;
        if (icon) {
            icon.remove();
            icon = null;
        }
    });

    // 刷新按钮
    popup.querySelector('.refresh-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        const sourceLang = popup.querySelector('#sourceLang').value;
        const targetLang = popup.querySelector('#targetLang').value;
        updateTranslation(sourceLang, targetLang);
    });

    // 语言选择框变更
    popup.querySelector('#sourceLang').addEventListener('change', () => {
        const sourceLang = popup.querySelector('#sourceLang').value;
        const targetLang = popup.querySelector('#targetLang').value;
        updateTranslation(sourceLang, targetLang);
    });

    popup.querySelector('#targetLang').addEventListener('change', () => {
        const sourceLang = popup.querySelector('#sourceLang').value;
        const targetLang = popup.querySelector('#targetLang').value;
        updateTranslation(sourceLang, targetLang);
    });
}

/**
 * calculate popup position
 * @param element
 * @param mouseX
 * @param mouseY
 */
function calculatePopupPosition(element, mouseX, mouseY) {
    // 获取浏览器窗口的宽度和高度
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;

    // 获取弹出框的宽度和高度
    const elementWidth = element.offsetWidth;
    const elementHeight = element.offsetHeight;

    // 计算弹出框的理想位置
    let popupX = mouseX + 10;  // 10px 偏移量
    let popupY = mouseY + 10;  // 10px 偏移量

    // 确保弹出框不会超出右边界
    if (popupX + elementWidth > windowWidth) {
        popupX = mouseX - elementWidth - 10;  // 如果超出右边界，则显示在左边
    }

    // 确保弹出框不会超出下边界
    if (popupY + elementHeight > windowHeight) {
        popupY = mouseY - elementHeight - 10;  // 如果超出下边界，则显示在上边
    }

    // 设置弹出框的位置
    element.style.position = 'absolute';
    element.style.left = `${popupX}px`;
    element.style.top = `${popupY}px`;
}

/**
 * close icon and popup
 */
function closeIconAndPopup() {
    if (popup) {
        popup.remove();
        popup = null;
    }
    if (icon) {
        icon.remove();
        icon = null;
    }
}

document.addEventListener('mouseup', function (event) {
    if (icon && icon.contains(event.target)) return;
    if (popup && popup.contains(event.target)) return;

    setTimeout(() => {
        const selection = window.getSelection();
        const selectedText = selection.toString().trim();
        console.log("选中：" + selectedText);
        if (selectedText) {
            createIcon(selectedText, event.pageX, event.pageY + 10); // 在选中文本下显示图标
        } else {
            closeIconAndPopup();
        }
    }, 10);
});

document.addEventListener('mousedown', function (event) {
    if (icon && icon.contains(event.target)) return;
    if (popup && popup.contains(event.target)) return;
    closeIconAndPopup();
});

document.addEventListener('keydown', function (event) {
    closeIconAndPopup();
});