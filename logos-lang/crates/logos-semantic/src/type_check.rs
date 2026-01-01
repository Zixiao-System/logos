//! Type checking for semantic analysis
//!
//! Provides type checking capabilities for detecting type mismatches,
//! undefined variables, incorrect function calls, etc.

use crate::type_infer::{Type, TypeContext};
use logos_core::{Diagnostic, Range, Symbol, SymbolKind};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Type check result for a single expression or statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeCheckResult {
    /// The inferred type
    pub inferred_type: Type,
    /// Any type errors found
    pub errors: Vec<TypeCheckError>,
}

/// A type checking error
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeCheckError {
    /// Error kind
    pub kind: TypeCheckErrorKind,
    /// Location of the error
    pub range: Range,
    /// Error message
    pub message: String,
    /// Expected type (if applicable)
    pub expected: Option<Type>,
    /// Actual type found (if applicable)
    pub actual: Option<Type>,
}

impl TypeCheckError {
    /// Convert to a diagnostic
    pub fn to_diagnostic(&self) -> Diagnostic {
        let mut diag = match self.kind {
            TypeCheckErrorKind::UndefinedVariable
            | TypeCheckErrorKind::UndefinedFunction
            | TypeCheckErrorKind::TypeMismatch
            | TypeCheckErrorKind::ArgumentCount
            | TypeCheckErrorKind::ReturnTypeMismatch => {
                Diagnostic::error(self.range, self.message.clone())
            }
            TypeCheckErrorKind::ImplicitAny | TypeCheckErrorKind::NullableAccess => {
                Diagnostic::warning(self.range, self.message.clone())
            }
        };
        diag.source = Some("logos-typecheck".to_string());
        diag.code = Some(self.kind.code().to_string());
        diag
    }
}

/// Kind of type checking error
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TypeCheckErrorKind {
    /// Type mismatch in assignment or expression
    TypeMismatch,
    /// Variable is not defined
    UndefinedVariable,
    /// Function is not defined
    UndefinedFunction,
    /// Wrong number of arguments in function call
    ArgumentCount,
    /// Return type doesn't match function signature
    ReturnTypeMismatch,
    /// Type is implicitly 'any' (when strict mode is enabled)
    ImplicitAny,
    /// Accessing a property on a potentially null value
    NullableAccess,
}

impl TypeCheckErrorKind {
    /// Get the error code for this kind
    pub fn code(&self) -> &'static str {
        match self {
            TypeCheckErrorKind::TypeMismatch => "type-mismatch",
            TypeCheckErrorKind::UndefinedVariable => "undefined-variable",
            TypeCheckErrorKind::UndefinedFunction => "undefined-function",
            TypeCheckErrorKind::ArgumentCount => "argument-count",
            TypeCheckErrorKind::ReturnTypeMismatch => "return-type-mismatch",
            TypeCheckErrorKind::ImplicitAny => "implicit-any",
            TypeCheckErrorKind::NullableAccess => "nullable-access",
        }
    }
}

/// Configuration for type checking
#[derive(Debug, Clone)]
pub struct TypeCheckConfig {
    /// Enable strict mode (report implicit any)
    pub strict: bool,
    /// Enable null safety checks
    pub null_safety: bool,
    /// Report unused variables
    pub report_unused: bool,
}

impl Default for TypeCheckConfig {
    fn default() -> Self {
        Self {
            strict: false,
            null_safety: true,
            report_unused: true,
        }
    }
}

/// Type checker for semantic analysis
pub struct TypeChecker {
    /// Type context with variable bindings
    context: TypeContext,
    /// Function signatures
    functions: HashMap<String, FunctionSignature>,
    /// Type errors collected during checking
    errors: Vec<TypeCheckError>,
    /// Configuration
    config: TypeCheckConfig,
}

/// Function signature for type checking
#[derive(Debug, Clone)]
pub struct FunctionSignature {
    /// Function name
    pub name: String,
    /// Parameter types with names
    pub params: Vec<(String, Type)>,
    /// Return type
    pub return_type: Type,
    /// Whether the function is variadic
    pub variadic: bool,
}

