//! C++ Language Adapter
//!
//! Pragmatic indexer for C++:
//! - Symbols: function definitions, class/struct, namespaces (best-effort)
//! - Imports: #include directives
//! - Calls: call_expression nodes (best-effort)

use crate::adapter::{AnalysisResult, CallInfo, ImportInfo, ImportItem, LanguageAdapter, SymbolBuilder, make_location};
use crate::symbol_table::Visibility;
use logos_core::{Position, Range, SymbolKind};
use std::path::Path;
use tree_sitter::{Node, Parser, Tree};

pub struct CppAdapter {
    parser: std::sync::Mutex<Parser>,
}

impl CppAdapter {
    pub fn new() -> Result<Self, String> {
        let mut parser = Parser::new();
        parser
            .set_language(&tree_sitter_cpp::LANGUAGE.into())
            .map_err(|e| format!("Failed to set C++ language: {}", e))?;
        Ok(Self {
            parser: std::sync::Mutex::new(parser),
        })
    }

    fn parse(&self, source: &str) -> Option<Tree> {
        let mut parser = self.parser.lock().ok()?;
        parser.parse(source, None)
    }
}

impl LanguageAdapter for CppAdapter {
    fn language_id(&self) -> &str {
        "cpp"
    }

    fn file_extensions(&self) -> &[&str] {
        &["cpp", "cc", "cxx", "hpp", "hxx", "hh", "h"]
    }

    fn analyze(&self, uri: &str, source: &str) -> AnalysisResult {
        let tree = match self.parse(source) {
            Some(t) => t,
            None => return AnalysisResult::default(),
        };

        let mut ctx = AnalysisContext {
            uri: uri.to_string(),
            source,
            result: AnalysisResult::default(),
            scope_stack: Vec::new(),
        };

        analyze_node(&tree.root_node(), &mut ctx);
        ctx.result
    }

    fn resolve_import(&self, from_file: &Path, import_path: &str) -> Option<std::path::PathBuf> {
        // For `#include "x.h"` try relative to file dir
        if !(import_path.starts_with('"') && import_path.ends_with('"')) {
            return None;
        }
        let inner = import_path.trim_matches('"');
        let parent = from_file.parent()?;
        let resolved = parent.join(inner);
        if resolved.exists() {
            return Some(resolved);
        }
        None
    }
}

struct AnalysisContext<'a> {
    uri: String,
    source: &'a str,
    result: AnalysisResult,
    scope_stack: Vec<ScopeInfo>,
}

struct ScopeInfo {
    symbol_id: crate::symbol_table::SymbolId,
    name: String,
}

impl<'a> AnalysisContext<'a> {
    fn get_text(&self, node: &Node) -> String {
        self.source[node.byte_range()].to_string()
    }

    fn current_scope(&self) -> Option<&ScopeInfo> {
        self.scope_stack.last()
    }

    fn qualified_name(&self, name: &str) -> String {
        if self.scope_stack.is_empty() {
            name.to_string()
        } else {
            let prefix: Vec<_> = self.scope_stack.iter().map(|s| s.name.as_str()).collect();
            format!("{}::{}", prefix.join("::"), name)
        }
    }
}

fn analyze_node(node: &Node, ctx: &mut AnalysisContext) {
    match node.kind() {
        "preproc_include" => analyze_include(node, ctx),
        "function_definition" => analyze_function(node, ctx),
        "class_specifier" | "struct_specifier" => analyze_class_or_struct(node, ctx),
        "class_declaration" | "struct_declaration" => analyze_class_decl(node, ctx),
        // Some C++ constructs wrap class/struct in a type_definition/declaration
        "type_definition" | "declaration" => {
            for i in 0..node.named_child_count() {
                if let Some(ch) = node.named_child(i) {
                    if ch.kind() == "class_specifier" || ch.kind() == "struct_specifier" {
                        analyze_class_or_struct(&ch, ctx);
                    }
                    if ch.kind() == "class_declaration" || ch.kind() == "struct_declaration" {
                        analyze_class_decl(&ch, ctx);
                    }
                }
            }
        }
        "namespace_definition" => analyze_namespace(node, ctx),
        "call_expression" => analyze_call(node, ctx),
        _ => {
            for i in 0..node.named_child_count() {
                if let Some(child) = node.named_child(i) {
                    analyze_node(&child, ctx);
                }
            }
        }
    }
}

