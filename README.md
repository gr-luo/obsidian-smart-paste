# Smart Paste for Obsidian

An Obsidian plugin that intelligently pastes content with preserved indentation hierarchy and inline formatting.

## The Problem

When pasting content from AI assistants (ChatGPT, Claude), websites, or other markdown editors into Obsidian:

- **Indentation breaks** - Nested lists lose their hierarchy
- **Extra empty lines** - Unwanted blank lines appear between bullet points
- **Formatting lost** - Bold, italic, and code formatting disappears

## The Solution

Smart Paste intercepts paste events and:

1. **Preserves relative indentation** - Pasted content inherits the current cursor's indent level
2. **Maintains hierarchy** - Nested lists stay nested
3. **Keeps inline formatting** - `**bold**`, `*italic*`, and `` `code` `` are preserved
4. **Cleans empty lines** - Removes extra blank lines between bullets

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
| Enable Smart Paste | On | Toggle the plugin on/off |
| Clean Empty Lines | On | Remove extra blank lines between bullets |
| Indent Style | Auto | Choose: Auto detect / Tab / Spaces |
| Spaces per Indent | 2 | Number of spaces per indent level |

## How It Works

1. **Captures paste event** in DOM capture phase (before other plugins)
2. **Reads HTML clipboard** (`text/html`) to preserve structure
3. **Converts HTML to Markdown** with proper indentation
4. **Applies relative indentation** based on cursor position

### Technical Details

- Uses `document.addEventListener('paste', fn, true)` for event priority
- Parses HTML with `DOMParser` for accurate hierarchy detection
- Tracks `prevWasParagraph` state for correct list indentation
- Recursively processes inline elements to preserve formatting

## Compatibility

- Obsidian v1.0.0+
- Desktop and Mobile

## Known Limitations

- Tables are not specially handled (yet)
- Images in clipboard are passed through without processing

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
