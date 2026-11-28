//! Nodes (mirror of `packages/model/src/nodes.ts`).

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use super::style::{ImageFit, Style, StyleOverride};

/// Semantic HTML tags. Which tags a node type may use is checked by the TypeScript validator.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Tag {
    Div,
    Section,
    Header,
    Footer,
    Nav,
    Main,
    Aside,
    Article,
    Figure,
    Picture,
    Ul,
    Ol,
    Li,
    P,
    H1,
    H2,
    H3,
    H4,
    H5,
    H6,
    Span,
    Blockquote,
    Label,
    Img,
    A,
    Button,
}

impl Tag {
    pub fn as_str(self) -> &'static str {
        match self {
            Tag::Div => "div",
            Tag::Section => "section",
            Tag::Header => "header",
            Tag::Footer => "footer",
            Tag::Nav => "nav",
            Tag::Main => "main",
            Tag::Aside => "aside",
            Tag::Article => "article",
            Tag::Figure => "figure",
            Tag::Picture => "picture",
            Tag::Ul => "ul",
            Tag::Ol => "ol",
            Tag::Li => "li",
            Tag::P => "p",
            Tag::H1 => "h1",
            Tag::H2 => "h2",
            Tag::H3 => "h3",
            Tag::H4 => "h4",
            Tag::H5 => "h5",
            Tag::H6 => "h6",
            Tag::Span => "span",
            Tag::Blockquote => "blockquote",
            Tag::Label => "label",
            Tag::Img => "img",
            Tag::A => "a",
            Tag::Button => "button",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Hidden {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub desktop: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tablet: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mobile: Option<bool>,
}

/// One run of text with the same formatting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TextSpan {
    pub text: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum LinkTarget {
    Url {
        href: String,
    },
    Page {
        #[serde(rename = "pageId")]
        page_id: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum EmbedSource {
    Html { html: String },
    Url { url: String },
}

/// A component prop value: text, an image asset id (or null), a link href, or a flag.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum PropValue {
    Text(String),
    Flag(bool),
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct NodeOverride {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub style: Option<StyleOverride>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub content: Option<Vec<TextSpan>>,
    /// Absent: not overridden. `null`: overridden to "no image".
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        with = "super::double_option"
    )]
    pub asset_id: Option<Option<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub alt: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hidden: Option<Hidden>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct InstanceOverrides {
    pub variant: BTreeMap<String, String>,
    pub props: BTreeMap<String, Option<PropValue>>,
    pub nodes: BTreeMap<String, NodeOverride>,
}

/// A layer. Fields shared by every type are repeated per variant so the JSON stays flat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", deny_unknown_fields)]
pub enum Node {
    Frame {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        children: Vec<String>,
    },
    Text {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        content: Vec<TextSpan>,
    },
    Image {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        #[serde(rename = "assetId")]
        asset_id: Option<String>,
        alt: String,
        decorative: bool,
        fit: ImageFit,
    },
    Link {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        target: LinkTarget,
        #[serde(rename = "newTab")]
        new_tab: bool,
        #[serde(rename = "ariaLabel", default, skip_serializing_if = "Option::is_none")]
        aria_label: Option<String>,
        children: Vec<String>,
    },
    Icon {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        set: String,
        icon: String,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        svg: Option<IconSvg>,
    },
    Embed {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        source: EmbedSource,
    },
    Instance {
        id: String,
        name: String,
        tag: Tag,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        hidden: Option<Hidden>,
        style: Style,
        #[serde(rename = "componentId")]
        component_id: String,
        overrides: InstanceOverrides,
    },
}

impl Node {
    pub fn id(&self) -> &str {
        match self {
            Node::Frame { id, .. }
            | Node::Text { id, .. }
            | Node::Image { id, .. }
            | Node::Link { id, .. }
            | Node::Icon { id, .. }
            | Node::Embed { id, .. }
            | Node::Instance { id, .. } => id,
        }
    }

    pub fn style(&self) -> &Style {
        match self {
            Node::Frame { style, .. }
            | Node::Text { style, .. }
            | Node::Image { style, .. }
            | Node::Link { style, .. }
            | Node::Icon { style, .. }
            | Node::Embed { style, .. }
            | Node::Instance { style, .. } => style,
        }
    }

    pub fn name(&self) -> &str {
        match self {
            Node::Frame { name, .. }
            | Node::Text { name, .. }
            | Node::Image { name, .. }
            | Node::Link { name, .. }
            | Node::Icon { name, .. }
            | Node::Embed { name, .. }
            | Node::Instance { name, .. } => name,
        }
    }

    pub fn tag(&self) -> Tag {
        match self {
            Node::Frame { tag, .. }
            | Node::Text { tag, .. }
            | Node::Image { tag, .. }
            | Node::Link { tag, .. }
            | Node::Icon { tag, .. }
            | Node::Embed { tag, .. }
            | Node::Instance { tag, .. } => *tag,
        }
    }

    pub fn hidden(&self) -> Option<&Hidden> {
        match self {
            Node::Frame { hidden, .. }
            | Node::Text { hidden, .. }
            | Node::Image { hidden, .. }
            | Node::Link { hidden, .. }
            | Node::Icon { hidden, .. }
            | Node::Embed { hidden, .. }
            | Node::Instance { hidden, .. } => hidden.as_ref(),
        }
    }

    /// Children in order (frames and links only).
    pub fn children(&self) -> &[String] {
        match self {
            Node::Frame { children, .. } | Node::Link { children, .. } => children,
            _ => &[],
        }
    }
}

/// An icon's drawing as data (P5-5); tags and attributes are allowlisted by the TS validator.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct IconSvg {
    #[serde(rename = "viewBox")]
    pub view_box: String,
    pub body: Vec<SvgEl>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SvgTag {
    G,
    Path,
    Circle,
    Ellipse,
    Rect,
    Line,
    Polyline,
    Polygon,
}

impl SvgTag {
    pub fn as_str(self) -> &'static str {
        match self {
            SvgTag::G => "g",
            SvgTag::Path => "path",
            SvgTag::Circle => "circle",
            SvgTag::Ellipse => "ellipse",
            SvgTag::Rect => "rect",
            SvgTag::Line => "line",
            SvgTag::Polyline => "polyline",
            SvgTag::Polygon => "polygon",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SvgEl {
    pub tag: SvgTag,
    /// Attribute name (SVG spelling, e.g. `stroke-width`) to value.
    pub attrs: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub children: Option<Vec<SvgEl>>,
}
