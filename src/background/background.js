// 右键菜单：选中文本快速翻译（在内容脚本中弹出翻译卡片）
function ensureMenu() {
  // 先清空，避免重复创建同 id 报错
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'easytranslate-selection',
      title: '用 EasyTranslate 翻译「%s」',
      contexts: ['selection']
    });
  });
}

chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'easytranslate-selection' && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'translate-selection',
      text: info.selectionText
    });
  }
});
