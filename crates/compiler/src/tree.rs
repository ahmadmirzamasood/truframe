//! Builds the element tree for pages and components from their layers.

use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};

use crate::model::{
    AssetMime, Component, EmbedSource, Hidden, ImageFit, InstanceOverrides, LinkTarget, Node,
    NodeOverride, Position, Project, PropField, PropType, PropValue, Props, Style, StyleOverride,
    Tag, TextSpan,
};
use crate::names::{ClassNamer, camel, class_base, kebab, pascal};
use crate::printer::{Attr, Child, El, Syntax, escape_text, js_string};
use crate::style::{
    AssetUrls, Bp, BpInput, Env, NodeInfo, ParentLayout, SlotFilter, apply_override, effective,
    merge, style_element,
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
    /// The prop a component takes for the instance's classes.
    fn class_prop(self) -> &'static str {
        match self {
            Flavor::Next => "props.className",
            Flavor::Astro => "props.class",
        }
    }
}

pub fn node<'a>(project: &'a Project, id: &str) -> Result<&'a Node, CompileError> {
    project
        .nodes
        .get(id)
        .ok_or_else(|| CompileError::Invalid(format!("missing node {id}")))
}

pub fn component<'a>(project: &'a Project, id: &str) -> Result<&'a Component, CompileError> {
    project
        .components
        .get(id)
        .ok_or_else(|| CompileError::Invalid(format!("missing component {id}")))
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

/// The class block of a component (`PricingCard` → `pricing-card`), guarded like layers.
pub fn component_block(c: &Component) -> String {
    class_base(&c.name, "component")
}

/// Code classes (PRD F27) for every layer under `root`, unique in tree order. On pages,
/// component blocks are reserved so an instance never shares its component's class.
pub fn code_classes(
    project: &Project,
    root: &str,
    scope: Option<&str>,
) -> Result<BTreeMap<String, String>, CompileError> {
    let mut namer = ClassNamer::new();
    if scope.is_none() {
        for c in project.components.values() {
            namer.reserve(&component_block(c));
        }
    }
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

/// Where an asset file must be placed in the project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum AssetUse {
    /// `public/assets/<file>`, referenced by URL (Next.js images, CSS backgrounds).
    Public,
    /// `src/assets/<file>`, imported for `astro:assets`.
    Src,
}

/// Background images live under `public/assets/` in both frameworks.
struct PublicAssets<'a> {
    names: &'a BTreeMap<String, String>,
    used: &'a RefCell<BTreeSet<(String, AssetUse)>>,
}

impl AssetUrls for PublicAssets<'_> {
    fn background_url(&self, asset_id: &str) -> Option<String> {
        let f = self.names.get(asset_id)?;
        self.used
            .borrow_mut()
            .insert((asset_id.to_string(), AssetUse::Public));
        Some(format!("/assets/{f}"))
    }
}

/// Hidden per breakpoint, cascading like style props.
fn hidden_at(h: Option<&Hidden>, bp: Bp) -> bool {
    let d = h.and_then(|h| h.desktop).unwrap_or(false);
    let t = h.and_then(|h| h.tablet).unwrap_or(d);
    match bp {
        Bp::Desktop => d,
        Bp::Tablet => t,
        Bp::Mobile => h.and_then(|h| h.mobile).unwrap_or(t),
    }
}

fn merge_hidden(base: Option<&Hidden>, over: Option<&Hidden>) -> Option<Hidden> {
    if base.is_none() && over.is_none() {
        return None;
    }
    let b = base.cloned().unwrap_or_default();
    let o = over.cloned().unwrap_or_default();
    Some(Hidden {
        desktop: o.desktop.or(b.desktop),
        tablet: o.tablet.or(b.tablet),
        mobile: o.mobile.or(b.mobile),
    })
}

fn merge_opt(x: &Option<Props>, y: &Option<Props>) -> Option<Props> {
    match (x, y) {
        (Some(x), Some(y)) => Some(merge(x, y)),
        (x, y) => y.clone().or_else(|| x.clone()),
    }
}

fn merge_override(a: &StyleOverride, b: &StyleOverride) -> StyleOverride {
    StyleOverride {
        desktop: merge_opt(&a.desktop, &b.desktop),
        tablet: merge_opt(&a.tablet, &b.tablet),
        mobile: merge_opt(&a.mobile, &b.mobile),
    }
}

/// What the generated file must import.
#[derive(Debug, Default, Clone)]
pub struct Imports {
    /// `next/image` / `astro:assets` Image.
    pub image: bool,
    /// `next/link`.
    pub link: bool,
    /// Component names.
    pub components: BTreeSet<String>,
    /// Astro: imported identifier → asset file name.
    pub astro_images: BTreeMap<String, String>,
}

