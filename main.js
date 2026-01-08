var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SmartPastePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  pasteMode: "manual",
  // 默认手动模式，更安全
  cleanEmptyLines: true,
  indentStyle: "auto",
  spacesPerIndent: 2,
  // Terminal output cleaning
  cleanTerminalOutput: true,
  autoDetectTerminal: true,
  fixHardLineBreaks: true,
  removeEmptyLines: true
  // 大纲场景默认移除空行
};
var SmartPastePlugin = class extends import_obsidian.Plugin {
  async onload() {
    await this.loadSettings();
    this.pasteHandler = this.handlePaste.bind(this);
    document.addEventListener("paste", this.pasteHandler, true);
    this.addCommand({
      id: "smart-paste",
      name: "Paste with Smart Formatting",
      editorCallback: (editor) => {
        this.executeSmartPaste(editor);
      }
    });
    this.addCommand({
      id: "toggle-paste-mode",
      name: "Toggle Paste Mode (Auto/Manual)",
      callback: () => {
        this.settings.pasteMode = this.settings.pasteMode === "auto" ? "manual" : "auto";
        this.saveSettings();
        const mode = this.settings.pasteMode === "auto" ? "\u81EA\u52A8\u52AB\u6301" : "\u624B\u52A8\u89E6\u53D1";
        console.log(`[SmartPaste] \u5207\u6362\u5230${mode}\u6A21\u5F0F`);
      }
    });
    this.addCommand({
      id: "clean-terminal-paste",
      name: "Paste and Clean Terminal Output",
      editorCallback: async (editor) => {
        const text = await navigator.clipboard.readText();
        if (!text)
          return;
        const cleaned = this.cleanTerminalOutputText(text);
        editor.replaceSelection(cleaned);
      }
    });
    this.addSettingTab(new SmartPasteSettingTab(this.app, this));
    console.log("Smart Paste plugin loaded");
  }
  onunload() {
    document.removeEventListener("paste", this.pasteHandler, true);
    console.log("Smart Paste plugin unloaded");
  }
  // ------------------------------------------------------------------------
  //  粘贴事件处理（仅 auto 模式生效）
  // ------------------------------------------------------------------------
  handlePaste(evt) {
    if (this.settings.pasteMode !== "auto") {
      return;
    }
    console.log("[SmartPaste] handlePaste triggered (capture phase, auto mode)");
    const target = evt.target;
    const isInEditor = target?.closest(".cm-editor, .markdown-source-view");
    const isInSpecialArea = target?.closest(
      ".inline-title, .view-header-title-container, .metadata-container, .metadata-properties, .frontmatter-container"
    );
    if (!isInEditor || isInSpecialArea) {
      console.log("[SmartPaste] Not in editor content area, skipping");
      return;
    }
    const activeView = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!activeView) {
      console.log("[SmartPaste] No active MarkdownView, skipping");
      return;
    }
    const editor = activeView.editor;
    const clipboardHtml = evt.clipboardData?.getData("text/html");
    const clipboardText = evt.clipboardData?.getData("text/plain");
    console.log("[SmartPaste] clipboardHtml:", clipboardHtml?.substring(0, 500));
    console.log("[SmartPaste] clipboardText:", clipboardText?.substring(0, 100));
    if (!clipboardText && !clipboardHtml) {
      console.log("[SmartPaste] No clipboard content, returning");
      return;
    }
    let processedClipboardText = clipboardText || "";
    if (this.settings.cleanTerminalOutput && processedClipboardText) {
      if (this.detectTerminalOutput(processedClipboardText)) {
        processedClipboardText = this.cleanTerminalOutputText(processedClipboardText);
      }
    }
    evt.preventDefault();
    evt.stopPropagation();
    console.log("[SmartPaste] Default prevented, processing...");
    if (this.isInsideCodeBlock(editor)) {
      editor.replaceSelection(processedClipboardText || "");
      return;
    }
    if (clipboardHtml?.includes("<table")) {
      console.log("[SmartPaste] Table detected, using plain text");
      editor.replaceSelection(processedClipboardText || "");
      return;
    }
    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    const baseIndent = this.getLeadingWhitespace(currentLine);
    const bulletPrefix = this.detectBulletPrefix(currentLine);
    console.log("[SmartPaste] baseIndent:", JSON.stringify(baseIndent));
    console.log("[SmartPaste] bulletPrefix:", JSON.stringify(bulletPrefix));
    let contentToProcess;
    if (clipboardHtml) {
      contentToProcess = this.htmlToMarkdown(clipboardHtml);
      console.log("[SmartPaste] converted markdown:", contentToProcess.substring(0, 300));
    } else {
      contentToProcess = processedClipboardText || "";
    }
    const processed = this.processContent(contentToProcess, baseIndent, bulletPrefix);
    console.log("[SmartPaste] processed result:", processed.substring(0, 200));
    editor.replaceSelection(processed);
  }
  // ------------------------------------------------------------------------
  //  手动智能粘贴（命令面板/快捷键触发）
  // ------------------------------------------------------------------------
  async executeSmartPaste(editor) {
    console.log("[SmartPaste] executeSmartPaste triggered (manual mode)");
    if (this.isInsideCodeBlock(editor)) {
      const text = await navigator.clipboard.readText();
      editor.replaceSelection(text);
      return;
    }
    const cursor = editor.getCursor();
    const currentLine = editor.getLine(cursor.line);
    const baseIndent = this.getLeadingWhitespace(currentLine);
    const bulletPrefix = this.detectBulletPrefix(currentLine);
    let clipboardHtml = "";
    let clipboardText = "";
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        if (item.types.includes("text/html")) {
          const blob = await item.getType("text/html");
          clipboardHtml = await blob.text();
        }
        if (item.types.includes("text/plain")) {
          const blob = await item.getType("text/plain");
          clipboardText = await blob.text();
        }
      }
    } catch (e) {
      clipboardText = await navigator.clipboard.readText();
    }
    if (!clipboardText && !clipboardHtml) {
      console.log("[SmartPaste] No clipboard content");
      return;
    }
    let processedClipboardText = clipboardText || "";
    if (this.settings.cleanTerminalOutput && processedClipboardText) {
      if (this.detectTerminalOutput(processedClipboardText)) {
        processedClipboardText = this.cleanTerminalOutputText(processedClipboardText);
      }
    }
    if (clipboardHtml?.includes("<table")) {
      console.log("[SmartPaste] Table detected, using plain text");
      editor.replaceSelection(processedClipboardText || "");
      return;
    }
    let contentToProcess;
    if (clipboardHtml) {
      contentToProcess = this.htmlToMarkdown(clipboardHtml);
    } else {
      contentToProcess = processedClipboardText;
    }
    const processed = this.processContent(contentToProcess, baseIndent, bulletPrefix);
    editor.replaceSelection(processed);
  }
  // ------------------------------------------------------------------------
  //  HTML 转 Markdown
  // ------------------------------------------------------------------------
  htmlToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    return this.convertNodeToMarkdown(doc.body, 0);
  }
  convertNodeToMarkdown(node, depth) {
    const results = [];
    const indent = "	".repeat(depth);
    let prevWasParagraph = false;
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim();
        if (text) {
          results.push(indent + "- " + text);
          prevWasParagraph = true;
        }
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child;
        const tagName = el.tagName.toLowerCase();
        if (tagName === "ul" || tagName === "ol") {
          const listDepth = prevWasParagraph ? depth + 1 : depth;
          const listItems = this.convertListToMarkdown(el, listDepth);
          results.push(listItems);
          prevWasParagraph = false;
        } else if (tagName === "li") {
          const text = this.getDirectTextContent(el);
          if (text) {
            results.push(indent + "- " + text);
          }
          for (const subChild of Array.from(el.children)) {
            if (subChild.tagName.toLowerCase() === "ul" || subChild.tagName.toLowerCase() === "ol") {
              results.push(this.convertListToMarkdown(subChild, depth + 1));
            }
          }
          prevWasParagraph = false;
        } else if (tagName === "p" || tagName === "div") {
          const text = this.getDirectTextContent(el);
          if (text) {
            results.push(indent + "- " + text);
            prevWasParagraph = true;
          }
        } else if (tagName === "br") {
        } else if (tagName === "h1" || tagName === "h2" || tagName === "h3" || tagName === "h4" || tagName === "h5" || tagName === "h6") {
          const text = el.textContent?.trim();
          if (text) {
            results.push(indent + "- " + text);
            prevWasParagraph = true;
          }
        } else if (tagName === "strong" || tagName === "b") {
          const text = el.textContent?.trim();
          if (text) {
            results.push(indent + "- **" + text + "**");
            prevWasParagraph = true;
          }
        } else if (tagName === "em" || tagName === "i") {
          const text = el.textContent?.trim();
          if (text) {
            results.push(indent + "- *" + text + "*");
            prevWasParagraph = true;
          }
        } else if (tagName === "span") {
          const text = el.textContent?.trim();
          if (text) {
            results.push(indent + "- " + text);
            prevWasParagraph = true;
          }
        } else if (tagName === "img") {
          const src = el.getAttribute("src");
          const alt = el.getAttribute("alt") || "";
          if (src) {
            results.push(indent + `![${alt}](${src})`);
          }
          prevWasParagraph = false;
        } else if (tagName === "a") {
          const href = el.getAttribute("href");
          const linkText = this.getDirectTextContent(el);
          if (href && linkText) {
            results.push(indent + `- [${linkText}](${href})`);
          } else if (linkText) {
            results.push(indent + "- " + linkText);
          }
          prevWasParagraph = true;
        } else {
          const inner = this.convertNodeToMarkdown(el, depth);
          if (inner) {
            results.push(inner);
            prevWasParagraph = false;
          }
        }
      }
    }
    return results.join("\n");
  }
  convertListToMarkdown(listEl, depth) {
    const results = [];
    const indent = "	".repeat(depth);
    const isOrdered = listEl.tagName.toLowerCase() === "ol";
    let counter = 1;
    for (const li of Array.from(listEl.children)) {
      if (li.tagName.toLowerCase() === "li") {
        const text = this.getDirectTextContent(li);
        const bullet = isOrdered ? `${counter}. ` : "- ";
        if (text) {
          results.push(indent + bullet + text);
        }
        counter++;
        for (const subChild of Array.from(li.children)) {
          const subTag = subChild.tagName.toLowerCase();
          if (subTag === "ul" || subTag === "ol") {
            results.push(this.convertListToMarkdown(subChild, depth + 1));
          }
        }
      }
    }
    return results.join("\n");
  }
  // 获取元素的直接文本内容（不包括子元素）
  getDirectTextContent(el) {
    let text = "";
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += child.textContent || "";
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child;
        const tag = childEl.tagName.toLowerCase();
        if (tag === "strong" || tag === "b") {
          text += "**" + childEl.textContent + "**";
        } else if (tag === "em" || tag === "i") {
          text += "*" + childEl.textContent + "*";
        } else if (tag === "code") {
          text += "`" + childEl.textContent + "`";
        } else if (tag === "a") {
          const href = childEl.getAttribute("href");
          const linkText = this.getDirectTextContent(childEl);
          if (href && linkText) {
            text += `[${linkText}](${href})`;
          } else {
            text += linkText || "";
          }
        } else if (tag !== "ul" && tag !== "ol") {
          text += this.getDirectTextContent(childEl);
        }
      }
    }
    return text.trim();
  }
  // ------------------------------------------------------------------------
  //  核心处理逻辑
  // ------------------------------------------------------------------------
  processContent(text, baseIndent, bulletPrefix) {
    const lines = text.split("\n");
    if (lines.length === 0)
      return text;
    let minIndentLength = Infinity;
    for (const line of lines) {
      if (!line.trim())
        continue;
      const indent = this.getLeadingWhitespace(line);
      minIndentLength = Math.min(minIndentLength, indent.length);
    }
    if (minIndentLength === Infinity)
      minIndentLength = 0;
    console.log("[SmartPaste] minIndentLength:", minIndentLength);
    const processedLines = lines.map((line, index) => {
      if (!line.trim())
        return "";
      const originalIndent = this.getLeadingWhitespace(line);
      const relativeIndent = originalIndent.slice(minIndentLength);
      let content = line.slice(originalIndent.length);
      if (index === 0) {
        if (bulletPrefix && this.startsWithBullet(content)) {
          content = this.stripBullet(content);
        }
        return content;
      } else {
        if (bulletPrefix) {
          if (this.startsWithBullet(content)) {
            return baseIndent + relativeIndent + content;
          }
          return baseIndent + relativeIndent + bulletPrefix + content;
        }
        return baseIndent + relativeIndent + content;
      }
    });
    const cleaned = this.settings.cleanEmptyLines ? this.cleanEmptyLines(processedLines) : processedLines;
    while (cleaned.length > 0 && cleaned[0] === "") {
      cleaned.shift();
    }
    return cleaned.join("\n");
  }
  // 检测内容是否以 bullet 开头
  startsWithBullet(text) {
    return /^[-*+]\s|^\d+\.\s/.test(text);
  }
  // 去掉行首的 bullet
  stripBullet(text) {
    return text.replace(/^[-*+]\s+/, "").replace(/^\d+\.\s+/, "");
  }
  // 检测当前行的 bullet 前缀
  detectBulletPrefix(line) {
    const match = line.match(/^\s*([-*+]|\d+\.)\s+/);
    if (match) {
      const bullet = match[1];
      return bullet.match(/^\d+$/) ? "- " : bullet + " ";
    }
    return "";
  }
  // ------------------------------------------------------------------------
  //  缩进工具函数
  // ------------------------------------------------------------------------
  // 获取行首空白字符
  getLeadingWhitespace(line) {
    const match = line.match(/^(\s*)/);
    return match ? match[1] : "";
  }
  // 检测文本使用的缩进风格
  detectIndentStyle(text) {
    const lines = text.split("\n");
    let tabCount = 0;
    let spaceCount = 0;
    for (const line of lines) {
      const indent = this.getLeadingWhitespace(line);
      if (indent.includes("	"))
        tabCount++;
      else if (indent.includes("  "))
        spaceCount++;
    }
    if (this.settings.indentStyle === "auto") {
      return tabCount > spaceCount ? "	" : "  ";
    }
    return this.settings.indentStyle === "tab" ? "	" : " ".repeat(this.settings.spacesPerIndent);
  }
  // 计算最小缩进层级
  calculateMinIndentLevel(lines, indentChar) {
    let minLevel = Infinity;
    for (const line of lines) {
      if (line.trim().length === 0)
        continue;
      const indent = this.getLeadingWhitespace(line);
      const level = this.countIndentUnits(indent, indentChar);
      if (level < minLevel) {
        minLevel = level;
      }
    }
    return minLevel === Infinity ? 0 : minLevel;
  }
  // 计算缩进单位数
  countIndentUnits(indent, indentChar) {
    if (indentChar === "	") {
      return indent.split("	").length - 1;
    }
    const unitSize = this.settings.spacesPerIndent;
    return Math.floor(indent.length / unitSize);
  }
  // 生成指定层级的缩进
  generateIndent(level) {
    if (level <= 0)
      return "";
    if (this.settings.indentStyle === "tab") {
      return "	".repeat(level);
    }
    return " ".repeat(level * this.settings.spacesPerIndent);
  }
  // ------------------------------------------------------------------------
  //  空行清理
  // ------------------------------------------------------------------------
  cleanEmptyLines(lines) {
    const result = [];
    let prevWasEmpty = false;
    let prevWasBullet = false;
    for (const line of lines) {
      const isEmpty = line.trim().length === 0;
      const isBullet = /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);
      if (isEmpty && prevWasBullet) {
        prevWasEmpty = true;
        continue;
      }
      if (isBullet && prevWasEmpty) {
      }
      if (isEmpty && prevWasEmpty)
        continue;
      result.push(line);
      prevWasEmpty = isEmpty;
      prevWasBullet = isBullet;
    }
    return result;
  }
  // ------------------------------------------------------------------------
  //  代码块检测
  // ------------------------------------------------------------------------
  isInsideCodeBlock(editor) {
    const cursor = editor.getCursor();
    const content = editor.getValue();
    const lines = content.split("\n");
    let inCodeBlock = false;
    for (let i = 0; i <= cursor.line; i++) {
      const line = lines[i];
      if (line.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
      }
    }
    return inCodeBlock;
  }
  // ------------------------------------------------------------------------
  //  终端输出清理（Terminal Output Cleaning）
  // ------------------------------------------------------------------------
  /**
   * 检测文本是否像终端输出
   * 特征：
   * - 行首有 1-4 个空格的统一缩进
   * - 行尾有大量空格填充
   * - 行长度接近 80 或终端宽度
   */
  detectTerminalOutput(text) {
    if (!this.settings.autoDetectTerminal)
      return false;
    const lines = text.split("\n").filter((l) => l.length > 0);
    if (lines.length < 2)
      return false;
    let leadingSpaceLines = 0;
    let trailingSpaceLines = 0;
    let consistentWidth = 0;
    for (const line of lines) {
      if (/^[ ]{1,4}\S/.test(line)) {
        leadingSpaceLines++;
      }
      if (/\s{3,}$/.test(line)) {
        trailingSpaceLines++;
      }
      if (line.length >= 75 && line.length <= 85) {
        consistentWidth++;
      }
    }
    const totalLines = lines.length;
    const isTerminal = leadingSpaceLines / totalLines > 0.5 || trailingSpaceLines / totalLines > 0.3 || consistentWidth / totalLines > 0.5;
    if (isTerminal) {
      console.log("[SmartPaste] Detected terminal output:", {
        leadingSpaceLines,
        trailingSpaceLines,
        consistentWidth,
        totalLines
      });
    }
    return isTerminal;
  }
  /**
   * 清理终端输出的格式问题
   */
  cleanTerminalOutputText(text) {
    let lines = text.split("\n");
    lines = lines.map((line) => line.replace(/\s+$/, ""));
    const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
    if (nonEmptyLines.length > 0) {
      let minLeadingSpaces = Infinity;
      for (const line of nonEmptyLines) {
        const match = line.match(/^( *)/);
        if (match && match[1].length < minLeadingSpaces) {
          minLeadingSpaces = match[1].length;
        }
      }
      if (minLeadingSpaces > 0 && minLeadingSpaces < Infinity) {
        lines = lines.map((line) => {
          if (line.trim().length === 0)
            return "";
          return line.slice(minLeadingSpaces);
        });
      }
    }
    lines = lines.map((line) => {
      if (line.trim().length === 0)
        return "";
      const bulletMatch = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
      if (bulletMatch) {
        const [, indent, bullet, content] = bulletMatch;
        const spaceCount = indent.replace(/\t/g, "  ").length;
        const tabCount = Math.floor(spaceCount / 2);
        return "	".repeat(tabCount) + bullet + " " + content;
      } else {
        return line.trimStart();
      }
    });
    if (this.settings.fixHardLineBreaks) {
      const joined = this.fixHardLineBreaks(lines.join("\n"));
      lines = joined.split("\n");
    }
    if (this.settings.removeEmptyLines) {
      lines = lines.filter((line) => line.trim().length > 0);
    } else {
      const result = [];
      let prevEmpty = false;
      for (const line of lines) {
        const isEmpty = line.trim().length === 0;
        if (isEmpty && prevEmpty)
          continue;
        result.push(isEmpty ? "" : line);
        prevEmpty = isEmpty;
      }
      lines = result;
    }
    console.log("[SmartPaste] Terminal output cleaned");
    return lines.join("\n");
  }
  /**
   * 修复硬换行：当一行以小写字母/逗号结尾，下一行以小写字母开头时，合并为一行
   */
  fixHardLineBreaks(text) {
    const lines = text.split("\n");
    const result = [];
    let buffer = "";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      if (trimmedLine.length === 0) {
        if (buffer) {
          result.push(buffer);
          buffer = "";
        }
        result.push("");
        continue;
      }
      const isSpecialLine = /^[-*+•]|\d+\.|^#+\s|^>|^```|^\|/.test(trimmedLine);
      if (isSpecialLine) {
        if (buffer) {
          result.push(buffer);
          buffer = "";
        }
        result.push(line);
        continue;
      }
      if (!buffer) {
        buffer = line;
        continue;
      }
      const prevEndsWithContinuation = /[a-z,，、]$/.test(buffer.trim());
      const currStartsWithLower = /^[a-z]/.test(trimmedLine);
      const prevEndsWithPunctuation = /[.!?。！？:：]$/.test(buffer.trim());
      if (!prevEndsWithPunctuation && (prevEndsWithContinuation || currStartsWithLower)) {
        buffer = buffer + " " + trimmedLine;
      } else {
        result.push(buffer);
        buffer = line;
      }
    }
    if (buffer) {
      result.push(buffer);
    }
    return result.join("\n");
  }
  // ------------------------------------------------------------------------
  //  设置
  // ------------------------------------------------------------------------
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var SmartPasteSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Smart Paste Settings" });
    new import_obsidian.Setting(containerEl).setName("Paste Mode").setDesc("Auto: hijack all paste events. Manual: use Cmd+Shift+V or command palette.").addDropdown((dropdown) => dropdown.addOption("manual", "Manual (safer)").addOption("auto", "Auto (experimental)").setValue(this.plugin.settings.pasteMode).onChange(async (value) => {
      this.plugin.settings.pasteMode = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Clean Empty Lines").setDesc("Remove extra empty lines between bullet points").addToggle((toggle) => toggle.setValue(this.plugin.settings.cleanEmptyLines).onChange(async (value) => {
      this.plugin.settings.cleanEmptyLines = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Indent Style").setDesc("Choose indentation style for pasted content").addDropdown((dropdown) => dropdown.addOption("auto", "Auto detect").addOption("tab", "Tab").addOption("spaces", "Spaces").setValue(this.plugin.settings.indentStyle).onChange(async (value) => {
      this.plugin.settings.indentStyle = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Spaces per Indent").setDesc("Number of spaces per indent level (when using spaces)").addSlider((slider) => slider.setLimits(2, 8, 2).setValue(this.plugin.settings.spacesPerIndent).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.spacesPerIndent = value;
      await this.plugin.saveSettings();
    }));
    containerEl.createEl("h3", { text: "Terminal Output Cleaning" });
    new import_obsidian.Setting(containerEl).setName("Clean Terminal Output").setDesc("Remove extra whitespace from terminal/CLI output (leading spaces, trailing spaces, etc.)").addToggle((toggle) => toggle.setValue(this.plugin.settings.cleanTerminalOutput).onChange(async (value) => {
      this.plugin.settings.cleanTerminalOutput = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Auto-detect Terminal Output").setDesc("Automatically detect if pasted content looks like terminal output").addToggle((toggle) => toggle.setValue(this.plugin.settings.autoDetectTerminal).onChange(async (value) => {
      this.plugin.settings.autoDetectTerminal = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Fix Hard Line Breaks").setDesc("Merge lines that were broken mid-sentence (e.g., at 80 columns)").addToggle((toggle) => toggle.setValue(this.plugin.settings.fixHardLineBreaks).onChange(async (value) => {
      this.plugin.settings.fixHardLineBreaks = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Remove Empty Lines").setDesc("Remove all empty lines (recommended for outline/bullet note-taking)").addToggle((toggle) => toggle.setValue(this.plugin.settings.removeEmptyLines).onChange(async (value) => {
      this.plugin.settings.removeEmptyLines = value;
      await this.plugin.saveSettings();
    }));
  }
};
