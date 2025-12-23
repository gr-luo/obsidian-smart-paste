# Smart Paste 插件开发指南

> Obsidian 智能粘贴插件 - 保留缩进层级与行内格式

---

## 架构概览

```
smart-paste/
├── main.ts           # 主入口，所有逻辑
├── main.js           # 编译输出（勿手动修改）
├── manifest.json     # 插件元数据
├── package.json      # 开发依赖
└── CLAUDE.md         # 本文档
```

单文件架构 `main.ts`，逻辑清晰无需拆分。

---

## 核心模块

### 1. 事件监听 (`onload`)

```typescript
// 关键：使用捕获阶段，优先于其他插件
document.addEventListener('paste', this.pasteHandler, true);
```

**为什么用 DOM 事件而不是 Obsidian API？**
- `app.workspace.on('editor-paste')` 在冒泡阶段
- 其他插件（如 easy-typing）可能先处理并阻止事件
- 捕获阶段 `true` 确保我们最先执行

### 2. 粘贴处理 (`handlePaste`)

```
流程：
1. 检查是否启用 & 是否在 MarkdownView
2. 获取剪贴板：优先 text/html，其次 text/plain
3. 检测是否在代码块内（跳过处理）
4. 获取当前行的 baseIndent 和 bulletPrefix
5. HTML → Markdown 转换（如果有 HTML）
6. 处理缩进并插入
```

### 3. HTML 转 Markdown (`htmlToMarkdown`)

使用 `DOMParser` 解析 HTML，递归转换：

| HTML 元素 | Markdown 输出 |
|-----------|---------------|
| `<p>`, `<div>` | `- text`（带 bullet） |
| `<ul>/<ol>` 跟在 `<p>` 后 | 缩进一层 |
| `<li>` | `- text` 或 `1. text` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<code>` | `` `text` `` |

**关键状态追踪**：
```typescript
let prevWasParagraph = false;  // 追踪前一个元素

if (tagName === 'ul' || tagName === 'ol') {
  // 如果前面是段落，列表作为子项缩进
  const listDepth = prevWasParagraph ? depth + 1 : depth;
}
```

### 4. 行内格式处理 (`getDirectTextContent`)

**递归处理**是关键，否则嵌套格式丢失：

```typescript
} else if (tag !== 'ul' && tag !== 'ol') {
  // 递归处理，不是 childEl.textContent
  text += this.getDirectTextContent(childEl);
}
```

### 5. 缩进处理 (`processContent`)

```
算法：
1. 找到最小缩进长度（字符数）
2. 每行：relativeIndent = originalIndent - minIndent
3. 第一行：直接输出（检测重复 bullet）
4. 后续行：baseIndent + relativeIndent + content
```

---

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 启用智能粘贴 |
| `cleanEmptyLines` | `true` | 清理 bullet 间多余空行 |
| `indentStyle` | `'auto'` | 缩进风格：auto/tab/spaces |
| `spacesPerIndent` | `2` | 每层缩进空格数 |

---

## 开发命令

```bash
# 安装依赖
npm install

# 编译（单次）
npm run build

# 监听模式
npm run dev
```

---

## 调试技巧

### Console 日志

```typescript
console.log('[SmartPaste] clipboardHtml:', html?.substring(0, 500));
console.log('[SmartPaste] converted markdown:', markdown.substring(0, 300));
console.log('[SmartPaste] baseIndent:', JSON.stringify(baseIndent));
console.log('[SmartPaste] bulletPrefix:', JSON.stringify(bulletPrefix));
```

### 常见问题排查

| 症状 | 可能原因 | 检查点 |
|------|---------|--------|
| 完全不生效 | 其他插件拦截 | 检查 `defaultPrevented` |
| 格式丢失 | 只读了 `text/plain` | 检查 `clipboardHtml` |
| 缩进错误 | `minIndentLength` 计算 | 检查原始缩进字符 |
| 行内格式丢失 | 没有递归处理 | 检查 `getDirectTextContent` |

---

## 已知边界情况

1. **代码块内粘贴** - 跳过处理，直接粘贴原文
2. **空剪贴板** - 直接返回
3. **纯文本来源** - 无 HTML 时用 `text/plain`
4. **混合 tab/空格** - 保留原始字符

---

## 后续优化方向

- [ ] 支持表格粘贴
- [ ] 快捷键切换普通/智能粘贴
- [ ] 链接格式保留 `<a>` → `[text](url)`
- [ ] 图片处理 `<img>` → `![](src)`

---

## 参考

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [Paste Mode 插件](https://github.com/jglev/obsidian-paste-mode)（参考其事件监听方式）

---

*Created by Claude Code - 2024*