/// How a component prop drives one field of a layer inside the component file.
#[derive(Debug, Clone)]
struct Binding {
    field: PropField,
    /// `props.title`
    expr: String,
}

/// Building a component's own file (or an inlined instance of it).
struct ComponentMode {
    root: String,
    bindings: BTreeMap<String, Vec<Binding>>,
    /// Node id → class lookup expression when variants change that node.
    variant_classes: BTreeMap<String, String>,
    /// Inlined instances print the root's classes as a plain string.
    inline: bool,
}

/// Builds elements and collects canvas CSS, imports and used assets on the way.
pub struct Builder<'a> {
    pub project: &'a Project,
    pub flavor: Flavor,
    pub classes: BTreeMap<String, String>,
    pub css: BTreeMap<String, NodeCss>,
    /// Canvas CSS of component layers per instance (see `Output::instance_css`).
    pub instance_css: BTreeMap<String, BTreeMap<String, NodeCss>>,
    pub asset_names: BTreeMap<String, String>,
    pub imports: Imports,
    pub assets_used: RefCell<BTreeSet<(String, AssetUse)>>,
    /// Overrides applied to component layers rendered inline (variant, props, instance).
    overlay: BTreeMap<String, NodeOverride>,
    component: Option<ComponentMode>,
    /// Classes the instance adds to an inlined component's root.
    inline_outer: Option<String>,
}

/// An image's `src` attribute, its intrinsic size (assets) and the prop it comes from.
type ImageSrc = (Attr, Option<(u32, u32)>, Option<String>);

enum Href {
    Static(String),
    Expr(String),
}

impl<'a> Builder<'a> {
    pub fn new(project: &'a Project, flavor: Flavor, classes: BTreeMap<String, String>) -> Self {
        Builder {
            project,
            flavor,
            classes,
            css: BTreeMap::new(),
            instance_css: BTreeMap::new(),
            asset_names: asset_file_names(project),
            imports: Imports::default(),
            assets_used: RefCell::new(BTreeSet::new()),
            overlay: BTreeMap::new(),
            component: None,
            inline_outer: None,
        }
    }

    /// Assets this file used, with where each must be placed.
    pub fn take_assets(&self) -> BTreeSet<(String, AssetUse)> {
        self.assets_used.take()
    }

    fn style_of(&self, id: &str, n: &Node) -> Style {
        match self.overlay.get(id).and_then(|o| o.style.as_ref()) {
            Some(o) => apply_override(n.style(), o),
            None => n.style().clone(),
        }
    }

    fn hidden_of(&self, id: &str, n: &Node) -> Option<Hidden> {
        merge_hidden(
            n.hidden(),
            self.overlay.get(id).and_then(|o| o.hidden.as_ref()),
        )
    }