fn analyze_class_decl(node: &Node, ctx: &mut AnalysisContext) {
    // class_declaration/struct_declaration 是前向声明，通常没有 body
    let keyword = if node.kind() == "struct_declaration" { "struct" } else { "class" };
    let name_node = node
        .child_by_field_name("name")
        .or_else(|| find_first_named_of_kinds(*node, &["type_identifier", "identifier"]));

    let name = match name_node {
        Some(n) => ctx.get_text(&n),
        None => extract_decl_name(&ctx.get_text(node), keyword).unwrap_or_default(),
    };

    if name.is_empty() {
        return;
    }

    let kind = if node.kind() == "struct_declaration" {
        SymbolKind::Struct
    } else {
        SymbolKind::Class
    };

    let name_range = name_node.map(|n| node_to_range(&n)).unwrap_or_else(|| node_to_range(node));
    let location = make_location(&ctx.uri, node_to_range(node), name_range);

    let qualified = ctx.qualified_name(&name);
    ctx.result.symbols.push(
        SymbolBuilder::new(name, kind, location)
            .exported(true)
            .visibility(Visibility::Public)
            .qualified_name(qualified)
            .build(),
    );
}

fn analyze_include(node: &Node, ctx: &mut AnalysisContext) {
    let text = ctx.get_text(node);
    if let Some(idx) = text.find("#include") {
        let rest = text[idx + "#include".len()..].trim();
        if !rest.is_empty() {
            ctx.result.imports.push(ImportInfo {
                module_path: rest.to_string(),
                items: vec![ImportItem {
                    name: rest.to_string(),
                    alias: None,
                    is_type: false,
                }],
                is_type_only: false,
                location: node_to_range(node),
            });
        }
    }
}

fn analyze_function(node: &Node, ctx: &mut AnalysisContext) {
    // function_definition 在全局作用域：function_declarator 包含 identifier
    let name_node = node
        .child_by_field_name("declarator")
        .and_then(find_identifier_in_declarator);

    if let Some(name_node) = name_node {
        let name = ctx.get_text(&name_node);
        let location = make_location(&ctx.uri, node_to_range(node), node_to_range(&name_node));

        let symbol = SymbolBuilder::new(name.clone(), SymbolKind::Function, location)
            .exported(true)
            .visibility(Visibility::Public)
            .qualified_name(ctx.qualified_name(&name))
            .build();

        let symbol_id = symbol.id;
        ctx.result.symbols.push(symbol);

        // 分析函数体中的调用
        if let Some(body) = node.child_by_field_name("body") {
            ctx.scope_stack.push(ScopeInfo {
                symbol_id,
                name,
            });
            analyze_node(&body, ctx);
            ctx.scope_stack.pop();
        }
    }
}

