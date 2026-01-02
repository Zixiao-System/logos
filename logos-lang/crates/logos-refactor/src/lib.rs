//! Logos Refactor - Safe refactoring engine for the language service
//!
//! This crate provides refactoring operations like:
//! - Extract Variable: Extract a selected expression into a new variable
//! - Extract Method: Extract selected code into a new function/method
//! - Safe Delete: Safely delete symbols that are not used elsewhere

pub mod analysis;
pub mod extract_method;
pub mod extract_variable;
pub mod safe_delete;

use logos_core::{Location, Position, Range};
use serde::{Deserialize, Serialize};
use thiserror::Error;

/// A text edit to be applied to a document
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextEdit {
    /// The range to replace
    pub range: Range,
    /// The new text to insert
    pub new_text: String,
}

impl TextEdit {
    /// Create a new text edit
    pub fn new(range: Range, new_text: String) -> Self {
        Self { range, new_text }
    }

    /// Create an insertion edit at a position
    pub fn insert(position: Position, text: String) -> Self {
        Self {
            range: Range::point(position.line, position.column),
            new_text: text,
        }
    }

    /// Create a deletion edit for a range
    pub fn delete(range: Range) -> Self {
        Self {
            range,
            new_text: String::new(),
        }
    }

    /// Create a replacement edit
    pub fn replace(range: Range, text: String) -> Self {
        Self {
            range,
            new_text: text,
        }
    }
}

/// Result of a refactoring operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefactorResult {
    /// Text edits to apply (in reverse order for proper application)
    pub edits: Vec<TextEdit>,
    /// Optional new code that was generated (e.g., extracted method)
    pub generated_code: Option<String>,
    /// Human-readable description of the refactoring
    pub description: String,
}

impl RefactorResult {
    pub fn new(edits: Vec<TextEdit>, description: String) -> Self {
        Self {
            edits,
            generated_code: None,
            description,
        }
    }

    pub fn with_generated_code(mut self, code: String) -> Self {
        self.generated_code = Some(code);
        self
    }
}

/// Available refactoring actions for a given selection
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefactorAction {
    /// Unique identifier for this action
    pub id: String,
    /// Display title for the action
    pub title: String,
    /// The kind of refactoring
    pub kind: RefactorKind,
    /// Whether this action is currently applicable
    pub is_available: bool,
    /// Reason if not available
    pub unavailable_reason: Option<String>,
}

impl RefactorAction {
    pub fn available(id: impl Into<String>, title: impl Into<String>, kind: RefactorKind) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            kind,
            is_available: true,
            unavailable_reason: None,
        }
    }

    pub fn unavailable(
        id: impl Into<String>,
        title: impl Into<String>,
        kind: RefactorKind,
        reason: impl Into<String>,
    ) -> Self {
        Self {
            id: id.into(),
            title: title.into(),
            kind,
            is_available: false,
            unavailable_reason: Some(reason.into()),
        }
    }
}

/// Types of refactoring operations
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefactorKind {
    ExtractVariable,
    ExtractMethod,
    InlineVariable,
    SafeDelete,
    Rename,
}

/// Errors that can occur during refactoring
#[derive(Debug, Error)]
pub enum RefactorError {
    #[error("Invalid selection: {0}")]
    InvalidSelection(String),

    #[error("Cannot extract: {0}")]
    CannotExtract(String),

    #[error("Expression has side effects")]
    HasSideEffects,

    #[error("Symbol is still in use")]
    SymbolInUse(Vec<Location>),

    #[error("No expression at selection")]
    NoExpression,

    #[error("Selection spans multiple statements")]
    MultipleStatements,

    #[error("Cannot determine expression type")]
    UnknownType,

    #[error("Control flow issue: {0}")]
    ControlFlowIssue(String),

    #[error("Parse error: {0}")]
    ParseError(String),
}

/// Context for refactoring operations
#[derive(Debug)]
pub struct RefactorContext<'a> {
    /// The source code
    pub source: &'a str,
    /// The document URI
    pub uri: &'a str,
    /// The selection range
    pub selection: Range,
    /// Language of the document
    pub language: logos_parser::LanguageId,
}

