//! Simplified type inference

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a type in the type system
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum Type {
    /// Unknown type (any)
    Unknown,
    /// Void/None/Unit type
    Void,
    /// Boolean type
    Bool,
    /// Integer type
    Int,
    /// Floating-point type
    Float,
    /// String type
    String,
    /// Homogeneous list/array type
    List(Box<Type>),
    /// Dictionary/Map type with key and value types
    Dict(Box<Type>, Box<Type>),
    /// Optional/nullable type
    Optional(Box<Type>),
    /// Function type with parameter and return types
    Function {
        params: Vec<Type>,
        return_type: Box<Type>,
    },
    /// Named class/struct type
    Class(String),
    /// Type variable for generics
    TypeVar(String),
    /// Tuple type with ordered element types
    Tuple(Vec<Type>),
    /// Union type (A | B)
    Union(Vec<Type>),
    /// Intersection type (A & B)
    Intersection(Vec<Type>),
    /// Record/Object type with named fields
    Record(HashMap<String, Type>),
    /// Callable type with named parameters
    Callable {
        params: Vec<(String, Type)>,
        return_type: Box<Type>,
    },
    /// Generic type with type parameters
    Generic {
        name: String,
        type_params: Vec<Type>,
    },
    /// Literal type (for const values)
    Literal(LiteralType),
    /// Never type (for functions that never return)
    Never,
}

/// Literal types for specific constant values
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", content = "value")]
pub enum LiteralType {
    /// String literal type
    String(String),
    /// Integer literal type
    Int(i64),
    /// Boolean literal type
    Bool(bool),
}

impl Type {
    pub fn is_unknown(&self) -> bool {
        matches!(self, Type::Unknown)
    }

    pub fn is_void(&self) -> bool {
        matches!(self, Type::Void)
    }

    pub fn is_never(&self) -> bool {
        matches!(self, Type::Never)
    }

    pub fn is_optional(&self) -> bool {
        matches!(self, Type::Optional(_))
    }

    /// Check if this type is a subtype of another
    pub fn is_subtype_of(&self, other: &Type) -> bool {
        match (self, other) {
            // Unknown is compatible with anything
            (_, Type::Unknown) | (Type::Unknown, _) => true,
            // Never is a subtype of everything
            (Type::Never, _) => true,
            // Same types
            (a, b) if a == b => true,
            // Int is assignable to Float
            (Type::Int, Type::Float) => true,
            // Optional handling
            (t, Type::Optional(inner)) => t.is_subtype_of(inner),
            (Type::Optional(inner), t) => inner.is_subtype_of(t),
            // Union: T is subtype of Union if T is subtype of any variant
            (t, Type::Union(variants)) => variants.iter().any(|v| t.is_subtype_of(v)),
            // Union: Union is subtype of T if all variants are subtypes of T
            (Type::Union(variants), t) => variants.iter().all(|v| v.is_subtype_of(t)),
            // Intersection: T is subtype of Intersection if T is subtype of all parts
            (t, Type::Intersection(parts)) => parts.iter().all(|p| t.is_subtype_of(p)),
            // List covariance
            (Type::List(a), Type::List(b)) => a.is_subtype_of(b),
            // Dict covariance
            (Type::Dict(ak, av), Type::Dict(bk, bv)) => ak.is_subtype_of(bk) && av.is_subtype_of(bv),
            // Tuple: same length and element-wise subtype
            (Type::Tuple(a), Type::Tuple(b)) if a.len() == b.len() => {
                a.iter().zip(b.iter()).all(|(a, b)| a.is_subtype_of(b))
            }
            // Generic types
            (Type::Generic { name: n1, type_params: p1 }, Type::Generic { name: n2, type_params: p2 }) => {
                n1 == n2 && p1.len() == p2.len() && p1.iter().zip(p2.iter()).all(|(a, b)| a.is_subtype_of(b))
            }
            _ => false,
        }
    }

    /// Get the display name for this type
    pub fn display_name(&self) -> String {
        match self {
            Type::Unknown => "any".to_string(),
            Type::Void => "void".to_string(),
            Type::Bool => "bool".to_string(),
            Type::Int => "int".to_string(),
            Type::Float => "float".to_string(),
            Type::String => "str".to_string(),
            Type::List(inner) => format!("list[{}]", inner.display_name()),
            Type::Dict(k, v) => format!("dict[{}, {}]", k.display_name(), v.display_name()),
            Type::Optional(inner) => format!("{}?", inner.display_name()),
            Type::Function { params, return_type } => {
                let p: Vec<_> = params.iter().map(|t| t.display_name()).collect();
                format!("({}) -> {}", p.join(", "), return_type.display_name())
            }
            Type::Class(name) => name.clone(),
            Type::TypeVar(name) => name.clone(),
            Type::Tuple(elements) => {
                let e: Vec<_> = elements.iter().map(|t| t.display_name()).collect();
                format!("({})", e.join(", "))
            }
            Type::Union(variants) => {
                let v: Vec<_> = variants.iter().map(|t| t.display_name()).collect();
                v.join(" | ")
            }
            Type::Intersection(parts) => {
                let p: Vec<_> = parts.iter().map(|t| t.display_name()).collect();
                p.join(" & ")
            }
            Type::Record(fields) => {
                let f: Vec<_> = fields
                    .iter()
                    .map(|(k, v)| format!("{}: {}", k, v.display_name()))
                    .collect();
                format!("{{ {} }}", f.join(", "))
            }
            Type::Callable { params, return_type } => {
                let p: Vec<_> = params
                    .iter()
                    .map(|(name, ty)| format!("{}: {}", name, ty.display_name()))
                    .collect();
                format!("({}) -> {}", p.join(", "), return_type.display_name())
            }
            Type::Generic { name, type_params } => {
                let p: Vec<_> = type_params.iter().map(|t| t.display_name()).collect();
                format!("{}<{}>", name, p.join(", "))
            }
            Type::Literal(lit) => match lit {
                LiteralType::String(s) => format!("\"{}\"", s),
                LiteralType::Int(n) => n.to_string(),
                LiteralType::Bool(b) => b.to_string(),
            },
            Type::Never => "never".to_string(),
        }
    }

