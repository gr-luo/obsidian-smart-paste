import { Editor, Plugin, PluginSettingTab, App, Setting, MarkdownView } from 'obsidian';

// ============================================================================
//  Settings
// ============================================================================

interface SmartPasteSettings {
	pasteMode: 'auto' | 'manual';
	cleanEmptyLines: boolean;
	indentStyle: 'auto' | 'tab' | 'spaces';
	spacesPerIndent: number;
	// Terminal output cleaning
	cleanTerminalOutput: boolean;
	autoDetectTerminal: boolean;
	fixHardLineBreaks: boolean;
	removeEmptyLines: boolean;
}

const DEFAULT_SETTINGS: SmartPasteSettings = {
	pasteMode: 'manual',  // 默认手动模式，更安全
	cleanEmptyLines: true,
	indentStyle: 'auto',
	spacesPerIndent: 2,
	// Terminal output cleaning
	cleanTerminalOutput: true,
	autoDetectTerminal: true,
	fixHardLineBreaks: true,
	removeEmptyLines: true  // 大纲场景默认移除空行
};

// ============================================================================
//  Main Plugin
// ============================================================================

export default class SmartPastePlugin extends Plugin {
	settings: SmartPasteSettings;
	private pasteHandler: (evt: ClipboardEvent) => void;

	async onload() {
		await this.loadSettings();

		// 使用 DOM 捕获阶段事件，优先于其他插件（仅 auto 模式生效）
		this.pasteHandler = this.handlePaste.bind(this);
		document.addEventListener('paste', this.pasteHandler, true);  // true = 捕获阶段

		// 命令：手动触发智能粘贴（可绑定快捷键如 Cmd+Shift+V）
		this.addCommand({
			id: 'smart-paste',
			name: 'Paste with Smart Formatting',
			editorCallback: (editor) => {
				this.executeSmartPaste(editor);
			}
		});

		// 命令：切换粘贴模式
		this.addCommand({
			id: 'toggle-paste-mode',
			name: 'Toggle Paste Mode (Auto/Manual)',
			callback: () => {
				this.settings.pasteMode = this.settings.pasteMode === 'auto' ? 'manual' : 'auto';
				this.saveSettings();
				const mode = this.settings.pasteMode === 'auto' ? '自动劫持' : '手动触发';
				console.log(`[SmartPaste] 切换到${mode}模式`);
			}
		});

		// 命令：清理终端输出并粘贴（强制清理，不检测）
		this.addCommand({
			id: 'clean-terminal-paste',
			name: 'Paste and Clean Terminal Output',
			editorCallback: async (editor) => {
				const text = await navigator.clipboard.readText();
				if (!text) return;

				const cleaned = this.cleanTerminalOutputText(text);
				editor.replaceSelection(cleaned);
			}
		});

		// 添加设置面板
		this.addSettingTab(new SmartPasteSettingTab(this.app, this));

		console.log('Smart Paste plugin loaded');
	}

	onunload() {
		document.removeEventListener('paste', this.pasteHandler, true);
		console.log('Smart Paste plugin unloaded');
	}

	// ------------------------------------------------------------------------
	//  粘贴事件处理（仅 auto 模式生效）
	// ------------------------------------------------------------------------

	handlePaste(evt: ClipboardEvent) {
		// 手动模式下不劫持，让原生粘贴生效
		if (this.settings.pasteMode !== 'auto') {
			return;
		}

		console.log('[SmartPaste] handlePaste triggered (capture phase, auto mode)');

		// 检查粘贴目标是否在编辑器区域内（排除文件标题、Property等特殊区域）
		const target = evt.target as HTMLElement;
		const isInEditor = target?.closest('.cm-editor, .markdown-source-view');
		const isInSpecialArea = target?.closest(
			'.inline-title, .view-header-title-container, ' +
			'.metadata-container, .metadata-properties, .frontmatter-container'
		);

		if (!isInEditor || isInSpecialArea) {
			console.log('[SmartPaste] Not in editor content area, skipping');
			return;  // 不在编辑器内容区，让默认行为处理
		}

		// 获取当前活跃的 MarkdownView
		const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!activeView) {
			console.log('[SmartPaste] No active MarkdownView, skipping');
			return;
		}

