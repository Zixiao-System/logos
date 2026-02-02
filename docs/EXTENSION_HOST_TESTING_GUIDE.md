# Extension Host Testing Guide

> **INTERNAL DOCUMENT** - This guide is for internal development and testing.

This guide covers testing the Extension Host implementation for Logos IDE.

## Runtime Modes

The Extension Host supports two runtime modes:

| Mode | Description | Status |
|------|-------------|--------|
| **Stub (Logos)** | Logos's own extension host implementation | Default, public |
| **VS Code Vendor** | Uses pre-built VS Code extension host | Internal only |

**Current Release Strategy**: Stub mode is the default and only publicly supported mode. VS Code vendor mode is reserved for internal testing until stability is confirmed.

### Mode Selection

The extension host automatically selects the mode:

**Development mode** (`NODE_ENV !== 'production'`):
1. Check `LOGOS_EXT_HOST_MODE` env var (explicit override)
2. If `vendor/vscode/out/vs/workbench/api/node/extensionHostProcess.js` exists → VS Code mode
3. Otherwise → Stub mode

**Production mode** (`NODE_ENV === 'production'`):
1. Check `LOGOS_EXT_HOST_MODE` env var (explicit override)
2. Default → Stub mode (vendor not auto-detected)

To force stub mode in development:
```bash
LOGOS_EXT_HOST_MODE=logos npm run dev
```

To force VS Code mode (requires vendor):
```bash
LOGOS_EXT_HOST_MODE=vscode npm run dev
```

## Target Extensions (PoC Validation Set)

1. **Prettier** (esbenp.prettier-vscode)
   - Provides formatting commands and DocumentFormattingEditProvider
   - Verification: Code formatting works
   - Difficulty: Low (pure commands, no webview)

2. **ESLint** (dbaeumer.vscode-eslint)
   - Diagnostics, code actions, fix commands
   - Verification: Error hints and quick fix
   - Difficulty: Medium (requires diagnostics, code actions)

3. **Go** (golang.go)
   - LSP client, debugger (optional), code overview, tests
   - Verification: Code completion, go to definition, quick select tests
   - Difficulty: High (complex extension, multiple providers)

## Running Tests

### Unit Tests

Run all extension host unit tests:
```bash
npm run test -- tests/unit/extension-host/
```

Run with verbose output:
```bash
npx vitest run tests/unit/extension-host/ --reporter=verbose
```

Run specific test file:
```bash
npx vitest run tests/unit/extension-host/rpc-protocol.test.ts
```

### Integration Tests

Integration tests require a built extension host:
```bash
npm run build
npx vitest run tests/unit/extension-host/extension-host-process.test.ts
```

### Test Coverage

Run tests with coverage:
```bash
npm run test:coverage
```

Coverage includes:
- `electron/extension-host/**/*.ts`
- `electron/services/**/*.ts`

## Manual Testing Steps

### 1. Start Logos with Extension Host

```bash
npm run dev
```

### 2. Verify Extension Host Startup

Check the console for messages like:
```
[extension-host] Extension Host process started (pid: 12345)
[extension-host] LOGOS_WORKSPACE_ROOT: /path/to/workspace
[extension-host] LOGOS_EXTENSIONS_DIR: /path/to/extensions
```

### 3. Test Extension Loading

1. Install a test extension to `~/.logos/extensions/`
2. Restart Logos
3. Check console for activation messages:
   ```
   [extension-host] activated: publisher.extension-name
   ```

### 4. Test Language Provider

1. Open a file with a supported language (e.g., `.ts` file)
2. Trigger completion (Ctrl+Space)
3. Verify completions appear from extension providers

### 5. Test Command Execution

1. Open Command Palette (Ctrl+Shift+P)
2. Execute an extension command
3. Verify command executes successfully

## Phase 1 Completion Checklist

| Deliverable | Status | Notes |
|-------------|--------|-------|
| Extension Host process starts (PID logged) | Done | Via extensionService fork() |
| Extensions load, activation events fire | Done | Via loader.ts |
| Commands executable from UI | Done | Via IPC handlers |
| Language providers callable | Done | Via requestHost() |
| RPC protocol implementation | Done | With validation |
| Testing guide | Done | This document |
| Unit tests > 60% on critical path | Done | rpc-protocol, loader tests |
| No TS errors | Done | Verified by typecheck |

## Debug Environment Variables