fn analyze_class_or_struct(node: &Node, ctx: &mut AnalysisContext) {
    // 根据实际 AST：class_specifier 的直接子节点 type_identifier 是类名
    let name_node = node
        .child_by_field_name("name")
        .or_else(|| find_first_named_of_kinds(*node, &["type_identifier", "identifier"]));

    let name = match name_node {
        Some(n) => ctx.get_text(&n),
        None => {
            // Fallback: best-effort parse from raw text
            extract_decl_name(&ctx.get_text(node), if node.kind() == "struct_specifier" { "struct" } else { "class" })
                .unwrap_or_default()
        }
    };

    if name.is_empty() {
        return;
    }

    let kind = if node.kind() == "struct_specifier" {
        SymbolKind::Struct
    } else {
        SymbolKind::Class
    };

    let name_range = name_node.map(|n| node_to_range(&n)).unwrap_or_else(|| node_to_range(node));
    let location = make_location(&ctx.uri, node_to_range(node), name_range);

    let qualified = ctx.qualified_name(&name);
    let symbol = SymbolBuilder::new(name.clone(), kind, location)
        .exported(true)
        .visibility(Visibility::Public)
        .qualified_name(qualified)
        .build();

    let symbol_id = symbol.id;
    ctx.result.symbols.push(symbol);

    // 分析类体：提取字段和方法
    if let Some(body) = node.child_by_field_name("body") {
        ctx.scope_stack.push(ScopeInfo {
            symbol_id,
            name: name.clone(),
        });

        // 根据 class/struct 决定默认可见性
        let default_visibility = if node.kind() == "struct_specifier" {
            Visibility::Public // struct 默认 public
        } else {
            Visibility::Private // class 默认 private
        };

        // field_declaration_list 包含所有成员
        analyze_class_body(&body, ctx, default_visibility);

        ctx.scope_stack.pop();
    }
}

fn analyze_class_body(node: &Node, ctx: &mut AnalysisContext, default_visibility: Visibility) {
    // 根据 AST：class_specifier 的 body 字段是 field_declaration_list
    // field_declaration_list 包含 access_specifier, field_declaration, function_definition
    if node.kind() == "field_declaration_list" {
        // 如果 body 本身就是 field_declaration_list，直接分析
        analyze_field_declaration_list(node, ctx, default_visibility);
    } else {
        // 否则查找 field_declaration_list 子节点
        for i in 0..node.named_child_count() {
            if let Some(child) = node.named_child(i) {
                match child.kind() {
                    "field_declaration_list" => {
                        analyze_field_declaration_list(&child, ctx, default_visibility);
                    }
                    "field_declaration" => {
                        analyze_field_with_visibility(&child, ctx, default_visibility);
                    }
                    "function_definition" => {
                        analyze_method_with_visibility(&child, ctx, default_visibility);
                    }
                    _ => {
                        analyze_node(&child, ctx);
                    }
                }
            }
        }
    }
}

fn analyze_field_declaration_list(node: &Node, ctx: &mut AnalysisContext, default_visibility: Visibility) {
    let mut current_visibility = default_visibility; // 使用传入的默认可见性

    // 遍历所有子节点，按顺序处理
    for i in 0..node.named_child_count() {
        if let Some(child) = node.named_child(i) {
            match child.kind() {
                "access_specifier" => {
                    // 更新当前可见性
                    // access_specifier 节点通常包含 "public", "private", "protected" 关键字（可能带冒号）
                    let text = ctx.get_text(&child).trim().to_lowercase();
                    // 移除可能的冒号
                    let text = text.trim_end_matches(':').trim();
                    current_visibility = if text == "public" {
                        Visibility::Public
                    } else if text == "protected" {
                        Visibility::Protected
                    } else {
                        Visibility::Private
                    };
                }
                "field_declaration" => {
                    analyze_field_with_visibility(&child, ctx, current_visibility);
                }
                "function_definition" => {
                    analyze_method_with_visibility(&child, ctx, current_visibility);
                }
                _ => {
                    // 对于其他节点，递归分析（可能包含嵌套结构）
                    analyze_node(&child, ctx);
                }
            }
        }
    }
}

fn analyze_field(node: &Node, ctx: &mut AnalysisContext) {
    analyze_field_with_visibility(node, ctx, Visibility::Private);
}

