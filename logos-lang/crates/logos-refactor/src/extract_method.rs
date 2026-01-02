//! Extract Method Refactoring
//!
//! Extract a selected block of code into a new method/function.
//! This involves:
//! 1. Identifying input variables (used but defined outside selection)
//! 2. Identifying output variables (modified and used after selection)
//! 3. Checking for control flow issues (return, break, continue)
//! 4. Generating the new method with appropriate parameters and return type

use crate::analysis::{find_variable_references, has_balanced_delimiters};
use crate::{RefactorContext, RefactorError, RefactorResult, TextEdit};
use logos_core::{Position, Range};
use logos_parser::LanguageId;
use regex::Regex;
use std::collections::HashSet;

/// Information about variables used in the extracted code
#[derive(Debug, Clone)]
pub struct VariableInfo {
    pub name: String,
    pub is_input: bool,   // Used but defined outside
    pub is_output: bool,  // Modified and used after
    pub is_local: bool,   // Defined and used only within
}

/// Analysis result for extract method
#[derive(Debug)]
pub struct ExtractMethodAnalysis {
    /// Variables that need to be passed as parameters
    pub parameters: Vec<String>,
    /// Variables that need to be returned
    pub return_variables: Vec<String>,
    /// Whether the selection contains return statements
    pub has_return: bool,
    /// Whether the selection contains break statements
    pub has_break: bool,
    /// Whether the selection contains continue statements
    pub has_continue: bool,
    /// Issues that prevent extraction
    pub issues: Vec<String>,
}

impl ExtractMethodAnalysis {
    pub fn can_extract(&self) -> bool {
        self.issues.is_empty() && !self.has_break && !self.has_continue
    }
}

/// Check if the selection can be extracted to a method
pub fn can_extract(ctx: &RefactorContext) -> Result<bool, RefactorError> {
    let selected = ctx.selected_text().trim();

    // Empty selection
    if selected.is_empty() {
        return Err(RefactorError::NoExpression);
    }

    // Check for balanced delimiters
    if !has_balanced_delimiters(selected) {
        return Err(RefactorError::CannotExtract(
            "Selection has unbalanced brackets or quotes".to_string(),
        ));
    }

    // Analyze the selection
    let analysis = analyze(ctx)?;

    if !analysis.can_extract() {
        return Err(RefactorError::ControlFlowIssue(
            analysis.issues.join(", "),
        ));
    }

    Ok(true)
}

/// Analyze the selection for extract method
pub fn analyze(ctx: &RefactorContext) -> Result<ExtractMethodAnalysis, RefactorError> {
    let selected = ctx.selected_text();
    let mut analysis = ExtractMethodAnalysis {
        parameters: Vec::new(),
        return_variables: Vec::new(),
        has_return: false,
        has_break: false,
        has_continue: false,
        issues: Vec::new(),
    };

    // Check for control flow statements
    analysis.has_return = Regex::new(r"\breturn\b").unwrap().is_match(selected);
    analysis.has_break = Regex::new(r"\bbreak\b").unwrap().is_match(selected);
    analysis.has_continue = Regex::new(r"\bcontinue\b").unwrap().is_match(selected);

    if analysis.has_break {
        analysis.issues.push("Selection contains 'break' statement".to_string());
    }
    if analysis.has_continue {
        analysis.issues.push("Selection contains 'continue' statement".to_string());
    }

    // Find variables used in selection
    let selected_vars = find_variable_references(selected, ctx.language);

    // Find variables defined before selection
    let before_text = get_text_before(ctx.source, ctx.selection);
    let before_vars = find_variable_references(&before_text, ctx.language);

    // Find variables used after selection
    let after_text = get_text_after(ctx.source, ctx.selection);
    let after_vars = find_variable_references(&after_text, ctx.language);

    // Determine parameters (used in selection but defined before)
    for var in &selected_vars {
        if before_vars.contains(var) {
            analysis.parameters.push(var.clone());
        }
    }

    // Determine return variables (modified in selection and used after)
    let modified_vars = find_modified_variables(selected, ctx.language);
    for var in modified_vars {
        if after_vars.contains(&var) && !analysis.parameters.contains(&var) {
            analysis.return_variables.push(var);
        }
    }

    Ok(analysis)
}

