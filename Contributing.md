
# Contributing to Logos IDE

## Getting Started

### Prerequisites
- Node.js 18+ (Logos)
- npm 9+
- Rust 1.70+
- Cargo
  - For VS Code vendor updates, use Node.js **22.21.1** (matches VS Code `.nvmrc`)

### Setup Development Environment
```bash
./setup.sh
```

This will:
- Check required tools
- Install Node.js dependencies
- Build the Rust daemon
- Run TypeScript type checking
- Optionally run tests

## Development Workflow

### Available Commands
```bash
npm run dev           # Start development server
npm run electron:dev  # Start Electron development
npm run build         # Build the application
npm run lint          # Run ESLint
npm run test          # Run tests
```

### Building
```bash
./build.sh [all|daemon|frontend]
```

- `daemon` - Build only the Rust backend
- `frontend` - Build only the Vue.js frontend
- `all` - Build everything (default)

## Code Structure

### Frontend (`/src`)
- **components/** - Vue components organized by feature
- **stores/** - Pinia state management
- **services/** - Business logic and integrations
- **views/** - Main application views
- **types/** - TypeScript type definitions

### Backend (`/logos-lang`)
- **logos-core/** - Core language processing
- **logos-daemon/** - LSP server implementation
- **logos-parser/** - Multi-language parsers (Rust, Python, Go, Java, C++, TypeScript, etc.)
- **logos-index/** - Symbol indexing and lookup
- **logos-semantic/** - Type checking and semantic analysis
- **logos-refactor/** - Code refactoring utilities

## Testing

### Run Tests
```bash
npm run test
```

### Test Coverage
Tests are located in `/tests` directory. Coverage reports are generated in `./coverage`.

### Test Configuration
See `vitest.config.ts` for test setup and configuration.

## Submission Guidelines

1. **Fork the repository** and create a feature branch
2. **Follow code style** - ESLint configuration is provided
3. **Write tests** for new features
4. **Update documentation** if needed
5. **Submit a pull request** with a clear description

### Branch Protection Rules

The `main` branch is protected. PRs must meet these requirements:

1. **At least 1 approval** - Requires maintainer approval
2. **CI checks pass** - The following checks must pass:
   - `Typecheck & Test` - TypeScript type checking and unit tests
   - `Rust Check` - Rust code verification
3. **Branch up to date** - PR branch must be synced with main

### CI Status Check Troubleshooting

#### "Expected — Waiting for status to be reported"

If you see this status, possible causes include:

1. **Fork PRs require manual approval**

   For security, PRs from external contributors' forks require maintainer approval before CI runs. Please wait for a maintainer to approve the workflow.

2. **Status check name mismatch**

   Branch protection rules require exact match with CI workflow job `name` fields:

   | Workflow File | Job ID | Status Check Name (name field) |
   |--------------|--------|-------------------------------|
   | Check.yml | `checks` | `Typecheck & Test` |
   | Check.yml | `rust-check` | `Rust Check` |

   If an incorrect name is configured (e.g., `test` instead of `Typecheck & Test`), GitHub will wait indefinitely for a non-existent status.

3. **Workflow not triggered**

   Ensure your PR targets the `main` branch and `.github/workflows/Check.yml` has the `pull_request` trigger configured.

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Common types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation update
- `style`: Code formatting (no functional changes)
- `refactor`: Refactoring (not bug fix or new feature)
- `perf`: Performance optimization
- `test`: Test-related changes
- `chore`: Build/toolchain related

## Bug Reports

Include:
- Operating system and version
- Logos IDE version
- Steps to reproduce
- Expected vs actual behavior
- Error logs (if applicable)

## Feature Requests

Describe:
- Use case and benefit
- Proposed implementation approach
- Any alternative solutions considered

## VS Code Vendor Updates

We vendor VS Code's `out/` artifacts for the extension host. Use the helper script:

```bash
# Use the VS Code recommended Node version
nvm use 22.21.1

# Update vendor bundle
./update.sh --source ../vscode --build
```

Notes:
- The CI workflow `Update VS Code Vendor` runs weekly and can be triggered manually.
- If the build fails, confirm your Node version matches VS Code `.nvmrc` and retry.

## UI/UX Guidelines

### Code Style

- Use TypeScript for type safety
- Follow the project's ESLint configuration
- Use MDUI components instead of custom div implementations for dialogs/menus
- Use CSS variables (`--mdui-color-*`) instead of hardcoded color values

### Accessibility (WCAG)

- Dialogs: Use `<mdui-dialog>` for proper ARIA roles and focus management
- Menus: Use `<mdui-menu>` + `<mdui-menu-item>` components
- Form controls: Associate labels using `for`/`id` attributes
- Status messages: Add `role="alert"` attribute

### Color Contrast

Use MDUI semantic color variables:
- `--mdui-color-on-primary` for text on primary backgrounds
- `--mdui-color-on-warning` for text on warning backgrounds
- `--mdui-color-on-error` for text on error backgrounds

Guidelines:
- Background opacity should be at least 15-20%; avoid opacity below 10%
- Support `prefers-contrast: more` media query for high contrast mode

### HDR Support

The project supports HDR displays using P3 color gamut variables:
- `--logos-hdr-primary`
- `--logos-hdr-error`
- `--logos-hdr-warning`
- `--logos-hdr-info`

