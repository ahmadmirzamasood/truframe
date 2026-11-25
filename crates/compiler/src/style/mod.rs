//! Style engine: per-breakpoint props → Tailwind v4 classes and canvas CSS (ARCHITECTURE §6.1).
//!
//! Every style property maps to a [`Slot`]. For each breakpoint the engine computes the
//! effective (cascaded) props, turns them into one [`Decl`] per slot, and emits:
//! - desktop: every slot, as base classes;
//! - tablet / mobile: only slots whose declaration differs from the breakpoint above, with a
//!   `tablet:` / `mobile:` prefix. A slot that disappears is reset to its CSS initial value.
//!
//! The canvas CSS is generated from the same declarations, so the editor and the generated
//! site agree by construction.

mod values;

use std::collections::BTreeMap;

pub use values::Vars;
use values::*;

use crate::NodeCss;
use crate::model::{
    Align, Blend, BorderStyle, Breakpoints, Direction, Display, Fill, ImageFit, Justify, Overflow,
    Position, Props, Radius, Size, SpacingValue, Style, StyleOverride, Tag, TextAlign,
    TextDecoration, TextTransform,
};
use crate::names::{kebab, num};

/// One CSS concern of an element. The order is the output order of classes and CSS.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Slot {
    Display,
    Direction,
    Wrap,
    Align,
    Justify,
    GridCols,
    GridRows,
    Gap,
    RowGap,
    Padding,
    Position,
    Top,
    Right,
    Bottom,
    Left,
    ZIndex,
    ColSpan,
    RowSpan,
    Flex,
    AlignSelf,
    Width,
    Height,
    MinWidth,
    MaxWidth,
    MinHeight,
    MaxHeight,
    Aspect,
    Overflow,
    FontFamily,
    FontSize,
    FontWeight,
    LineHeight,
    Tracking,
    TextAlign,
    Decoration,
    Transform,
    Truncate,
    TextColor,
    Background,
    Border,
    Radius,
    Shadow,
    Opacity,
    Blend,
    Blur,
}

impl Slot {
    /// Slots that place an element in its parent. For a component's root these come from the
    /// instance (its size and position in the page), the rest from the component.
    pub fn is_outer(self) -> bool {
        matches!(
            self,
            Slot::Display
                | Slot::Position
                | Slot::Top
                | Slot::Right
                | Slot::Bottom
                | Slot::Left
                | Slot::ZIndex
                | Slot::ColSpan
                | Slot::RowSpan
                | Slot::Flex
                | Slot::AlignSelf
                | Slot::Width
                | Slot::Height
                | Slot::MinWidth
                | Slot::MaxWidth
                | Slot::MinHeight
                | Slot::MaxHeight
        )
    }
}

/// The classes and CSS declarations of one slot.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Decl {
    pub classes: Vec<String>,
    pub css: Vec<(&'static str, String)>,
    /// Emitted before this declaration when it replaces a different one on a smaller
    /// breakpoint (e.g. a gradient must drop the solid color it replaces).
    pub clear: Vec<(String, &'static str, String)>,
}

impl Decl {
    fn one(class: impl Into<String>, prop: &'static str, value: impl Into<String>) -> Decl {
        Decl {
            classes: vec![class.into()],
            css: vec![(prop, value.into())],
            clear: Vec::new(),
        }
    }
    fn push(&mut self, class: impl Into<String>, prop: &'static str, value: impl Into<String>) {
        self.classes.push(class.into());
        self.css.push((prop, value.into()));
    }
}

/// What kind of element a node renders (affects defaults and resets).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NodeInfo {
    pub tag: Tag,
}

impl NodeInfo {
    /// The display an element has without classes (after Tailwind's preflight).
    fn natural_display(self) -> (&'static str, &'static str) {
        match self.tag {
            Tag::Span | Tag::A | Tag::Label => ("inline", "inline"),
            Tag::Button => ("inline-block", "inline-block"),
            Tag::Li => ("list-item", "list-item"),
            _ => ("block", "block"),
        }
    }
}

/// The parent's layout at one breakpoint, which decides what Fill means.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ParentLayout {
    pub display: Option<Display>,
    pub direction: Direction,
}

impl ParentLayout {
    pub fn of(p: &Props) -> ParentLayout {
        ParentLayout {
            display: p.display,
            direction: p.direction.unwrap_or(Direction::Row),
        }
    }
}

/// Everything about one breakpoint the engine needs.
#[derive(Debug, Clone)]
pub struct BpInput {
    pub props: Props,
    pub hidden: bool,
    pub parent: Option<ParentLayout>,
    pub has_absolute_child: bool,
}

