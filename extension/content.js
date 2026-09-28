// CodeFencer content script（v1.8.0 稳定性重构版）
//
// 快捷键（浏览器级 commands 由 background 转发，页面级 keydown 兜底）：
//   Ctrl+Shift+V  剪贴板代码 → 一键粘贴成 Markdown 代码块
//   Ctrl+Shift+F  选中代码 → 就地转围栏
//   Ctrl+Shift+X  选中围栏 → 去掉围栏
//   右键菜单：转代码块 / 去围栏
//
// 编辑器适配策略：
//   - textarea / CodeMirror：自动插入围栏（纯 API 操作，无 execCommand，无崩溃风险）
//   - 富文本（contenteditable，如 CSDN）：不做自动插入——合成 ClipboardEvent 在
//     Chromium content script 中无法可靠携带 clipboardData，且会触发编辑器内部
//     崩溃。统一降级为"转换结果写回剪贴板 + toast 提示手动 Ctrl+V"。
//
(() => {
  "use strict";

  // ---- 重复注入哨兵：SPA 重挂载时 content script 可能被注入两次 ----
  if (window.__codefencerLoaded) return;
  window.__codefencerLoaded = true;

  // ---------------- 语言自动检测 ----------------
  // 常见 shell/命令行 起始命令（Unix + Windows）
  const SHELL_CMDS = new Set((
    "ls ll cd pwd mkdir rm rmdir cp mv cat echo touch chmod chown ln tar zip unzip gzip gunzip " +
    "git svn npm yarn pnpm npx pip pip3 python python3 node docker ssh scp sftp curl wget sudo " +
    "apt apt-get yum dnf brew pacman grep find sed awk head tail less more vim vi nano emacs export " +
    "source make cmake gcc g++ clang mvn gradle java javac go rustc cargo kubectl helm systemctl service " +
    "netstat ping ipconfig ifconfig route ps top kill pkill which where whereis exit man rsync ffmpeg conda " +
    "scrapy uvicorn flask celery redis-cli mysql psql mongo mount df du free uptime uname whoami date cal " +
    "dir copy del type ren tasklist taskkill chcp powershell cmd set start xcopy robocopy"
  ).split(/\s+/).filter(Boolean));

  function detectShell(code) {
    const lines = code.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    if (lines.length === 0) return false;
    // 命令行提示符开头（$ / >）是强信号（# 开头的行已被上面 filter 过滤）
    if (/^[$>]\s/.test(lines[0])) return true;
    let cmd = 0;
    for (const l of lines) {
      const w = l.split(/\s+/)[0].toLowerCase();
      // 首词是已知命令；或 ./script、/path/to/bin、C:\path\bin 这类可执行路径
      if (SHELL_CMDS.has(w) || /^\.\/\S+/.test(w) || /^[A-Za-z]:\\/.test(w)) cmd++;
    }
    // 单行即命令，或多行中多数是命令，判为 shell
    return cmd >= Math.max(1, Math.ceil(lines.length * 0.6));
  }

  function detectLanguage(code) {
    const lines = code.split("\n").map(l => l.trim());
    const first = lines[0] || "";
    const low = code.toLowerCase();

    if (/^```/.test(code.trim())) return "";
    if (/<!doctype html|<html[\s>]|<div[\s>]|<span[\s>]/i.test(code)) return "html";
    if (/<\?php/.test(code)) return "php";
    if (/^#!\/bin\/(ba)?sh|^#!\/usr\/bin\/env (ba)?sh\b/.test(first)) return "bash";
    if (/(public|private|protected)\s+(class|static\s+(void|int|String))|System\.out\.print/.test(code)) return "java";
    if (/#include\s*<|std::|int main\s*\(/.test(code)) return "cpp";
    if (/using System|Console\.Write/.test(code)) return "csharp";
    if (/\bfunc\s+\w+\(|package main\b/.test(code)) return "go";
    // TypeScript 必须先于 JavaScript 判断（否则 JS 分支的特征会先捕获 TS 代码）
    if (/\binterface\s+\w+\s*\{|\btype\s+\w+\s*=|\benum\s+\w+\b|:\s*(string|number|boolean)\b/.test(code)) return "typescript";
    if (/\bfunction\b|=>|\bconst\s+\w+\s*=|\blet\s+\w+\s*=|console\.log|module\.exports|\bimport\s+\w+\s+from\b|\bexport\s+(default|const|function|class)\b/.test(code)) return "javascript";
    // Python：import 特征收紧为"单行纯导入"或 from...import，
    // 避免吞掉 JS 的 import React from 'react'
    if (/^\s*(def\s+\w+\s*\(|class\s+\w+.*:\s*$)/m.test(code) ||
        /^\s*import\s+\w+\s*$/m.test(code) ||
        /^\s*from\s+\w+\s+import/m.test(code) ||
        /\bprint\s*\(|\belif\b|\bself\./.test(code)) return "python";
    if (/\bselect\b.+\bfrom\b|\binsert\s+into\b|\bcreate\s+table\b/.test(low)) return "sql";
    const s = code.trim();
    if (/^[[{]/.test(s) && /[\]}]$/.test(s) && /"\s*:\s*"/.test(s)) return "json";
    if (/^[^{};]+\{[^}]*[\w-]+\s*:[^}]*;/m.test(code)) return "css";
    // 命令行放最后兜底（避免把命令误判成编程语言）
    if (detectShell(code)) return "bash";
    return "";
  }

  function wrapMarkdown(code) {
    const lang = detectLanguage(code);
    return "```" + lang + "\n" + code.replace(/^\s*\n/, "").replace(/\s+$/, "") + "\n```";
  }

  function unwrapMarkdown(code) {
    const m = /^\s*```[\w+#.-]*\s*\n([\s\S]*?)\n?```\s*$/.exec(code);
    return m ? m[1] : null;
  }

  // ---------------- 气泡提示（定时销毁，不驻留 DOM） ----------------
  let toastEl = null;
  let toastTimer = null;
  function toast(msg, ok = true) {
    if (toastEl) { toastEl.remove(); toastEl = null; }
    toastEl = document.createElement("div");
    toastEl.style.cssText =
      "position:fixed;top:20px;left:20px;z-index:2147483647;padding:8px 16px;" +
      "border-radius:6px;color:#fff;font:600 13px/1.4 'Segoe UI','Microsoft YaHei',sans-serif;" +
      "box-shadow:0 2px 8px rgba(0,0,0,.3);pointer-events:none;transition:opacity .2s;";
    toastEl.style.background = ok ? "#1f883d" : "#cf222e";
    toastEl.textContent = msg;
    toastEl.style.opacity = "1";
    document.documentElement.appendChild(toastEl);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl) { toastEl.remove(); toastEl = null; }
    }, 1800);
  }

  // ---------------- 编辑器探测 ----------------
  // CodeMirror：必须校验焦点在其内部，失焦后残留选区不使用
  function getFocusedCodeMirror() {
    const sels = [".CodeMirror", ".editormd-markdown-textarea", ".editormd .CodeMirror", ".CodeMirror-code"];
    for (const sel of sels) {
      try {
        const el = document.querySelector(sel);
        if (el && el.CodeMirror) {
          const wrap = el.CodeMirror.getWrapperElement();
          if (wrap && wrap.contains(document.activeElement)) return el.CodeMirror;
        }
      } catch (e) {}
    }
    return null;
  }

  // ---------------- 取选区（textarea 与 contenteditable） ----------------
  function getSelectionInfo() {
    // CodeMirror 优先（焦点校验通过才使用）
    const cm = getFocusedCodeMirror();
    if (cm) {
      const text = cm.getSelection();
      if (text) {
        return {
          kind: "cm",
          text,
          replace(fenced) { cm.replaceSelection(fenced, "around"); cm.focus(); }
        };
      }
    }

    const ae = document.activeElement;

    // textarea / input（Markdown 模式）
    if (ae && (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement)) {
      const start = ae.selectionStart, end = ae.selectionEnd;
      if (start != null && start !== end) {
        return {
          kind: "textarea",
          text: ae.value.slice(start, end),
          replace(fenced) {
            ae.value = ae.value.slice(0, start) + fenced + ae.value.slice(end);
            const pos = start + fenced.length;
            ae.setSelectionRange(pos, pos);
            ae.dispatchEvent(new Event("input", { bubbles: true }));
            ae.dispatchEvent(new Event("change", { bubbles: true }));
          }
        };
      }
    }

    // contenteditable（富文本模式）：只读选区文本，转换结果走剪贴板
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && !sel.isCollapsed) {
      const text = sel.toString();
      if (text.trim()) {
        return { kind: "ce", text };
      }
    }
    return null;
  }

  // ---------------- 核心转换 ----------------
  async function convertSelection(action) {
    const info = getSelectionInfo();
    if (!info) { toast("请先选中要转换的代码文本", false); return; }
    const text = info.text;
    if (!text.trim()) { toast("选区是空的", false); return; }

    if (action === "unfence") {
      const inner = unwrapMarkdown(text);
      if (inner === null) { toast("选中的不是代码块", false); return; }
      if (info.kind === "ce") {
        // 富文本：不做自动插入，写回剪贴板 + 提示
        try {
          await navigator.clipboard.writeText(inner);
          toast("已去掉围栏，请按 Ctrl+V 粘贴");
        } catch (e) { toast("写入剪贴板失败", false); }
        return;
      }
      info.replace(inner);
      toast("已去掉围栏 ✓");
      return;
    }

    // fence
    if (/^\s*```/.test(text)) { toast("已经是代码块了，跳过"); return; }
    const fenced = wrapMarkdown(text);
    if (info.kind === "ce") {
      try {
        await navigator.clipboard.writeText(fenced);
        toast("已转成代码块，请按 Ctrl+V 粘贴");
      } catch (e) { toast("写入剪贴板失败", false); }
      return;
    }
    info.replace(fenced);
    toast("已转换成代码块 [" + (detectLanguage(text) || "无语言") + "] ✓");
  }

  // ---------------- 通道：接收 background 转发（Ctrl+Shift+F/X / 右键菜单） ----------------
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      const t = msg && msg.type;
      if (t === "fence-selection" || t === "cf-fence") convertSelection("fence");
      else if (t === "unfence-selection" || t === "cf-unfence") convertSelection("unfence");
      else return false;
      sendResponse({ ok: true }); // 同步应答后关闭消息通道
      return false;
    });
  } catch (e) { /* 扩展 API 不可用时忽略 */ }

  // ---------------- 粘贴即代码块（Ctrl+Shift+V，核心流程） ----------------
  let pasting = false; // 并发锁：异步读剪贴板期间重复按键不重复插入

  async function pasteAsCodeBlock() {
    if (pasting) return;
    pasting = true;
    try {
      let code;
      try {
        code = await navigator.clipboard.readText();
      } catch (e) {
        toast("读剪贴板失败，请先点一下页面再按", false);
        return;
      }
      if (!code || !code.trim()) { toast("剪贴板是空的", false); return; }
      if (/^\s*```/.test(code.trim())) { toast("已是代码块，直接 Ctrl+V"); return; }
      const fenced = wrapMarkdown(code);
      const lang = detectLanguage(code) || "无语言";

      // CodeMirror（焦点校验通过才使用）
      const cm = getFocusedCodeMirror();
      if (cm) {
        cm.focus();
        cm.replaceSelection(fenced, "end");
        toast("已以代码块形式粘贴 ✓ [" + lang + "]");
        return;
      }

      const ae = document.activeElement;

      // textarea / input：自动插入
      if (ae && (ae instanceof HTMLTextAreaElement || ae instanceof HTMLInputElement)) {
        const start = ae.selectionStart ?? ae.value.length;
        const end = ae.selectionEnd ?? start;
        ae.value = ae.value.slice(0, start) + fenced + ae.value.slice(end);
        const pos = start + fenced.length;
        ae.setSelectionRange(pos, pos);
        ae.dispatchEvent(new Event("input", { bubbles: true }));
        ae.dispatchEvent(new Event("change", { bubbles: true }));
        toast("已以代码块形式粘贴 ✓ [" + lang + "]");
        return;
      }

      // contenteditable（富文本）与光标不在编辑器：统一写回剪贴板 + 提示手动粘贴
      try {
        await navigator.clipboard.writeText(fenced);
        toast(ae && ae.isContentEditable ? "已转成代码块，请按 Ctrl+V 粘贴" : "光标不在编辑器，已转成代码块放入剪贴板");
      } catch (e) { toast("写入剪贴板失败", false); }
    } finally {
      pasting = false;
    }
  }

  document.addEventListener("keydown", (e) => {
    if (e.repeat) return; // 长按不重复触发
    if (e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey && e.code === "KeyV") {
      e.preventDefault();
      pasteAsCodeBlock();
    }
  }, true);

  // ---------------- 装载指示 ----------------
  console.log("[CodeFencer v1.8.0] 已加载 ✓ Ctrl+Shift+V 粘贴成代码块 / Ctrl+Shift+F 选中转换 / Ctrl+Shift+X 去围栏 / 也可右键菜单");
  if (window === window.top) {
    toast("CodeFencer v1.8.0 已就绪：复制代码后按 Ctrl+Shift+V", true);
    try { chrome.runtime.sendMessage({ type: "codefencer-loaded" }); } catch (e) {}
  }
})();
