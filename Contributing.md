
# Contributing to Logos IDE

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+
- Rust 1.70+
- Cargo

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
