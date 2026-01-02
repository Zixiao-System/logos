//! Code analysis utilities for refactoring
//!
//! This module provides utilities for analyzing code structure,
//! identifying expressions, statements, and their relationships.

use logos_core::{Position, Range};
use logos_parser::LanguageId;
use regex::Regex;
use std::collections::HashSet;

/// Represents an expression found in the code
#[derive(Debug, Clone)]
pub struct Expression {
    pub range: Range,
    pub text: String,
    pub kind: ExpressionKind,
}

/// Types of expressions
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExpressionKind {
    Literal,        // Numbers, strings, booleans
    Identifier,     // Variable names
    BinaryOp,       // a + b, x * y
    UnaryOp,        // !x, -y
    Call,           // function()
    MemberAccess,   // obj.prop
    Index,          // arr[i]
    Ternary,        // a ? b : c
    Lambda,         // () => x
    Object,         // { a: 1 }
    Array,          // [1, 2, 3]
    Unknown,
}

/// Represents a statement in the code
#[derive(Debug, Clone)]
pub struct Statement {
    pub range: Range,
    pub text: String,
    pub kind: StatementKind,
}

/// Types of statements
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StatementKind {
    Expression,     // expression;
    Declaration,    // let x = ...
    Assignment,     // x = ...
    Return,         // return ...
    If,             // if (...) ...
    Loop,           // for, while, etc.
    Block,          // { ... }
    Unknown,
}

/// Variable usage information
#[derive(Debug, Clone)]
pub struct VariableUsage {
    pub name: String,
    pub is_read: bool,
    pub is_written: bool,
    pub positions: Vec<Position>,
}

/// Analyze a selection to determine if it's a valid expression
pub fn is_valid_expression(text: &str, language: LanguageId) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }

    // Check for balanced parentheses/brackets
    if !has_balanced_delimiters(trimmed) {
        return false;
    }

    // Check for incomplete statements
    let incomplete_patterns = [
        r"^(if|else|for|while|switch|case|try|catch|finally)\s*$",
        r"^\w+\s*:\s*$", // label without statement
        r"^(let|const|var|function|class|interface|type)\s+\w*$", // incomplete declaration
    ];

    for pattern in incomplete_patterns {
        if Regex::new(pattern).unwrap().is_match(trimmed) {
            return false;
        }
    }

    // Language-specific checks
    match language {
        LanguageId::Python => is_valid_python_expression(trimmed),
        LanguageId::JavaScript | LanguageId::TypeScript => is_valid_js_expression(trimmed),
        LanguageId::Rust => is_valid_rust_expression(trimmed),
        LanguageId::Go => is_valid_go_expression(trimmed),
        _ => !trimmed.ends_with('{') && !trimmed.starts_with('}'),
    }
}

fn is_valid_python_expression(text: &str) -> bool {
    // Python expressions shouldn't be statements
    let statement_starts = ["def ", "class ", "if ", "for ", "while ", "try:", "except:", "with "];
    for start in statement_starts {
        if text.starts_with(start) {
            return false;
        }
    }
    !text.ends_with(':')
}

fn is_valid_js_expression(text: &str) -> bool {
    // JavaScript expressions
    let statement_starts = [
        "function ", "class ", "if ", "for ", "while ", "switch ", "try ", "const ", "let ", "var ",
    ];
    for start in statement_starts {
        if text.starts_with(start) && !text.contains("=>") {
            return false;
        }
    }
    true
}

fn is_valid_rust_expression(text: &str) -> bool {
    // Rust expressions
    let statement_starts = ["fn ", "struct ", "enum ", "impl ", "trait ", "mod ", "use ", "pub "];
    for start in statement_starts {
        if text.starts_with(start) {
            return false;
        }
    }
    !text.ends_with('{')
}

fn is_valid_go_expression(text: &str) -> bool {
    // Go expressions
    let statement_starts = ["func ", "type ", "var ", "const ", "package ", "import "];
    for start in statement_starts {
        if text.starts_with(start) {
            return false;
        }
    }
    !text.ends_with('{')
}

/// Check if a string has balanced delimiters
pub fn has_balanced_delimiters(text: &str) -> bool {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut string_char = '"';
    let mut prev_char = ' ';

    for ch in text.chars() {
        if in_string {
            if ch == string_char && prev_char != '\\' {
                in_string = false;
            }
        } else {
            match ch {
                '"' | '\'' | '`' => {
                    in_string = true;
                    string_char = ch;
                }
                '(' | '[' | '{' => stack.push(ch),
                ')' => {
                    if stack.pop() != Some('(') {
                        return false;
                    }
                }
                ']' => {
                    if stack.pop() != Some('[') {
                        return false;
                    }
                }
                '}' => {
                    if stack.pop() != Some('{') {
                        return false;
                    }
                }
                _ => {}
            }
        }
        prev_char = ch;
    }

    stack.is_empty() && !in_string
}