All debug flags are **opt-in** (off by default). Set to `1` to enable.

### IPC & Memory Debugging

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_DEBUG_IPC` | Log IPC send/recv messages | Off |
| `LOGOS_EXT_HOST_DEBUG_MEM` | Log memory usage periodically | Off |
| `LOGOS_EXT_HOST_DEBUG_BYTE_LENGTH` | Log large string serialization | Off |

Example:
```bash
LOGOS_EXT_HOST_DEBUG_IPC=1 LOGOS_EXT_HOST_DEBUG_MEM=1 npm run dev
```

### Heap Snapshot

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_AUTO_HEAP_SNAPSHOT` | Auto capture heap on threshold | Off |
| `LOGOS_EXT_HOST_HEAP_SNAPSHOT_THRESHOLD_MB` | Heap threshold for snapshot | `2200` |
| `LOGOS_EXT_HOST_HEAP_SNAPSHOT_RSS_THRESHOLD_MB` | RSS threshold for snapshot | `0` (disabled) |
| `LOGOS_EXT_HOST_HEAP_SNAPSHOT_ON_STARTUP` | Capture heap on startup | Off |

### IPC Safety

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_IPC_DROP_LARGE` | Drop oversized IPC payloads | Off in prod |
| `LOGOS_EXT_HOST_IPC_MAX_BYTES` | Max IPC payload size | `2000000` |

### Source Map Control

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_DISABLE_SOURCEMAP_SUPPORT` | Disable source-map-support | Off in prod |
| `LOGOS_EXT_HOST_BLOCK_EXTENSION_MAPS` | Block .map files from extensions | Off in prod |
| `LOGOS_EXT_HOST_STRIP_INLINE_SOURCEMAP` | Strip inline source maps | On |

### Module Analysis

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_LOG_MODULES` | Log large module loads | Off |
| `LOGOS_EXT_HOST_LARGE_MODULE_THRESHOLD` | Threshold for "large" module | `5000000` |

### Mode Control (Internal)

| Variable | Description | Default |
|----------|-------------|---------|
| `LOGOS_EXT_HOST_STUB` | Force stub mode | Off |
| `LOGOS_EXT_HOST_MODE` | Set mode (`logos` or `vscode`) | Auto |
| `LOGOS_VSCODE_ROOT` | Override vendor path | Auto-detect |

## Known Limitations

### Phase 1 Limitations

1. **Webview Support**: Basic webview panel creation works, but advanced features like webview-to-extension messaging may have issues.

2. **Debug Adapter Protocol**: Not implemented in Phase 1.

3. **Native Modules**: Extensions requiring native Node modules may fail to load.

4. **Extension Marketplace**: No direct integration with Open VSX or VS Code Marketplace.

5. **File System Events**: Limited to basic create/change/delete events.

### Compatibility Notes

- Extensions must be VS Code API compatible
- Only activation events supported: `*`, `onStartupFinished`, `onLanguage:*`, `onCommand:*`, `workspaceContains:*`, `onView:*`
- Webview HTML must be self-contained (no external scripts)

## Troubleshooting

### Extension fails to activate

Check:
1. Extension has a valid `package.json` with `main` entry
2. Extension is enabled in state.json
3. Activation events match document/command being used

### IPC timeout errors

Check:
1. Extension host process is running
2. No blocking operations in extension code
3. IPC payload size within limits

### Memory issues

Enable heap snapshot debugging:
```bash
LOGOS_EXT_HOST_AUTO_HEAP_SNAPSHOT=1 \
LOGOS_EXT_HOST_HEAP_SNAPSHOT_THRESHOLD_MB=500 \
npm run dev
```

### Noisy logs

If you see excessive debug output, ensure debug flags are not set:
```bash
unset LOGOS_EXT_HOST_DEBUG_IPC
unset LOGOS_EXT_HOST_DEBUG_MEM
npm run dev
```

## VS Code Vendor Mode (Internal)

> **Internal only** - Do not document publicly until stable.

To test with VS Code vendor:

1. Run `./update.sh --clone --build` to fetch and build VS Code vendor
2. Start Logos normally - it will auto-detect `vendor/vscode/`
3. Check logs for `mode: 'vscode'` in ready message

The vendor tree is gitignored and not included in releases.

## Related Documentation

- [Extension Host PoC Plan](./EXTENSION_HOST_POC_PLAN.md)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