impl<'a> RefactorContext<'a> {
    pub fn new(
        source: &'a str,
        uri: &'a str,
        selection: Range,
        language: logos_parser::LanguageId,
    ) -> Self {
        Self {
            source,
            uri,
            selection,
            language,
        }
    }

    /// Get the selected text
    pub fn selected_text(&self) -> &str {
        self.text_in_range(self.selection)
    }

    /// Get text in a given range
    pub fn text_in_range(&self, range: Range) -> &str {
        let lines: Vec<&str> = self.source.lines().collect();

        if range.start.line as usize >= lines.len() {
            return "";
        }

        if range.start.line == range.end.line {
            // Single line selection
            let line = lines[range.start.line as usize];
            let start = (range.start.column as usize).min(line.len());
            let end = (range.end.column as usize).min(line.len());
            &line[start..end]
        } else {
            // Multi-line selection
            let mut result = String::new();
            for i in range.start.line..=range.end.line {
                if i as usize >= lines.len() {
                    break;
                }
                let line = lines[i as usize];
                if i == range.start.line {
                    let start = (range.start.column as usize).min(line.len());
                    result.push_str(&line[start..]);
                } else if i == range.end.line {
                    let end = (range.end.column as usize).min(line.len());
                    result.push_str(&line[..end]);
                } else {
                    result.push_str(line);
                }
                if i < range.end.line {
                    result.push('\n');
                }
            }
            // Leak the string to get a static lifetime - this is a workaround
            // In practice, we'd use a different approach
            Box::leak(result.into_boxed_str())
        }
    }

    /// Get the line text at a given line number
    pub fn line_at(&self, line: u32) -> Option<&str> {
        self.source.lines().nth(line as usize)
    }

    /// Get indentation at a given line
    pub fn indentation_at(&self, line: u32) -> String {
        if let Some(text) = self.line_at(line) {
            let indent_len = text.len() - text.trim_start().len();
            text[..indent_len].to_string()
        } else {
            String::new()
        }
    }
}

/// Main refactoring engine
pub struct RefactorEngine;

impl RefactorEngine {
    /// Get available refactoring actions for a selection
    pub fn get_actions(ctx: &RefactorContext) -> Vec<RefactorAction> {
        let mut actions = Vec::new();

        // Check Extract Variable
        match extract_variable::can_extract(ctx) {
            Ok(true) => {
                actions.push(RefactorAction::available(
                    "extract-variable",
                    "Extract Variable",
                    RefactorKind::ExtractVariable,
                ));
            }
            Ok(false) => {}
            Err(e) => {
                actions.push(RefactorAction::unavailable(
                    "extract-variable",
                    "Extract Variable",
                    RefactorKind::ExtractVariable,
                    e.to_string(),
                ));
            }
        }

        // Check Extract Method
        match extract_method::can_extract(ctx) {
            Ok(true) => {
                actions.push(RefactorAction::available(
                    "extract-method",
                    "Extract Method",
                    RefactorKind::ExtractMethod,
                ));
            }
            Ok(false) => {}
            Err(e) => {
                actions.push(RefactorAction::unavailable(
                    "extract-method",
                    "Extract Method",
                    RefactorKind::ExtractMethod,
                    e.to_string(),
                ));
            }
        }

        actions
    }

    /// Execute a refactoring action
    pub fn execute(
        ctx: &RefactorContext,
        action_id: &str,
        new_name: Option<&str>,
    ) -> Result<RefactorResult, RefactorError> {
        match action_id {
            "extract-variable" => {
                let name = new_name.unwrap_or("extracted");
                extract_variable::extract(ctx, name)
            }
            "extract-method" => {
                let name = new_name.unwrap_or("extractedMethod");
                extract_method::extract(ctx, name)
            }
            "safe-delete" => safe_delete::delete(ctx),
            _ => Err(RefactorError::InvalidSelection(format!(
                "Unknown action: {}",
                action_id
            ))),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_text_edit_insert() {
        let edit = TextEdit::insert(Position::new(0, 5), "hello".to_string());
        assert!(edit.range.is_empty());
        assert_eq!(edit.new_text, "hello");
    }

    #[test]
    fn test_text_edit_delete() {
        let edit = TextEdit::delete(Range::from_coords(0, 0, 0, 5));
        assert!(edit.new_text.is_empty());
    }
}