fn get_text_before(source: &str, selection: Range) -> String {
    let lines: Vec<&str> = source.lines().collect();
    let mut result = String::new();

    for (i, line) in lines.iter().enumerate() {
        if i < selection.start.line as usize {
            result.push_str(line);
            result.push('\n');
        } else if i == selection.start.line as usize {
            let end = (selection.start.column as usize).min(line.len());
            result.push_str(&line[..end]);
            break;
        }
    }

    result
}

fn get_text_after(source: &str, selection: Range) -> String {
    let lines: Vec<&str> = source.lines().collect();
    let mut result = String::new();

    for (i, line) in lines.iter().enumerate() {
        if i > selection.end.line as usize {
            result.push_str(line);
            result.push('\n');
        } else if i == selection.end.line as usize {
            let start = (selection.end.column as usize).min(line.len());
            result.push_str(&line[start..]);
            result.push('\n');
        }
    }

    result
}

/// Find variables that are modified (assigned) in the code
fn find_modified_variables(text: &str, language: LanguageId) -> HashSet<String> {
    let mut modified = HashSet::new();

    // Pattern for assignments: identifier = something (but not ==, ===, etc.)
    let pattern = match language {
        LanguageId::Python => r"(\w+)\s*(?<![=!<>])=(?![=])",
        LanguageId::Go => r"(\w+)\s*:?=",
        _ => r"(\w+)\s*(?<![=!<>])=(?![=])",
    };

    if let Ok(re) = Regex::new(pattern) {
        for cap in re.captures_iter(text) {
            if let Some(name) = cap.get(1) {
                modified.insert(name.as_str().to_string());
            }
        }
    }

    // Also check for increment/decrement
    let inc_pattern = r"(\w+)\s*(?:\+\+|--)|(?:\+\+|--)\s*(\w+)";
    if let Ok(re) = Regex::new(inc_pattern) {
        for cap in re.captures_iter(text) {
            if let Some(name) = cap.get(1).or_else(|| cap.get(2)) {
                modified.insert(name.as_str().to_string());
            }
        }
    }

    modified
}

/// Extract the selection into a new method
pub fn extract(ctx: &RefactorContext, method_name: &str) -> Result<RefactorResult, RefactorError> {
    can_extract(ctx)?;

    let analysis = analyze(ctx)?;
    let selected = ctx.selected_text();
    let indent = ctx.indentation_at(ctx.selection.start.line);

    // Generate the new method
    let method_code = generate_method(
        method_name,
        selected,
        &analysis.parameters,
        &analysis.return_variables,
        analysis.has_return,
        ctx.language,
        &indent,
    );

    // Generate the call to the new method
    let call_code = generate_call(
        method_name,
        &analysis.parameters,
        &analysis.return_variables,
        ctx.language,
        &indent,
    );

    // Find insertion point for the new method (after current function or at end of file)
    let method_insert_pos = find_method_insertion_point(ctx);

    // Create edits
    let mut edits = Vec::new();

    // Replace selection with call
    edits.push(TextEdit::replace(ctx.selection, call_code));

    // Insert new method
    edits.push(TextEdit::insert(method_insert_pos, method_code.clone()));

    Ok(RefactorResult::new(
        edits,
        format!("Extract to method '{}'", method_name),
    )
    .with_generated_code(method_code))
}

