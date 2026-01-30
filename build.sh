#!/bin/bash

set -e

echo "🔨 Building Logos IDE..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check prerequisites
check_command() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}❌ $1 is not installed. Please install it first.${NC}"
        exit 1
    fi
}

echo -e "${YELLOW}📋 Checking prerequisites...${NC}"
check_command "node"
check_command "npm"
check_command "cargo"
check_command "rustc"

# Get build target
BUILD_TARGET=${1:-all}

build_daemon() {
    echo -e "${YELLOW}🦀 Building Logos daemon (Rust)...${NC}"
    cd logos-lang
    cargo build --release --package logos-daemon
    cd ..
    echo -e "${GREEN}✓ Daemon build complete${NC}"
}

build_frontend() {
    echo -e "${YELLOW}📦 Installing Node.js dependencies...${NC}"
    npm install
    
    echo -e "${YELLOW}✓ Running TypeScript type checking...${NC}"
    npm run typecheck
    
    echo -e "${YELLOW}🎨 Building frontend...${NC}"
    npm run build
    echo -e "${GREEN}✓ Frontend build complete${NC}"
}

# Main build logic
case $BUILD_TARGET in
    daemon)
        build_daemon
        ;;
    frontend)
        build_frontend
        ;;
    all|"")
        build_daemon
        build_frontend
        echo -e "${GREEN}✅ Build complete!${NC}"
        echo -e "${YELLOW}Release files:${NC}"
        find release -type f -name "*.dmg" -o -name "*.exe" -o -name "*.deb" -o -name "*.AppImage" 2>/dev/null | head -10
        ;;
    *)
        echo -e "${RED}Unknown target: $BUILD_TARGET${NC}"
        echo "Usage: $0 [all|daemon|frontend]"
        exit 1
        ;;
esac