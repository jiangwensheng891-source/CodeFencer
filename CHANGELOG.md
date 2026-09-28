# Changelog

## v1.8.0 稳定性重构（发布候选版）

按失效分析报告完成的稳定性优化，目标是可公开发布。

### 修复

- **语言检测判断顺序**（任务 1）
  - TypeScript 判断移到 JavaScript 之前（此前 TS 代码永远先命中 JS 分支），特征：`interface X {`、`type X =`、`enum X`、`: string|number|boolean` 类型标注
  - 收紧 Python 的 import 正则：仅认 `^\s*import\s+\w+\s*$`（单行纯导入）或 `^\s*from\s+\w+\s+import`，不再吞掉 JS 的 `import React from 'react'`
  - JS 分支补充 ES Module 特征（`import ... from`、`export default/const/function/class`），单行 ES Module 代码不再漏判
  - 其余语言检测逻辑未改动

- **移除全部 execCommand 调用**（任务 2）
  - `execCommand("insertText" / "insertHTML" / "formatBlock")` 全部删除——它们会触发 CSDN 等编辑器 beforeinput handler 的崩溃链
  - 富文本（contenteditable）场景统一降级为：`navigator.clipboard.writeText(wrapMarkdown(code))` + toast 提示用户手动 Ctrl+V（真粘贴事件，百分百可用）
  - 保留 textarea 与 CodeMirror 的自动插入路径（纯 API 操作，无崩溃风险）
  - 移除 ProseMirror view 直连与合成 ClipboardEvent 相关代码（合成事件路线已验证走不通，不再保留）

- **重复注入哨兵 + 并发锁**（任务 3）
  - IIFE 顶部 `window.__codefencerLoaded` 哨兵，SPA 重挂载不再重复注入
  - `pasteAsCodeBlock` 增加 `pasting` 布尔锁，`try/finally` 保证释放，异步读剪贴板期间重复按键不再并发插入
  - keydown handler 增加 `if (e.repeat) return`，长按不重复触发

- **CodeMirror 焦点校验**（任务 4）
  - 新增 `getFocusedCodeMirror()`：必须 `cm.getWrapperElement().contains(document.activeElement)` 才使用 CM 选区
  - `getSelectionInfo` 与 `pasteAsCodeBlock` 均走此校验，CM 失焦后的残留选区不再被误用

### 可选优化（一并完成）

- `detectShell` 清理已被 filter 过滤、永不生效的 `#` 提示符分支
- `onMessage` 同步 `sendResponse` 后改 `return false`，不再挂起消息通道
- toast 元素 1.8 秒后 `remove()` 销毁，不再永久驻留 DOM
- 脚本头部注释更新：富文本行为描述改为"写回剪贴板 + 手动粘贴"

### 回归验证

- 语言检测 20/20 通过（TS 4 例、ES Module 2 例、Python 4 例、其他语言 8 例、无语言 1 例、shell 2 例）
- 静态检查 7 项全过：execCommand 清零、注入哨兵、并发锁、e.repeat 防重、CM 焦点校验、消息通道释放、toast 销毁

### 行为变化说明

- 富文本编辑器（CSDN 等）里 Ctrl+Shift+V 从"尝试自动插入"变为"转成代码块写入剪贴板 + 提示手动 Ctrl+V"——这是权衡后的稳定行为，避免崩溃链
- Markdown 编辑器（textarea / CodeMirror）行为不变，仍为全自动插入