    /// Simplify a union type by removing duplicates and flattening nested unions
    pub fn simplify_union(types: Vec<Type>) -> Type {
        let mut flattened = Vec::new();
        for ty in types {
            match ty {
                Type::Union(inner) => flattened.extend(inner),
                other => flattened.push(other),
            }
        }
        // Remove duplicates
        let mut unique = Vec::new();
        for ty in flattened {
            if !unique.contains(&ty) {
                unique.push(ty);
            }
        }
        match unique.len() {
            0 => Type::Never,
            1 => unique.pop().unwrap(),
            _ => Type::Union(unique),
        }
    }

    /// Create an optional type
    pub fn optional(inner: Type) -> Type {
        match inner {
            Type::Optional(_) => inner,
            other => Type::Optional(Box::new(other)),
        }
    }

    /// Unwrap optional type
    pub fn unwrap_optional(&self) -> &Type {
        match self {
            Type::Optional(inner) => inner,
            other => other,
        }
    }
}

impl Default for Type {
    fn default() -> Self {
        Type::Unknown
    }
}

/// Type context for tracking variable bindings and scopes
#[derive(Debug, Default, Clone)]
pub struct TypeContext {
    /// Variable bindings: name -> type
    bindings: HashMap<String, Type>,
    /// Parent scope for nested contexts
    parent: Option<Box<TypeContext>>,
}

impl TypeContext {
    pub fn new() -> Self {
        Self::default()
    }

    /// Create a child context with this as parent
    pub fn child(&self) -> Self {
        Self {
            bindings: HashMap::new(),
            parent: Some(Box::new(self.clone())),
        }
    }

    /// Bind a name to a type
    pub fn bind(&mut self, name: String, ty: Type) {
        self.bindings.insert(name, ty);
    }

    /// Get the type of a name, searching parent scopes
    pub fn get(&self, name: &str) -> Option<&Type> {
        self.bindings.get(name).or_else(|| {
            self.parent.as_ref().and_then(|p| p.get(name))
        })
    }

    /// Get the type of a name, or Unknown if not found
    pub fn get_or_unknown(&self, name: &str) -> Type {
        self.get(name).cloned().unwrap_or(Type::Unknown)
    }

    /// Check if a type is assignable to another
    pub fn is_assignable(&self, from: &Type, to: &Type) -> bool {
        from.is_subtype_of(to)
    }

    /// Get all bindings in this context (not including parents)
    pub fn bindings(&self) -> &HashMap<String, Type> {
        &self.bindings
    }

    /// Get the number of bindings in this context
    pub fn len(&self) -> usize {
        self.bindings.len()
    }

    /// Check if this context is empty
    pub fn is_empty(&self) -> bool {
        self.bindings.is_empty()
    }
}

/// Type error information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypeError {
    /// The expected type
    pub expected: Type,
    /// The actual type found
    pub actual: Type,
    /// Error message
    pub message: String,
}

impl TypeError {
    pub fn new(expected: Type, actual: Type) -> Self {
        let message = format!(
            "Type mismatch: expected '{}', found '{}'",
            expected.display_name(),
            actual.display_name()
        );
        Self { expected, actual, message }
    }

    pub fn with_message(expected: Type, actual: Type, message: impl Into<String>) -> Self {
        Self {
            expected,
            actual,
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_type_display() {
        assert_eq!(Type::Int.display_name(), "int");
        assert_eq!(Type::List(Box::new(Type::String)).display_name(), "list[str]");
        assert_eq!(
            Type::Union(vec![Type::Int, Type::String]).display_name(),
            "int | str"
        );
    }

    #[test]
    fn test_subtype() {
        assert!(Type::Int.is_subtype_of(&Type::Int));
        assert!(Type::Int.is_subtype_of(&Type::Float));
        assert!(Type::Int.is_subtype_of(&Type::Unknown));
        assert!(Type::Never.is_subtype_of(&Type::Int));
    }

    #[test]
    fn test_union_subtype() {
        let union = Type::Union(vec![Type::Int, Type::String]);
        assert!(Type::Int.is_subtype_of(&union));
        assert!(Type::String.is_subtype_of(&union));
        assert!(!Type::Float.is_subtype_of(&union));
    }

    #[test]
    fn test_context_scoping() {
        let mut ctx = TypeContext::new();
        ctx.bind("x".to_string(), Type::Int);

        let child = ctx.child();
        assert_eq!(child.get("x"), Some(&Type::Int));
    }
}
