# CodeFencer - 代码块一键转换

> 写技术博客，复制代码还要手动点成代码块？
> **复制 → Ctrl+Shift+V，一步成型。**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## 这是什么

一个 Chrome / Edge 浏览器扩展，专为技术博客作者设计：

在 IDE 里复制代码，到 CSDN / 掘金 / 知乎等编辑器里按 `Ctrl+Shift+V`，代码自动包上 Markdown 围栏（` ```python ... ``` `），带语言识别，直接是代码块。

**核心特点：**

- ⌨️ **一键粘贴成代码块**：`Ctrl+Shift+V`，Markdown 源码编辑器（textarea / CodeMirror）内自动插入
- 🧠 **语言自动识别**：TS / JS / Python / Java / C++ / Go / SQL / HTML / CSS / JSON / Bash 等特征检测
- 🖱️ **选中即转**：`Ctrl+Shift+F` 选中文字就地转围栏，`Ctrl+Shift+X` 反向去围栏
- 🪶 **轻量**：无依赖、无框架，两个核心文件
- 🔒 **零上传**：只在本地处理，无任何网络请求

## 安装

1. 下载本仓库（Code → Download ZIP 并解压）
2. Chrome 打开 `chrome://extensions/`（Edge 打开 `edge://extensions/`）
3. 打开右上角「开发者模式」
4. 点「加载已解压的扩展程序」，选择 `extension/` 文件夹

## 使用

| 快捷键 | 作用 |
|---|---|
| `Ctrl+Shift+V` | 剪贴板代码 → 粘贴成代码块 |
| `Ctrl+Shift+F` | 选中代码 → 就地转围栏 |
| `Ctrl+Shift+X` | 选中代码块 → 去掉围栏 |

也可右键菜单操作。每次操作左上角有气泡反馈。

**编辑器适配：**

- Markdown 源码编辑器（textarea / CodeMirror）：自动插入，全自动
- 富文本编辑器（CSDN 富文本等）：因编辑器拦截外部插入，自动转换为「写回剪贴板 + 手动 Ctrl+V」，稳定可靠不崩溃

## License

MIT