/// Find all variable references in a code snippet
pub fn find_variable_references(text: &str, language: LanguageId) -> HashSet<String> {
    let mut variables = HashSet::new();

    // Basic identifier pattern (works for most languages)
    let pattern = match language {
        LanguageId::Python => r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b",
        LanguageId::Rust => r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b",
        LanguageId::Go => r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b",
        _ => r"\b([a-zA-Z_$][a-zA-Z0-9_$]*)\b",
    };

    let re = Regex::new(pattern).unwrap();

    // Language keywords to exclude
    let keywords = get_language_keywords(language);

    for cap in re.captures_iter(text) {
        let name = cap.get(1).unwrap().as_str();
        if !keywords.contains(name) && !is_builtin(name, language) {
            variables.insert(name.to_string());
        }
    }

    variables
}

/// Get keywords for a language
fn get_language_keywords(language: LanguageId) -> HashSet<&'static str> {
    match language {
        LanguageId::Python => [
            "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
            "continue", "def", "del", "elif", "else", "except", "finally", "for", "from",
            "global", "if", "import", "in", "is", "lambda", "nonlocal", "not", "or", "pass",
            "raise", "return", "try", "while", "with", "yield",
        ]
        .iter()
        .cloned()
        .collect(),
        LanguageId::JavaScript | LanguageId::TypeScript => [
            "break", "case", "catch", "class", "const", "continue", "debugger", "default",
            "delete", "do", "else", "enum", "export", "extends", "false", "finally", "for",
            "function", "if", "import", "in", "instanceof", "new", "null", "return", "super",
            "switch", "this", "throw", "true", "try", "typeof", "undefined", "var", "void",
            "while", "with", "yield", "let", "static", "async", "await",
        ]
        .iter()
        .cloned()
        .collect(),
        LanguageId::Rust => [
            "as", "async", "await", "break", "const", "continue", "crate", "dyn", "else",
            "enum", "extern", "false", "fn", "for", "if", "impl", "in", "let", "loop", "match",
            "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct",
            "super", "trait", "true", "type", "unsafe", "use", "where", "while",
        ]
        .iter()
        .cloned()
        .collect(),
        LanguageId::Go => [
            "break", "case", "chan", "const", "continue", "default", "defer", "else",
            "fallthrough", "for", "func", "go", "goto", "if", "import", "interface", "map",
            "package", "range", "return", "select", "struct", "switch", "type", "var",
        ]
        .iter()
        .cloned()
        .collect(),
        _ => HashSet::new(),
    }
}

/// Check if a name is a builtin
fn is_builtin(name: &str, language: LanguageId) -> bool {
    match language {
        LanguageId::Python => {
            matches!(
                name,
                "print" | "len" | "range" | "str" | "int" | "float" | "list" | "dict" | "set"
                    | "tuple" | "bool" | "type" | "isinstance" | "hasattr" | "getattr" | "setattr"
                    | "open" | "input" | "map" | "filter" | "zip" | "enumerate" | "sorted"
                    | "reversed" | "sum" | "min" | "max" | "abs" | "round"
            )
        }
        LanguageId::JavaScript | LanguageId::TypeScript => {
            matches!(
                name,
                "console" | "Math" | "JSON" | "Array" | "Object" | "String" | "Number"
                    | "Boolean" | "Date" | "RegExp" | "Error" | "Map" | "Set" | "Promise"
                    | "parseInt" | "parseFloat" | "isNaN" | "isFinite" | "encodeURI"
                    | "decodeURI" | "setTimeout" | "setInterval" | "clearTimeout"
                    | "clearInterval" | "fetch" | "document" | "window"
            )
        }
        LanguageId::Rust => {
            matches!(
                name,
                "println" | "print" | "format" | "vec" | "String" | "Vec" | "Box" | "Rc" | "Arc"
                    | "Option" | "Result" | "Some" | "None" | "Ok" | "Err"
            )
        }
        LanguageId::Go => {
            matches!(
                name,
                "fmt" | "make" | "new" | "len" | "cap" | "append" | "copy" | "delete" | "close"
                    | "panic" | "recover" | "print" | "println" | "error" | "string" | "int"
                    | "float64" | "bool" | "byte" | "rune"
            )
        }
        _ => false,
    }
}

/// Generate a suggested variable name based on the expression
pub fn suggest_variable_name(text: &str, language: LanguageId) -> String {
    let trimmed = text.trim();

    // Check for method calls
    if let Some(captures) = Regex::new(r"\.(\w+)\s*\(").unwrap().captures(trimmed) {
        let method = captures.get(1).unwrap().as_str();
        return to_variable_case(method, language);
    }

    // Check for function calls
    if let Some(captures) = Regex::new(r"^(\w+)\s*\(").unwrap().captures(trimmed) {
        let func = captures.get(1).unwrap().as_str();
        return format!("{}Result", to_variable_case(func, language));
    }

    // Check for property access
    if let Some(captures) = Regex::new(r"\.(\w+)$").unwrap().captures(trimmed) {
        return captures.get(1).unwrap().as_str().to_string();
    }

    // Check for binary operations
    if Regex::new(r"[+\-*/]").unwrap().is_match(trimmed) {
        return default_name(language);
    }

    // Check for comparisons
    if Regex::new(r"[<>=!]=?").unwrap().is_match(trimmed) {
        return "condition".to_string();
    }

    // Default
    default_name(language)
}

