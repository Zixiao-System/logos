//! Extract Variable Refactoring
//!
//! Extract a selected expression into a new variable declaration.
//! The variable is declared before the statement containing the expression,
//! and the expression is replaced with a reference to the variable.

use crate::analysis::{
    find_declaration_insertion_point, is_valid_expression,
    suggest_variable_name,
};
use crate::{RefactorContext, RefactorError, RefactorResult, TextEdit};
use logos_core::{Position, Range};
use logos_parser::LanguageId;
use regex::Regex;

/// Check if the selection can be extracted to a variable
pub fn can_extract(ctx: &RefactorContext) -> Result<bool, RefactorError> {
    let selected = ctx.selected_text().trim();

    // Empty selection
    if selected.is_empty() {
        return Err(RefactorError::NoExpression);
    }

    // Check if it's a valid expression
    if !is_valid_expression(selected, ctx.language) {
        return Err(RefactorError::CannotExtract(
            "Selection is not a valid expression".to_string(),
        ));
    }

    Ok(true)
}

/// Find all occurrences of the same expression in the source
pub fn find_occurrences(ctx: &RefactorContext) -> Vec<Range> {
    let selected = ctx.selected_text();
    let trimmed = selected.trim();

    if trimmed.is_empty() {
        return vec![ctx.selection];
    }

    let mut occurrences = Vec::new();
    let escaped = regex::escape(trimmed);

    // Create a pattern that matches the expression with word boundaries
    let pattern = format!(r"(?m){}", escaped);

    if let Ok(re) = Regex::new(&pattern) {
        let lines: Vec<&str> = ctx.source.lines().collect();
        let mut line_offsets: Vec<usize> = Vec::new();
        let mut offset = 0;

        for line in &lines {
            line_offsets.push(offset);
            offset += line.len() + 1; // +1 for newline
        }

        for m in re.find_iter(ctx.source) {
            let start_offset = m.start();
            let end_offset = m.end();

            // Convert byte offsets to line/column
            let start_pos = offset_to_position(&line_offsets, &lines, start_offset);
            let end_pos = offset_to_position(&line_offsets, &lines, end_offset);

            occurrences.push(Range::new(start_pos, end_pos));
        }
    }

    if occurrences.is_empty() {
        occurrences.push(ctx.selection);
    }

    occurrences
}

fn offset_to_position(line_offsets: &[usize], lines: &[&str], offset: usize) -> Position {
    for (i, &line_offset) in line_offsets.iter().enumerate() {
        let line_end = if i + 1 < line_offsets.len() {
            line_offsets[i + 1] - 1
        } else {
            line_offset + lines.get(i).map(|l| l.len()).unwrap_or(0)
        };

        if offset <= line_end {
            let column = offset - line_offset;
            return Position::new(i as u32, column as u32);
        }
    }

    Position::new(0, 0)
}

/// Extract the selected expression into a variable
pub fn extract(ctx: &RefactorContext, variable_name: &str) -> Result<RefactorResult, RefactorError> {
    can_extract(ctx)?;

    let selected = ctx.selected_text();
    let trimmed = selected.trim();

    // Find where to insert the declaration
    let insert_pos = find_declaration_insertion_point(ctx.source, ctx.selection, ctx.language);

    // Get indentation for the new line
    let indent = ctx.indentation_at(insert_pos.line);

    // Generate the declaration statement
    let declaration = generate_declaration(variable_name, trimmed, ctx.language, &indent);

    // Find all occurrences to replace (currently just the selected one)
    let occurrences = vec![ctx.selection]; // Could use find_occurrences for replace all

    // Create edits (in reverse order so offsets remain valid)
    let mut edits = Vec::new();

    // First, add replacements for all occurrences (in reverse order)
    let mut sorted_occurrences = occurrences.clone();
    sorted_occurrences.sort_by(|a, b| b.start.cmp(&a.start));

    for occurrence in sorted_occurrences {
        edits.push(TextEdit::replace(occurrence, variable_name.to_string()));
    }

    // Then add the declaration at the insertion point
    edits.push(TextEdit::insert(insert_pos, declaration.clone()));

    Ok(RefactorResult::new(
        edits,
        format!("Extract '{}' to variable '{}'", trimmed, variable_name),
    )
    .with_generated_code(declaration))
}

