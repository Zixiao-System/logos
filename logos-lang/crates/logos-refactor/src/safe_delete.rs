//! Safe Delete Refactoring
//!
//! Safely delete a symbol (variable, function, class, etc.) only if it's not used elsewhere.
//! If the symbol is still in use, return the usage locations to inform the user.

use crate::{RefactorContext, RefactorError, RefactorResult, TextEdit};
use logos_core::{Location, Range};
use regex::Regex;

/// Result of safe delete analysis
#[derive(Debug)]
pub struct SafeDeleteAnalysis {
    /// Whether the symbol can be safely deleted
    pub can_delete: bool,
    /// Symbol being analyzed
    pub symbol_name: String,
    /// Symbol range
    pub symbol_range: Range,
    /// Locations where the symbol is used
    pub usages: Vec<Location>,
    /// Warnings if any
    pub warnings: Vec<String>,
}

impl SafeDeleteAnalysis {
    pub fn safe(symbol_name: String, symbol_range: Range) -> Self {
        Self {
            can_delete: true,
            symbol_name,
            symbol_range,
            usages: Vec::new(),
            warnings: Vec::new(),
        }
    }

    pub fn unsafe_with_usages(symbol_name: String, symbol_range: Range, usages: Vec<Location>) -> Self {
        Self {
            can_delete: false,
            symbol_name,
            symbol_range,
            usages,
            warnings: Vec::new(),
        }
    }

    pub fn with_warning(mut self, warning: String) -> Self {
        self.warnings.push(warning);
        self
    }
}

/// Analyze if a symbol at the given position can be safely deleted
pub fn analyze(ctx: &RefactorContext) -> Result<SafeDeleteAnalysis, RefactorError> {
    // For now, we use a simpler approach that doesn't require full parsing
    // We look at the selection and find usages of the symbol by name

    let selected_text = ctx.selected_text().trim();

    if selected_text.is_empty() {
        return Err(RefactorError::InvalidSelection(
            "No symbol selected".to_string(),
        ));
    }

    // Extract the symbol name (first identifier in selection)
    let symbol_name = extract_symbol_name(selected_text);

    if symbol_name.is_empty() {
        return Err(RefactorError::InvalidSelection(
            "Could not identify symbol name".to_string(),
        ));
    }

    // Find all usages of this symbol
    let usages = find_usages(ctx, &symbol_name);

    // If there's only one usage (the definition itself), it's safe to delete
    let can_delete = usages.len() <= 1;

    if can_delete {
        Ok(SafeDeleteAnalysis::safe(symbol_name, ctx.selection))
    } else {
        // Filter out the definition itself from usages
        let other_usages: Vec<Location> = usages
            .into_iter()
            .filter(|loc| !loc.range.overlaps(&ctx.selection))
            .collect();

        if other_usages.is_empty() {
            Ok(SafeDeleteAnalysis::safe(symbol_name, ctx.selection))
        } else {
            Ok(SafeDeleteAnalysis::unsafe_with_usages(
                symbol_name,
                ctx.selection,
                other_usages,
            ))
        }
    }
}

/// Extract the symbol name from selected text
fn extract_symbol_name(text: &str) -> String {
    // Match the first identifier
    let pattern = r"^(?:(?:let|const|var|function|class|def|fn|func|type)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)";

    if let Ok(re) = Regex::new(pattern) {
        if let Some(caps) = re.captures(text) {
            if let Some(name) = caps.get(1) {
                return name.as_str().to_string();
            }
        }
    }

    // Fallback: just return the first word-like sequence
    text.split(|c: char| !c.is_alphanumeric() && c != '_')
        .next()
        .unwrap_or("")
        .to_string()
}

/// Find all usages of a symbol by name
fn find_usages(ctx: &RefactorContext, name: &str) -> Vec<Location> {
    let mut usages = Vec::new();
    let pattern = format!(r"\b{}\b", regex::escape(name));

    if let Ok(re) = Regex::new(&pattern) {
        let lines: Vec<&str> = ctx.source.lines().collect();

        for (line_num, line) in lines.iter().enumerate() {
            for m in re.find_iter(line) {
                let range = Range::from_coords(
                    line_num as u32,
                    m.start() as u32,
                    line_num as u32,
                    m.end() as u32,
                );
                usages.push(Location::new(ctx.uri.to_string(), range));
            }
        }
    }

    usages
}

