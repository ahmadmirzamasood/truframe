//! Framework adapters: turn the document into project files.

mod astro;
mod next;

use crate::model::Project;
use crate::printer::{Writer, utf16_offset};
use crate::{CompileError, Framework, Output, Span};

pub fn compile(project: &Project, framework: Framework) -> Result<Output, CompileError> {
    let mut out = Emit::default();
    match framework {
        Framework::Next => next::emit(project, &mut out)?,
        Framework::Astro => astro::emit(project, &mut out)?,
    }
    let mut output = out.output;
    output.spans.sort_by(|a, b| {
        (a.path.as_str(), a.start, a.node.as_str()).cmp(&(
            b.path.as_str(),
            b.start,
            b.node.as_str(),
        ))
    });
    Ok(output)
}

/// Collects files and converts each file's byte spans to UTF-16 spans.
#[derive(Debug, Default)]
pub struct Emit {
    pub output: Output,
}

impl Emit {
    pub fn file(&mut self, path: &str, text: impl Into<String>) {
        self.output.files.insert(path.to_string(), text.into());
    }

    pub fn writer(&mut self, path: &str, w: Writer) {
        for s in &w.spans {
            self.output.spans.push(Span {
                node: s.node.clone(),
                path: path.to_string(),
                start: utf16_offset(&w.out, s.start),
                end: utf16_offset(&w.out, s.end),
            });
        }
        self.output.files.insert(path.to_string(), w.out);
    }
}