/// Generate the new method code
fn generate_method(
    name: &str,
    body: &str,
    params: &[String],
    return_vars: &[String],
    has_explicit_return: bool,
    language: LanguageId,
    base_indent: &str,
) -> String {
    let param_list = params.join(", ");
    let body_indent = format!("{}    ", base_indent);
    let indented_body = indent_code(body.trim(), &body_indent);

    match language {
        LanguageId::Python => {
            let mut code = format!("\n{}def {}({}):\n", base_indent, name, param_list);
            code.push_str(&indented_body);
            if !return_vars.is_empty() && !has_explicit_return {
                code.push_str(&format!("\n{}return {}", body_indent, return_vars.join(", ")));
            }
            code.push('\n');
            code
        }
        LanguageId::JavaScript => {
            let mut code = format!("\n{}function {}({}) {{\n", base_indent, name, param_list);
            code.push_str(&indented_body);
            if !return_vars.is_empty() && !has_explicit_return {
                if return_vars.len() == 1 {
                    code.push_str(&format!("\n{}return {};", body_indent, return_vars[0]));
                } else {
                    code.push_str(&format!(
                        "\n{}return {{ {} }};",
                        body_indent,
                        return_vars.join(", ")
                    ));
                }
            }
            code.push_str(&format!("\n{}}}\n", base_indent));
            code
        }
        LanguageId::TypeScript => {
            let mut code = format!("\n{}function {}({}) {{\n", base_indent, name, param_list);
            code.push_str(&indented_body);
            if !return_vars.is_empty() && !has_explicit_return {
                if return_vars.len() == 1 {
                    code.push_str(&format!("\n{}return {};", body_indent, return_vars[0]));
                } else {
                    code.push_str(&format!(
                        "\n{}return {{ {} }};",
                        body_indent,
                        return_vars.join(", ")
                    ));
                }
            }
            code.push_str(&format!("\n{}}}\n", base_indent));
            code
        }
        LanguageId::Rust => {
            let params_typed: Vec<String> = params.iter().map(|p| format!("{}: _", p)).collect();
            let param_list = params_typed.join(", ");
            let mut code = format!("\n{}fn {}({}) {{\n", base_indent, name, param_list);
            code.push_str(&indented_body);
            if !return_vars.is_empty() && !has_explicit_return {
                if return_vars.len() == 1 {
                    code.push_str(&format!("\n{}{}", body_indent, return_vars[0]));
                } else {
                    code.push_str(&format!(
                        "\n{}({})",
                        body_indent,
                        return_vars.join(", ")
                    ));
                }
            }
            code.push_str(&format!("\n{}}}\n", base_indent));
            code
        }
        LanguageId::Go => {
            let mut code = format!("\n{}func {}({}) ", base_indent, name, param_list);
            if !return_vars.is_empty() {
                if return_vars.len() == 1 {
                    code.push_str("_ ");
                } else {
                    code.push_str(&format!("({}) ", vec!["_"; return_vars.len()].join(", ")));
                }
            }
            code.push_str("{\n");
            code.push_str(&indented_body);
            if !return_vars.is_empty() && !has_explicit_return {
                code.push_str(&format!("\n{}return {}", body_indent, return_vars.join(", ")));
            }
            code.push_str(&format!("\n{}}}\n", base_indent));
            code
        }
        LanguageId::Java => {
            let mut code = format!(
                "\n{}private void {}({}) {{\n",
                base_indent, name, param_list
            );
            code.push_str(&indented_body);
            code.push_str(&format!("\n{}}}\n", base_indent));
            code
        }
        _ => {
            format!(
                "\n{}// Extracted method\n{}function {}({}) {{\n{}\n{}}}\n",
                base_indent, base_indent, name, param_list, indented_body, base_indent
            )
        }
    }
}

