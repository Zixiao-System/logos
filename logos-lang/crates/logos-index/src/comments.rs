//! TODO/FIXME comment scanner for code analysis
//!
//! Scans source code for TODO, FIXME, HACK, XXX, NOTE and other comment markers.

use logos_core::Range;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// The kind of TODO comment marker
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TodoKind {
    Todo,
    Fixme,
    Hack,
    Xxx,
    Note,
    Bug,
    Optimize,
    Custom,
}

impl TodoKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            TodoKind::Todo => "TODO",
            TodoKind::Fixme => "FIXME",
            TodoKind::Hack => "HACK",
            TodoKind::Xxx => "XXX",
            TodoKind::Note => "NOTE",
            TodoKind::Bug => "BUG",
            TodoKind::Optimize => "OPTIMIZE",
            TodoKind::Custom => "CUSTOM",
        }
    }

    /// Get priority level (higher = more urgent)
    pub fn priority(&self) -> u8 {
        match self {
            TodoKind::Bug => 5,
            TodoKind::Fixme => 4,
            TodoKind::Xxx => 3,
            TodoKind::Todo => 2,
            TodoKind::Optimize => 2,
            TodoKind::Hack => 1,
            TodoKind::Note => 0,
            TodoKind::Custom => 1,
        }
    }
}

/// A TODO item found in source code
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TodoItem {
    /// The kind of TODO marker
    pub kind: TodoKind,
    /// The text content after the marker
    pub text: String,
    /// Location in the file
    pub range: Range,
    /// Optional author/assignee (from patterns like TODO(john):)
    pub author: Option<String>,
    /// Priority level (0-5, higher = more urgent)
    pub priority: u8,
    /// The line number (1-indexed)
    pub line: u32,
}

/// Configuration for the comment scanner
#[derive(Debug, Clone)]
pub struct ScannerConfig {
    /// Additional custom patterns to match
    pub custom_patterns: Vec<String>,
    /// Whether to scan inside multi-line comments
    pub scan_multiline: bool,
}

impl Default for ScannerConfig {
    fn default() -> Self {
        Self {
            custom_patterns: Vec::new(),
            scan_multiline: true,
        }
    }
}

/// Scanner for TODO/FIXME comments in source code
#[derive(Debug)]
pub struct CommentScanner {
    /// Compiled regex pattern for matching TODO markers
    pattern: Regex,
    /// Map of marker strings to TodoKind
    kind_map: HashMap<String, TodoKind>,
}

impl Default for CommentScanner {
    fn default() -> Self {
        Self::new(&ScannerConfig::default())
    }
}

impl CommentScanner {
    /// Create a new scanner with the given configuration
    pub fn new(config: &ScannerConfig) -> Self {
        let mut kind_map = HashMap::new();
        kind_map.insert("TODO".to_string(), TodoKind::Todo);
        kind_map.insert("FIXME".to_string(), TodoKind::Fixme);
        kind_map.insert("HACK".to_string(), TodoKind::Hack);
        kind_map.insert("XXX".to_string(), TodoKind::Xxx);
        kind_map.insert("NOTE".to_string(), TodoKind::Note);
        kind_map.insert("BUG".to_string(), TodoKind::Bug);
        kind_map.insert("OPTIMIZE".to_string(), TodoKind::Optimize);

        // Add custom patterns
        for pattern in &config.custom_patterns {
            kind_map.insert(pattern.to_uppercase(), TodoKind::Custom);
        }

        // Build the regex pattern
        // Matches: // TODO: text, /* TODO: text */, # TODO: text, -- TODO: text
        // Also matches: TODO(author): text, TODO!: text (urgent)
        let keywords: Vec<&str> = kind_map.keys().map(|s| s.as_str()).collect();
        let keywords_pattern = keywords.join("|");

        // Pattern explanation:
        // (?://|/\*|#|--|;)?\s*  - Optional comment prefix
        // (TODO|FIXME|...)       - The keyword
        // (!)?                   - Optional urgency marker
        // (?:\(([^)]+)\))?       - Optional (author) group
        // [:\s]+                 - Colon or whitespace separator
        // (.*)                   - The TODO text
        let pattern_str = format!(
            r"(?://|/\*|#|--|;)?\s*\b({})\b(!)?(?:\(([^)]+)\))?[:\s]+(.*)$",
            keywords_pattern
        );

        let pattern = Regex::new(&pattern_str).expect("Invalid regex pattern");

        Self { pattern, kind_map }
    }

    /// Scan a source file for TODO comments
    pub fn scan_file(&self, source: &str, _uri: &str) -> Vec<TodoItem> {
        let mut todos = Vec::new();

        for (line_idx, line) in source.lines().enumerate() {
            if let Some(captures) = self.pattern.captures(line) {
                let keyword = captures.get(1).map(|m| m.as_str().to_uppercase());
                let urgent = captures.get(2).is_some();
                let author = captures.get(3).map(|m| m.as_str().to_string());
                let text = captures.get(4).map(|m| m.as_str().trim().to_string()).unwrap_or_default();

                if let Some(keyword) = keyword {
                    if let Some(&kind) = self.kind_map.get(&keyword) {
                        let match_start = captures.get(1).unwrap().start();
                        let match_end = captures.get(4).map(|m| m.end()).unwrap_or(captures.get(1).unwrap().end());

                        let priority = if urgent {
                            (kind.priority() + 1).min(5)
                        } else {
                            kind.priority()
                        };

                        todos.push(TodoItem {
                            kind,
                            text,
                            range: Range {
                                start: logos_core::Position {
                                    line: line_idx as u32,
                                    column: match_start as u32,
                                },
                                end: logos_core::Position {
                                    line: line_idx as u32,
                                    column: match_end as u32,
                                },
                            },
                            author,
                            priority,
                            line: (line_idx + 1) as u32,
                        });
                    }
                }
            }
        }

        todos
    }