impl TypeChecker {
    /// Create a new type checker
    pub fn new() -> Self {
        Self {
            context: TypeContext::new(),
            functions: HashMap::new(),
            errors: Vec::new(),
            config: TypeCheckConfig::default(),
        }
    }

    /// Create a type checker with custom configuration
    pub fn with_config(config: TypeCheckConfig) -> Self {
        Self {
            context: TypeContext::new(),
            functions: HashMap::new(),
            errors: Vec::new(),
            config,
        }
    }

    /// Register a function signature
    pub fn register_function(&mut self, sig: FunctionSignature) {
        self.functions.insert(sig.name.clone(), sig);
    }

    /// Register a variable type
    pub fn register_variable(&mut self, name: &str, ty: Type) {
        self.context.bind(name.to_string(), ty);
    }

    /// Check an assignment expression
    pub fn check_assignment(&mut self, target: &str, value_type: &Type, range: Range) {
        if let Some(target_type) = self.context.get(target) {
            if !value_type.is_subtype_of(target_type) {
                self.errors.push(TypeCheckError {
                    kind: TypeCheckErrorKind::TypeMismatch,
                    range,
                    message: format!(
                        "Cannot assign '{}' to variable '{}' of type '{}'",
                        value_type.display_name(),
                        target,
                        target_type.display_name()
                    ),
                    expected: Some(target_type.clone()),
                    actual: Some(value_type.clone()),
                });
            }
        } else {
            // Variable not defined, bind it with the value type
            self.context.bind(target.to_string(), value_type.clone());
        }
    }

    /// Check a function call
    pub fn check_function_call(
        &mut self,
        name: &str,
        args: &[Type],
        range: Range,
    ) -> Type {
        if let Some(sig) = self.functions.get(name).cloned() {
            // Check argument count
            if !sig.variadic && args.len() != sig.params.len() {
                self.errors.push(TypeCheckError {
                    kind: TypeCheckErrorKind::ArgumentCount,
                    range,
                    message: format!(
                        "Function '{}' expects {} arguments, but {} were provided",
                        name,
                        sig.params.len(),
                        args.len()
                    ),
                    expected: None,
                    actual: None,
                });
            }

            // Check argument types
            for (i, (arg_type, (param_name, param_type))) in
                args.iter().zip(sig.params.iter()).enumerate()
            {
                if !arg_type.is_subtype_of(param_type) {
                    self.errors.push(TypeCheckError {
                        kind: TypeCheckErrorKind::TypeMismatch,
                        range,
                        message: format!(
                            "Argument {} '{}': expected '{}', found '{}'",
                            i + 1,
                            param_name,
                            param_type.display_name(),
                            arg_type.display_name()
                        ),
                        expected: Some(param_type.clone()),
                        actual: Some(arg_type.clone()),
                    });
                }
            }

            sig.return_type
        } else {
            self.errors.push(TypeCheckError {
                kind: TypeCheckErrorKind::UndefinedFunction,
                range,
                message: format!("Function '{}' is not defined", name),
                expected: None,
                actual: None,
            });
            Type::Unknown
        }
    }

    /// Check member access (e.g., obj.property)
    pub fn check_member_access(
        &mut self,
        object_type: &Type,
        member: &str,
        range: Range,
    ) -> Type {
        // Check for nullable access
        if self.config.null_safety && object_type.is_optional() {
            self.errors.push(TypeCheckError {
                kind: TypeCheckErrorKind::NullableAccess,
                range,
                message: format!(
                    "Cannot access '{}' on potentially null value of type '{}'",
                    member,
                    object_type.display_name()
                ),
                expected: None,
                actual: Some(object_type.clone()),
            });
        }

        // For Record types, look up the field
        if let Type::Record(fields) = object_type.unwrap_optional() {
            if let Some(field_type) = fields.get(member) {
                return field_type.clone();
            }
        }

        // For Class types, we would need class definitions
        if let Type::Class(_name) = object_type.unwrap_optional() {
            // In a full implementation, we would look up the class definition
            return Type::Unknown;
        }

        Type::Unknown
    }