		const editor = activeView.editor;

		// 尝试获取 HTML 格式，否则用纯文本
		const clipboardHtml = evt.clipboardData?.getData('text/html');
		const clipboardText = evt.clipboardData?.getData('text/plain');

		console.log('[SmartPaste] clipboardHtml:', clipboardHtml?.substring(0, 500));
		console.log('[SmartPaste] clipboardText:', clipboardText?.substring(0, 100));

		if (!clipboardText && !clipboardHtml) {
			console.log('[SmartPaste] No clipboard content, returning');
			return;
		}

		// 终端输出清理：检测并清理纯文本
		let processedClipboardText = clipboardText || '';
		if (this.settings.cleanTerminalOutput && processedClipboardText) {
			if (this.detectTerminalOutput(processedClipboardText)) {
				processedClipboardText = this.cleanTerminalOutputText(processedClipboardText);
			}
		}

		// 阻止默认粘贴和事件传播
		evt.preventDefault();
		evt.stopPropagation();
		console.log('[SmartPaste] Default prevented, processing...');

		// 检测是否在代码块内
		if (this.isInsideCodeBlock(editor)) {
			editor.replaceSelection(processedClipboardText || '');
			return;
		}

		// 检测到表格，跳过处理，使用纯文本
		if (clipboardHtml?.includes('<table')) {
			console.log('[SmartPaste] Table detected, using plain text');
			editor.replaceSelection(processedClipboardText || '');
			return;
		}

