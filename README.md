# Smart Paste for Obsidian

An Obsidian plugin that intelligently pastes content with preserved indentation hierarchy, inline formatting, and automatic bullet point inheritance.

## The Problem

When pasting content from AI assistants (ChatGPT, Claude), websites, or other markdown editors into Obsidian:

- **Indentation breaks** - Nested lists lose their hierarchy
- **Extra empty lines** - Unwanted blank lines appear between bullet points
- **Formatting lost** - Bold, italic, code, links, and images disappear
- **No bullet inheritance** - Multi-line text doesn't auto-convert to bullet lists

## The Solution

Smart Paste intercepts paste events and:

1. **Preserves relative indentation** - Pasted content inherits the current cursor's indent level
2. **Maintains hierarchy** - Nested lists stay nested
3. **Keeps inline formatting** - `**bold**`, `*italic*`, `` `code` ``, `[links](url)`, and `![images](src)` are preserved
4. **Cleans empty lines** - Removes extra blank lines between bullets
5. **Auto-inherits bullets** - When pasting into a bullet line, each line becomes a bullet

## Demo

**Before** (native Obsidian paste):
```
- Parent item
- Child item 1    ← Lost indentation!
- Child item 2    ← Lost indentation!
```

**After** (with Smart Paste):
```
- Parent item
  - Child item 1  ← Preserved!
  - Child item 2  ← Preserved!
```

**Auto-inherit bullets** - Paste plain text into `- `:
```
Input (plain text):
Line 1
Line 2
Line 3

Output (when cursor is at "- "):
- Line 1
- Line 2
- Line 3
```

## Installation

### Manual Installation

1. Download the latest release from [Releases](https://github.com/gr-luo/obsidian-smart-paste/releases)
2. Extract to your vault's `.obsidian/plugins/smart-paste/` directory
3. Reload Obsidian
4. Enable "Smart Paste" in Settings → Community plugins

### From Source

```bash
cd /path/to/vault/.obsidian/plugins
git clone https://github.com/gr-luo/obsidian-smart-paste.git smart-paste
cd smart-paste
npm install
npm run build
```

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Paste Mode | Manual | `Manual`: use command/hotkey for smart paste. `Auto`: hijack all paste events |
| Clean Empty Lines | On | Remove extra blank lines between bullets |
| Indent Style | Auto | Choose: Auto detect / Tab / Spaces |
| Spaces per Indent | 2 | Number of spaces per indent level |

## Usage

### Manual Mode (Default, Recommended)

- **Cmd+V** - Normal paste (native Obsidian behavior)
- **Command Palette** → "Smart Paste: Paste with Smart Formatting" - Smart paste
- Set a custom hotkey (e.g., `Cmd+Shift+V`) in Settings → Hotkeys

### Auto Mode (Experimental)

- **Cmd+V** - All pastes are automatically processed with smart formatting

## Features

| Content | Conversion |
|---------|------------|
| Lists `<ul>/<ol>` | Smart indentation preserved |
| Links `<a href>` | `[text](url)` |
| Images `<img>` | `![alt](src)` |
| Bold `<strong>` | `**text**` |
| Italic `<em>` | `*text*` |
| Code `<code>` | `` `text` `` |
| Tables `<table>` | Skipped (uses plain text) |

## How It Works

1. **Captures paste event** in DOM capture phase (before other plugins)
2. **Reads HTML clipboard** (`text/html`) to preserve structure
3. **Converts HTML to Markdown** with proper indentation
4. **Applies relative indentation** based on cursor position
5. **Auto-inherits bullet prefix** when pasting multi-line text

### Technical Details

- Uses `document.addEventListener('paste', fn, true)` for event priority
- Parses HTML with `DOMParser` for accurate hierarchy detection
- Tracks `prevWasParagraph` state for correct list indentation
- Recursively processes inline elements to preserve formatting
- Detects tables and skips processing to avoid corruption

## Compatibility

- Obsidian v1.0.0+
- Desktop and Mobile

## Excluded Areas

Smart Paste automatically skips these areas (native paste behavior):
- File title
- Property/Metadata (frontmatter) section
- Code blocks

## Known Limitations

- Tables are skipped (plain text fallback)
- Complex nested HTML structures may not convert perfectly

## Development

```bash
# Install dependencies
npm install

# Build (one-time)
npm run build

# Watch mode
npm run dev
```

## Contributing

Issues and PRs welcome! See [CLAUDE.md](./CLAUDE.md) for development guidelines.

## License

MIT

## Credits

Built with [Claude Code](https://claude.com/claude-code)