fn to_variable_case(name: &str, language: LanguageId) -> String {
    match language {
        LanguageId::Python | LanguageId::Rust => {
            // snake_case
            let mut result = String::new();
            for (i, ch) in name.chars().enumerate() {
                if ch.is_uppercase() && i > 0 {
                    result.push('_');
                }
                result.push(ch.to_ascii_lowercase());
            }
            result
        }
        _ => {
            // camelCase
            let mut result = String::new();
            let mut capitalize_next = false;
            for (i, ch) in name.chars().enumerate() {
                if ch == '_' {
                    capitalize_next = true;
                } else if capitalize_next {
                    result.push(ch.to_ascii_uppercase());
                    capitalize_next = false;
                } else if i == 0 {
                    result.push(ch.to_ascii_lowercase());
                } else {
                    result.push(ch);
                }
            }
            result
        }
    }
}

fn default_name(language: LanguageId) -> String {
    match language {
        LanguageId::Python | LanguageId::Rust => "extracted".to_string(),
        _ => "extracted".to_string(),
    }
}

/// Find the insertion point for a new variable declaration
pub fn find_declaration_insertion_point(
    source: &str,
    expression_range: Range,
    language: LanguageId,
) -> Position {
    let lines: Vec<&str> = source.lines().collect();
    let expr_line = expression_range.start.line as usize;

    if expr_line >= lines.len() {
        return Position::new(0, 0);
    }

    // Find the start of the current statement
    let mut target_line = expr_line;

    // Look for statement boundaries going up
    for i in (0..=expr_line).rev() {
        let line = lines[i].trim();

        // Check for statement starts
        let is_statement_start = match language {
            LanguageId::Python => {
                line.starts_with("if ")
                    || line.starts_with("for ")
                    || line.starts_with("while ")
                    || line.starts_with("def ")
                    || line.starts_with("class ")
                    || line.starts_with("return ")
                    || line.starts_with("with ")
                    || (i > 0 && lines[i - 1].trim().is_empty())
                    || i == 0
            }
            LanguageId::Rust => {
                line.starts_with("let ")
                    || line.starts_with("if ")
                    || line.starts_with("for ")
                    || line.starts_with("while ")
                    || line.starts_with("match ")
                    || line.starts_with("return ")
                    || line.starts_with("fn ")
                    || (i > 0 && lines[i - 1].trim().ends_with(';'))
                    || (i > 0 && lines[i - 1].trim().ends_with('}'))
                    || i == 0
            }
            _ => {
                line.starts_with("const ")
                    || line.starts_with("let ")
                    || line.starts_with("var ")
                    || line.starts_with("if ")
                    || line.starts_with("for ")
                    || line.starts_with("while ")
                    || line.starts_with("return ")
                    || line.starts_with("function ")
                    || (i > 0 && lines[i - 1].trim().ends_with(';'))
                    || (i > 0 && lines[i - 1].trim().ends_with('}'))
                    || i == 0
            }
        };

        if is_statement_start {
            target_line = i;
            break;
        }
    }

    // Get the indentation of the target line
    let indent = lines[target_line].len() - lines[target_line].trim_start().len();

    Position::new(target_line as u32, indent as u32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_balanced_delimiters() {
        assert!(has_balanced_delimiters("(a + b)"));
        assert!(has_balanced_delimiters("foo(bar[0])"));
        assert!(has_balanced_delimiters("{a: 1, b: 2}"));
        assert!(!has_balanced_delimiters("(a + b"));
        assert!(!has_balanced_delimiters("foo(bar[0)"));
    }

    #[test]
    fn test_is_valid_expression() {
        assert!(is_valid_expression("a + b", LanguageId::JavaScript));
        assert!(is_valid_expression("foo()", LanguageId::JavaScript));
        assert!(is_valid_expression("x.y.z", LanguageId::JavaScript));
        assert!(!is_valid_expression("if ", LanguageId::JavaScript));
        assert!(!is_valid_expression("function foo", LanguageId::JavaScript));
    }

    #[test]
    fn test_suggest_variable_name() {
        assert_eq!(
            suggest_variable_name("obj.getName()", LanguageId::JavaScript),
            "getName"
        );
        assert_eq!(
            suggest_variable_name("calculate()", LanguageId::JavaScript),
            "calculateResult"
        );
        assert_eq!(
            suggest_variable_name("user.name", LanguageId::JavaScript),
            "name"
        );
    }
}
