//! Logos Index - Symbol indexing for fast lookup

pub mod comments;
pub mod incremental;
pub mod inverted;

pub use comments::{CommentScanner, ScannerConfig, TodoIndex, TodoItem, TodoKind};
use logos_core::{Position, Range, Symbol, SymbolKind};
use std::collections::HashMap;

#[derive(Debug, Clone)]
pub struct IndexedSymbol {
    pub name: String,
    pub kind: SymbolKind,
    pub uri: String,
    pub range: Range,
    pub selection_range: Range,
    pub container: Option<String>,
}

impl IndexedSymbol {
    pub fn from_symbol(symbol: &Symbol, uri: &str, container: Option<String>) -> Self {
        Self {
            name: symbol.name.clone(),
            kind: symbol.kind,
            uri: uri.to_string(),
            range: symbol.range,
            selection_range: symbol.selection_range,
            container,
        }
    }
}

#[derive(Debug, Default)]
pub struct SymbolIndex {
    by_document: HashMap<String, Vec<IndexedSymbol>>,
    inverted: inverted::InvertedIndex,
}

impl SymbolIndex {
    pub fn new() -> Self { Self::default() }

    pub fn index_document(&mut self, uri: &str, symbols: &[Symbol]) {
        self.remove_document(uri);
        let mut indexed = Vec::new();
        self.index_symbols_recursive(uri, symbols, None, &mut indexed);
        for symbol in &indexed {
            self.inverted.add(&symbol.name, uri);
        }
        self.by_document.insert(uri.to_string(), indexed);
    }

    fn index_symbols_recursive(&self, uri: &str, symbols: &[Symbol], container: Option<&str>, indexed: &mut Vec<IndexedSymbol>) {
        for symbol in symbols {
            indexed.push(IndexedSymbol::from_symbol(symbol, uri, container.map(String::from)));
            if !symbol.children.is_empty() {
                self.index_symbols_recursive(uri, &symbol.children, Some(&symbol.name), indexed);
            }
        }
    }

    pub fn remove_document(&mut self, uri: &str) {
        if let Some(symbols) = self.by_document.remove(uri) {
            for symbol in symbols {
                self.inverted.remove(&symbol.name, uri);
            }
        }
    }

    pub fn get_document_symbols(&self, uri: &str) -> &[IndexedSymbol] {
        self.by_document.get(uri).map(|v| v.as_slice()).unwrap_or(&[])
    }

    pub fn search(&self, query: &str) -> Vec<&IndexedSymbol> {
        let uris = self.inverted.search(query);
        let mut results = Vec::new();
        for uri in uris {
            if let Some(symbols) = self.by_document.get(&uri) {
                for symbol in symbols {
                    if symbol.name.to_lowercase().contains(&query.to_lowercase()) {
                        results.push(symbol);
                    }
                }
            }
        }
        results
    }

    pub fn find_at_position(&self, uri: &str, position: Position) -> Option<&IndexedSymbol> {
        self.by_document.get(uri)?.iter().find(|s| s.selection_range.contains(position))
    }

    pub fn documents(&self) -> impl Iterator<Item = &str> {
        self.by_document.keys().map(|s| s.as_str())
    }

    pub fn symbol_count(&self) -> usize {
        self.by_document.values().map(|v| v.len()).sum()
    }
}
