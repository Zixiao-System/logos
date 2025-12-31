//! JavaScript API for the language service

use wasm_bindgen::prelude::*;
use logos_core::{Document, Position, SymbolKind};
use logos_index::SymbolIndex;
use std::collections::HashMap;
use std::cell::RefCell;

#[wasm_bindgen]
pub struct LanguageService {
    documents: RefCell<HashMap<String, Document>>,
    index: RefCell<SymbolIndex>,
}

#[wasm_bindgen]
impl LanguageService {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        Self {
            documents: RefCell::new(HashMap::new()),
            index: RefCell::new(SymbolIndex::new()),
        }
    }

    /// Open a document
    #[wasm_bindgen(js_name = openDocument)]
    pub fn open_document(&self, uri: &str, content: &str, language_id: &str) {
        let doc = Document::new(uri.to_string(), language_id.to_string(), content.to_string());
        self.documents.borrow_mut().insert(uri.to_string(), doc);
    }

    /// Update a document
    #[wasm_bindgen(js_name = updateDocument)]
    pub fn update_document(&self, uri: &str, content: &str) {
        if let Some(doc) = self.documents.borrow_mut().get_mut(uri) {
            doc.set_content(content.to_string());
        }
    }

    /// Close a document
    #[wasm_bindgen(js_name = closeDocument)]
    pub fn close_document(&self, uri: &str) {
        self.documents.borrow_mut().remove(uri);
        self.index.borrow_mut().remove_document(uri);
    }

    /// Get completions at position (returns JSON)
    #[wasm_bindgen(js_name = getCompletions)]
    pub fn get_completions(&self, uri: &str, _line: u32, _column: u32) -> String {
        let docs = self.documents.borrow();
        let doc = match docs.get(uri) {
            Some(d) => d,
            None => return "[]".to_string(),
        };

        let mut completions = Vec::new();

        // Add keyword completions based on language
        let keywords = match doc.language_id.as_str() {
            "python" => logos_parser::python::get_keywords(),
            "go" => logos_parser::go::get_keywords(),
            "rust" => logos_parser::rust_lang::get_keywords(),
            "c" => logos_parser::c::get_keywords(),
            "cpp" => logos_parser::cpp::get_keywords(),
            "java" => logos_parser::java::get_keywords(),
            "javascript" => logos_parser::javascript::get_keywords(),
            "typescript" => logos_parser::typescript::get_keywords(),
            _ => &[],
        };

        for kw in keywords {
            completions.push(serde_json::json!({
                "label": kw,
                "kind": 14, // Keyword
                "detail": "keyword"
            }));
        }

        // Add symbols from index
        let index = self.index.borrow();
        for symbol in index.get_document_symbols(uri) {
            completions.push(serde_json::json!({
                "label": symbol.name,
                "kind": symbol_kind_to_completion_kind(symbol.kind),
                "detail": format!("{:?}", symbol.kind)
            }));
        }

        serde_json::to_string(&completions).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get hover info at position (returns JSON)
    #[wasm_bindgen(js_name = getHover)]
    pub fn get_hover(&self, uri: &str, line: u32, column: u32) -> String {
        let position = Position::new(line, column);
        let index = self.index.borrow();

        if let Some(symbol) = index.find_at_position(uri, position) {
            let hover = serde_json::json!({
                "contents": format!("**{}** ({})", symbol.name, format!("{:?}", symbol.kind)),
                "range": {
                    "startLine": symbol.selection_range.start.line,
                    "startColumn": symbol.selection_range.start.column,
                    "endLine": symbol.selection_range.end.line,
                    "endColumn": symbol.selection_range.end.column
                }
            });
            return serde_json::to_string(&hover).unwrap_or_else(|_| "null".to_string());
        }

        "null".to_string()
    }

    /// Get definition at position (returns JSON)
    #[wasm_bindgen(js_name = getDefinition)]
    pub fn get_definition(&self, uri: &str, line: u32, column: u32) -> String {
        let position = Position::new(line, column);
        let index = self.index.borrow();

        if let Some(symbol) = index.find_at_position(uri, position) {
            let definition = serde_json::json!({
                "uri": symbol.uri,
                "range": {
                    "startLine": symbol.range.start.line,
                    "startColumn": symbol.range.start.column,
                    "endLine": symbol.range.end.line,
                    "endColumn": symbol.range.end.column
                }
            });
            return serde_json::to_string(&definition).unwrap_or_else(|_| "null".to_string());
        }

        "null".to_string()
    }

    /// Get document symbols (returns JSON)
    #[wasm_bindgen(js_name = getDocumentSymbols)]
    pub fn get_document_symbols(&self, uri: &str) -> String {
        let index = self.index.borrow();
        let symbols: Vec<_> = index.get_document_symbols(uri).iter().map(|s| {
            serde_json::json!({
                "name": s.name,
                "kind": symbol_kind_to_monaco_kind(s.kind),
                "range": {
                    "startLine": s.range.start.line,
                    "startColumn": s.range.start.column,
                    "endLine": s.range.end.line,
                    "endColumn": s.range.end.column
                },
                "selectionRange": {
                    "startLine": s.selection_range.start.line,
                    "startColumn": s.selection_range.start.column,
                    "endLine": s.selection_range.end.line,
                    "endColumn": s.selection_range.end.column
                }
            })
        }).collect();

        serde_json::to_string(&symbols).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get diagnostics for a document (returns JSON)
    #[wasm_bindgen(js_name = getDiagnostics)]
    pub fn get_diagnostics(&self, _uri: &str) -> String {
        // Basic diagnostics - would integrate with parser errors
        "[]".to_string()
    }

    /// Search symbols across workspace
    #[wasm_bindgen(js_name = searchSymbols)]
    pub fn search_symbols(&self, query: &str) -> String {
        let index = self.index.borrow();
        let results: Vec<_> = index.search(query).iter().map(|s| {
            serde_json::json!({
                "name": s.name,
                "kind": symbol_kind_to_monaco_kind(s.kind),
                "uri": s.uri,
                "range": {
                    "startLine": s.range.start.line,
                    "startColumn": s.range.start.column,
                    "endLine": s.range.end.line,
                    "endColumn": s.range.end.column
                }
            })
        }).collect();

        serde_json::to_string(&results).unwrap_or_else(|_| "[]".to_string())
    }

    /// Get references to symbol at position (returns JSON)
    #[wasm_bindgen(js_name = getReferences)]
    pub fn get_references(&self, uri: &str, line: u32, column: u32) -> String {
        let position = Position::new(line, column);
        let index = self.index.borrow();

        // Find the symbol at the given position
        let symbol = match index.find_at_position(uri, position) {
            Some(s) => s,
            None => return "[]".to_string(),
        };

        let symbol_name = symbol.name.clone();

        // Search for all occurrences of this symbol name across documents
        let references: Vec<_> = index.search(&symbol_name).iter().map(|s| {
            serde_json::json!({
                "uri": s.uri,
                "range": {
                    "startLine": s.selection_range.start.line,
                    "startColumn": s.selection_range.start.column,
                    "endLine": s.selection_range.end.line,
                    "endColumn": s.selection_range.end.column
                }
            })
        }).collect();

        serde_json::to_string(&references).unwrap_or_else(|_| "[]".to_string())
    }

    /// Prepare rename at position (returns JSON with symbol info or null)
    #[wasm_bindgen(js_name = prepareRename)]
    pub fn prepare_rename(&self, uri: &str, line: u32, column: u32) -> String {
        let position = Position::new(line, column);
        let index = self.index.borrow();

        if let Some(symbol) = index.find_at_position(uri, position) {
            let result = serde_json::json!({
                "range": {
                    "startLine": symbol.selection_range.start.line,
                    "startColumn": symbol.selection_range.start.column,
                    "endLine": symbol.selection_range.end.line,
                    "endColumn": symbol.selection_range.end.column
                },
                "placeholder": symbol.name
            });
            return serde_json::to_string(&result).unwrap_or_else(|_| "null".to_string());
        }

        "null".to_string()
    }

    /// Rename symbol at position (returns JSON with workspace edit or null)
    #[wasm_bindgen(js_name = rename)]
    pub fn rename(&self, uri: &str, line: u32, column: u32, new_name: &str) -> String {
        let position = Position::new(line, column);
        let index = self.index.borrow();

        // Find the symbol at the given position
        let symbol = match index.find_at_position(uri, position) {
            Some(s) => s,
            None => return "null".to_string(),
        };

        let old_name = symbol.name.clone();

        // Find all references to this symbol
        let references = index.search(&old_name);

        // Group edits by document URI
        let mut changes: std::collections::HashMap<String, Vec<serde_json::Value>> = std::collections::HashMap::new();

        for s in references {
            let edit = serde_json::json!({
                "range": {
                    "startLine": s.selection_range.start.line,
                    "startColumn": s.selection_range.start.column,
                    "endLine": s.selection_range.end.line,
                    "endColumn": s.selection_range.end.column
                },
                "newText": new_name
            });
            changes.entry(s.uri.clone()).or_default().push(edit);
        }

        let workspace_edit = serde_json::json!({
            "changes": changes
        });

        serde_json::to_string(&workspace_edit).unwrap_or_else(|_| "null".to_string())
    }
}

impl Default for LanguageService {
    fn default() -> Self {
        Self::new()
    }
}

fn symbol_kind_to_completion_kind(kind: SymbolKind) -> u32 {
    match kind {
        SymbolKind::Function | SymbolKind::Method => 3,  // Function
        SymbolKind::Class => 7,       // Class
        SymbolKind::Interface => 8,   // Interface
        SymbolKind::Variable => 6,    // Variable
        SymbolKind::Constant => 21,   // Constant
        SymbolKind::Enum => 13,       // Enum
        SymbolKind::Struct => 22,     // Struct
        SymbolKind::Module => 9,      // Module
        SymbolKind::Property | SymbolKind::Field => 10, // Property
        _ => 1,                       // Text
    }
}

fn symbol_kind_to_monaco_kind(kind: SymbolKind) -> u32 {
    kind.to_monaco_kind()
}
