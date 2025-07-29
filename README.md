# 📋 EasyTerms - AI-Powered Terms of Service Summarizer

**EasyTerms** is a Chrome browser extension that automatically detects Terms of Service and Privacy Policy links on websites and provides AI-powered summaries to help users understand what they're agreeing to.

![EasyTerms Demo](https://img.shields.io/badge/Status-Active-brightgreen) ![Chrome Extension](https://img.shields.io/badge/Platform-Chrome%20Extension-blue) ![AI Powered](https://img.shields.io/badge/AI-OpenAI%20GPT-orange)

## ✨ Features

- 🔍 **Automatic Detection**: Finds Terms of Service and Privacy Policy links on any website
- 🤖 **AI Summarization**: Uses OpenAI GPT models to create clear, concise summaries
- 🎯 **Smart Extraction**: Bypasses CORS restrictions to fetch content from any website
- 🖱️ **Interactive Popup**: Draggable, resizable window with minimize/maximize controls
- ⌨️ **Keyboard Shortcuts**: Quick actions with Ctrl+Enter, Escape, and Ctrl+A
- 💾 **State Persistence**: Remembers window size and position across sessions
- 📱 **Responsive Design**: Works on all screen sizes with mobile-friendly controls
- 🎨 **Modern UI**: Clean, professional interface with smooth animations

## 🔧 Requirements

### System Requirements
- **Browser**: Google Chrome 88+ or Chromium-based browsers
- **Operating System**: Windows, macOS, or Linux
- **Internet Connection**: Required for AI summarization

### API Requirements
- **OpenAI API Key**: Required for text summarization
  - Sign up at [OpenAI Platform](https://platform.openai.com/)
  - Generate an API key from your dashboard
  - Supported models: GPT-4.1 Nano, GPT-4.1 Mini, GPT-4o Mini, GPT-4o, GPT-4.1

### Permissions
The extension requires the following Chrome permissions:
- `activeTab`: To detect terms links on the current page
- `storage`: To save API key and user preferences
- `host_permissions`: Access to `https://api.openai.com/*` for AI processing

## 📦 Installation

### Method 1: Chrome Web Store (Recommended)
*Coming Soon - Extension will be available on the Chrome Web Store*

### Method 2: Developer Mode Installation

1. **Download the Extension**
   ```bash
   git clone https://github.com/kxddry/easyterms.git
   cd easyterms
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or go to Chrome Menu → More Tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `easyterms` folder you downloaded
   - The extension should now appear in your extensions list

5. **Pin the Extension** (Optional)
   - Click the puzzle piece icon in Chrome's toolbar
   - Find "EasyTerms" and click the pin icon to keep it visible

## ⚙️ Configuration

### Setting up OpenAI API Key

1. **Open Extension Settings**
   - Click the EasyTerms icon in your Chrome toolbar
   - The settings popup will open

2. **Enter API Key**
   - Paste your OpenAI API key in the "OpenAI API Key" field
   - Select your preferred model (GPT-4.1 Nano recommended for speed and cost)

3. **Test Connection**
   - Click "Test Connection" to verify your API key works
   - You should see "Connection successful!" message

4. **Save Settings**
   - Click "Save Settings" to store your configuration

### Model Selection Guide

| Model | Speed | Cost | Quality | Best For |
|-------|-------|------|---------|----------|
| GPT-4.1 Nano | ⚡⚡⚡ | 💰 | ⭐⭐⭐ | Quick summaries |
| GPT-4.1 Mini | ⚡⚡ | 💰💰 | ⭐⭐⭐⭐ | Balanced performance |
| GPT-4o Mini | ⚡⚡ | 💰💰 | ⭐⭐⭐⭐ | Good quality/cost ratio |
| GPT-4o | ⚡ | 💰💰💰 | ⭐⭐⭐⭐⭐ | High-quality summaries |
| GPT-4.1 | ⚡ | 💰💰💰💰 | ⭐⭐⭐⭐⭐ | Premium quality |

## 🚀 Usage

### Basic Usage

1. **Visit Any Website**
   - Navigate to any website that might have Terms of Service or Privacy Policy links

2. **Automatic Detection**
   - EasyTerms automatically scans the page for terms-related links
   - If found, a popup will appear near the detected links

3. **Select Documents**
   - Choose which terms documents you want to summarize
   - Use "All" or "None" buttons for quick selection

4. **Get Summary**
   - Click "Summarize" or press Ctrl+Enter
   - Wait for AI processing (usually 5-15 seconds)
   - Read the clear, concise summary

### Advanced Features

#### Window Controls
- **Drag**: Click and drag the header to move the popup
- **Resize**: Drag from corners/edges to resize
- **Minimize**: Click the "−" button to minimize to title bar
- **Maximize**: Click the "□" button to maximize to 90% of screen
- **Close**: Click the "×" button or press Escape

#### Keyboard Shortcuts
- `Escape`: Close the popup
- `Ctrl+Enter`: Start summarization
- `Ctrl+A`: Select all checkboxes
- `Double-click header`: Maximize/restore window

#### State Persistence
- Window size and position are automatically saved
- Settings persist across browser sessions
- State expires after 24 hours for privacy

## 🛠️ Development

### Project Structure
```
easyterms/
├── manifest.json          # Extension manifest
├── popup.html             # Settings popup UI
├── popup.js              # Settings popup logic
├── content.js            # Main content script
├── content.css           # Popup styling
├── background.js         # Background service worker
├── icons/                # Extension icons
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md            # This file
```

### Building from Source

1. **Clone Repository**
   ```bash
   git clone https://github.com/kxddry/easyterms.git
   cd easyterms
   ```

2. **Install Dependencies** (if any)
   ```bash
   # No build process required - pure JavaScript
   ```

3. **Load in Chrome**
   - Follow the Developer Mode installation steps above

### Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🔒 Privacy & Security

### Data Handling
- **API Key Storage**: Stored locally in Chrome's secure storage
- **Content Processing**: Terms content is sent to OpenAI for summarization only
- **No Data Collection**: EasyTerms doesn't collect or store user browsing data
- **Local Processing**: All detection and parsing happens locally in your browser

### Security Features
- **HTTPS Only**: All API communications use secure HTTPS
- **Content Security Policy**: Strict CSP prevents code injection
- **Minimal Permissions**: Only requests necessary browser permissions
- **No Tracking**: No analytics, tracking, or telemetry

## 🐛 Troubleshooting

### Common Issues

#### "API Key not configured" Error
- **Solution**: Open extension settings and enter your OpenAI API key
- **Check**: Ensure the API key starts with "sk-" and is valid

#### "Connection failed" Error
- **Check**: Verify your internet connection
- **Verify**: Test your API key on OpenAI's platform
- **Firewall**: Ensure `api.openai.com` is not blocked

#### No Terms Links Detected
- **Manual Check**: Look for "Terms", "Privacy Policy" links on the page
- **Reload**: Try refreshing the page
- **Different Sites**: Some sites may not have detectable terms links

#### Content Extraction Failed
- **CORS Issues**: Some sites block automated access
- **Manual Copy**: Try copying terms content manually
- **Different Links**: Try other terms links on the same site

### Debug Mode
- Open Chrome DevTools (F12)
- Check Console for detailed logs with `[TERMS-SUMMARIZER]` prefix
- Look for network errors or API response issues

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Support

### Getting Help
- **Issues**: Report bugs on [GitHub Issues](https://github.com/kxddry/easyterms/issues)
- **Discussions**: Join conversations on [GitHub Discussions](https://github.com/kxddry/easyterms/discussions)
- **Email**: Contact support at support@easyterms.com

### Feature Requests
We welcome feature requests! Please:
1. Check existing issues first
2. Provide detailed use cases
3. Explain the expected behavior
4. Consider contributing the feature yourself

## 🙏 Acknowledgments

- **OpenAI** for providing the GPT models that power our summarization
- **Chrome Extensions Team** for the excellent developer platform
- **Contributors** who help improve EasyTerms
- **Users** who provide feedback and bug reports

## 📊 Changelog

### Version 1.0.0 (Current)
- ✅ Initial release
- ✅ Automatic terms detection
- ✅ AI-powered summarization
- ✅ Draggable, resizable popup
- ✅ Multiple model support
- ✅ State persistence
- ✅ Keyboard shortcuts

### Planned Features
- 🔄 Batch processing for multiple sites
- 🌐 Multi-language support
- 📊 Terms comparison tool
- 🔔 Terms change notifications
- 📱 Mobile browser support

---

**Made with ❤️ for a more transparent web by [@kxddry](https://github.com/kxddry/)**

*EasyTerms helps users understand what they're agreeing to, one terms document at a time.*
