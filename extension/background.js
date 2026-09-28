// CodeFencer 后台脚本：浏览器级快捷键（commands）+ 右键菜单 + ON 角标
// 快捷键由浏览器接管，页面脚本拦不住，比 content script 里的 keydown 监听可靠

// 安装时创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "cf-fence",
      title: "CodeFencer：转成代码块（%s）",
      contexts: ["selection"]
    });
    chrome.contextMenus.create({
      id: "cf-unfence",
      title: "CodeFencer：去掉围栏",
      contexts: ["selection"]
    });
  });
});

function sendToTab(tabId, type) {
  chrome.tabs.sendMessage(tabId, { type }).catch(() => {});
}

// 浏览器级快捷键（chrome://extensions/shortcuts 可查看/修改绑定）
chrome.commands.onCommand.addListener((command, tab) => {
  if (tab && tab.id != null) sendToTab(tab.id, command);
});

// 右键菜单
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab && tab.id != null) sendToTab(tab.id, info.menuItemId);
});

// content script 注入成功 → 图标亮 ON
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "codefencer-loaded" && sender.tab) {
    chrome.action.setBadgeText({ tabId: sender.tab.id, text: "ON" });
    chrome.action.setBadgeBackgroundColor({ tabId: sender.tab.id, color: "#1f883d" });
    sendResponse({ ok: true });
  }
  return true;
});
