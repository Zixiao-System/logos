<div align="center">

# Logos


<img src="docs/assets/Logosicon-iOS-Default-1024x1024@1x.png" alt="logos Logo" width="128" height="128">


**A Modern, Lightweight Code Editor**

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/electron-40+-47848F.svg)](https://electronjs.org)
[![Vue](https://img.shields.io/badge/vue-3.4+-4FC08D.svg)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/typescript-5.4+-3178C6.svg)](https://typescriptlang.org)
[![Check & Build](https://github.com/zixiao-labs/logos/actions/workflows/Check.yml/badge.svg)](https://github.com/zixiao-labs/logos/actions/workflows/Check.yml)
[![Release & Publish](https://github.com/zixiao-labs/logos/actions/workflows/Release.yml/badge.svg)](https://github.com/zixiao-labs/logos/actions/workflows/Release.yml)

[Download](#download) | [Features](#features) | [Development](#development) | [Documentation](#documentation)

</div>

---

## About

Logos is a modern, lightweight code editor built with Electron and Vue 3. It features Monaco Editor integration, an integrated terminal, and a beautiful Material Design-inspired UI powered by MDUI.

> *The name "Logos" comes from an elite operator in the game "Arknights" (Logos), symbolizing wisdom and insight.*

## Features

### Editor
- **Monaco Editor** - The same editor that powers VS Code
- **Multi-tab editing** - Work with multiple files simultaneously
- **Syntax highlighting** - Support for 50+ languages
- **Intelligent code completion** - Powered by Monaco's IntelliSense
- **Minimap** - Navigate large files easily
- **Multiple themes** - Light and dark themes included

### Code Intelligence
- **Dual Intelligence Mode** - Switch between Basic and Smart modes
  - **Basic Mode** - Standard LSP servers, fast startup, low memory
  - **Smart Mode** - Full project indexing, advanced refactoring, call hierarchy
- **Auto Mode Selection** - Automatically choose the best mode based on project size
- **Project Analysis** - Real-time metrics on file count, memory usage, and languages
- **LSP Support** - TypeScript, JavaScript, Python, Go, Rust, C/C++, Java
- **Call Hierarchy** - Trace function calls up and down the call stack
- **Impact Analysis** - Understand the consequences of code changes
- **Persistent Settings** - Your mode preference is automatically saved

### File Explorer
- **Single-click open** - VS Code-style file opening
- **File icons** - Beautiful file type icons
- **Context menu** - Create, rename, delete files and folders
- **File watching** - Auto-refresh on external changes

### Terminal
- **Integrated terminal** - xterm.js with full PTY support
- **Multiple shells** - bash, zsh, PowerShell, cmd
- **Web links** - Clickable URLs in terminal output

### UI/UX
- **Material Design** - MDUI-based modern interface
- **Dark/Light themes** - System preference detection
- **Responsive layout** - Adjustable panels and sidebar
- **Keyboard shortcuts** - Familiar VS Code shortcuts

### DevOps Integration
- **Git integration** - Branch display, file status
- **CI/CD dashboard** - Pipeline monitoring (coming soon)
- **Deployment tools** - One-click deployment (coming soon)

## Download

### Latest Release

| Platform | Architecture | Download |
|----------|--------------|----------|
| macOS | Universal (Intel + Apple Silicon) | [Download](https://github.com/Zixiao-System/logos/releases/download/v2026.5.4/Logos-2026.5.4-arm64.dmg) |
| Windows | x64 | [Download](https://github.com/Zixiao-System/logos/releases/download/v2026.5.4/Logos-2026.5.4-arm64.dmg) |
| Linux | x64 | [Download](https://github.com/Zixiao-System/logos/releases/download/v2026.5.4/Logos-2026.5.4-arm64.dmg) |
| Linux | arm64 | [Download](https://github.com/Zixiao-System/logos/releases/download/v2026.5.4/Logos-2026.5.4-arm64.dmg) |

### Package Managers

```bash
# macOS (Homebrew)
brew tap Zixiao-System/tap
brew install --cask logos

# Arch Linux (AUR)
yay -S logos-bin
# or
paru -S logos-bin

# Windows (Winget) - Coming soon
# winget install Zixiao.Logos
```

## macOS issue resove

```bash
xattr -cr /Applications/Logos.app 

```

## Screenshots

<div align="center">

| Dark Theme | Light Theme |
|------------|-------------|
| ![Dark](docs/assets/screenshot-dark.png) | ![Light](docs/assets/screenshot-light.png) |

</div>

## Development

### Prerequisites

- Node.js 18+ (LTS recommended)
- npm 9+ or yarn 1.22+
- Git

### Setup

```bash
# Clone the repository
git clone https://github.com/Zixiao-System/logos-ide.git
cd lsp-ide

# Install dependencies
npm install

# Start development server
npm run dev
```

### Build

```bash
# Build for production
npm run build

# Build Electron app
npm run electron:build
```

### Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Vite dev server with Electron |
| `npm run build` | Build for production |
| `npm run electron:build` | Package Electron app |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |

## Project Structure

```
logos-ide/
├── electron/
│   ├── main.ts              # Electron main process
│   ├── preload.ts           # Preload scripts (IPC bridge)
│   └── services/            # Backend services
│       ├── fileSystem.ts    # File system operations
│       ├── git.ts           # Git operations
│       └── terminal.ts      # PTY terminal
├── src/
│   ├── components/          # Vue components
│   │   ├── FileExplorer/    # File tree components
│   │   └── Git/             # Git panel components
│   ├── stores/              # Pinia stores
│   │   ├── editor.ts        # Editor state
│   │   ├── fileExplorer.ts  # File explorer state
│   │   ├── git.ts           # Git state
│   │   └── theme.ts         # Theme state
│   ├── views/               # View components
│   │   ├── EditorView.vue   # Main editor view
│   │   ├── TerminalView.vue # Terminal view
│   │   ├── DevOpsView.vue   # DevOps dashboard
│   │   └── SettingsView.vue # Settings view
│   ├── types/               # TypeScript definitions
│   ├── utils/               # Utility functions
│   ├── styles/              # Global CSS
│   ├── router/              # Vue Router
│   ├── App.vue              # Root component
│   └── main.ts              # Vue entry point
├── public/                  # Static assets
├── build/                   # Build resources (icons)
├── docs/                    # Documentation
├── package.json
├── vite.config.ts
├── tsconfig.json
└── electron-builder.yml
```

## Keyboard Shortcuts

| Action | macOS | Windows/Linux |
|--------|-------|---------------|
| Save | `Cmd+S` | `Ctrl+S` |
| Close Tab | `Cmd+W` | `Ctrl+W` |
| Quick Open | `Cmd+P` | `Ctrl+P` |
| Command Palette | `Cmd+Shift+P` | `Ctrl+Shift+P` |
| Find | `Cmd+F` | `Ctrl+F` |
| Replace | `Cmd+H` | `Ctrl+H` |
| Toggle Terminal | `Cmd+`` | `Ctrl+`` |
| Toggle Sidebar | `Cmd+B` | `Ctrl+B` |

## Configuration

logos stores configuration in:
- **macOS**: `~/Library/Application Support/logos/`
- **Windows**: `%APPDATA%/logos/`
- **Linux**: `~/.config/logos/`

### Editor Settings

```json
{
  "editor.fontSize": 14,
  "editor.fontFamily": "JetBrains Mono, Fira Code, monospace",
  "editor.tabSize": 2,
  "editor.wordWrap": "off",
  "editor.minimap": true,
  "editor.theme": "lsp-dark"
}
```

## Roadmap

- [ ] VS Code-compatible extension system (core APIs + VSIX install)
- [ ] Extension marketplace (Open VSX / self-host), GA target v2026.6.7
- [ ] VS Code extension API full support (Core/UI/Webview)
- [ ] Remote development (SSH)
- [ ] Collaborative editing
- [ ] AI code assistant integration
- [ ] Custom themes
- [ ] Workspace support
- [ ] Debug adapter protocol

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Electron](https://electronjs.org) | Desktop application framework |
| [Vue 3](https://vuejs.org) | UI framework |
| [Vite](https://vitejs.dev) | Build tool |
| [Pinia](https://pinia.vuejs.org) | State management |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | Code editor |
| [xterm.js](https://xtermjs.org) | Terminal emulator |
| [MDUI](https://www.mdui.org) | Material Design UI library |
| [TypeScript](https://typescriptlang.org) | Type safety |
| [node-pty](https://github.com/microsoft/node-pty) | Pseudo-terminal |

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [VS Code](https://code.visualstudio.com/) - For inspiration and Monaco Editor
- [MDUI](https://www.mdui.org/) - For the beautiful Material Design components
- [Arknights](https://ak.hypergryph.com/) - For the name inspiration

---

<div align="center">

**Built with passion by the Zixiao System Team**

[Website](https://zixiao.io) | [Twitter](https://twitter.com/zixiao_system) | [Discord](https://discord.gg/zixiao)

</div>