fn analyze_field_with_visibility(node: &Node, ctx: &mut AnalysisContext, visibility: Visibility) {
    // field_declaration 结构：type + declarator (field_identifier)
    // 查找 field_identifier 或 identifier
    let name_node = find_first_named_of_kinds(*node, &["field_identifier", "identifier"]);

    if let Some(name_node) = name_node {
        let name = ctx.get_text(&name_node);
        let location = make_location(&ctx.uri, node_to_range(node), node_to_range(&name_node));

        ctx.result.symbols.push(
            SymbolBuilder::new(name.clone(), SymbolKind::Field, location)
                .parent(ctx.current_scope().map(|s| s.symbol_id).unwrap_or(crate::symbol_table::SymbolId(0)))
                .visibility(visibility)
                .exported(visibility == Visibility::Public)
                .qualified_name(ctx.qualified_name(&name))
                .build(),
        );
    }
}

fn analyze_method(node: &Node, ctx: &mut AnalysisContext) {
    analyze_method_with_visibility(node, ctx, Visibility::Private);
}

fn analyze_method_with_visibility(node: &Node, ctx: &mut AnalysisContext, visibility: Visibility) {
    // function_definition 在类中：function_declarator 包含 field_identifier 或 identifier
    let name_node = node
        .child_by_field_name("declarator")
        .and_then(|d| find_first_named_of_kinds(d, &["field_identifier", "identifier"]));

    if let Some(name_node) = name_node {
        let name = ctx.get_text(&name_node);
        let location = make_location(&ctx.uri, node_to_range(node), node_to_range(&name_node));

        let symbol = SymbolBuilder::new(name.clone(), SymbolKind::Method, location)
            .parent(ctx.current_scope().map(|s| s.symbol_id).unwrap_or(crate::symbol_table::SymbolId(0)))
            .visibility(visibility)
            .exported(visibility == Visibility::Public)
            .qualified_name(ctx.qualified_name(&name))
            .build();

        let symbol_id = symbol.id;
        ctx.result.symbols.push(symbol);

        // 分析方法体中的调用
        if let Some(body) = node.child_by_field_name("body") {
            ctx.scope_stack.push(ScopeInfo {
                symbol_id,
                name,
            });
            analyze_node(&body, ctx);
            ctx.scope_stack.pop();
        }
    }
}

fn analyze_namespace(node: &Node, ctx: &mut AnalysisContext) {
    // namespace_definition 的直接子节点 namespace_identifier 是命名空间名
    let name_node = node
        .child_by_field_name("name")
        .or_else(|| find_first_named_of_kinds(*node, &["namespace_identifier", "identifier"]));

    if let Some(name_node) = name_node {
        let name = ctx.get_text(&name_node);
        let location = make_location(&ctx.uri, node_to_range(node), node_to_range(&name_node));

        let symbol = SymbolBuilder::new(name.clone(), SymbolKind::Namespace, location)
            .exported(true)
            .visibility(Visibility::Public)
            .qualified_name(ctx.qualified_name(&name))
            .build();

        let symbol_id = symbol.id;
        ctx.result.symbols.push(symbol);

        // 分析命名空间体
        if let Some(body) = node.child_by_field_name("body") {
            ctx.scope_stack.push(ScopeInfo {
                symbol_id,
                name,
            });
            analyze_node(&body, ctx);
            ctx.scope_stack.pop();
        }
    }
}

fn find_first_named_of_kinds<'a>(node: Node<'a>, kinds: &[&str]) -> Option<Node<'a>> {
    // 先检查直接子节点
    for i in 0..node.named_child_count() {
        if let Some(ch) = node.named_child(i) {
            if kinds.contains(&ch.kind()) {
                return Some(ch);
            }
        }
    }
    // 递归查找
    for i in 0..node.named_child_count() {
        if let Some(ch) = node.named_child(i) {
            if let Some(found) = find_first_named_of_kinds(ch, kinds) {
                return Some(found);
            }
        }
    }
    None
}

