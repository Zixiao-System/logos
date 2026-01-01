//! Logos Semantic - Semantic analysis for the language service

pub mod resolver;
pub mod scope;
pub mod type_check;
pub mod type_infer;
pub mod unused;

pub use type_check::{TypeCheckConfig, TypeCheckError, TypeCheckErrorKind, TypeChecker};
pub use type_infer::{LiteralType, Type, TypeContext, TypeError};
pub use unused::{UnusedDetector, UnusedItem, UnusedKind};

use logos_core::{Diagnostic, Position, Range, Symbol, SymbolKind};
use logos_parser::LanguageId;
use std::collections::HashMap;

/// Semantic analysis result
#[derive(Debug, Default)]
pub struct SemanticInfo {
    pub symbols: Vec<Symbol>,
    pub diagnostics: Vec<Diagnostic>,
    pub scope_tree: scope::ScopeTree,
    pub references: HashMap<Position, Vec<Position>>,
    pub unused_items: Vec<UnusedItem>,
}

/// Semantic analyzer for a document
pub struct SemanticAnalyzer {
    language: LanguageId,
    detect_unused: bool,
}

impl SemanticAnalyzer {
    pub fn new(language: LanguageId) -> Self {
        Self {
            language,
            detect_unused: true,
        }
    }

    /// Enable or disable unused code detection
    pub fn with_unused_detection(mut self, enabled: bool) -> Self {
        self.detect_unused = enabled;
        self
    }

    pub fn analyze(&self, symbols: &[Symbol], source: &str) -> SemanticInfo {
        let mut info = SemanticInfo::default();
        info.scope_tree = scope::ScopeTree::from_symbols(symbols);
        info.symbols = symbols.to_vec();
        self.check_duplicates(&info.symbols, &mut info.diagnostics);

        // Detect unused code
        if self.detect_unused {
            let mut detector = UnusedDetector::new();
            info.unused_items = detector.analyze(symbols, source);
            // Add unused diagnostics
            for item in &info.unused_items {
                info.diagnostics.push(item.to_diagnostic());
            }
        }

        info
    }

    fn check_duplicates(&self, symbols: &[Symbol], diagnostics: &mut Vec<Diagnostic>) {
        let mut seen: HashMap<(&str, SymbolKind), Range> = HashMap::new();
        for symbol in symbols {
            let key = (symbol.name.as_str(), symbol.kind);
            if seen.contains_key(&key) {
                diagnostics.push(
                    Diagnostic::warning(
                        symbol.selection_range,
                        format!("Duplicate definition of '{}'", symbol.name),
                    )
                    .with_source("logos-semantic".to_string()),
                );
            } else {
                seen.insert(key, symbol.selection_range);
            }
            self.check_duplicates(&symbol.children, diagnostics);
        }
    }

    pub fn language(&self) -> LanguageId {
        self.language
    }
}
