
# Security Policy

## Reporting Security Vulnerabilities

We take security seriously. If you discover a security vulnerability in Logos IDE, please **do not** open a public issue. Instead, email us at `hwllochen@qq.com` with:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

We will acknowledge receipt within 48 hours and provide updates on our progress.

## Security Practices

### Code Security
- All dependencies are regularly updated to patch known vulnerabilities
- TypeScript provides type safety throughout the codebase
- ESLint and type checking are enforced in CI/CD pipelines

### Daemon & LSP Server
- The Rust daemon runs with minimal privileges
- LSP communication is isolated to the local process
- No telemetry is collected without explicit user consent

### User Data
- Project files are stored locally only
- No data is transmitted without user authorization
- Git credentials are handled by the OS credential manager

## Dependency Management

We monitor security advisories for all dependencies:
- **Frontend**: Vue.js, Monaco Editor, and related packages
- **Backend**: Rust crates managed via Cargo
- Updates are applied promptly for critical vulnerabilities

## Supported Versions

| Version | Status |
|---------|--------|
| 2026.5.x | ✅ Supported |
| 2026.4.x | ⚠️ Limited Support |
| < 2026.4 | ❌ Unsupported |

## Security Advisories

For security updates and advisories, follow our [GitHub releases](https://github.com/Zixiao-System/logos/releases).
