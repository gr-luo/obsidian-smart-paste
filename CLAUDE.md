# Smart Paste 插件开发指南

> Obsidian 智能粘贴插件 - 保留缩进层级、行内格式、自动继承 bullet

---

## 架构概览

```
smart-paste/
├── main.ts           # 主入口，所有逻辑
├── main.js           # 编译输出（勿手动修改）
├── manifest.json     # 插件元数据
├── package.json      # 开发依赖
├── README.md         # 用户文档
└── CLAUDE.md         # 开发指南（本文档）
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
1. 检查 pasteMode 是否为 'auto'
2. 排除特殊区域（标题、Property/Metadata）
3. 获取剪贴板：优先 text/html，其次 text/plain
4. 检测是否在代码块内（跳过处理）
5. 检测是否有表格（跳过处理）
6. 获取当前行的 baseIndent 和 bulletPrefix
7. HTML → Markdown 转换
8. 处理缩进 + 自动继承 bullet
9. 过滤开头空行，插入内容
```

### 3. 排除区域

```typescript
const isInSpecialArea = target?.closest(
    '.inline-title, .view-header-title-container, ' +
    '.metadata-container, .metadata-properties, .frontmatter-container'
);
```

排除的区域：
- 文件标题 (`.inline-title`)
- Property/Metadata 区域 (`.metadata-container`, `.frontmatter-container`)

### 4. HTML 转 Markdown (`htmlToMarkdown`)

使用 `DOMParser` 解析 HTML，递归转换：

| HTML 元素 | Markdown 输出 |
|-----------|---------------|
| `<p>`, `<div>` | `- text`（带 bullet） |
| `<ul>/<ol>` | 智能缩进列表 |
| `<li>` | `- text` 或 `1. text` |
| `<strong>`, `<b>` | `**text**` |
| `<em>`, `<i>` | `*text*` |
| `<code>` | `` `text` `` |
| `<a href="url">` | `[text](url)` |
| `<img src="url">` | `![alt](url)` |
| `<table>` | 跳过，使用纯文本 |

### 5. 行内格式处理 (`getDirectTextContent`)

**递归处理**是关键，否则嵌套格式丢失：

```typescript
} else if (tag === 'a') {
    // 链接转换
    const href = childEl.getAttribute('href');
    const linkText = this.getDirectTextContent(childEl);
    text += `[${linkText}](${href})`;
} else if (tag !== 'ul' && tag !== 'ol') {
    // 递归处理其他元素
    text += this.getDirectTextContent(childEl);
}
```

### 6. 缩进处理 (`processContent`)

```
算法：
1. 找到最小缩进长度（字符数）
2. 每行：relativeIndent = originalIndent - minIndent
3. 第一行：直接输出（检测重复 bullet）
4. 后续行：
   - 有 bulletPrefix → 自动加 bullet（如果内容没有）
   - 无 bulletPrefix → 只加缩进
5. 过滤开头空行，避免换行粘贴
```

---

## 设置项

| 设置 | 默认值 | 说明 |
|------|--------|------|
| `pasteMode` | `'manual'` | `manual`: 命令触发, `auto`: 自动劫持 |
| `cleanEmptyLines` | `true` | 清理 bullet 间多余空行 |
| `indentStyle` | `'auto'` | 缩进风格：auto/tab/spaces |
| `spacesPerIndent` | `2` | 每层缩进空格数 |

---

## 命令

| 命令 ID | 名称 | 说明 |
|---------|------|------|
| `smart-paste` | Paste with Smart Formatting | 手动触发智能粘贴 |
| `toggle-paste-mode` | Toggle Paste Mode | 切换 Auto/Manual 模式 |

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
| 完全不生效 | pasteMode 为 manual | 检查设置或用命令触发 |
| 特殊区域无法粘贴 | 未排除该区域 | 添加 CSS 选择器到排除列表 |
| 格式丢失 | 只读了 `text/plain` | 检查 `clipboardHtml` |
| 缩进错误 | `minIndentLength` 计算 | 检查原始缩进字符 |
| 行内格式丢失 | 没有递归处理 | 检查 `getDirectTextContent` |
| 换行粘贴 | 开头有空行 | 检查空行过滤逻辑 |

---

## 已知边界情况

1. **代码块内粘贴** - 跳过处理，直接粘贴原文
2. **表格粘贴** - 跳过处理，使用纯文本
3. **空剪贴板** - 直接返回
4. **纯文本来源** - 无 HTML 时用 `text/plain`
5. **混合 tab/空格** - 保留原始字符
6. **标题/Property 区域** - 跳过处理，原生粘贴

---

## 已完成功能

- [x] 智能缩进保留
- [x] 行内格式保留（bold/italic/code）
- [x] 链接转换 `<a>` → `[text](url)`
- [x] 图片转换 `<img>` → `![alt](src)`
- [x] 自动继承 bullet point
- [x] Manual/Auto 模式切换
- [x] 表格检测跳过
- [x] 排除标题/Property 区域

## 后续优化方向

- [ ] 支持表格转 Markdown 表格
- [ ] 更多特殊区域排除（如需要）

---

## 参考

- [Obsidian Plugin API](https://github.com/obsidianmd/obsidian-api)
- [Paste Mode 插件](https://github.com/jglev/obsidian-paste-mode)（参考其事件监听方式）

---

*Created by Claude Code - 2024*