    /// Per-breakpoint style inputs of a node with `style`, placed in `parent`.
    fn inputs(
        &self,
        n: &Node,
        style: &Style,
        hidden: Option<&Hidden>,
        parent: Option<(&str, &Node)>,
    ) -> Result<Vec<(Bp, BpInput)>, CompileError> {
        let bps = &self.project.breakpoints;
        let parents = parent.map(|(pid, p)| effective(&self.style_of(pid, p), bps));
        let children: Vec<Vec<(Bp, Props)>> = n
            .children()
            .iter()
            .map(|c| node(self.project, c).map(|cn| effective(&self.style_of(c, cn), bps)))
            .collect::<Result<_, _>>()?;
        Ok(effective(style, bps)
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
                        hidden: hidden_at(hidden, bp),
                        parent,
                        has_absolute_child,
                    },
                )
            })
            .collect())
    }

    fn styled(
        &self,
        n: &Node,
        style: &Style,
        hidden: Option<&Hidden>,
        parent: Option<(&str, &Node)>,
        filter: SlotFilter,
    ) -> Result<(Vec<String>, NodeCss), CompileError> {
        let inputs = self.inputs(n, style, hidden, parent)?;
        let assets = PublicAssets {
            names: &self.asset_names,
            used: &self.assets_used,
        };
        let env = Env {
            vars: &self.project.variables,
            assets: &assets,
        };
        let s = style_element(&inputs, NodeInfo { tag: n.tag() }, &env, filter);
        Ok((s.classes, s.css))
    }

    fn is_component_root(&self, id: &str) -> bool {
        self.component.as_ref().is_some_and(|c| c.root == id)
    }

    /// The class attribute of a layer: code class first, then utilities, then fixed extras
    /// (PRD F27). Component files look classes up by variant and append the instance's.
    fn class_attr(
        &mut self,
        id: &str,
        n: &Node,
        parent: Option<(&str, &Node)>,
        extra: &[(&str, &'static str, &str)],
    ) -> Result<Attr, CompileError> {
        let style = self.style_of(id, n);
        let hidden = self.hidden_of(id, n);
        let root = self.is_component_root(id);
        let filter = if root {
            SlotFilter::Inner
        } else {
            SlotFilter::All
        };
        let (classes, mut css) = self.styled(n, &style, hidden.as_ref(), parent, filter)?;
        let mut list = vec![self.classes.get(id).cloned().unwrap_or_default()];
        list.extend(classes);
        for (class, prop, value) in extra {
            list.push((*class).to_string());
            if !css.desktop.is_empty() {
                css.desktop.push(' ');
            }
            css.desktop.push_str(&format!("{prop}: {value};"));
        }
        self.css.entry(id.to_string()).or_insert(css);
        let list = list.join(" ");
        let name = self.flavor.class_attr();

        let Some(cm) = &self.component else {
            return Ok(Attr::str(name, list));
        };
        if cm.inline {
            return Ok(match (&self.inline_outer, root) {
                (Some(outer), true) => Attr::str(name, format!("{list} {outer}")),
                _ => Attr::str(name, list),
            });
        }
        let lookup = cm.variant_classes.get(id);
        if root {
            let inner = match lookup {
                Some(expr) => format!("${{{expr} ?? {}}}", js_string(&list)),
                None => list.replace('`', "\\`"),
            };
            return Ok(Attr::expr(
                name,
                format!("`{inner} ${{{}}}`", self.flavor.class_prop()),
            ));
        }
        Ok(match lookup {
            Some(expr) => Attr::expr(name, format!("{expr} ?? {}", js_string(&list))),
            None => Attr::str(name, list),
        })
    }

    fn binding(&self, id: &str, field: PropField) -> Option<String> {
        self.component
            .as_ref()?
            .bindings
            .get(id)?
            .iter()
            .find(|b| b.field == field)
            .map(|b| b.expr.clone())
    }

    /// The element for `id`, wrapped in a condition when a prop controls whether it renders
    /// (a boolean visibility prop, or an image prop that may be empty).
    pub fn child(&mut self, id: &str, parent: Option<&str>) -> Result<Child, CompileError> {
        let el = self.element(id, parent)?;
        let conds: Vec<String> = [
            self.binding(id, PropField::Visible),
            self.binding(id, PropField::AssetId),
        ]
        .into_iter()
        .flatten()
        .collect();
        Ok(if conds.is_empty() {
            Child::El(el)
        } else {
            Child::Cond(conds.join(" && "), Box::new(el))
        })
    }

    pub fn element(&mut self, id: &str, parent: Option<&str>) -> Result<El, CompileError> {
        let project = self.project;
        let n = node(project, id)?;
        let parent_node = match parent {
            Some(p) => Some((p, node(project, p)?)),
            None => None,
        };
        let overlay = self.overlay.get(id).cloned().unwrap_or_default();
        match n {
            Node::Frame { children, tag, .. } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let mut el = El::new(tag.as_str()).node(id).attr(class);
                for c in children {
                    let child = self.child(c, Some(id))?;
                    el.children.push(child);
                }
                Ok(el)
            }
            Node::Text { content, tag, .. } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let mut el = El::new(tag.as_str()).node(id).attr(class);
                el.inline = true;
                let content = overlay.content.as_ref().unwrap_or(content);
                el.children = match self.binding(id, PropField::Content) {
                    Some(expr) => vec![Child::Expr(format!(
                        "{expr} ?? {}",
                        js_string(&plain_text(content))
                    ))],
                    None => self.rich_text(content),
                };
                Ok(el)
            }
            Node::Link {
                children,
                target,
                new_tab,
                aria_label,
                ..
            } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let href = match self.binding(id, PropField::Href) {
                    Some(expr) => {
                        Href::Expr(format!("{expr} ?? {}", js_string(&self.href(target))))
                    }
                    None => Href::Static(self.href(target)),
                };
                let mut el = self.anchor(&href, *new_tab).node(id).attr(class);
                if let Some(label) = aria_label {
                    el = el.attr(Attr::str("aria-label", label.clone()));
                }
                for c in children {
                    let child = self.child(c, Some(id))?;
                    el.children.push(child);
                }
                Ok(el)
            }
            Node::Image {
                asset_id,
                alt,
                decorative,
                fit,
                tag,
                ..
            } => {
                let asset_id = match &overlay.asset_id {
                    Some(a) => a.clone(),
                    None => asset_id.clone(),
                };
                let alt = if *decorative {
                    String::new()
                } else {
                    overlay.alt.clone().unwrap_or_else(|| alt.clone())
                };
                self.image(id, n, parent_node, *tag, asset_id.as_deref(), &alt, *fit)
            }
            Node::Icon {
                svg: Some(svg),
                tag,
                ..
            } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let mut root = El::new("svg")
                    .attr(Attr::str("xmlns", "http://www.w3.org/2000/svg"))
                    .attr(Attr::str("viewBox", svg.view_box.clone()))
                    .attr(Attr::str(self.flavor.class_attr(), "block size-full"));
                for el in &svg.body {
                    root = root.child(Child::El(svg_el(el, self.flavor)));
                }
                Ok(El::new(tag.as_str())
                    .node(id)
                    .attr(class)
                    .attr(Attr::str("aria-hidden", "true"))
                    .child(Child::El(root)))
            }
            Node::Icon { set, icon, tag, .. } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let img = El::new("img")
                    .attr(Attr::str(
                        "src",
                        format!("https://api.iconify.design/{set}/{icon}.svg"),
                    ))
                    .attr(Attr::str("alt", ""))
                    .attr(Attr::str(self.flavor.class_attr(), "block size-full"));
                Ok(El::new(tag.as_str())
                    .node(id)
                    .attr(class)
                    .attr(Attr::str("aria-hidden", "true"))
                    .child(Child::El(img)))
            }
            Node::Embed {
                source, tag, name, ..
            } => {
                let class = self.class_attr(id, n, parent_node, &[])?;
                let mut el = El::new(tag.as_str()).node(id).attr(class);
                // HTML embeds render once the sanitizer exists (P6); until then the element
                // keeps its place and size in the layout.
                if let EmbedSource::Url { url } = source {
                    let title = if name.trim().is_empty() {
                        "Embedded content"
                    } else {
                        name.as_str()
                    };
                    el.children.push(Child::El(
                        El::new("iframe")
                            .attr(Attr::str("src", url.clone()))
                            .attr(Attr::str("title", title))
                            .attr(Attr::str("loading", "lazy"))
                            .attr(Attr::str(
                                self.flavor.class_attr(),
                                "block size-full border-0",
                            )),
                    ));
                }
                Ok(el)
            }
            Node::Instance {
                component_id,
                overrides,
                ..
            } => self.instance(id, n, parent_node, component_id, overrides),
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn image(
        &mut self,
        id: &str,
        n: &Node,
        parent: Option<(&str, &Node)>,
        tag: Tag,
        asset_id: Option<&str>,
        alt: &str,
        fit: ImageFit,
    ) -> Result<El, CompileError> {
        let (fit_class, fit_css) = match fit {
            ImageFit::Fill | ImageFit::Crop => ("object-cover", "cover"),
            ImageFit::Fit => ("object-contain", "contain"),
            ImageFit::Tile => ("object-none", "none"),
        };
        // The source: a component prop, an uploaded asset, or nothing (placeholder).
        let src: Option<ImageSrc> = if let Some(expr) = self.binding(id, PropField::AssetId) {
            let src = match self.flavor {
                Flavor::Next => Attr::expr("src", format!("{expr}.src")),
                Flavor::Astro => Attr::expr("src", expr.clone()),
            };
            Some((src, None, Some(expr)))
        } else {
            asset_id
                .and_then(|a| {
                    let file = self.asset_names.get(a)?.clone();
                    let meta = self.project.assets.get(a)?;
                    Some((a.to_string(), file, meta.width, meta.height))
                })
                .map(|(asset, file, w, h)| (self.asset_src(&asset, &file), Some((w, h)), None))
        };

        let Some((src, size, prop)) = src else {
            // A placeholder keeps the layout until an image is chosen.
            let class = self.class_attr(
                id,
                n,
                parent,
                &[("bg-[#e5e5e5]", "background-color", "#e5e5e5")],
            )?;
            let el = El::new("div").node(id).attr(class);
            return Ok(if alt.is_empty() {
                el.attr(Attr::str("aria-hidden", "true"))
            } else {
                el.attr(Attr::str("role", "img"))
                    .attr(Attr::str("aria-label", alt))
            });
        };
        self.imports.image = true;
        let mut img = El::new("Image").attr(src).attr(Attr::str("alt", alt));
        if self.flavor == Flavor::Next {
            img = match (size, prop) {
                (Some((w, h)), _) => img
                    .attr(Attr::expr("width", w.to_string()))
                    .attr(Attr::expr("height", h.to_string())),
                (None, Some(p)) => img
                    .attr(Attr::expr("width", format!("{p}.width")))
                    .attr(Attr::expr("height", format!("{p}.height"))),
                (None, None) => img,
            };
        }
        if tag == Tag::Img {
            let class = self.class_attr(id, n, parent, &[(fit_class, "object-fit", fit_css)])?;
            return Ok(img.attr(class).node(id));
        }
        // <figure>/<picture>: the wrapper takes the layout and the image fills it.
        let class = self.class_attr(id, n, parent, &[])?;
        let inner = img.attr(Attr::str(
            self.flavor.class_attr(),
            format!("size-full {fit_class}"),
        ));
        Ok(El::new(tag.as_str())
            .node(id)
            .attr(class)
            .child(Child::El(inner)))
    }

    /// The `src` of an uploaded asset, recording where the build must put the file.
    fn asset_src(&mut self, asset_id: &str, file: &str) -> Attr {
        match self.flavor {
            Flavor::Next => {
                self.assets_used
                    .borrow_mut()
                    .insert((asset_id.to_string(), AssetUse::Public));
                Attr::str("src", format!("/assets/{file}"))
            }
            Flavor::Astro => {
                self.assets_used
                    .borrow_mut()
                    .insert((asset_id.to_string(), AssetUse::Src));
                let ident = image_ident(file);
                self.imports
                    .astro_images
                    .insert(ident.clone(), file.to_string());
                Attr::expr("src", ident)
            }
        }
    }

    fn instance(
        &mut self,
        id: &str,
        n: &Node,
        parent: Option<(&str, &Node)>,
        component_id: &str,
        overrides: &InstanceOverrides,
    ) -> Result<El, CompileError> {
        let project = self.project;
        let c = component(project, component_id)?;
        let root = node(project, &c.root)?;
        // The instance places the component: outer slots from the instance's style over the
        // component root's, plus the instance's visibility.
        let mut style = root.style().clone();
        let inst = n.style();
        style.desktop = merge(&style.desktop, &inst.desktop);
        style.tablet = merge_opt(&style.tablet, &inst.tablet);
        style.mobile = merge_opt(&style.mobile, &inst.mobile);
        let hidden = merge_hidden(root.hidden(), n.hidden());
        let (outer, css) = self.styled(n, &style, hidden.as_ref(), parent, SlotFilter::Outer)?;
        self.css.entry(id.to_string()).or_insert(css);
        let mut class = vec![self.classes.get(id).cloned().unwrap_or_default()];
        class.extend(outer);
        let class = class.join(" ");

        if !overrides.nodes.is_empty() {
            return self.inline_instance(id, c, class, overrides);
        }
        if c.variants.contains_key(&variant_key(c, &overrides.variant)) {
            self.instance_canvas_css(id, c, overrides)?;
        }

        let name = pascal(&c.name);
        self.imports.components.insert(name.clone());
        let class_prop = match self.flavor {
            Flavor::Next => "className",
            Flavor::Astro => "class",
        };
        let mut el = El::new(name).node(id).attr(Attr::str(class_prop, class));
        for vp in &c.variant_props {
            if let Some(v) = overrides.variant.get(&vp.name)
                && v != &vp.default
            {
                el = el.attr(Attr::str(&vp.name, v.clone()));
            }
        }
        for p in &c.props {
            if let Some(value) = overrides.props.get(&p.name) {
                let attr = self.prop_attr(&p.name, p.kind, value.as_ref());
                el = el.attr(attr);
            }
        }
        Ok(el)
    }

    fn prop_attr(&mut self, name: &str, kind: PropType, value: Option<&PropValue>) -> Attr {
        match (kind, value) {
            (PropType::Image, Some(PropValue::Text(asset_id))) => {
                let file = self.asset_names.get(asset_id).cloned();
                let size = self
                    .project
                    .assets
                    .get(asset_id)
                    .map(|a| (a.width, a.height));
                match (file, size) {
                    (Some(file), Some((w, h))) => {
                        let src = self.asset_src(asset_id, &file);
                        match (self.flavor, src.value) {
                            (Flavor::Next, crate::printer::AttrValue::Str(url)) => Attr::expr(
                                name,
                                format!("{{ src: {}, width: {w}, height: {h} }}", js_string(&url)),
                            ),
                            (_, crate::printer::AttrValue::Expr(ident)) => Attr::expr(name, ident),
                            _ => Attr::expr(name, "null"),
                        }
                    }
                    _ => Attr::expr(name, "null"),
                }
            }
            (_, Some(PropValue::Text(s))) => Attr::str(name, s.clone()),
            (_, Some(PropValue::Flag(b))) => Attr::expr(name, b.to_string()),
            (_, None) => Attr::expr(name, "null"),
        }
    }

    /// The canvas CSS of an imported instance's layers with its variant applied. The elements
    /// built on the way are thrown away; only the CSS is kept.
    fn instance_canvas_css(
        &mut self,
        id: &str,
        c: &Component,
        overrides: &InstanceOverrides,
    ) -> Result<(), CompileError> {
        let imports = self.imports.clone();
        let assets = self.assets_used.borrow().clone();
        self.inline_instance(id, c, String::new(), overrides)?;
        self.imports = imports;
        *self.assets_used.borrow_mut() = assets;
        Ok(())
    }

    /// The variant, prop values and layer overrides an instance applies to its component.
    fn instance_overlay(
        c: &Component,
        overrides: &InstanceOverrides,
    ) -> BTreeMap<String, NodeOverride> {
        let mut overlay: BTreeMap<String, NodeOverride> = BTreeMap::new();
        // Variant overrides, then prop values, then the instance's own layer overrides.
        if let Some(v) = c.variants.get(&variant_key(c, &overrides.variant)) {
            for (nid, so) in v {
                overlay.entry(nid.clone()).or_default().style = Some(so.clone());
            }
        }
        for p in &c.props {
            let value = match overrides.props.get(&p.name) {
                Some(v) => v.clone(),
                None => p.default.clone(),
            };
            let o = overlay.entry(p.target.node_id.clone()).or_default();
            match (p.target.field, value) {
                (PropField::Content, Some(PropValue::Text(t))) => {
                    o.content = Some(vec![TextSpan {
                        text: t,
                        bold: None,
                        italic: None,
                        underline: None,
                        href: None,
                    }]);
                }
                (PropField::AssetId, v) => {
                    o.asset_id = Some(match v {
                        Some(PropValue::Text(a)) => Some(a),
                        _ => None,
                    });
                }
                (PropField::Visible, Some(PropValue::Flag(false))) => {
                    o.hidden = Some(Hidden {
                        desktop: Some(true),
                        tablet: None,
                        mobile: None,
                    });
                }
                _ => {}
            }
        }
        for (nid, no) in &overrides.nodes {
            let o = overlay.entry(nid.clone()).or_default();
            if let Some(s) = &no.style {
                o.style = Some(match &o.style {
                    Some(prev) => merge_override(prev, s),
                    None => s.clone(),
                });
            }
            if no.content.is_some() {
                o.content = no.content.clone();
            }
            if no.asset_id.is_some() {
                o.asset_id = no.asset_id.clone();
            }
            if no.alt.is_some() {
                o.alt = no.alt.clone();
            }
            if no.hidden.is_some() {
                o.hidden = no.hidden.clone();
            }
        }
        overlay
    }

    /// An instance with per-layer overrides is rendered in place: the component's layers with
    /// the selected variant, the props and the overrides applied.
    fn inline_instance(
        &mut self,
        id: &str,
        c: &Component,
        outer_class: String,
        overrides: &InstanceOverrides,
    ) -> Result<El, CompileError> {
        let project = self.project;
        let overlay = Self::instance_overlay(c, overrides);
        let classes = code_classes(project, &c.root, Some(&component_block(c)))?;
        let saved = (
            std::mem::replace(&mut self.classes, classes),
            std::mem::replace(&mut self.overlay, overlay),
            self.component.take(),
            self.inline_outer.replace(outer_class),
        );
        // Inlined layers share ids with the component's own file: their canvas CSS for this
        // instance goes to `instance_css`, scoped under the instance by the renderer.
        let mut root = self.element_inline(id, c)?;
        root.node = Some(id.to_string());
        self.classes = saved.0;
        self.overlay = saved.1;
        self.component = saved.2;
        self.inline_outer = saved.3;
        Ok(root)
    }

    fn element_inline(&mut self, instance: &str, c: &Component) -> Result<El, CompileError> {
        self.component = Some(ComponentMode {
            root: c.root.clone(),
            bindings: BTreeMap::new(),
            variant_classes: BTreeMap::new(),
            inline: true,
        });
        let css_before = std::mem::take(&mut self.css);
        let el = self.element(&c.root, None);
        let css = std::mem::replace(&mut self.css, css_before);
        self.instance_css.entry(instance.to_string()).or_insert(css);
        el
    }

    fn href(&self, target: &LinkTarget) -> String {
        match target {
            LinkTarget::Url { href } => href.clone(),
            LinkTarget::Page { page_id } => self
                .project
                .pages
                .iter()
                .find(|p| &p.id == page_id)
                .map_or_else(|| "/".to_string(), |p| p.path.clone()),
        }
    }

    /// `<Link>` for internal paths in Next.js, `<a>` otherwise.
    fn anchor(&mut self, href: &Href, new_tab: bool) -> El {
        let internal = match href {
            Href::Static(h) => h.starts_with('/'),
            Href::Expr(_) => true,
        };
        let tag = if self.flavor == Flavor::Next && internal {
            self.imports.link = true;
            "Link"
        } else {
            "a"
        };
        let mut el = El::new(tag).attr(match href {
            Href::Static(h) => Attr::str("href", h.clone()),
            Href::Expr(e) => Attr::expr("href", e.clone()),
        });
        if new_tab {
            el = el
                .attr(Attr::str("target", "_blank"))
                .attr(Attr::str("rel", "noopener noreferrer"));
        }
        el
    }

    /// Rich text runs as inline children; newlines become `<br />`.
    fn rich_text(&mut self, spans: &[TextSpan]) -> Vec<Child> {
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
                let mut a = self.anchor(&Href::Static(href.clone()), false);
                a.inline = true;
                a.children = parts;
                parts = vec![Child::El(a)];
            }
            out.extend(parts);
        }
        out
    }

    /// Builds a component's own file: props bound to layers, variants as class lookups.
    pub fn component_tree(&mut self, c: &Component) -> Result<ComponentTree, CompileError> {
        let project = self.project;
        self.classes = code_classes(project, &c.root, Some(&component_block(c)))?;
        let mut bindings: BTreeMap<String, Vec<Binding>> = BTreeMap::new();
        let mut prelude = Vec::new();
        let mut prop_types = Vec::new();
        for p in &c.props {
            let ts = match (p.kind, self.flavor) {
                (PropType::Text | PropType::Link, _) => "string",
                (PropType::Boolean, _) => "boolean",
                (PropType::Image, Flavor::Next) => {
                    "{ src: string; width: number; height: number } | null"
                }
                (PropType::Image, Flavor::Astro) => "ImageMetadata | null",
            };
            prop_types.push((p.name.clone(), ts.to_string()));
            let expr = match p.kind {
                PropType::Text | PropType::Link => format!("props.{}", p.name),
                PropType::Boolean => {
                    let d = !matches!(p.default, Some(PropValue::Flag(false)));
                    format!("(props.{} ?? {d})", p.name)
                }
                PropType::Image => {
                    // The component's own image is the default when the instance passes none.
                    let local = format!("{}Image", p.name);
                    let default = match &p.default {
                        Some(PropValue::Text(a)) => self.image_value(a),
                        _ => match node(project, &p.target.node_id)? {
                            Node::Image {
                                asset_id: Some(a), ..
                            } => self.image_value(a),
                            _ => "null".to_string(),
                        },
                    };
                    let n = &p.name;
                    let one =
                        format!("const {local} = props.{n} !== undefined ? props.{n} : {default};");
                    // Statements sit at 2 spaces; wrap like Prettier when too long.
                    prelude.push(if 2 + one.len() <= crate::printer::PRINT_WIDTH {
                        one
                    } else {
                        format!(
                            "const {local} =\n  props.{n} !== undefined\n    ? props.{n}\n    : {default};"
                        )
                    });
                    local
                }
            };
            bindings
                .entry(p.target.node_id.clone())
                .or_default()
                .push(Binding {
                    field: p.target.field,
                    expr,
                });
        }
        self.component = Some(ComponentMode {
            root: c.root.clone(),
            bindings,
            variant_classes: BTreeMap::new(),
            inline: false,
        });
        // Class strings per variant key for every layer a variant touches.
        let mut touched: BTreeSet<&String> = BTreeSet::new();
        for v in c.variants.values() {
            touched.extend(v.keys());
        }
        let mut lookups = Vec::new();
        let mut variant_classes = BTreeMap::new();
        for nid in subtree_order(project, &c.root)? {
            if !touched.contains(&nid) {
                continue;
            }
            let n = node(project, &nid)?;
            let parent = parent_of(project, &c.root, &nid)?;
            let parent_node = match &parent {
                Some(p) => Some((p.as_str(), node(project, p)?)),
                None => None,
            };
            let filter = if nid == c.root {
                SlotFilter::Inner
            } else {
                SlotFilter::All
            };
            let mut body = String::new();
            for (key, v) in &c.variants {
                let Some(so) = v.get(&nid) else { continue };
                let style = apply_override(n.style(), so);
                let (classes, _) = self.styled(n, &style, n.hidden(), parent_node, filter)?;
                let mut list = vec![self.classes.get(&nid).cloned().unwrap_or_default()];
                list.extend(classes);
                let (k, v) = (js_string(key), js_string(&list.join(" ")));
                let one = format!("  {k}: {v},");
                if one.len() <= crate::printer::PRINT_WIDTH {
                    body.push_str(&one);
                    body.push('\n');
                } else {
                    // Prettier keeps string literals whole and moves the value down.
                    body.push_str(&format!("  {k}:\n    {v},\n"));
                }
            }
            let ident = format!(
                "{}Variants",
                camel(self.classes.get(&nid).map_or("layer", |s| s.as_str()))
            );
            lookups.push(format!(
                "const {ident}: Partial<Record<string, string>> = {{\n{body}}};"
            ));
            variant_classes.insert(nid.clone(), format!("{ident}[variant]"));
        }
        if let Some(cm) = &mut self.component {
            cm.variant_classes = variant_classes;
        }
        let root = self.element(&c.root, None)?;
        Ok(ComponentTree {
            root,
            lookups,
            prelude,
            prop_types,
        })
    }

    /// An asset as a component image value (Next.js object, Astro import), or `null`.
    fn image_value(&mut self, asset_id: &str) -> String {
        let Some(file) = self.asset_names.get(asset_id).cloned() else {
            return "null".into();
        };
        let Some((w, h)) = self
            .project
            .assets
            .get(asset_id)
            .map(|a| (a.width, a.height))
        else {
            return "null".into();
        };
        match self.asset_src(asset_id, &file).value {
            crate::printer::AttrValue::Str(url) => {
                format!("{{ src: {}, width: {w}, height: {h} }}", js_string(&url))
            }
            crate::printer::AttrValue::Expr(ident) => ident,
            crate::printer::AttrValue::Flag => "null".into(),
        }
    }
}