fn extract_decl_name(text: &str, keyword: &str) -> Option<String> {
    // Very small fallback parser: find `keyword` and read next identifier-like token.
    let mut it = text.split_whitespace();
    while let Some(tok) = it.next() {
        if tok == keyword {
            if let Some(name) = it.next() {
                let clean: String = name
                    .chars()
                    .take_while(|c| c.is_alphanumeric() || *c == '_')
                    .collect();
                if !clean.is_empty() {
                    return Some(clean);
                }
            }
        }
    }
    // If keyword isn't in the snippet (some grammars exclude it), pick the first identifier-like token.
    for tok in text.split_whitespace() {
        let clean: String = tok
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect();
        if clean.is_empty() {
            continue;
        }
        match clean.as_str() {
            "class" | "struct" | "public" | "private" | "protected" | "namespace" => continue,
            _ => return Some(clean),
        }
    }
    None
}

fn analyze_call(node: &Node, ctx: &mut AnalysisContext) {
    if let Some(function) = node.child_by_field_name("function") {
        let text = ctx.get_text(&function);
        ctx.result.calls.push(CallInfo {
            callee_name: text.clone(),
            qualified_name: if text.contains("::") || text.contains('.') { Some(text) } else { None },
            location: node_to_range(node),
            is_constructor: false,
        });
    }
}

fn find_identifier_in_declarator<'a>(node: Node<'a>) -> Option<Node<'a>> {
    if node.kind() == "identifier" {
        return Some(node);
    }
    for i in 0..node.named_child_count() {
        if let Some(ch) = node.named_child(i) {
            if let Some(id) = find_identifier_in_declarator(ch) {
                return Some(id);
            }
        }
    }
    None
}

fn node_to_range(node: &Node) -> Range {
    let start = node.start_position();
    let end = node.end_position();
    Range {
        start: Position {
            line: start.row as u32,
            column: start.column as u32,
        },
        end: Position {
            line: end.row as u32,
            column: end.column as u32,
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cpp_basic_symbols_imports_calls() {
        let adapter = CppAdapter::new().unwrap();
        let src = r#"
#include <string>

namespace demo {
  class User { 
    public: 
      std::string name; 
      void greet() {}
  };
}

int greet() { return 0; }
"#;
        let result = adapter.analyze("file:///test.cpp", src);
        assert!(result.imports.len() >= 1, "Should have includes");
        assert!(result.symbols.iter().any(|s| s.name == "demo"), "Should have namespace");
        assert!(result.symbols.iter().any(|s| s.name == "User" && s.kind == SymbolKind::Class), "Should have class User");
        assert!(result.symbols.iter().any(|s| s.name == "name" && s.kind == SymbolKind::Field), "Should have field name");
        assert!(result.symbols.iter().any(|s| s.name == "greet" && s.kind == SymbolKind::Method), "Should have method greet");
        assert!(result.symbols.iter().any(|s| s.name == "greet" && s.kind == SymbolKind::Function), "Should have function greet");
    }

    #[test]
    fn cpp_class_with_private_members() {
        let adapter = CppAdapter::new().unwrap();
        let src = r#"
class MyClass {
  private:
    int private_field;
    void private_method() {}
  
  public:
    int public_field;
    void public_method() {}
};
"#;
        let result = adapter.analyze("file:///test.cpp", src);
        let class_sym = result.symbols.iter().find(|s| s.name == "MyClass").unwrap();
        assert_eq!(class_sym.kind, SymbolKind::Class);

        let private_field = result.symbols.iter().find(|s| s.name == "private_field").unwrap();
        assert_eq!(private_field.kind, SymbolKind::Field);
        assert_eq!(private_field.visibility, Visibility::Private);

        let public_field = result.symbols.iter().find(|s| s.name == "public_field").unwrap();
        assert_eq!(public_field.visibility, Visibility::Public);
        assert!(public_field.exported);

        let public_method = result.symbols.iter().find(|s| s.name == "public_method").unwrap();
        assert_eq!(public_method.kind, SymbolKind::Method);
        assert_eq!(public_method.visibility, Visibility::Public);
    }
}