    /// Scan multiple files and return all TODO items
    pub fn scan_files(&self, files: &[(&str, &str)]) -> HashMap<String, Vec<TodoItem>> {
        let mut results = HashMap::new();
        for (uri, source) in files {
            let todos = self.scan_file(source, uri);
            if !todos.is_empty() {
                results.insert(uri.to_string(), todos);
            }
        }
        results
    }
}

/// Index for storing and querying TODO items across a project
#[derive(Debug, Default)]
pub struct TodoIndex {
    /// TODOs indexed by document URI
    by_document: HashMap<String, Vec<TodoItem>>,
    /// Scanner instance
    scanner: CommentScanner,
}

impl TodoIndex {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_config(config: &ScannerConfig) -> Self {
        Self {
            by_document: HashMap::new(),
            scanner: CommentScanner::new(config),
        }
    }

    /// Index a document for TODOs
    pub fn index_document(&mut self, uri: &str, source: &str) {
        let todos = self.scanner.scan_file(source, uri);
        if todos.is_empty() {
            self.by_document.remove(uri);
        } else {
            self.by_document.insert(uri.to_string(), todos);
        }
    }

    /// Remove a document from the index
    pub fn remove_document(&mut self, uri: &str) {
        self.by_document.remove(uri);
    }

    /// Get all TODOs for a specific document
    pub fn get_document_todos(&self, uri: &str) -> &[TodoItem] {
        self.by_document.get(uri).map(|v| v.as_slice()).unwrap_or(&[])
    }

    /// Get all TODOs across all indexed documents
    pub fn get_all_todos(&self) -> Vec<(&str, &TodoItem)> {
        let mut todos = Vec::new();
        for (uri, items) in &self.by_document {
            for item in items {
                todos.push((uri.as_str(), item));
            }
        }
        // Sort by priority (descending) then by file and line
        todos.sort_by(|a, b| {
            b.1.priority.cmp(&a.1.priority)
                .then_with(|| a.0.cmp(b.0))
                .then_with(|| a.1.line.cmp(&b.1.line))
        });
        todos
    }

    /// Get TODOs filtered by kind
    pub fn get_todos_by_kind(&self, kind: TodoKind) -> Vec<(&str, &TodoItem)> {
        self.get_all_todos()
            .into_iter()
            .filter(|(_, item)| item.kind == kind)
            .collect()
    }

    /// Get total count of TODOs
    pub fn todo_count(&self) -> usize {
        self.by_document.values().map(|v| v.len()).sum()
    }

    /// Get count by kind
    pub fn count_by_kind(&self) -> HashMap<TodoKind, usize> {
        let mut counts = HashMap::new();
        for items in self.by_document.values() {
            for item in items {
                *counts.entry(item.kind).or_insert(0) += 1;
            }
        }
        counts
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_scan_simple_todo() {
        let scanner = CommentScanner::default();
        let source = r#"
// TODO: Fix this later
fn main() {
    // FIXME: Handle error case
    println!("Hello");
}
"#;
        let todos = scanner.scan_file(source, "test.rs");
        assert_eq!(todos.len(), 2);
        assert_eq!(todos[0].kind, TodoKind::Todo);
        assert_eq!(todos[0].text, "Fix this later");
        assert_eq!(todos[1].kind, TodoKind::Fixme);
    }

    #[test]
    fn test_scan_with_author() {
        let scanner = CommentScanner::default();
        let source = "// TODO(john): Review this code";
        let todos = scanner.scan_file(source, "test.rs");
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].author, Some("john".to_string()));
    }

    #[test]
    fn test_scan_urgent() {
        let scanner = CommentScanner::default();
        let source = "// TODO!: Urgent fix needed";
        let todos = scanner.scan_file(source, "test.rs");
        assert_eq!(todos.len(), 1);
        assert!(todos[0].priority > TodoKind::Todo.priority());
    }

    #[test]
    fn test_scan_python_comment() {
        let scanner = CommentScanner::default();
        let source = "# TODO: Python todo";
        let todos = scanner.scan_file(source, "test.py");
        assert_eq!(todos.len(), 1);
        assert_eq!(todos[0].text, "Python todo");
    }

    #[test]
    fn test_todo_index() {
        let mut index = TodoIndex::new();
        index.index_document("a.rs", "// TODO: First\n// FIXME: Second");
        index.index_document("b.rs", "// NOTE: Third");

        assert_eq!(index.todo_count(), 3);
        assert_eq!(index.get_document_todos("a.rs").len(), 2);
        assert_eq!(index.get_document_todos("b.rs").len(), 1);
    }
}
