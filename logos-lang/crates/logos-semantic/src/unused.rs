//! Unused code detection
//!
//! Detects unused variables, functions, imports, and parameters in source code.

use logos_core::{Diagnostic, DiagnosticSeverity, Range, Symbol, SymbolKind};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// The kind of unused item
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UnusedKind {
    Variable,
    Function,
    Import,
    Parameter,
    Class,
    Constant,
    TypeAlias,
}

impl UnusedKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            UnusedKind::Variable => "variable",
            UnusedKind::Function => "function",
            UnusedKind::Import => "import",
            UnusedKind::Parameter => "parameter",
            UnusedKind::Class => "class",
            UnusedKind::Constant => "constant",
            UnusedKind::TypeAlias => "type alias",
        }
    }

    /// Get diagnostic severity for this kind of unused item
    pub fn severity(&self) -> DiagnosticSeverity {
        match self {
            UnusedKind::Variable | UnusedKind::Parameter => DiagnosticSeverity::Hint,
            UnusedKind::Import => DiagnosticSeverity::Warning,
            UnusedKind::Function | UnusedKind::Class | UnusedKind::TypeAlias => {
                DiagnosticSeverity::Hint
            }
            UnusedKind::Constant => DiagnosticSeverity::Hint,
        }
    }
}

/// An unused item found in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnusedItem {
    /// The kind of unused item
    pub kind: UnusedKind,
    /// The name of the unused item
    pub name: String,
    /// Location in the file
    pub range: Range,
    /// Whether this item can be safely removed
    pub can_remove: bool,
    /// Suggested fix action
    pub fix_action: Option<String>,
}

impl UnusedItem {
    /// Create a diagnostic for this unused item
    pub fn to_diagnostic(&self) -> Diagnostic {
        let message = format!("Unused {}: '{}'", self.kind.as_str(), self.name);
        let mut diagnostic = match self.kind.severity() {
            DiagnosticSeverity::Error => Diagnostic::error(self.range, message),
            DiagnosticSeverity::Warning => Diagnostic::warning(self.range, message),
            DiagnosticSeverity::Information => Diagnostic::info(self.range, message),
            DiagnosticSeverity::Hint => Diagnostic::hint(self.range, message),
        };
        diagnostic.source = Some("logos-semantic".to_string());
        diagnostic.code = Some(format!("unused-{}", self.kind.as_str()));
        diagnostic
    }
}

/// Detector for unused code
pub struct UnusedDetector {
    /// Defined symbols: name -> (range, kind, is_used)
    defined_symbols: HashMap<String, (Range, UnusedKind, bool)>,
    /// Referenced names
    references: HashSet<String>,
    /// Names that should be ignored (e.g., starting with _)
    ignore_patterns: Vec<String>,
}

impl Default for UnusedDetector {
    fn default() -> Self {
        Self::new()
    }
}

impl UnusedDetector {
    pub fn new() -> Self {
        Self {
            defined_symbols: HashMap::new(),
            references: HashSet::new(),
            ignore_patterns: vec!["_".to_string()],
        }
    }

    /// Add a pattern to ignore (e.g., names starting with _)
    pub fn ignore_pattern(&mut self, pattern: &str) {
        self.ignore_patterns.push(pattern.to_string());
    }

    /// Check if a name should be ignored
    fn should_ignore(&self, name: &str) -> bool {
        for pattern in &self.ignore_patterns {
            if name.starts_with(pattern) {
                return true;
            }
        }
        // Also ignore common special names
        matches!(
            name,
            "self" | "cls" | "this" | "super" | "main" | "init" | "__init__" | "new"
        )
    }

    /// Convert SymbolKind to UnusedKind
    fn symbol_kind_to_unused_kind(kind: SymbolKind) -> Option<UnusedKind> {
        match kind {
            SymbolKind::Variable => Some(UnusedKind::Variable),
            SymbolKind::Function | SymbolKind::Method => Some(UnusedKind::Function),
            SymbolKind::Class | SymbolKind::Struct => Some(UnusedKind::Class),
            SymbolKind::Constant => Some(UnusedKind::Constant),
            SymbolKind::TypeParameter => Some(UnusedKind::TypeAlias),
            SymbolKind::Module => Some(UnusedKind::Import),
            _ => None,
        }
    }

    /// Register a defined symbol
    pub fn register_definition(&mut self, name: &str, range: Range, kind: SymbolKind) {
        if self.should_ignore(name) {
            return;
        }
        if let Some(unused_kind) = Self::symbol_kind_to_unused_kind(kind) {
            self.defined_symbols
                .insert(name.to_string(), (range, unused_kind, false));
        }
    }

    /// Register a reference to a symbol
    pub fn register_reference(&mut self, name: &str) {
        self.references.insert(name.to_string());
    }

    /// Mark a symbol as used
    pub fn mark_used(&mut self, name: &str) {
        if let Some((_, _, used)) = self.defined_symbols.get_mut(name) {
            *used = true;
        }
    }

