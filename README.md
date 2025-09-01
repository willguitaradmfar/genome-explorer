# Genome Explorer 🧬📊

Advanced Trading Analysis Desktop Application built with Electron, React, and TypeScript.

## Features

- 📊 **Real-time Trading Charts** - Interactive candlestick charts with Lightweight Charts
- 📈 **Technical Indicators** - RSI, SMA, EMA, MACD and more
- ⌨️ **Command Palette** - Quick navigation with keyboard shortcuts
- 💾 **Data Persistence** - IndexedDB for user preferences
- 🎨 **Modern UI** - Dark theme with glassmorphism effects
- 🖱️ **OHLC Tooltips** - Hover over candles for detailed information
- 📱 **Cross-platform** - Windows, macOS, and Linux support

## Keyboard Shortcuts

- `Ctrl+P` - Search and switch symbols
- `Ctrl+I` - Add technical indicators

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev:electron

# Build for production
npm run build

# Build distributables
npm run dist
```

## Building Releases

This project uses GitHub Actions to automatically build releases for all platforms when you create a new tag:

```bash
# Create and push a new tag
git tag v1.0.0
git push origin v1.0.0
```

## Download

Visit the [Releases](https://github.com/username/genome-explorer/releases) page to download the latest version for your platform:

- **Windows**: `.exe` files (installer and portable)
- **macOS**: `.dmg` and `.zip` files
- **Linux**: `.AppImage` and `.deb` packages

## Author

William Lima Pereira

## License

MIT License