/// Resolves assets for image fills.
pub trait AssetUrls {
    /// Public URL of an asset used as a CSS background (`/assets/hero.png`).
    fn background_url(&self, asset_id: &str) -> Option<String>;
}

pub struct Env<'a> {
    pub vars: &'a dyn Vars,
    pub assets: &'a dyn AssetUrls,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Bp {
    Desktop,
    Tablet,
    Mobile,
}

impl Bp {
    fn prefix(self) -> &'static str {
        match self {
            Bp::Desktop => "",
            Bp::Tablet => "tablet:",
            Bp::Mobile => "mobile:",
        }
    }
}

/// Which slots to emit (component roots split them between instance and component).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SlotFilter {
    All,
    Outer,
    Inner,
}

impl SlotFilter {
    fn keeps(self, s: Slot) -> bool {
        match self {
            SlotFilter::All => true,
            SlotFilter::Outer => s.is_outer(),
            SlotFilter::Inner => !s.is_outer(),
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Styled {
    pub classes: Vec<String>,
    pub css: NodeCss,
}

/// Props of `over` replace those of `base`, field by field.
pub fn merge(base: &Props, over: &Props) -> Props {
    macro_rules! m {
        ($($f:ident),*) => {
            Props { $($f: over.$f.clone().or_else(|| base.$f.clone()),)* }
        };
    }
    m!(
        display,
        direction,
        wrap,
        align,
        justify,
        gap,
        row_gap,
        grid_columns,
        grid_rows,
        column_span,
        row_span,
        padding,
        width,
        height,
        min_width,
        max_width,
        min_height,
        max_height,
        aspect_ratio,
        position,
        top,
        right,
        bottom,
        left,
        z_index,
        overflow,
        font,
        font_family,
        font_weight,
        font_size,
        line_height,
        letter_spacing,
        text_align,
        text_decoration,
        text_transform,
        truncate,
        text_color,
        fill,
        border,
        radius,
        shadows,
        opacity,
        blend,
        blur
    )
}

/// Applies a style override (component variant, instance override) on top of a style.
pub fn apply_override(style: &Style, o: &StyleOverride) -> Style {
    let mut s = style.clone();
    if let Some(d) = &o.desktop {
        s.desktop = merge(&s.desktop, d);
    }
    if let Some(t) = &o.tablet {
        s.tablet = Some(merge(s.tablet.as_ref().unwrap_or(&Props::default()), t));
    }
    if let Some(m) = &o.mobile {
        s.mobile = Some(merge(s.mobile.as_ref().unwrap_or(&Props::default()), m));
    }
    s
}

/// The breakpoints that exist, widest first, with each one's effective props.
pub fn effective(style: &Style, bps: &Breakpoints) -> Vec<(Bp, Props)> {
    let mut out = vec![(Bp::Desktop, style.desktop.clone())];
    let mut current = style.desktop.clone();
    if bps.tablet.is_some() {
        if let Some(t) = &style.tablet {
            current = merge(&current, t);
        }
        out.push((Bp::Tablet, current.clone()));
    }
    if bps.mobile.is_some() {
        if let Some(m) = &style.mobile {
            current = merge(&current, m);
        }
        out.push((Bp::Mobile, current));
    }
    out
}

/// Styles one element from its per-breakpoint inputs (widest first, desktop required).
pub fn style_element(
    inputs: &[(Bp, BpInput)],
    node: NodeInfo,
    env: &Env,
    filter: SlotFilter,
) -> Styled {
    let mut styled = Styled::default();
    let mut prev: Option<BTreeMap<Slot, Decl>> = None;
    for (bp, input) in inputs {
        let mut decls = decls(input, env);
        decls.retain(|s, _| filter.keeps(*s));
        let mut css = Vec::new();
        match &prev {
            None => {
                for d in decls.values() {
                    styled.classes.extend(d.classes.iter().cloned());
                    css.extend(d.css.iter().map(|(p, v)| (*p, v.clone())));
                }
            }
            Some(before) => {
                let mut slots: Vec<Slot> = before.keys().chain(decls.keys()).copied().collect();
                slots.sort();
                slots.dedup();
                for slot in slots {
                    let (old, new) = (before.get(&slot), decls.get(&slot));
                    if old == new {
                        continue;
                    }
                    let d = match new {
                        Some(d) => {
                            for (class, prop, value) in &d.clear {
                                styled.classes.push(format!("{}{class}", bp.prefix()));
                                css.push((*prop, value.clone()));
                            }
                            d.clone()
                        }
                        None => reset(slot, node),
                    };
                    styled
                        .classes
                        .extend(d.classes.iter().map(|c| format!("{}{c}", bp.prefix())));
                    css.extend(d.css.iter().map(|(p, v)| (*p, v.clone())));
                }
            }
        }
        let text = css
            .iter()
            .map(|(p, v)| format!("{p}: {v};"))
            .collect::<Vec<_>>()
            .join(" ");
        match bp {
            Bp::Desktop => styled.css.desktop = text,
            Bp::Tablet => styled.css.tablet = (!text.is_empty()).then_some(text),
            Bp::Mobile => styled.css.mobile = (!text.is_empty()).then_some(text),
        }
        prev = Some(decls);
    }
    styled
}

/// The declaration that undoes a slot (its CSS initial value).
pub fn reset(slot: Slot, node: NodeInfo) -> Decl {
    match slot {
        Slot::Display => {
            let (class, value) = node.natural_display();
            Decl::one(class, "display", value)
        }
        Slot::Direction => Decl::one("flex-row", "flex-direction", "row"),
        Slot::Wrap => Decl::one("flex-nowrap", "flex-wrap", "nowrap"),
        Slot::Align => Decl::one("items-stretch", "align-items", "stretch"),
        Slot::Justify => Decl::one("justify-start", "justify-content", "flex-start"),
        Slot::GridCols => Decl::one("grid-cols-none", "grid-template-columns", "none"),
        Slot::GridRows => Decl::one("grid-rows-none", "grid-template-rows", "none"),
        Slot::Gap => Decl::one("gap-0", "gap", "0px"),
        Slot::RowGap => Decl::one("gap-y-0", "row-gap", "0px"),
        Slot::Padding => Decl::one("p-0", "padding", "0px"),
        Slot::Position => Decl::one("static", "position", "static"),
        Slot::Top => Decl::one("top-auto", "top", "auto"),
        Slot::Right => Decl::one("right-auto", "right", "auto"),
        Slot::Bottom => Decl::one("bottom-auto", "bottom", "auto"),
        Slot::Left => Decl::one("left-auto", "left", "auto"),
        Slot::ZIndex => Decl::one("z-auto", "z-index", "auto"),
        Slot::ColSpan => Decl::one("col-auto", "grid-column", "auto"),
        Slot::RowSpan => Decl::one("row-auto", "grid-row", "auto"),
        Slot::Flex => Decl::one("flex-initial", "flex", "0 1 auto"),
        Slot::AlignSelf => Decl::one("self-auto", "align-self", "auto"),
        Slot::Width => Decl::one("w-auto", "width", "auto"),
        Slot::Height => Decl::one("h-auto", "height", "auto"),
        Slot::MinWidth => Decl::one("min-w-0", "min-width", "0px"),
        Slot::MaxWidth => Decl::one("max-w-none", "max-width", "none"),
        Slot::MinHeight => Decl::one("min-h-0", "min-height", "0px"),
        Slot::MaxHeight => Decl::one("max-h-none", "max-height", "none"),
        Slot::Aspect => Decl::one("aspect-auto", "aspect-ratio", "auto"),
        Slot::Overflow => Decl::one("overflow-visible", "overflow", "visible"),
        Slot::FontFamily => Decl::one("[font-family:inherit]", "font-family", "inherit"),
        Slot::FontSize => Decl::one("[font-size:inherit]", "font-size", "inherit"),
        Slot::FontWeight => Decl::one("[font-weight:inherit]", "font-weight", "inherit"),
        Slot::LineHeight => Decl::one("[line-height:inherit]", "line-height", "inherit"),
        Slot::Tracking => Decl::one("[letter-spacing:inherit]", "letter-spacing", "inherit"),
        Slot::TextAlign => Decl::one("text-start", "text-align", "start"),
        Slot::Decoration => Decl::one("no-underline", "text-decoration-line", "none"),
        Slot::Transform => Decl::one("normal-case", "text-transform", "none"),
        Slot::Truncate => {
            let mut d = Decl::one("overflow-visible", "overflow", "visible");
            d.push("text-clip", "text-overflow", "clip");
            d.push("whitespace-normal", "white-space", "normal");
            d
        }
        Slot::TextColor => Decl::one("text-inherit", "color", "inherit"),
        Slot::Background => {
            let mut d = Decl::one("bg-transparent", "background-color", "transparent");
            d.push("bg-none", "background-image", "none");
            d
        }
        Slot::Border => Decl::one("border-0", "border-width", "0px"),
        Slot::Radius => Decl::one("rounded-none", "border-radius", "0px"),
        Slot::Shadow => Decl::one("shadow-none", "box-shadow", "0 0 #0000"),
        Slot::Opacity => Decl::one("opacity-100", "opacity", "1"),
        Slot::Blend => Decl::one("mix-blend-normal", "mix-blend-mode", "normal"),
        Slot::Blur => Decl::one("blur-none", "filter", "none"),
    }
}

/// The declarations of one breakpoint, by slot.
pub fn decls(input: &BpInput, env: &Env) -> BTreeMap<Slot, Decl> {
    let p = &input.props;
    let vars = env.vars;
    let mut out: BTreeMap<Slot, Decl> = BTreeMap::new();
    let mut put = |slot: Slot, d: Decl| {
        out.insert(slot, d);
    };

    // Display and visibility
    if input.hidden {
        put(Slot::Display, Decl::one("hidden", "display", "none"));
    } else {
        match p.display {
            Some(Display::Stack) => put(Slot::Display, Decl::one("flex", "display", "flex")),
            Some(Display::Grid) => put(Slot::Display, Decl::one("grid", "display", "grid")),
            None => {}
        }
    }

    // Auto layout
    let stack = p.display == Some(Display::Stack);
    let grid = p.display == Some(Display::Grid);
    if stack && p.direction == Some(Direction::Column) {
        put(
            Slot::Direction,
            Decl::one("flex-col", "flex-direction", "column"),
        );
    }
    if stack && p.wrap == Some(true) {
        put(Slot::Wrap, Decl::one("flex-wrap", "flex-wrap", "wrap"));
    }
    if stack || grid {
        if let Some(a) = p.align {
            let (c, v) = match a {
                Align::Start => ("items-start", "flex-start"),
                Align::Center => ("items-center", "center"),
                Align::End => ("items-end", "flex-end"),
                Align::Stretch => ("items-stretch", "stretch"),
                Align::Baseline => ("items-baseline", "baseline"),
            };
            put(Slot::Align, Decl::one(c, "align-items", v));
        }
        if let Some(j) = p.justify {
            let (c, v) = match j {
                Justify::Start => ("justify-start", "flex-start"),
                Justify::Center => ("justify-center", "center"),
                Justify::End => ("justify-end", "flex-end"),
                Justify::Between => ("justify-between", "space-between"),
                Justify::Around => ("justify-around", "space-around"),
                Justify::Evenly => ("justify-evenly", "space-evenly"),
            };
            put(Slot::Justify, Decl::one(c, "justify-content", v));
        }
        if let Some(g) = &p.gap {
            let (c, v) = spacing("gap", g, vars);
            put(Slot::Gap, Decl::one(c, "gap", v));
        }
        if let Some(g) = &p.row_gap {
            let (c, v) = spacing("gap-y", g, vars);
            put(Slot::RowGap, Decl::one(c, "row-gap", v));
        }
    }
    if grid {
        if let Some(n) = p.grid_columns {
            put(
                Slot::GridCols,
                Decl::one(
                    format!("grid-cols-{n}"),
                    "grid-template-columns",
                    format!("repeat({n}, minmax(0, 1fr))"),
                ),
            );
        }
        if let Some(n) = p.grid_rows {
            put(
                Slot::GridRows,
                Decl::one(
                    format!("grid-rows-{n}"),
                    "grid-template-rows",
                    format!("repeat({n}, minmax(0, 1fr))"),
                ),
            );
        }
    }
    if let Some(pad) = &p.padding {
        put(Slot::Padding, padding(pad, vars));
    }

    // Position
    let absolute = p.position == Some(Position::Absolute);
    if absolute {
        put(
            Slot::Position,
            Decl::one("absolute", "position", "absolute"),
        );
    } else if input.has_absolute_child {
        put(
            Slot::Position,
            Decl::one("relative", "position", "relative"),
        );
    }
    for (slot, v, prefix) in [
        (Slot::Top, p.top, "top"),
        (Slot::Right, p.right, "right"),
        (Slot::Bottom, p.bottom, "bottom"),
        (Slot::Left, p.left, "left"),
    ] {
        if let Some(v) = v {
            let (c, css) = offset(prefix, v);
            let prop = match slot {
                Slot::Top => "top",
                Slot::Right => "right",
                Slot::Bottom => "bottom",
                _ => "left",
            };
            put(slot, Decl::one(c, prop, css));
        }
    }
    if let Some(z) = p.z_index {
        let c = if z < 0 {
            format!("-z-{}", -z)
        } else {
            format!("z-{z}")
        };
        put(Slot::ZIndex, Decl::one(c, "z-index", z.to_string()));
    }
    let parent_grid = input
        .parent
        .is_some_and(|pl| pl.display == Some(Display::Grid));
    if parent_grid {
        if let Some(n) = p.column_span {
            put(
                Slot::ColSpan,
                Decl::one(
                    format!("col-span-{n}"),
                    "grid-column",
                    format!("span {n} / span {n}"),
                ),
            );
        }
        if let Some(n) = p.row_span {
            put(
                Slot::RowSpan,
                Decl::one(
                    format!("row-span-{n}"),
                    "grid-row",
                    format!("span {n} / span {n}"),
                ),
            );
        }
    }

    // Size
    let flex_parent = input
        .parent
        .filter(|pl| pl.display == Some(Display::Stack) && !absolute);
    let (main, cross) = match flex_parent.map(|pl| pl.direction) {
        Some(Direction::Row) => (p.width.as_ref(), p.height.as_ref()),
        Some(Direction::Column) => (p.height.as_ref(), p.width.as_ref()),
        None => (None, None),
    };
    if flex_parent.is_some() {
        match main {
            Some(Size::Fill) => put(Slot::Flex, Decl::one("flex-1", "flex", "1 1 0%")),
            Some(_) => put(Slot::Flex, Decl::one("flex-none", "flex", "none")),
            None => {}
        }
        if let Some(Size::Fill) = cross {
            put(
                Slot::AlignSelf,
                Decl::one("self-stretch", "align-self", "stretch"),
            );
        }
    }
    for (slot, size, axis, prop) in [
        (Slot::Width, p.width.as_ref(), "w", "width"),
        (Slot::Height, p.height.as_ref(), "h", "height"),
    ] {
        let Some(size) = size else { continue };
        let d = match size {
            Size::Fixed { value } => {
                let (s, css) = length(*value);
                Decl::one(format!("{axis}-{s}"), prop, css)
            }
            Size::Fit => Decl::one(format!("{axis}-fit"), prop, "fit-content"),
            // In a stack, Fill is flex-1 (main axis) or self-stretch (cross axis).
            Size::Fill if flex_parent.is_some() => continue,
            Size::Fill => Decl::one(format!("{axis}-full"), prop, "100%"),
        };
        put(slot, d);
    }
    for (slot, v, prefix, prop) in [
        (Slot::MinWidth, p.min_width, "min-w", "min-width"),
        (Slot::MaxWidth, p.max_width, "max-w", "max-width"),
        (Slot::MinHeight, p.min_height, "min-h", "min-height"),
        (Slot::MaxHeight, p.max_height, "max-h", "max-height"),
    ] {
        if let Some(v) = v {
            let (s, css) = length(v);
            put(slot, Decl::one(format!("{prefix}-{s}"), prop, css));
        }
    }
    if let Some(r) = p.aspect_ratio {
        let c = if r == 1.0 {
            "aspect-square".to_string()
        } else if (r - 16.0 / 9.0).abs() < 1e-3 {
            "aspect-video".to_string()
        } else {
            format!("aspect-[{}]", num(r))
        };
        let css = if c == "aspect-video" {
            "16 / 9".to_string()
        } else {
            num(r)
        };
        put(Slot::Aspect, Decl::one(c, "aspect-ratio", css));
    }
    if let Some(o) = p.overflow {
        let (c, v) = match o {
            Overflow::Visible => ("overflow-visible", "visible"),
            Overflow::Clip => ("overflow-clip", "clip"),
        };
        put(Slot::Overflow, Decl::one(c, "overflow", v));
    }

    // Typography: a bound text style supplies each part unless the layer sets it itself.
    let font_var = p.font.as_ref().map(|r| var_name(vars, &r.var).to_string());
    if let Some(family) = &p.font_family {
        let slug = family_slug(family);
        put(
            Slot::FontFamily,
            Decl::one(
                format!("font-(family-name:--tf-font-{slug})"),
                "font-family",
                format!("var(--tf-font-{slug}, {})", family_css(family)),
            ),
        );
    } else if let Some(v) = &font_var {
        put(
            Slot::FontFamily,
            Decl::one(
                format!("font-(family-name:{v}-family)"),
                "font-family",
                format!("var({v}-family)"),
            ),
        );
    }
    let line_height_set = p.line_height.is_some() || font_var.is_some();
    if let Some(size) = p.font_size {
        let named = TEXT_SIZES.iter().find(|(px, ..)| *px == size);
        let d = match named {
            Some((_, name, rem, lh)) => {
                let mut d = Decl::one(format!("text-{name}"), "font-size", *rem);
                if !line_height_set {
                    d.css.push(("line-height", (*lh).to_string()));
                }
                d
            }
            None => Decl::one(
                format!("text-[{}px]", num(size)),
                "font-size",
                format!("{}px", num(size)),
            ),
        };
        put(Slot::FontSize, d);
    } else if let Some(v) = &font_var {
        put(
            Slot::FontSize,
            Decl::one(
                format!("text-(length:{v}-size)"),
                "font-size",
                format!("var({v}-size)"),
            ),
        );
    }
    if let Some(w) = p.font_weight {
        put(
            Slot::FontWeight,
            Decl::one(
                format!("font-{}", weight_name(w)),
                "font-weight",
                w.to_string(),
            ),
        );
    } else if let Some(v) = &font_var {
        put(
            Slot::FontWeight,
            Decl::one(
                format!("[font-weight:var({v}-weight)]"),
                "font-weight",
                format!("var({v}-weight)"),
            ),
        );
    }
    if let Some(lh) = p.line_height {
        put(
            Slot::LineHeight,
            Decl::one(leading(lh), "line-height", num(lh)),
        );
    } else if let Some(v) = &font_var {
        put(
            Slot::LineHeight,
            Decl::one(
                format!("leading-({v}-line-height)"),
                "line-height",
                format!("var({v}-line-height)"),
            ),
        );
    }
    if let Some(ls) = p.letter_spacing {
        put(
            Slot::Tracking,
            Decl::one(tracking(ls), "letter-spacing", format!("{}em", num(ls))),
        );
    } else if let Some(v) = &font_var {
        put(
            Slot::Tracking,
            Decl::one(
                format!("tracking-({v}-letter-spacing)"),
                "letter-spacing",
                format!("var({v}-letter-spacing)"),
            ),
        );
    }
    if let Some(a) = p.text_align {
        let v = match a {
            TextAlign::Left => "left",
            TextAlign::Center => "center",
            TextAlign::Right => "right",
            TextAlign::Justify => "justify",
        };
        put(
            Slot::TextAlign,
            Decl::one(format!("text-{v}"), "text-align", v),
        );
    }
    if let Some(d) = p.text_decoration {
        let (c, v) = match d {
            TextDecoration::None => ("no-underline", "none"),
            TextDecoration::Underline => ("underline", "underline"),
            TextDecoration::LineThrough => ("line-through", "line-through"),
        };
        put(Slot::Decoration, Decl::one(c, "text-decoration-line", v));
    }
    if let Some(t) = p.text_transform {
        let (c, v) = match t {
            TextTransform::None => ("normal-case", "none"),
            TextTransform::Uppercase => ("uppercase", "uppercase"),
            TextTransform::Lowercase => ("lowercase", "lowercase"),
            TextTransform::Capitalize => ("capitalize", "capitalize"),
        };
        put(Slot::Transform, Decl::one(c, "text-transform", v));
    }
    if p.truncate == Some(true) {
        // Tailwind's `truncate`: one class, three declarations.
        let mut d = Decl::one("truncate", "overflow", "hidden");
        d.css.push(("text-overflow", "ellipsis".into()));
        d.css.push(("white-space", "nowrap".into()));
        put(Slot::Truncate, d);
    }
    if let Some(c) = &p.text_color {
        let (class, v) = color("text", c, vars, true);
        put(Slot::TextColor, Decl::one(class, "color", v));
    }

    // Appearance
    if let Some(f) = &p.fill {
        put(Slot::Background, fill(f, env));
    }
    if let Some(b) = &p.border {
        let mut d = Decl::default();
        let s = &b.sides;
        let w = border_width(b.width);
        let px = format!("{}px", num(b.width));
        if s.top && s.right && s.bottom && s.left {
            d.push(format!("border{w}"), "border-width", px);
        } else {
            for (on, side, prop) in [
                (s.top, "t", "border-top-width"),
                (s.right, "r", "border-right-width"),
                (s.bottom, "b", "border-bottom-width"),
                (s.left, "l", "border-left-width"),
            ] {
                if on {
                    d.push(format!("border-{side}{w}"), prop, px.clone());
                }
            }
            d.clear
                .push(("border-0".into(), "border-width", "0px".into()));
        }
        match b.style {
            BorderStyle::Solid => {}
            BorderStyle::Dashed => d.push("border-dashed", "border-style", "dashed"),
            BorderStyle::Dotted => d.push("border-dotted", "border-style", "dotted"),
        }
        let (c, v) = color("border", &b.color, vars, true);
        d.push(c, "border-color", v);
        put(Slot::Border, d);
    }
    if let Some(r) = &p.radius {
        let d = match r {
            Radius::All(v) => Decl::one(
                format!("rounded{}", radius(*v)),
                "border-radius",
                radius_css(*v),
            ),
            Radius::Corners(c)
                if c.top_left == c.top_right
                    && c.top_right == c.bottom_right
                    && c.bottom_right == c.bottom_left =>
            {
                Decl::one(
                    format!("rounded{}", radius(c.top_left)),
                    "border-radius",
                    radius_css(c.top_left),
                )
            }
            Radius::Corners(c) => {
                let mut d = Decl::default();
                for (v, corner, prop) in [
                    (c.top_left, "tl", "border-top-left-radius"),
                    (c.top_right, "tr", "border-top-right-radius"),
                    (c.bottom_right, "br", "border-bottom-right-radius"),
                    (c.bottom_left, "bl", "border-bottom-left-radius"),
                ] {
                    d.push(
                        format!("rounded-{corner}{}", radius(v)),
                        prop,
                        radius_css(v),
                    );
                }
                d
            }
        };
        put(Slot::Radius, d);
    }
    if let Some(shadows) = &p.shadows {
        if shadows.is_empty() {
            put(
                Slot::Shadow,
                Decl::one("shadow-none", "box-shadow", "0 0 #0000"),
            );
        } else {
            let css = shadows
                .iter()
                .map(|s| {
                    format!(
                        "{}{}px {}px {}px {}px {}",
                        if s.inset { "inset " } else { "" },
                        num(s.x),
                        num(s.y),
                        num(s.blur),
                        num(s.spread),
                        color_css(&s.color, vars)
                    )
                })
                .collect::<Vec<_>>()
                .join(", ");
            put(
                Slot::Shadow,
                Decl::one(
                    format!("shadow-[{}]", arbitrary(&css.replace(", ", ","))),
                    "box-shadow",
                    css,
                ),
            );
        }
    }
    if let Some(o) = p.opacity {
        let pct = o * 100.0;
        let c = if (pct - pct.round()).abs() < 1e-9 {
            format!("opacity-{}", num(pct))
        } else {
            format!("opacity-[{}]", num(o))
        };
        put(Slot::Opacity, Decl::one(c, "opacity", num(o)));
    }
    if let Some(b) = p.blend {
        let name = blend_name(b);
        put(
            Slot::Blend,
            Decl::one(format!("mix-blend-{name}"), "mix-blend-mode", name),
        );
    }
    if let Some(b) = p.blur {
        let c = if b == 0.0 {
            "blur-none".to_string()
        } else {
            format!("blur-[{}px]", num(b))
        };
        let css = if b == 0.0 {
            "none".to_string()
        } else {
            format!("blur({}px)", num(b))
        };
        put(Slot::Blur, Decl::one(c, "filter", css));
    }
    out
}

fn padding(pad: &crate::model::Sides<SpacingValue>, vars: &dyn Vars) -> Decl {
    let (t, r, b, l) = (&pad.top, &pad.right, &pad.bottom, &pad.left);
    let mut d = Decl::default();
    if t == r && r == b && b == l {
        let (c, v) = spacing("p", t, vars);
        d.push(c, "padding", v);
    } else if t == b && l == r {
        let (cy, vy) = spacing("py", t, vars);
        let (cx, vx) = spacing("px", l, vars);
        d.push(cx, "padding-inline", vx);
        d.push(cy, "padding-block", vy);
    } else {
        for (v, prefix, prop) in [
            (t, "pt", "padding-top"),
            (r, "pr", "padding-right"),
            (b, "pb", "padding-bottom"),
            (l, "pl", "padding-left"),
        ] {
            let (c, css) = spacing(prefix, v, vars);
            d.push(c, prop, css);
        }
    }
    d
}

fn fill(f: &Fill, env: &Env) -> Decl {
    match f {
        Fill::Solid { color: c } => {
            let (class, v) = color("bg", c, env.vars, false);
            let mut d = Decl::one(class, "background-color", v);
            d.clear
                .push(("bg-none".into(), "background-image", "none".into()));
            d
        }
        Fill::LinearGradient { angle, stops } => {
            let css = format!(
                "linear-gradient({}deg, {})",
                num(*angle),
                stops
                    .iter()
                    .map(|s| format!(
                        "{} {}%",
                        color_css(&s.color, env.vars),
                        num(s.position * 100.0)
                    ))
                    .collect::<Vec<_>>()
                    .join(", ")
            );
            let class = format!("bg-[{}]", arbitrary(&css.replace(", ", ",")));
            let mut d = Decl::one(class, "background-image", css);
            d.clear.push((
                "bg-transparent".into(),
                "background-color",
                "transparent".into(),
            ));
            d
        }
        Fill::Image { asset_id, fit } => {
            let url = env
                .assets
                .background_url(asset_id)
                .unwrap_or_else(|| "/missing.png".into());
            let mut d = Decl::one(
                format!("bg-[url({url})]"),
                "background-image",
                format!("url({url})"),
            );
            match fit {
                ImageFit::Fill | ImageFit::Crop => {
                    d.push("bg-cover", "background-size", "cover");
                    d.push("bg-center", "background-position", "center");
                    d.push("bg-no-repeat", "background-repeat", "no-repeat");
                }
                ImageFit::Fit => {
                    d.push("bg-contain", "background-size", "contain");
                    d.push("bg-center", "background-position", "center");
                    d.push("bg-no-repeat", "background-repeat", "no-repeat");
                }
                ImageFit::Tile => {
                    d.push("bg-auto", "background-size", "auto");
                    d.push("bg-repeat", "background-repeat", "repeat");
                }
            }
            d.clear.push((
                "bg-transparent".into(),
                "background-color",
                "transparent".into(),
            ));
            d
        }
    }
}

fn blend_name(b: Blend) -> &'static str {
    match b {
        Blend::Normal => "normal",
        Blend::Multiply => "multiply",
        Blend::Screen => "screen",
        Blend::Overlay => "overlay",
        Blend::Darken => "darken",
        Blend::Lighten => "lighten",
        Blend::ColorDodge => "color-dodge",
        Blend::ColorBurn => "color-burn",
        Blend::Difference => "difference",
        Blend::Exclusion => "exclusion",
        Blend::Hue => "hue",
        Blend::Saturation => "saturation",
        Blend::Color => "color",
        Blend::Luminosity => "luminosity",
    }
}

/// System font stacks that need no download; every other family is a web font.
pub const SYSTEM_FONTS: &[(&str, &str)] = &[
    ("system-ui", "system-ui, sans-serif"),
    ("sans-serif", "sans-serif"),
    ("serif", "serif"),
    ("monospace", "monospace"),
    ("Arial", "Arial, Helvetica, sans-serif"),
    ("Helvetica", "Helvetica, Arial, sans-serif"),
    ("Georgia", "Georgia, serif"),
    ("Times New Roman", "\"Times New Roman\", Times, serif"),
    ("Courier New", "\"Courier New\", Courier, monospace"),
    ("Verdana", "Verdana, sans-serif"),
    ("Tahoma", "Tahoma, sans-serif"),
    ("Trebuchet MS", "\"Trebuchet MS\", sans-serif"),
];

pub fn system_stack(family: &str) -> Option<&'static str> {
    SYSTEM_FONTS
        .iter()
        .find(|(name, _)| *name == family)
        .map(|(_, stack)| *stack)
}

/// `Playfair Display` → `playfair-display` (the `--tf-font-<slug>` variable).
pub fn family_slug(family: &str) -> String {
    let k = kebab(family);
    if k.is_empty() { "custom".into() } else { k }
}

/// The family as a CSS value (quoted name or system stack).
pub fn family_css(family: &str) -> String {
    match system_stack(family) {
        Some(stack) => stack.to_string(),
        None => format!("\"{}\"", family.replace('"', "")),
    }
}

/// Media queries of the `tablet` and `mobile` variants (ARCHITECTURE §5 breakpoint semantics).
/// Tablet applies below 1200px; mobile below the tablet width, or below 1200px without Tablet.
pub fn media(bps: &Breakpoints) -> (Option<String>, Option<String>) {
    let tablet = bps.tablet.map(|_| "(width < 1200px)".to_string());
    let mobile = bps.mobile.map(|_| {
        let w = bps.tablet.map_or(1200, |t| t.width);
        format!("(width < {w}px)")
    });
    (tablet, mobile)
}

#[cfg(test)]
mod tests;