/// Generate the call to the extracted method
fn generate_call(
    name: &str,
    params: &[String],
    return_vars: &[String],
    language: LanguageId,
    _indent: &str,
) -> String {
    let param_list = params.join(", ");
    let call = format!("{}({})", name, param_list);

    if return_vars.is_empty() {
        match language {
            LanguageId::Python => call,
            LanguageId::Go => call,
            _ => format!("{};", call),
        }
    } else {
        match language {
            LanguageId::Python => {
                if return_vars.len() == 1 {
                    format!("{} = {}", return_vars[0], call)
                } else {
                    format!("{} = {}", return_vars.join(", "), call)
                }
            }
            LanguageId::Go => {
                format!("{} = {}", return_vars.join(", "), call)
            }
            LanguageId::Rust => {
                if return_vars.len() == 1 {
                    format!("let {} = {};", return_vars[0], call)
                } else {
                    format!("let ({}) = {};", return_vars.join(", "), call)
                }
            }
            _ => {
                if return_vars.len() == 1 {
                    format!("const {} = {};", return_vars[0], call)
                } else {
                    format!("const {{ {} }} = {};", return_vars.join(", "), call)
                }
            }
        }
    }
}

/// Indent code with the given prefix
fn indent_code(code: &str, indent: &str) -> String {
    code.lines()
        .map(|line| {
            if line.trim().is_empty() {
                String::new()
            } else {
                format!("{}{}", indent, line.trim())
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// Find the insertion point for the new method
fn find_method_insertion_point(ctx: &RefactorContext) -> Position {
    let lines: Vec<&str> = ctx.source.lines().collect();
    let current_line = ctx.selection.start.line as usize;

    // Find the end of the current function/method
    let mut brace_depth = 0;
    let mut in_function = false;

    for (i, line) in lines.iter().enumerate().skip(current_line) {
        let trimmed = line.trim();

        // Detect function start
        if !in_function
            && (trimmed.starts_with("function ")
                || trimmed.starts_with("fn ")
                || trimmed.starts_with("def ")
                || trimmed.starts_with("func "))
        {
            in_function = true;
        }

        // Track braces
        for ch in line.chars() {
            match ch {
                '{' => brace_depth += 1,
                '}' => {
                    brace_depth -= 1;
                    if brace_depth == 0 && in_function {
                        // Found the end of the function
                        return Position::new(i as u32 + 1, 0);
                    }
                }
                _ => {}
            }
        }

        // For Python, look for dedent
        if ctx.language == LanguageId::Python && in_function {
            if i > current_line && !trimmed.is_empty() {
                let indent_level = line.len() - line.trim_start().len();
                let base_indent = lines[current_line].len() - lines[current_line].trim_start().len();
                if indent_level <= base_indent {
                    return Position::new(i as u32, 0);
                }
            }
        }
    }

    // Default: end of file
    Position::new(lines.len() as u32, 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_ctx<'a>(source: &'a str, selection: Range, language: LanguageId) -> RefactorContext<'a> {
        RefactorContext::new(source, "test.js", selection, language)
    }

    #[test]
    fn test_find_modified_variables() {
        let code = "x = 1; y += 2; z++;";
        let modified = find_modified_variables(code, LanguageId::JavaScript);
        assert!(modified.contains("x"));
        assert!(modified.contains("y"));
        assert!(modified.contains("z"));
    }

    #[test]
    fn test_analyze_parameters() {
        let source = "let x = 1;\nlet y = x + 2;\nconsole.log(y);";
        let selection = Range::from_coords(1, 0, 1, 14); // "let y = x + 2;"
        let ctx = make_ctx(source, selection, LanguageId::JavaScript);

        let analysis = analyze(&ctx).unwrap();
        assert!(analysis.parameters.contains(&"x".to_string()));
    }

    #[test]
    fn test_cannot_extract_with_break() {
        let source = "for(;;) { break; }";
        let selection = Range::from_coords(0, 10, 0, 16); // "break;"
        let ctx = make_ctx(source, selection, LanguageId::JavaScript);

        assert!(can_extract(&ctx).is_err());
    }

    #[test]
    fn test_generate_method_javascript() {
        let code = generate_method(
            "extracted",
            "console.log(x);",
            &["x".to_string()],
            &[],
            false,
            LanguageId::JavaScript,
            "",
        );
        assert!(code.contains("function extracted(x)"));
        assert!(code.contains("console.log(x)"));
    }
}