/// Everything needed to print a component file.
pub struct ComponentTree {
    pub root: El,
    /// `const titleVariants = {…};` declarations, in layer order.
    pub lookups: Vec<String>,
    /// Statements before the markup (image prop defaults).
    pub prelude: Vec<String>,
    /// Prop name → TypeScript type, in declaration order.
    pub prop_types: Vec<(String, String)>,
}

/// Plain text of rich text (component prop defaults).
pub fn plain_text(spans: &[TextSpan]) -> String {
    spans.iter().map(|s| s.text.as_str()).collect()
}

/// `hero-photo.jpg` → `heroPhotoJpg` (Astro image import identifier).
pub fn image_ident(file: &str) -> String {
    let c = camel(file);
    if c.is_empty() { "image".into() } else { c }
}

/// "size=large,tone=dark" for the selected values (defaults where unset), in declaration
/// order, matching the document's variant keys.
pub fn variant_key(c: &Component, selected: &BTreeMap<String, String>) -> String {
    c.variant_props
        .iter()
        .map(|vp| {
            let v = selected.get(&vp.name).unwrap_or(&vp.default);
            format!("{}={v}", vp.name)
        })
        .collect::<Vec<_>>()
        .join(",")
}

/// Layers under `root` in depth-first document order.
fn subtree_order(project: &Project, root: &str) -> Result<Vec<String>, CompileError> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_string()];
    while let Some(id) = stack.pop() {
        let n = node(project, &id)?;
        for c in n.children().iter().rev() {
            stack.push(c.clone());
        }
        out.push(id);
    }
    Ok(out)
}

fn parent_of(project: &Project, root: &str, target: &str) -> Result<Option<String>, CompileError> {
    for id in subtree_order(project, root)? {
        if node(project, &id)?.children().iter().any(|c| c == target) {
            return Ok(Some(id));
        }
    }
    Ok(None)
}

/// One shape of an inlined icon. JSX spells presentation attributes in camelCase
/// (`strokeWidth`); Astro keeps the SVG spelling. Attributes print sorted (deterministic).
fn svg_el(el: &crate::model::SvgEl, flavor: Flavor) -> El {
    let mut out = El::new(el.tag.as_str());
    for (name, value) in &el.attrs {
        let name = if flavor == Flavor::Next {
            crate::names::camel(name)
        } else {
            name.clone()
        };
        out = out.attr(Attr::str(&name, value.clone()));
    }
    for c in el.children.iter().flatten() {
        out = out.child(Child::El(svg_el(c, flavor)));
    }
    out
}
