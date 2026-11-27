//! The design document (mirror of `packages/model`, the TypeScript reference).
//!
//! These types accept exactly the JSON shape the TypeScript schema produces, and reject unknown
//! keys. Value rules (ranges, regexes) and cross-references are checked by the TypeScript
//! validator before a document reaches the compiler; the parity test in `tests/parity.rs`
//! keeps the two shapes in step.

mod node;
mod style;

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

pub use node::*;
pub use style::*;

pub const SCHEMA_VERSION: u32 = 1;

/// Frameworks the compiler can target.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Framework {
    #[serde(rename = "nextjs")]
    Next,
    Astro,
}

impl Framework {
    /// Stable identifier stored on project rows and in generated READMEs.
    pub fn id(self) -> &'static str {
        match self {
            Framework::Next => "nextjs",
            Framework::Astro => "astro",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Breakpoint {
    pub width: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Breakpoints {
    pub desktop: Breakpoint,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tablet: Option<Breakpoint>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mobile: Option<Breakpoint>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Settings {
    pub lang: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Seo {
    pub title: String,
    pub description: String,
    pub og_image: Option<String>,
    pub noindex: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Page {
    pub id: String,
    pub name: String,
    pub path: String,
    pub seo: Seo,
    pub root: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PerBreakpoint<T> {
    pub desktop: T,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tablet: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mobile: Option<T>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct FontValue {
    pub family: String,
    pub weight: u16,
    pub size: f64,
    pub line_height: f64,
    pub letter_spacing: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Variable {
    Color {
        id: String,
        name: String,
        group: String,
        #[serde(rename = "cssName")]
        css_name: String,
        value: PerBreakpoint<String>,
    },
    Spacing {
        id: String,
        name: String,
        group: String,
        #[serde(rename = "cssName")]
        css_name: String,
        value: PerBreakpoint<f64>,
    },
    Font {
        id: String,
        name: String,
        group: String,
        #[serde(rename = "cssName")]
        css_name: String,
        value: PerBreakpoint<FontValue>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PropType {
    Text,
    Image,
    Link,
    Boolean,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PropField {
    Content,
    AssetId,
    Href,
    Visible,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct PropTarget {
    pub node_id: String,
    pub field: PropField,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ComponentProp {
    pub name: String,
    #[serde(rename = "type")]
    pub kind: PropType,
    pub default: Option<PropValue>,
    pub target: PropTarget,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct VariantProp {
    pub name: String,
    pub values: Vec<String>,
    pub default: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Component {
    pub id: String,
    pub name: String,
    pub root: String,
    pub props: Vec<ComponentProp>,
    pub variant_props: Vec<VariantProp>,
    /// "prop=value,prop=value" → node id → overrides.
    pub variants: BTreeMap<String, BTreeMap<String, StyleOverride>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum AssetMime {
    #[serde(rename = "image/png")]
    Png,
    #[serde(rename = "image/jpeg")]
    Jpeg,
    #[serde(rename = "image/webp")]
    Webp,
    #[serde(rename = "image/avif")]
    Avif,
    #[serde(rename = "image/gif")]
    Gif,
    #[serde(rename = "image/svg+xml")]
    Svg,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Asset {
    pub id: String,
    pub name: String,
    pub mime: AssetMime,
    pub width: u32,
    pub height: u32,
    pub bytes: u64,
    /// Relative to the workspace's R2 prefix.
    pub key: String,
    /// Assets panel folder (editor only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder: Option<String>,
    /// Default alt text for new image layers (editor only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
}

/// A whole project document.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct Project {
    pub schema_version: u32,
    pub id: String,
    pub framework: Framework,
    pub settings: Settings,
    pub breakpoints: Breakpoints,
    pub pages: Vec<Page>,
    pub nodes: BTreeMap<String, Node>,
    pub components: BTreeMap<String, Component>,
    pub variables: BTreeMap<String, Variable>,
    pub assets: BTreeMap<String, Asset>,
}

/// Why a document couldn't be read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ModelError {
    Json(String),
    SchemaVersion(u32),
}

impl std::fmt::Display for ModelError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ModelError::Json(e) => write!(f, "invalid document: {e}"),
            ModelError::SchemaVersion(v) => {
                write!(
                    f,
                    "unsupported schema version {v} (expected {SCHEMA_VERSION})"
                )
            }
        }
    }
}

impl std::error::Error for ModelError {}

impl Project {
    /// Reads a document that the TypeScript validator has accepted.
    pub fn from_json(json: &str) -> Result<Project, ModelError> {
        let project: Project =
            serde_json::from_str(json).map_err(|e| ModelError::Json(e.to_string()))?;
        if project.schema_version != SCHEMA_VERSION {
            return Err(ModelError::SchemaVersion(project.schema_version));
        }
        Ok(project)
    }

    pub fn to_json(&self) -> Result<String, ModelError> {
        serde_json::to_string(self).map_err(|e| ModelError::Json(e.to_string()))
    }
}

/// Serde helper for `Option<Option<T>>`: absent → `None`, `null` → `Some(None)`.
mod double_option {
    use serde::{Deserialize, Deserializer, Serialize, Serializer};

    pub fn deserialize<'de, T, D>(d: D) -> Result<Option<Option<T>>, D::Error>
    where
        T: Deserialize<'de>,
        D: Deserializer<'de>,
    {
        Option::<T>::deserialize(d).map(Some)
    }

    pub fn serialize<T, S>(v: &Option<Option<T>>, s: S) -> Result<S::Ok, S::Error>
    where
        T: Serialize,
        S: Serializer,
    {
        match v {
            Some(inner) => inner.serialize(s),
            None => s.serialize_none(),
        }
    }
}
