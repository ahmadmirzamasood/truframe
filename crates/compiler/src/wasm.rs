//! wasm-bindgen boundary (`packages/compiler-wasm`). JSON in, JSON out; never panics: every
//! failure becomes a thrown JS `Error` with a message.

use wasm_bindgen::prelude::*;

use crate::model::Project;
use crate::{Framework, compile_for};

/// Compiles a document (JSON text) and returns the output as JSON text:
/// `{ files, spans, css, instanceCss?, assets }`. `framework` overrides the document's framework when given.
#[wasm_bindgen(js_name = compile)]
pub fn compile_js(document_json: &str, framework: Option<String>) -> Result<String, JsError> {
    let project = Project::from_json(document_json).map_err(|e| JsError::new(&e.to_string()))?;
    let framework = match framework.as_deref() {
        None => project.framework,
        Some("nextjs") => Framework::Next,
        Some("astro") => Framework::Astro,
        Some(other) => return Err(JsError::new(&format!("unknown framework \"{other}\""))),
    };
    let output = compile_for(&project, framework).map_err(|e| JsError::new(&e.to_string()))?;
    serde_json::to_string(&output).map_err(|e| JsError::new(&e.to_string()))
}

/// The output contract version ([`crate::OUTPUT_VERSION`]).
#[wasm_bindgen(js_name = outputVersion)]
pub fn output_version() -> u32 {
    crate::OUTPUT_VERSION
}