    /// Check a return statement
    pub fn check_return(
        &mut self,
        return_type: &Type,
        expected_return: &Type,
        range: Range,
    ) {
        if !return_type.is_subtype_of(expected_return) {
            self.errors.push(TypeCheckError {
                kind: TypeCheckErrorKind::ReturnTypeMismatch,
                range,
                message: format!(
                    "Return type '{}' is not assignable to expected return type '{}'",
                    return_type.display_name(),
                    expected_return.display_name()
                ),
                expected: Some(expected_return.clone()),
                actual: Some(return_type.clone()),
            });
        }
    }

    /// Get the type of a variable
    pub fn get_variable_type(&mut self, name: &str, range: Range) -> Type {
        if let Some(ty) = self.context.get(name) {
            ty.clone()
        } else {
            self.errors.push(TypeCheckError {
                kind: TypeCheckErrorKind::UndefinedVariable,
                range,
                message: format!("Variable '{}' is not defined", name),
                expected: None,
                actual: None,
            });
            Type::Unknown
        }
    }

    /// Analyze symbols and extract type information
    pub fn analyze_symbols(&mut self, symbols: &[Symbol]) {
        for symbol in symbols {
            match symbol.kind {
                SymbolKind::Variable | SymbolKind::Constant => {
                    // Register variable with unknown type (would be inferred from context)
                    self.context.bind(symbol.name.clone(), Type::Unknown);
                }
                SymbolKind::Function | SymbolKind::Method => {
                    // Register function signature (simplified)
                    self.register_function(FunctionSignature {
                        name: symbol.name.clone(),
                        params: Vec::new(),
                        return_type: Type::Unknown,
                        variadic: false,
                    });
                }
                SymbolKind::Class | SymbolKind::Struct => {
                    self.context.bind(symbol.name.clone(), Type::Class(symbol.name.clone()));
                }
                _ => {}
            }
            // Process children
            self.analyze_symbols(&symbol.children);
        }
    }

    /// Get all type errors
    pub fn errors(&self) -> &[TypeCheckError] {
        &self.errors
    }

    /// Get type errors as diagnostics
    pub fn diagnostics(&self) -> Vec<Diagnostic> {
        self.errors.iter().map(|e| e.to_diagnostic()).collect()
    }

    /// Clear all errors
    pub fn clear_errors(&mut self) {
        self.errors.clear();
    }

    /// Get the type context
    pub fn context(&self) -> &TypeContext {
        &self.context
    }
}

impl Default for TypeChecker {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use logos_core::Position;

    fn test_range() -> Range {
        Range {
            start: Position { line: 0, character: 0 },
            end: Position { line: 0, character: 10 },
        }
    }

    #[test]
    fn test_assignment_check() {
        let mut checker = TypeChecker::new();
        checker.register_variable("x", Type::Int);

        // Valid assignment
        checker.check_assignment("x", &Type::Int, test_range());
        assert!(checker.errors().is_empty());

        // Invalid assignment
        checker.check_assignment("x", &Type::String, test_range());
        assert_eq!(checker.errors().len(), 1);
        assert_eq!(checker.errors()[0].kind, TypeCheckErrorKind::TypeMismatch);
    }

    #[test]
    fn test_function_call() {
        let mut checker = TypeChecker::new();
        checker.register_function(FunctionSignature {
            name: "add".to_string(),
            params: vec![
                ("a".to_string(), Type::Int),
                ("b".to_string(), Type::Int),
            ],
            return_type: Type::Int,
            variadic: false,
        });

        // Valid call
        let result = checker.check_function_call("add", &[Type::Int, Type::Int], test_range());
        assert_eq!(result, Type::Int);
        assert!(checker.errors().is_empty());

        // Wrong argument type
        checker.check_function_call("add", &[Type::String, Type::Int], test_range());
        assert_eq!(checker.errors().len(), 1);
    }

    #[test]
    fn test_undefined_variable() {
        let mut checker = TypeChecker::new();
        let ty = checker.get_variable_type("undefined_var", test_range());
        assert_eq!(ty, Type::Unknown);
        assert_eq!(checker.errors().len(), 1);
        assert_eq!(checker.errors()[0].kind, TypeCheckErrorKind::UndefinedVariable);
    }
}