/// Generate a variable declaration statement
fn generate_declaration(name: &str, value: &str, language: LanguageId, indent: &str) -> String {
    match language {
        LanguageId::Python => {
            format!("{}{} = {}\n", indent, name, value)
        }
        LanguageId::JavaScript => {
            format!("{}const {} = {};\n", indent, name, value)
        }
        LanguageId::TypeScript => {
            format!("{}const {} = {};\n", indent, name, value)
        }
        LanguageId::Rust => {
            format!("{}let {} = {};\n", indent, name, value)
        }
        LanguageId::Go => {
            format!("{}{} := {}\n", indent, name, value)
        }
        LanguageId::Java => {
            format!("{}var {} = {};\n", indent, name, value)
        }
        LanguageId::C | LanguageId::Cpp => {
            format!("{}auto {} = {};\n", indent, name, value)
        }
    }
}

/// Extract with suggested variable name
pub fn extract_with_suggestion(ctx: &RefactorContext) -> Result<(String, RefactorResult), RefactorError> {
    let selected = ctx.selected_text();
    let suggested_name = suggest_variable_name(selected, ctx.language);
    let result = extract(ctx, &suggested_name)?;
    Ok((suggested_name, result))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ctx<'a>(source: &'a str, selection: Range, language: LanguageId) -> RefactorContext<'a> {
        RefactorContext::new(source, "test.js", selection, language)
    }

    #[test]
    fn test_can_extract_simple_expression() {
        let source = "let x = a + b;";
        let selection = Range::from_coords(0, 8, 0, 13); // "a + b"
        let ctx = make_ctx(source, selection, LanguageId::JavaScript);

        assert!(can_extract(&ctx).unwrap());
    }

    #[test]
    fn test_cannot_extract_empty() {
        let source = "let x = a + b;";
        let selection = Range::from_coords(0, 8, 0, 8); // empty
        let ctx = make_ctx(source, selection, LanguageId::JavaScript);

        assert!(can_extract(&ctx).is_err());
    }

    #[test]
    fn test_extract_javascript() {
        let source = "console.log(a + b);";
        let selection = Range::from_coords(0, 12, 0, 17); // "a + b"
        let ctx = make_ctx(source, selection, LanguageId::JavaScript);

        let result = extract(&ctx, "sum").unwrap();
        assert!(result.edits.len() >= 2); // declaration + replacement
    }

    #[test]
    fn test_extract_python() {
        let source = "print(x * 2)";
        let selection = Range::from_coords(0, 6, 0, 11); // "x * 2"
        let ctx = make_ctx(source, selection, LanguageId::Python);

        let result = extract(&ctx, "doubled").unwrap();

        // Check that we have the right declaration format
        let declaration = result.generated_code.unwrap();
        assert!(declaration.contains("doubled = x * 2"));
    }

    #[test]
    fn test_generate_declaration() {
        assert_eq!(
            generate_declaration("x", "1 + 2", LanguageId::JavaScript, "  "),
            "  const x = 1 + 2;\n"
        );
        assert_eq!(
            generate_declaration("x", "1 + 2", LanguageId::Python, "    "),
            "    x = 1 + 2\n"
        );
        assert_eq!(
            generate_declaration("x", "1 + 2", LanguageId::Rust, ""),
            "let x = 1 + 2;\n"
        );
        assert_eq!(
            generate_declaration("x", "1 + 2", LanguageId::Go, "\t"),
            "\tx := 1 + 2\n"
        );
    }
}
