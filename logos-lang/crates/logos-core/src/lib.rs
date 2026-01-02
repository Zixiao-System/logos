//! Logos Core - Core types and interfaces for the language service

pub mod diagnostic;
pub mod document;
pub mod position;
pub mod symbol;

pub use diagnostic::{Diagnostic, DiagnosticSeverity};
pub use document::Document;
pub use position::{Location, Position, Range};
pub use symbol::{Symbol, SymbolKind};