//! Builds the element tree for a page from its layers.

use std::collections::BTreeMap;

use crate::CompileError;
use crate::model::{Node, Project, TextSpan};
use crate::names::{ClassNamer, class_base};
use crate::printer::{Attr, Child, El, Syntax, escape_text};

/// Per-framework choices while building elements.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flavor {
    Next,
    Astro,
}

impl Flavor {
    pub fn syntax(self) -> Syntax {
        match self {
            Flavor::Next => Syntax::Jsx,
            Flavor::Astro => Syntax::Astro,
        }
    }
    pub fn class_attr(self) -> &'static str {
        match self {
            Flavor::Next => "className",
            Flavor::Astro => "class",
        }
    }
}

pub fn node<'a>(project: &'a Project, id: &str) -> Result<&'a Node, CompileError> {
    project
        .nodes
        .get(id)
        .ok_or_else(|| CompileError::Invalid(format!("missing node {id}")))
}

pub fn node_type(n: &Node) -> &'static str {
    match n {
        Node::Frame { .. } => "frame",
        Node::Text { .. } => "text",
        Node::Image { .. } => "image",
        Node::Link { .. } => "link",
        Node::Icon { .. } => "icon",
        Node::Embed { .. } => "embed",
        Node::Instance { .. } => "instance",
    }
}

fn node_name(n: &Node) -> &str {
    match n {
        Node::Frame { name, .. }
        | Node::Text { name, .. }
        | Node::Image { name, .. }
        | Node::Link { name, .. }
        | Node::Icon { name, .. }
        | Node::Embed { name, .. }
        | Node::Instance { name, .. } => name,
    }
}

/// Code classes (PRD F27) for every layer under `root`, unique in tree order.
pub fn code_classes(
    project: &Project,
    root: &str,
    scope: Option<&str>,
) -> Result<BTreeMap<String, String>, CompileError> {
    let mut namer = ClassNamer::new();
    let mut out = BTreeMap::new();
    let mut stack = vec![root.to_string()];
    while let Some(id) = stack.pop() {
        let n = node(project, &id)?;
        let base = class_base(node_name(n), node_type(n));
        let class = match scope {
            // Component layers are scoped: `pricing-card__title`; the root is the block itself.
            Some(block) if id == root => block.to_string(),
            Some(block) => format!("{block}__{base}"),
            None => base,
        };
        out.insert(id.clone(), namer.unique(&class));
        // Depth-first in document order.
        for c in n.children().iter().rev() {
            stack.push(c.clone());
        }
    }
    Ok(out)
}

/// Builds the element for `id` and its subtree.
pub struct Builder<'a> {
    pub project: &'a Project,
    pub flavor: Flavor,
    pub classes: BTreeMap<String, String>,
}

impl Builder<'_> {
    pub fn element(&self, id: &str) -> Result<El, CompileError> {
        let n = node(self.project, id)?;
        let class = self.classes.get(id).cloned().unwrap_or_default();
        let tag = match n {
            Node::Frame { tag, .. }
            | Node::Text { tag, .. }
            | Node::Image { tag, .. }
            | Node::Link { tag, .. }
            | Node::Icon { tag, .. }
            | Node::Embed { tag, .. }
            | Node::Instance { tag, .. } => tag.as_str(),
        };
        let mut el = El::new(tag)
            .node(id)
            .attr(Attr::str(self.flavor.class_attr(), class));
        match n {
            Node::Frame { children, .. } | Node::Link { children, .. } => {
                for c in children {
                    el.children.push(Child::El(self.element(c)?));
                }
            }
            Node::Text { content, .. } => {
                el.inline = true;
                el.children = rich_text(content);
            }
            _ => {}
        }
        Ok(el)
    }
}

/// Rich text runs as inline children; newlines become `<br />`.
pub fn rich_text(spans: &[TextSpan]) -> Vec<Child> {
    let mut out = Vec::new();
    for s in spans {
        let mut parts: Vec<Child> = Vec::new();
        for (i, line) in s.text.split('\n').enumerate() {
            if i > 0 {
                parts.push(Child::El(El::new("br")));
            }
            if !line.is_empty() {
                parts.push(Child::Text(escape_text(line)));
            }
        }
        let wrap = |tag: &str, inner: Vec<Child>| -> Vec<Child> {
            let mut el = El::new(tag);
            el.inline = true;
            el.children = inner;
            vec![Child::El(el)]
        };
        if s.underline == Some(true) {
            parts = wrap("u", parts);
        }
        if s.italic == Some(true) {
            parts = wrap("em", parts);
        }
        if s.bold == Some(true) {
            parts = wrap("strong", parts);
        }
        if let Some(href) = &s.href {
            let mut a = El::new("a").attr(Attr::str("href", href.clone()));
            a.inline = true;
            a.children = parts;
            parts = vec![Child::El(a)];
        }
        out.extend(parts);
    }
    out
}
