//! Builds the element tree for a page from its layers.

use std::collections::BTreeMap;

use crate::model::{AssetMime, Node, Position, Project, Props, TextSpan};
use crate::names::{ClassNamer, class_base, kebab};
use crate::printer::{Attr, Child, El, Syntax, escape_text};
use crate::style::{
    AssetUrls, Bp, BpInput, Env, NodeInfo, ParentLayout, SlotFilter, effective, style_element,
};
use crate::{CompileError, NodeCss};

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
        let base = class_base(n.name(), node_type(n));
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

/// Builds the element for `id` and its subtree, collecting canvas CSS on the way.
pub struct Builder<'a> {
    pub project: &'a Project,
    pub flavor: Flavor,
    pub classes: BTreeMap<String, String>,
    pub css: BTreeMap<String, NodeCss>,
    /// Asset id → file name ([`asset_file_names`]).
    pub asset_names: BTreeMap<String, String>,
}

/// Background images live under `public/assets/` in both frameworks.
struct PublicAssets<'a>(&'a BTreeMap<String, String>);

impl AssetUrls for PublicAssets<'_> {
    fn background_url(&self, asset_id: &str) -> Option<String> {
        self.0.get(asset_id).map(|f| format!("/assets/{f}"))
    }
}

/// A file name per asset: its kebab-cased name and extension, unique in the project.
pub fn asset_file_names(project: &Project) -> BTreeMap<String, String> {
    let mut namer = ClassNamer::new();
    let mut out = BTreeMap::new();
    for (id, a) in &project.assets {
        let ext = match a.mime {
            AssetMime::Png => "png",
            AssetMime::Jpeg => "jpg",
            AssetMime::Webp => "webp",
            AssetMime::Avif => "avif",
            AssetMime::Gif => "gif",
            AssetMime::Svg => "svg",
        };
        let stem = a.name.rsplit_once('.').map_or(a.name.as_str(), |(s, _)| s);
        let mut base = kebab(stem);
        if base.is_empty() {
            base = "image".into();
        }
        let base = namer.unique(&base);
        out.insert(id.clone(), format!("{base}.{ext}"));
    }
    out
}

/// Hidden per breakpoint, cascading like style props.
fn hidden_at(n: &Node, bp: Bp) -> bool {
    let h = n.hidden();
    let d = h.and_then(|h| h.desktop).unwrap_or(false);
    let t = h.and_then(|h| h.tablet).unwrap_or(d);
    match bp {
        Bp::Desktop => d,
        Bp::Tablet => t,
        Bp::Mobile => h.and_then(|h| h.mobile).unwrap_or(t),
    }
}

impl Builder<'_> {
    pub fn new(
        project: &Project,
        flavor: Flavor,
        classes: BTreeMap<String, String>,
    ) -> Builder<'_> {
        Builder {
            project,
            flavor,
            classes,
            css: BTreeMap::new(),
            asset_names: asset_file_names(project),
        }
    }

    /// Per-breakpoint style inputs of a node placed in `parent`.
    fn inputs(&self, n: &Node, parent: Option<&Node>) -> Result<Vec<(Bp, BpInput)>, CompileError> {
        let bps = &self.project.breakpoints;
        let mine = effective(n.style(), bps);
        let parents = parent.map(|p| effective(p.style(), bps));
        let children: Vec<Vec<(Bp, Props)>> = n
            .children()
            .iter()
            .map(|c| node(self.project, c).map(|c| effective(c.style(), bps)))
            .collect::<Result<_, _>>()?;
        Ok(mine
            .into_iter()
            .enumerate()
            .map(|(i, (bp, props))| {
                let parent = parents
                    .as_ref()
                    .and_then(|ps| ps.get(i))
                    .map(|(_, p)| ParentLayout::of(p));
                let has_absolute_child = children.iter().any(|c| {
                    c.get(i)
                        .is_some_and(|(_, p)| p.position == Some(Position::Absolute))
                });
                (
                    bp,
                    BpInput {
                        props,
                        hidden: hidden_at(n, bp),
                        parent,
                        has_absolute_child,
                    },
                )
            })
            .collect())
    }

    /// The class list of a node: its code class first, then the utilities (PRD F27).
    fn class_list(
        &mut self,
        id: &str,
        n: &Node,
        parent: Option<&Node>,
    ) -> Result<String, CompileError> {
        let inputs = self.inputs(n, parent)?;
        let assets = PublicAssets(&self.asset_names);
        let env = Env {
            vars: &self.project.variables,
            assets: &assets,
        };
        let styled = style_element(&inputs, NodeInfo { tag: n.tag() }, &env, SlotFilter::All);
        self.css.insert(id.to_string(), styled.css);
        let mut list = vec![self.classes.get(id).cloned().unwrap_or_default()];
        list.extend(styled.classes);
        Ok(list.join(" "))
    }

    pub fn element(&mut self, id: &str, parent: Option<&str>) -> Result<El, CompileError> {
        let project = self.project;
        let n = node(project, id)?;
        let parent_node = parent.map(|p| node(project, p)).transpose()?;
        let class = self.class_list(id, n, parent_node)?;
        let mut el = El::new(n.tag().as_str())
            .node(id)
            .attr(Attr::str(self.flavor.class_attr(), class));
        match n {
            Node::Frame { children, .. } | Node::Link { children, .. } => {
                for c in children {
                    let child = self.element(c, Some(id))?;
                    el.children.push(Child::El(child));
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