/// Check if the selection can be safely deleted
pub fn can_delete(ctx: &RefactorContext) -> Result<bool, RefactorError> {
    let analysis = analyze(ctx)?;
    Ok(analysis.can_delete)
}

/// Delete the symbol at the cursor position
pub fn delete(ctx: &RefactorContext) -> Result<RefactorResult, RefactorError> {
    let analysis = analyze(ctx)?;

    if !analysis.can_delete {
        return Err(RefactorError::SymbolInUse(analysis.usages));
    }

    // Find the full range to delete (including the entire declaration line)
    let delete_range = find_deletion_range(ctx, &analysis);

    let edits = vec![TextEdit::delete(delete_range)];

    Ok(RefactorResult::new(
        edits,
        format!("Delete unused symbol '{}'", analysis.symbol_name),
    ))
}

/// Find the range to delete for a symbol
fn find_deletion_range(ctx: &RefactorContext, analysis: &SafeDeleteAnalysis) -> Range {
    let lines: Vec<&str> = ctx.source.lines().collect();
    let symbol_line = analysis.symbol_range.start.line as usize;

    if symbol_line >= lines.len() {
        return analysis.symbol_range;
    }

    let line = lines[symbol_line];

    // Check if this is a single-line declaration
    let is_single_line = analysis.symbol_range.start.line == analysis.symbol_range.end.line;

    if is_single_line {
        // Check if the entire line is just this declaration
        let trimmed = line.trim();
        let symbol_text = ctx.text_in_range(analysis.symbol_range);

        if trimmed == symbol_text
            || trimmed.ends_with(';')
                && trimmed[..trimmed.len() - 1].trim() == symbol_text
        {
            // Delete the entire line including newline
            if symbol_line + 1 < lines.len() {
                Range::from_coords(
                    symbol_line as u32,
                    0,
                    symbol_line as u32 + 1,
                    0,
                )
            } else {
                Range::from_coords(
                    symbol_line as u32,
                    0,
                    symbol_line as u32,
                    line.len() as u32,
                )
            }
        } else {
            // Just delete the symbol portion
            analysis.symbol_range
        }
    } else {
        // Multi-line: delete from start to end including trailing newline
        let end_line = analysis.symbol_range.end.line as usize;
        if end_line + 1 < lines.len() {
            Range::from_coords(
                symbol_line as u32,
                0,
                end_line as u32 + 1,
                0,
            )
        } else {
            analysis.symbol_range
        }
    }
}

/// Get the delete confirmation message
pub fn get_confirmation_message(ctx: &RefactorContext) -> Result<String, RefactorError> {
    let analysis = analyze(ctx)?;

    if analysis.can_delete {
        Ok(format!(
            "Are you sure you want to delete '{}'?",
            analysis.symbol_name
        ))
    } else {
        let usage_count = analysis.usages.len();
        Ok(format!(
            "Symbol '{}' is still used in {} location(s). Delete anyway?",
            analysis.symbol_name, usage_count
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use logos_parser::LanguageId;

    fn make_ctx<'a>(source: &'a str, selection: Range, language: LanguageId) -> RefactorContext<'a> {
        RefactorContext::new(source, "test.js", selection, language)
    }

    #[test]
    fn test_find_usages() {
        let source = "let foo = 1;\nconsole.log(foo);\nlet bar = foo + 1;";
        let ctx = make_ctx(
            source,
            Range::from_coords(0, 4, 0, 7),
            LanguageId::JavaScript,
        );

        let usages = find_usages(&ctx, "foo");
        assert_eq!(usages.len(), 3); // declaration + 2 uses
    }

    #[test]
    fn test_analyze_unused() {
        let source = "function unused() {}\nfunction used() {}\nused();";
        let ctx = make_ctx(
            source,
            Range::from_coords(0, 9, 0, 15), // "unused"
            LanguageId::JavaScript,
        );

        // Note: This test depends on the UnusedDetector implementation
        let result = analyze(&ctx);
        assert!(result.is_ok());
    }
}
