#!/bin/bash

set -e

echo "🚀 Setting up Logos IDE development environment..."

# Check for required tools
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo "❌ $1 is not installed. Please install it first."
        exit 1
    fi
}

echo "📋 Checking prerequisites..."
check_command "node"
check_command "npm"
check_command "cargo"
check_command "rustc"

# Install Node dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# Build the Rust daemon
echo "🔨 Building Logos daemon..."
npm run build:daemon

# Type checking
echo "✓ Running TypeScript type checking..."
npm run typecheck

# Optional: Run tests
read -p "Do you want to run tests? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run test
fi

echo ""
echo "✅ Development environment setup complete!"
echo ""
echo "Available commands:"
echo "  npm run dev           - Start development server"
echo "  npm run electron:dev  - Start Electron development"
echo "  npm run build         - Build the application"
echo "  npm run lint          - Run ESLint"
echo "  npm run test          - Run tests"
echo ""