    /// Analyze symbols and source to detect unused items
    pub fn analyze(&mut self, symbols: &[Symbol], source: &str) -> Vec<UnusedItem> {
        self.clear();

        // First pass: collect all defined symbols
        self.collect_definitions(symbols);

        // Second pass: collect references from source
        self.collect_references(source);

        // Mark referenced symbols as used
        // Clone references to avoid borrow conflict
        let refs: Vec<String> = self.references.iter().cloned().collect();
        for name in refs {
            self.mark_used(&name);
        }

        // Report unused items
        self.report_unused()
    }

    /// Clear internal state
    fn clear(&mut self) {
        self.defined_symbols.clear();
        self.references.clear();
    }

    /// Recursively collect all symbol definitions
    fn collect_definitions(&mut self, symbols: &[Symbol]) {
        for symbol in symbols {
            self.register_definition(&symbol.name, symbol.selection_range, symbol.kind);
            // Recursively collect child symbols
            self.collect_definitions(&symbol.children);
        }
    }

    /// Collect references from source code
    /// This is a simple heuristic-based approach
    fn collect_references(&mut self, source: &str) {
        // Simple word-based reference detection
        // A more accurate approach would use the AST
        for word in source.split(|c: char| !c.is_alphanumeric() && c != '_') {
            if !word.is_empty() && !self.should_ignore(word) {
                // Check if this word is a defined symbol
                if self.defined_symbols.contains_key(word) {
                    // Count occurrences - if more than 1, it's used
                    let count = source.matches(word).count();
                    if count > 1 {
                        self.mark_used(word);
                    }
                }
            }
        }
    }

    /// Report all unused items
    fn report_unused(&self) -> Vec<UnusedItem> {
        let mut unused = Vec::new();
        for (name, (range, kind, used)) in &self.defined_symbols {
            if !used {
                let fix_action = match kind {
                    UnusedKind::Variable | UnusedKind::Parameter => {
                        Some(format!("Prefix with underscore: _{}", name))
                    }
                    UnusedKind::Import => Some("Remove unused import".to_string()),
                    UnusedKind::Function | UnusedKind::Class => {
                        Some("Remove or export if intended as public API".to_string())
                    }
                    _ => None,
                };
                unused.push(UnusedItem {
                    kind: *kind,
                    name: name.clone(),
                    range: *range,
                    can_remove: matches!(
                        kind,
                        UnusedKind::Variable | UnusedKind::Import | UnusedKind::Constant
                    ),
                    fix_action,
                });
            }
        }
        // Sort by range position
        unused.sort_by(|a, b| {
            a.range.start.line.cmp(&b.range.start.line)
                .then_with(|| a.range.start.column.cmp(&b.range.start.column))
        });
        unused
    }

    /// Generate diagnostics from analysis
    pub fn analyze_to_diagnostics(&mut self, symbols: &[Symbol], source: &str) -> Vec<Diagnostic> {
        self.analyze(symbols, source)
            .into_iter()
            .map(|item| item.to_diagnostic())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use logos_core::Position;

    fn make_symbol(name: &str, kind: SymbolKind, line: u32) -> Symbol {
        Symbol {
            name: name.to_string(),
            kind,
            range: Range {
                start: Position { line, column: 0 },
                end: Position { line, column: name.len() as u32 },
            },
            selection_range: Range {
                start: Position { line, column: 0 },
                end: Position { line, column: name.len() as u32 },
            },
            detail: None,
            children: Vec::new(),
        }
    }

    #[test]
    fn test_detect_unused_variable() {
        let mut detector = UnusedDetector::new();
        let symbols = vec![
            make_symbol("used_var", SymbolKind::Variable, 0),
            make_symbol("unused_var", SymbolKind::Variable, 1),
        ];
        let source = "let used_var = 1;\nlet unused_var = 2;\nprint(used_var);";

        let unused = detector.analyze(&symbols, source);
        assert_eq!(unused.len(), 1);
        assert_eq!(unused[0].name, "unused_var");
    }

    #[test]
    fn test_ignore_underscore() {
        let mut detector = UnusedDetector::new();
        let symbols = vec![
            make_symbol("_unused", SymbolKind::Variable, 0),
            make_symbol("unused", SymbolKind::Variable, 1),
        ];
        let source = "let _unused = 1;\nlet unused = 2;";

        let unused = detector.analyze(&symbols, source);
        assert_eq!(unused.len(), 1);
        assert_eq!(unused[0].name, "unused");
    }

    #[test]
    fn test_ignore_special_names() {
        let mut detector = UnusedDetector::new();
        let symbols = vec![
            make_symbol("self", SymbolKind::Variable, 0),
            make_symbol("main", SymbolKind::Function, 1),
        ];
        let source = "def main(): pass";

        let unused = detector.analyze(&symbols, source);
        assert!(unused.is_empty());
    }
}
