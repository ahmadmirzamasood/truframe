//! Truframe compiler: design document → generated Next.js or Astro project.
//!
//! [`compile`] is a pure function of the document: the same document always gives
//! byte-identical files (ARCHITECTURE §6.1). It returns the project files, the source range of
//! every layer (`spans`, for reveal-in-code) and per-layer canvas CSS (`css`, for the renderer).

mod adapters;
mod fonts;
pub mod model;
pub mod names;
pub mod printer;
pub mod style;
mod tokens;
mod tree;
#[cfg(target_arch = "wasm32")]
mod wasm;

use std::collections::BTreeMap;

use serde::Serialize;

pub use model::Framework;
use model::{ModelError, Project};

/// Version of the compiler's output contract. Bumped when generated files change shape.
pub const OUTPUT_VERSION: u32 = 1;

/// Where a layer's element sits in a generated file. Offsets are UTF-16 code units (what JS
/// strings and CodeMirror use), `end` exclusive.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Span {
    pub node: String,
    pub path: String,
    pub start: usize,
    pub end: usize,
}

/// CSS declarations for one layer on the canvas, per breakpoint. Tablet and mobile hold only
/// what changes from the breakpoint above, like the generated classes.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct NodeCss {
    pub desktop: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tablet: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<String>,
}

/// An uploaded asset the generated project needs, and where the build must put it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetFile {
    pub asset_id: String,
    /// The asset's key in storage (relative to the workspace prefix).
    pub key: String,
    /// Path inside the generated project.
    pub path: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Output {
    /// Path → file content, sorted by path.
    pub files: BTreeMap<String, String>,
    pub spans: Vec<Span>,
    /// Node id → canvas CSS.
    pub css: BTreeMap<String, NodeCss>,
    pub assets: Vec<AssetFile>,
}

/// Why a document couldn't be compiled. Documents are validated before they reach the
/// compiler, so these mean a bug or a document from a newer schema.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompileError {
    Model(ModelError),
    /// A reference the validator should have caught (missing node, page or component).
    Invalid(String),
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CompileError::Model(e) => write!(f, "{e}"),
            CompileError::Invalid(m) => write!(f, "invalid document: {m}"),
        }
    }
}

impl std::error::Error for CompileError {}

impl From<ModelError> for CompileError {
    fn from(e: ModelError) -> Self {
        CompileError::Model(e)
    }
}

/// Compiles a document for the framework it was created with.
pub fn compile(project: &Project) -> Result<Output, CompileError> {
    adapters::compile(project, project.framework)
}

/// Compiles a document for another framework (golden fixtures cover both).
pub fn compile_for(project: &Project, framework: Framework) -> Result<Output, CompileError> {
    adapters::compile(project, framework)
}

/// Reads a document from JSON and compiles it.
pub fn compile_json(json: &str) -> Result<Output, CompileError> {
    compile(&Project::from_json(json)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn framework_ids_are_stable() {
        assert_eq!(Framework::Next.id(), "nextjs");
        assert_eq!(Framework::Astro.id(), "astro");
    }
}