		// 获取当前行信息
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);
		const baseIndent = this.getLeadingWhitespace(currentLine);

		// 检测当前行是否是 bullet，获取 bullet 前缀
		const bulletPrefix = this.detectBulletPrefix(currentLine);

		console.log('[SmartPaste] baseIndent:', JSON.stringify(baseIndent));
		console.log('[SmartPaste] bulletPrefix:', JSON.stringify(bulletPrefix));

		// 如果有 HTML，尝试解析成 Markdown
		let contentToProcess: string;
		if (clipboardHtml) {
			contentToProcess = this.htmlToMarkdown(clipboardHtml);
			console.log('[SmartPaste] converted markdown:', contentToProcess.substring(0, 300));
		} else {
			contentToProcess = processedClipboardText || '';
		}

		// 处理粘贴内容
		const processed = this.processContent(contentToProcess, baseIndent, bulletPrefix);
		console.log('[SmartPaste] processed result:', processed.substring(0, 200));
		editor.replaceSelection(processed);
	}

	// ------------------------------------------------------------------------
	//  手动智能粘贴（命令面板/快捷键触发）
	// ------------------------------------------------------------------------

	async executeSmartPaste(editor: Editor) {
		console.log('[SmartPaste] executeSmartPaste triggered (manual mode)');

		// 检测是否在代码块内
		if (this.isInsideCodeBlock(editor)) {
			// 代码块内直接粘贴纯文本
			const text = await navigator.clipboard.readText();
			editor.replaceSelection(text);
			return;
		}

		// 获取当前行信息
		const cursor = editor.getCursor();
		const currentLine = editor.getLine(cursor.line);
		const baseIndent = this.getLeadingWhitespace(currentLine);
		const bulletPrefix = this.detectBulletPrefix(currentLine);

		// 尝试读取 HTML 剪贴板（需要 clipboard-read 权限）
		let clipboardHtml = '';
		let clipboardText = '';

		try {
			const clipboardItems = await navigator.clipboard.read();
			for (const item of clipboardItems) {
				if (item.types.includes('text/html')) {
					const blob = await item.getType('text/html');
					clipboardHtml = await blob.text();
				}
				if (item.types.includes('text/plain')) {
					const blob = await item.getType('text/plain');
					clipboardText = await blob.text();
				}
			}
		} catch (e) {
			// 回退到纯文本
			clipboardText = await navigator.clipboard.readText();
		}

		if (!clipboardText && !clipboardHtml) {
			console.log('[SmartPaste] No clipboard content');
			return;
		}

		// 终端输出清理：检测并清理纯文本
		let processedClipboardText = clipboardText || '';
		if (this.settings.cleanTerminalOutput && processedClipboardText) {
			if (this.detectTerminalOutput(processedClipboardText)) {
				processedClipboardText = this.cleanTerminalOutputText(processedClipboardText);
			}
		}

		// 检测到表格，跳过处理，使用纯文本
		if (clipboardHtml?.includes('<table')) {
			console.log('[SmartPaste] Table detected, using plain text');
			editor.replaceSelection(processedClipboardText || '');
			return;
		}

		// 处理内容
		let contentToProcess: string;
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

	htmlToMarkdown(html: string): string {
		// 创建临时 DOM 解析 HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(html, 'text/html');

		// 递归转换
		return this.convertNodeToMarkdown(doc.body, 0);
	}

	convertNodeToMarkdown(node: Node, depth: number): string {
		const results: string[] = [];
		const indent = '\t'.repeat(depth);
		let prevWasParagraph = false;  // 追踪前一个元素是否是段落

		for (const child of Array.from(node.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				const text = child.textContent?.trim();
				if (text) {
					// 独立文本也变成 bullet
					results.push(indent + '- ' + text);
					prevWasParagraph = true;
				}
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				const tagName = el.tagName.toLowerCase();

				if (tagName === 'ul' || tagName === 'ol') {
					// 列表：如果前面是段落，作为子项需要缩进一层
					const listDepth = prevWasParagraph ? depth + 1 : depth;
					const listItems = this.convertListToMarkdown(el, listDepth);
					results.push(listItems);
					prevWasParagraph = false;
				} else if (tagName === 'li') {
					// 列表项
					const text = this.getDirectTextContent(el);
					if (text) {
						results.push(indent + '- ' + text);
					}
					// 处理嵌套列表
					for (const subChild of Array.from(el.children)) {
						if (subChild.tagName.toLowerCase() === 'ul' || subChild.tagName.toLowerCase() === 'ol') {
							results.push(this.convertListToMarkdown(subChild as HTMLElement, depth + 1));
						}
					}
					prevWasParagraph = false;
				} else if (tagName === 'p' || tagName === 'div') {
					// 段落也变成 bullet
					const text = this.getDirectTextContent(el);
					if (text) {
						results.push(indent + '- ' + text);
						prevWasParagraph = true;
					}
				} else if (tagName === 'br') {
					// 换行 - 不改变状态
				} else if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3' || tagName === 'h4' || tagName === 'h5' || tagName === 'h6') {
					// 标题也变成 bullet
					const text = el.textContent?.trim();
					if (text) {
						results.push(indent + '- ' + text);
						prevWasParagraph = true;
					}
				} else if (tagName === 'strong' || tagName === 'b') {
					const text = el.textContent?.trim();
					if (text) {
						results.push(indent + '- **' + text + '**');
						prevWasParagraph = true;
					}
				} else if (tagName === 'em' || tagName === 'i') {
					const text = el.textContent?.trim();
					if (text) {
						results.push(indent + '- *' + text + '*');
						prevWasParagraph = true;
					}
				} else if (tagName === 'span') {
					// span 通常是内联元素，检查是否有独立文本
					const text = el.textContent?.trim();
					if (text) {
						results.push(indent + '- ' + text);
						prevWasParagraph = true;
					}
				} else if (tagName === 'img') {
					// 图片转换 <img src="..." alt="..."> → ![alt](src)
					const src = el.getAttribute('src');
					const alt = el.getAttribute('alt') || '';
					if (src) {
						results.push(indent + `![${alt}](${src})`);
					}
					prevWasParagraph = false;
				} else if (tagName === 'a') {
					// 独立链接转换 <a href="url">text</a> → [text](url)
					const href = el.getAttribute('href');
					const linkText = this.getDirectTextContent(el);
					if (href && linkText) {
						results.push(indent + `- [${linkText}](${href})`);
					} else if (linkText) {
						results.push(indent + '- ' + linkText);
					}
					prevWasParagraph = true;
				} else {
					// 其他元素：递归处理
					const inner = this.convertNodeToMarkdown(el, depth);
					if (inner) {
						results.push(inner);
						prevWasParagraph = false;
					}
				}
			}
		}

		return results.join('\n');
	}

	convertListToMarkdown(listEl: HTMLElement, depth: number): string {
		const results: string[] = [];
		const indent = '\t'.repeat(depth);
		const isOrdered = listEl.tagName.toLowerCase() === 'ol';
		let counter = 1;

		for (const li of Array.from(listEl.children)) {
			if (li.tagName.toLowerCase() === 'li') {
				const text = this.getDirectTextContent(li as HTMLElement);
				const bullet = isOrdered ? `${counter}. ` : '- ';
				if (text) {
					results.push(indent + bullet + text);
				}
				counter++;

				// 处理嵌套列表
				for (const subChild of Array.from(li.children)) {
					const subTag = subChild.tagName.toLowerCase();
					if (subTag === 'ul' || subTag === 'ol') {
						results.push(this.convertListToMarkdown(subChild as HTMLElement, depth + 1));
					}
				}
			}
		}

		return results.join('\n');
	}

	// 获取元素的直接文本内容（不包括子元素）
	getDirectTextContent(el: HTMLElement): string {
		let text = '';
		for (const child of Array.from(el.childNodes)) {
			if (child.nodeType === Node.TEXT_NODE) {
				text += child.textContent || '';
			} else if (child.nodeType === Node.ELEMENT_NODE) {
				const childEl = child as HTMLElement;
				const tag = childEl.tagName.toLowerCase();
				// 处理内联格式
				if (tag === 'strong' || tag === 'b') {
					text += '**' + childEl.textContent + '**';
				} else if (tag === 'em' || tag === 'i') {
					text += '*' + childEl.textContent + '*';
				} else if (tag === 'code') {
					text += '`' + childEl.textContent + '`';
				} else if (tag === 'a') {
					// 链接转换 <a href="url">text</a> → [text](url)
					const href = childEl.getAttribute('href');
					const linkText = this.getDirectTextContent(childEl);
					if (href && linkText) {
						text += `[${linkText}](${href})`;
					} else {
						text += linkText || '';
					}
				} else if (tag !== 'ul' && tag !== 'ol') {
					text += this.getDirectTextContent(childEl);  // 递归处理，保留格式
				}
			}
		}
		return text.trim();
	}

	// ------------------------------------------------------------------------
	//  核心处理逻辑
	// ------------------------------------------------------------------------

	processContent(text: string, baseIndent: string, bulletPrefix: string): string {
		const lines = text.split('\n');
		if (lines.length === 0) return text;

		// 找到最小缩进长度（直接用字符数，不转换层级）
		let minIndentLength = Infinity;
		for (const line of lines) {
			if (!line.trim()) continue;
			const indent = this.getLeadingWhitespace(line);
			minIndentLength = Math.min(minIndentLength, indent.length);
		}
		if (minIndentLength === Infinity) minIndentLength = 0;

		console.log('[SmartPaste] minIndentLength:', minIndentLength);

		// 重新生成每行，保留原始相对缩进
		const processedLines = lines.map((line, index) => {
			if (!line.trim()) return '';

			const originalIndent = this.getLeadingWhitespace(line);
			// 相对缩进 = 原始缩进去掉最小缩进部分
			const relativeIndent = originalIndent.slice(minIndentLength);
			let content = line.slice(originalIndent.length);  // 去掉缩进后的内容

			if (index === 0) {
				// 第一行：如果当前环境有 bullet，且内容也以 bullet 开头，去掉重复的 bullet
				if (bulletPrefix && this.startsWithBullet(content)) {
					content = this.stripBullet(content);
				}
				return content;
			} else {
				// 后续行：如果当前环境有 bullet
				if (bulletPrefix) {
					// 如果内容已有 bullet，保留原样
					if (this.startsWithBullet(content)) {
						return baseIndent + relativeIndent + content;
					}
					// 否则自动加上 bullet（保留相对缩进）
					return baseIndent + relativeIndent + bulletPrefix + content;
				}
				return baseIndent + relativeIndent + content;
			}
		});

		// 清理空行
		const cleaned = this.settings.cleanEmptyLines
			? this.cleanEmptyLines(processedLines)
			: processedLines;

		// 过滤开头的空行，避免换行粘贴
		while (cleaned.length > 0 && cleaned[0] === '') {
			cleaned.shift();
		}

		return cleaned.join('\n');
	}

	// 检测内容是否以 bullet 开头
	startsWithBullet(text: string): boolean {
		return /^[-*+]\s|^\d+\.\s/.test(text);
	}

	// 去掉行首的 bullet
	stripBullet(text: string): string {
		return text.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '');
	}

	// 检测当前行的 bullet 前缀
	detectBulletPrefix(line: string): string {
		// 匹配 "- ", "* ", "+ ", "1. " 等
		const match = line.match(/^\s*([-*+]|\d+\.)\s+/);
		if (match) {
			// 返回 bullet 符号 + 空格，如 "- "
			const bullet = match[1];
			return bullet.match(/^\d+$/) ? '- ' : bullet + ' ';  // 数字列表转换为 -
		}
		return '';
	}

	// ------------------------------------------------------------------------
	//  缩进工具函数
	// ------------------------------------------------------------------------

	// 获取行首空白字符
	getLeadingWhitespace(line: string): string {
		const match = line.match(/^(\s*)/);
		return match ? match[1] : '';
	}

	// 检测文本使用的缩进风格
	detectIndentStyle(text: string): string {
		const lines = text.split('\n');
		let tabCount = 0;
		let spaceCount = 0;

		for (const line of lines) {
			const indent = this.getLeadingWhitespace(line);
			if (indent.includes('\t')) tabCount++;
			else if (indent.includes('  ')) spaceCount++;
		}

		// 如果设置为自动，根据内容判断
		if (this.settings.indentStyle === 'auto') {
			return tabCount > spaceCount ? '\t' : '  ';
		}
		return this.settings.indentStyle === 'tab' ? '\t' : ' '.repeat(this.settings.spacesPerIndent);
	}

	// 计算最小缩进层级
	calculateMinIndentLevel(lines: string[], indentChar: string): number {
		let minLevel = Infinity;

		for (const line of lines) {
			if (line.trim().length === 0) continue;
			const indent = this.getLeadingWhitespace(line);
			const level = this.countIndentUnits(indent, indentChar);
			if (level < minLevel) {
				minLevel = level;
			}
		}

		return minLevel === Infinity ? 0 : minLevel;
	}

	// 计算缩进单位数
	countIndentUnits(indent: string, indentChar: string): number {
		if (indentChar === '\t') {
			return indent.split('\t').length - 1;
		}
		// 空格缩进
		const unitSize = this.settings.spacesPerIndent;
		return Math.floor(indent.length / unitSize);
	}

	// 生成指定层级的缩进
	generateIndent(level: number): string {
		if (level <= 0) return '';

		if (this.settings.indentStyle === 'tab') {
			return '\t'.repeat(level);
		}
		return ' '.repeat(level * this.settings.spacesPerIndent);
	}

	// ------------------------------------------------------------------------
	//  空行清理
	// ------------------------------------------------------------------------

	cleanEmptyLines(lines: string[]): string[] {
		const result: string[] = [];
		let prevWasEmpty = false;
		let prevWasBullet = false;

		for (const line of lines) {
			const isEmpty = line.trim().length === 0;
			const isBullet = /^\s*[-*+]\s/.test(line) || /^\s*\d+\.\s/.test(line);

			// 如果当前是空行，且前一行是 bullet，跳过
			if (isEmpty && prevWasBullet) {
				prevWasEmpty = true;
				continue;
			}

			// 如果当前是 bullet，且前一行是空行，不添加空行
			if (isBullet && prevWasEmpty) {
				// 跳过空行，直接添加 bullet
			}

			// 跳过连续空行
			if (isEmpty && prevWasEmpty) continue;

			result.push(line);
			prevWasEmpty = isEmpty;
			prevWasBullet = isBullet;
		}

		return result;
	}

	// ------------------------------------------------------------------------
	//  代码块检测
	// ------------------------------------------------------------------------

	isInsideCodeBlock(editor: Editor): boolean {
		const cursor = editor.getCursor();
		const content = editor.getValue();
		const lines = content.split('\n');

		let inCodeBlock = false;
		for (let i = 0; i <= cursor.line; i++) {
			const line = lines[i];
			if (line.startsWith('```')) {
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
	detectTerminalOutput(text: string): boolean {
		if (!this.settings.autoDetectTerminal) return false;

		const lines = text.split('\n').filter(l => l.length > 0);
		if (lines.length < 2) return false;

		let leadingSpaceLines = 0;
		let trailingSpaceLines = 0;
		let consistentWidth = 0;

		for (const line of lines) {
			// 检测行首空格（1-4个）
			if (/^[ ]{1,4}\S/.test(line)) {
				leadingSpaceLines++;
			}
			// 检测行尾空格（3个以上）
			if (/\s{3,}$/.test(line)) {
				trailingSpaceLines++;
			}
			// 检测是否接近 80 列宽度
			if (line.length >= 75 && line.length <= 85) {
				consistentWidth++;
			}
		}

		const totalLines = lines.length;
		// 如果超过 50% 的行有这些特征，认为是终端输出
		const isTerminal = (
			(leadingSpaceLines / totalLines > 0.5) ||
			(trailingSpaceLines / totalLines > 0.3) ||
			(consistentWidth / totalLines > 0.5)
		);

		if (isTerminal) {
			console.log('[SmartPaste] Detected terminal output:', {
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
	cleanTerminalOutputText(text: string): string {
		let lines = text.split('\n');

		// Step 1: 去掉每行尾部的空格
		lines = lines.map(line => line.replace(/\s+$/, ''));

		// Step 2: 去掉统一的行首空格（找到最小公共缩进并移除）
		const nonEmptyLines = lines.filter(l => l.trim().length > 0);
		if (nonEmptyLines.length > 0) {
			let minLeadingSpaces = Infinity;
			for (const line of nonEmptyLines) {
				const match = line.match(/^( *)/);
				if (match && match[1].length < minLeadingSpaces) {
					minLeadingSpaces = match[1].length;
				}
			}
			if (minLeadingSpaces > 0 && minLeadingSpaces < Infinity) {
				lines = lines.map(line => {
					if (line.trim().length === 0) return '';
					return line.slice(minLeadingSpaces);
				});
			}
		}

		// Step 3: 标准化缩进 - 去掉所有前导空格，bullet 也顶格
		lines = lines.map(line => {
			if (line.trim().length === 0) return '';
			// 直接去掉所有前导空格，让所有内容顶格
			return line.trimStart();
		});

		// Step 4: 修复硬换行
		if (this.settings.fixHardLineBreaks) {
			const joined = this.fixHardLineBreaks(lines.join('\n'));
			lines = joined.split('\n');
		}

		// Step 5: 处理空行
		if (this.settings.removeEmptyLines) {
			// 完全移除空行
			lines = lines.filter(line => line.trim().length > 0);
		} else {
			// 只压缩连续空行为单个
			const result: string[] = [];
			let prevEmpty = false;
			for (const line of lines) {
				const isEmpty = line.trim().length === 0;
				if (isEmpty && prevEmpty) continue;
				result.push(isEmpty ? '' : line);
				prevEmpty = isEmpty;
			}
			lines = result;
		}

		console.log('[SmartPaste] Terminal output cleaned');
		return lines.join('\n');
	}

	/**
	 * 修复硬换行：当一行以小写字母/逗号结尾，下一行以小写字母开头时，合并为一行
	 */
	fixHardLineBreaks(text: string): string {
		const lines = text.split('\n');
		const result: string[] = [];
		let buffer = '';

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];
			const trimmedLine = line.trim();

			// 空行：输出 buffer 和空行
			if (trimmedLine.length === 0) {
				if (buffer) {
					result.push(buffer);
					buffer = '';
				}
				result.push('');
				continue;
			}

			// 检测是否是列表项或特殊行（不合并）
			const isSpecialLine = /^[-*+•]|\d+\.|^#+\s|^>|^```|^\|/.test(trimmedLine);

			if (isSpecialLine) {
				if (buffer) {
					result.push(buffer);
					buffer = '';
				}
				result.push(line);
				continue;
			}

			// 如果 buffer 为空，开始新段落
			if (!buffer) {
				buffer = line;
				continue;
			}

			// 判断是否应该合并
			const prevEndsWithContinuation = /[a-z,，、]$/.test(buffer.trim());
			const currStartsWithLower = /^[a-z]/.test(trimmedLine);
			const prevEndsWithPunctuation = /[.!?。！？:：]$/.test(buffer.trim());

			// 合并条件：上一行没有结束标点，且（上一行以小写/逗号结尾 或 当前行以小写开头）
			if (!prevEndsWithPunctuation && (prevEndsWithContinuation || currStartsWithLower)) {
				buffer = buffer + ' ' + trimmedLine;
			} else {
				result.push(buffer);
				buffer = line;
			}
		}

		// 输出剩余的 buffer
		if (buffer) {
			result.push(buffer);
		}

		return result.join('\n');
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
}

// ============================================================================
//  设置面板
// ============================================================================

class SmartPasteSettingTab extends PluginSettingTab {
	plugin: SmartPastePlugin;

	constructor(app: App, plugin: SmartPastePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Smart Paste Settings' });

		// 粘贴模式
		new Setting(containerEl)
			.setName('Paste Mode')
			.setDesc('Auto: hijack all paste events. Manual: use Cmd+Shift+V or command palette.')
			.addDropdown(dropdown => dropdown
				.addOption('manual', 'Manual (safer)')
				.addOption('auto', 'Auto (experimental)')
				.setValue(this.plugin.settings.pasteMode)
				.onChange(async (value: 'auto' | 'manual') => {
					this.plugin.settings.pasteMode = value;
					await this.plugin.saveSettings();
				}));

		// 空行清理
		new Setting(containerEl)
			.setName('Clean Empty Lines')
			.setDesc('Remove extra empty lines between bullet points')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cleanEmptyLines)
				.onChange(async (value) => {
					this.plugin.settings.cleanEmptyLines = value;
					await this.plugin.saveSettings();
				}));

		// 缩进风格
		new Setting(containerEl)
			.setName('Indent Style')
			.setDesc('Choose indentation style for pasted content')
			.addDropdown(dropdown => dropdown
				.addOption('auto', 'Auto detect')
				.addOption('tab', 'Tab')
				.addOption('spaces', 'Spaces')
				.setValue(this.plugin.settings.indentStyle)
				.onChange(async (value: 'auto' | 'tab' | 'spaces') => {
					this.plugin.settings.indentStyle = value;
					await this.plugin.saveSettings();
				}));

		// 空格数
		new Setting(containerEl)
			.setName('Spaces per Indent')
			.setDesc('Number of spaces per indent level (when using spaces)')
			.addSlider(slider => slider
				.setLimits(2, 8, 2)
				.setValue(this.plugin.settings.spacesPerIndent)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.spacesPerIndent = value;
					await this.plugin.saveSettings();
				}));

		// Terminal Output Cleaning Section
		containerEl.createEl('h3', { text: 'Terminal Output Cleaning' });

		new Setting(containerEl)
			.setName('Clean Terminal Output')
			.setDesc('Remove extra whitespace from terminal/CLI output (leading spaces, trailing spaces, etc.)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cleanTerminalOutput)
				.onChange(async (value) => {
					this.plugin.settings.cleanTerminalOutput = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Auto-detect Terminal Output')
			.setDesc('Automatically detect if pasted content looks like terminal output')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.autoDetectTerminal)
				.onChange(async (value) => {
					this.plugin.settings.autoDetectTerminal = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Fix Hard Line Breaks')
			.setDesc('Merge lines that were broken mid-sentence (e.g., at 80 columns)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.fixHardLineBreaks)
				.onChange(async (value) => {
					this.plugin.settings.fixHardLineBreaks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Remove Empty Lines')
			.setDesc('Remove all empty lines (recommended for outline/bullet note-taking)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.removeEmptyLines)
				.onChange(async (value) => {
					this.plugin.settings.removeEmptyLines = value;
					await this.plugin.saveSettings();
				}));
	}
}
