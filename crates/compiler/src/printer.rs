//! Deterministic printer for JSX (Next.js) and Astro templates.
//!
//! The adapters build a small element tree ([`El`]) and the printer lays it out in a
//! Prettier-compatible style: two-space indent, double quotes, 80 columns, attributes wrapped
//! one per line when the opening tag doesn't fit. Text content is never re-wrapped, so
//! whitespace inside text stays exactly as designed. While printing, the writer records the
//! byte range of every element that belongs to a design node ([`RawSpan`]).

pub const PRINT_WIDTH: usize = 80;

/// Which template syntax to print.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Syntax {
    Jsx,
    Astro,
}

#[derive(Debug, Clone, PartialEq)]
pub enum AttrValue {
    /// A plain string; quoted (and escaped) by the printer.
    Str(String),
    /// A JS expression printed inside `{…}`.
    Expr(String),
    /// A boolean attribute with no value.
    Flag,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Attr {
    pub name: String,
    pub value: AttrValue,
}

impl Attr {
    pub fn str(name: &str, value: impl Into<String>) -> Attr {
        Attr {
            name: name.to_string(),
            value: AttrValue::Str(value.into()),
        }
    }
    pub fn expr(name: &str, code: impl Into<String>) -> Attr {
        Attr {
            name: name.to_string(),
            value: AttrValue::Expr(code.into()),
        }
    }
    pub fn flag(name: &str) -> Attr {
        Attr {
            name: name.to_string(),
            value: AttrValue::Flag,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Child {
    El(El),
    /// Text that is already escaped for the target syntax ([`escape_text`]).
    Text(String),
    /// A JS expression printed inside `{…}`.
    Expr(String),
    /// `{cond && <el />}`: an element rendered only when `cond` is truthy.
    Cond(String, Box<El>),
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct El {
    pub tag: String,
    pub attrs: Vec<Attr>,
    pub children: Vec<Child>,
    /// The design node this element renders; recorded in the spans.
    pub node: Option<String>,
    /// Print children on one line with no added whitespace (text content).
    pub inline: bool,
}

impl El {
    pub fn new(tag: impl Into<String>) -> El {
        El {
            tag: tag.into(),
            ..El::default()
        }
    }
    pub fn attr(mut self, a: Attr) -> El {
        self.attrs.push(a);
        self
    }
    pub fn node(mut self, id: &str) -> El {
        self.node = Some(id.to_string());
        self
    }
    pub fn child(mut self, c: Child) -> El {
        self.children.push(c);
        self
    }
}

/// HTML void elements: always self-closing, never have children.
pub fn is_void(tag: &str) -> bool {
    matches!(
        tag,
        "area"
            | "base"
            | "br"
            | "col"
            | "embed"
            | "hr"
            | "img"
            | "input"
            | "link"
            | "meta"
            | "source"
            | "track"
            | "wbr"
    )
}

/// Components (`Image`, `PricingCard`) may self-close in Astro too; HTML elements may not.
fn is_component(tag: &str) -> bool {
    tag.starts_with(|c: char| c.is_ascii_uppercase())
}

/// Escapes text content. `{` and `}` start expressions in both JSX and Astro.
pub fn escape_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '{' => out.push_str("&#123;"),
            '}' => out.push_str("&#125;"),
            _ => out.push(c),
        }
    }
    out
}

/// A JS string literal (double quotes, JSON escaping).
pub fn js_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\u{2028}' => out.push_str("\\u2028"),
            '\u{2029}' => out.push_str("\\u2029"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}

/// A byte range of one element in the file being written.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawSpan {
    pub node: String,
    pub start: usize,
    pub end: usize,
}

/// Accumulates one output file and the spans of the elements printed into it.
#[derive(Debug, Default)]
pub struct Writer {
    pub out: String,
    pub spans: Vec<RawSpan>,
}

impl Writer {
    pub fn new() -> Writer {
        Writer::default()
    }

    pub fn push(&mut self, s: &str) {
        self.out.push_str(s);
    }

    /// Writes `indent` spaces, `s` and a newline.
    pub fn line(&mut self, indent: usize, s: &str) {
        if !s.is_empty() {
            self.indent(indent);
            self.out.push_str(s);
        }
        self.out.push('\n');
    }

    fn indent(&mut self, n: usize) {
        for _ in 0..n {
            self.out.push(' ');
        }
    }

    /// Prints `el` on its own line(s) at `indent`, followed by a newline.
    pub fn element(&mut self, el: &El, indent: usize, syntax: Syntax) {
        self.indent(indent);
        let start = self.out.len();
        self.element_body(el, indent, syntax);
        if let Some(node) = &el.node {
            self.spans.push(RawSpan {
                node: node.clone(),
                start,
                end: self.out.len(),
            });
        }
        self.out.push('\n');
    }

    fn element_body(&mut self, el: &El, indent: usize, syntax: Syntax) {
        let attrs: Vec<String> = el.attrs.iter().map(|a| attr_text(a, syntax)).collect();
        let open_flat = open_tag_flat(&el.tag, &attrs);
        let empty = el.children.is_empty();
        let void = is_void(&el.tag);
        let self_closing = empty && (void || syntax == Syntax::Jsx || is_component(&el.tag));

        if self_closing {
            let flat = format!("{} />", &open_flat[..open_flat.len() - 1]);
            if indent + flat.len() <= PRINT_WIDTH {
                self.out.push_str(&flat);
            } else {
                self.open_tag_broken(&el.tag, &attrs, indent);
                self.out.push_str("/>");
            }
            return;
        }

        let close = format!("</{}>", el.tag);
        if el.inline || empty {
            let content = inline_children(&el.children, syntax);
            let flat = format!("{open_flat}{content}{close}");
            if indent + flat.len() <= PRINT_WIDTH && !flat.contains('\n') {
                self.out.push_str(&flat);
                return;
            }
            self.open_tag(&el.tag, &attrs, &open_flat, indent);
            if !content.is_empty() {
                self.out.push('\n');
                self.indent(indent + 2);
                self.out.push_str(&content);
            }
            self.out.push('\n');
            self.indent(indent);
            self.out.push_str(&close);
            return;
        }

        self.open_tag(&el.tag, &attrs, &open_flat, indent);
        self.out.push('\n');
        for child in &el.children {
            match child {
                Child::El(c) => self.element(c, indent + 2, syntax),
                Child::Text(t) => self.line(indent + 2, t),
                Child::Expr(e) => self.line(indent + 2, &format!("{{{e}}}")),
                Child::Cond(cond, el) => self.conditional(cond, el, indent + 2, syntax),
            }
        }
        self.indent(indent);
        self.out.push_str(&close);
    }

    /// `{cond && <el />}` on one line when it fits, else Prettier's parenthesized form.
    fn conditional(&mut self, cond: &str, el: &El, indent: usize, syntax: Syntax) {
        let mut probe = Writer::new();
        probe.element(el, 0, syntax);
        let flat = probe.out.trim_end();
        let one_line = format!("{{{cond} && {flat}}}");
        if !flat.contains('\n') && indent + one_line.len() <= PRINT_WIDTH {
            self.indent(indent);
            // `{` + cond + ` && `
            let start = self.out.len() + cond.len() + 5;
            self.out.push_str(&one_line);
            self.shift_spans(&probe.spans, start);
            self.out.push('\n');
            return;
        }
        self.line(indent, &format!("{{{cond} && ("));
        self.element(el, indent + 2, syntax);
        self.line(indent, ")}");
    }

    fn shift_spans(&mut self, spans: &[RawSpan], by: usize) {
        for s in spans {
            self.spans.push(RawSpan {
                node: s.node.clone(),
                start: s.start + by,
                end: s.end + by,
            });
        }
    }

    fn open_tag(&mut self, tag: &str, attrs: &[String], flat: &str, indent: usize) {
        if indent + flat.len() <= PRINT_WIDTH {
            self.out.push_str(flat);
        } else {
            self.open_tag_broken(tag, attrs, indent);
            self.out.push('>');
        }
    }

    /// `<tag` then one attribute per line; the caller closes with `>` or `/>`.
    fn open_tag_broken(&mut self, tag: &str, attrs: &[String], indent: usize) {
        self.out.push('<');
        self.out.push_str(tag);
        for a in attrs {
            self.out.push('\n');
            self.indent(indent + 2);
            self.out.push_str(a);
        }
        self.out.push('\n');
        self.indent(indent);
    }
}

fn open_tag_flat(tag: &str, attrs: &[String]) -> String {
    let mut s = format!("<{tag}");
    for a in attrs {
        s.push(' ');
        s.push_str(a);
    }
    s.push('>');
    s
}

fn attr_text(a: &Attr, syntax: Syntax) -> String {
    match &a.value {
        AttrValue::Flag => a.name.clone(),
        AttrValue::Expr(code) => format!("{}={{{code}}}", a.name),
        AttrValue::Str(v) => match syntax {
            // JSX string attributes can't hold `"`; fall back to an expression.
            Syntax::Jsx if v.contains('"') || v.contains('\\') || v.contains('\n') => {
                format!("{}={{{}}}", a.name, js_string(v))
            }
            Syntax::Jsx => format!("{}=\"{v}\"", a.name),
            Syntax::Astro => format!(
                "{}=\"{}\"",
                a.name,
                v.replace('&', "&amp;").replace('"', "&quot;")
            ),
        },
    }
}

/// Children of an inline element printed with no added whitespace.
fn inline_children(children: &[Child], syntax: Syntax) -> String {
    let mut s = String::new();
    for c in children {
        match c {
            Child::Text(t) => s.push_str(t),
            Child::Expr(e) => {
                s.push('{');
                s.push_str(e);
                s.push('}');
            }
            Child::Cond(cond, el) => {
                s.push_str(&format!("{{{cond} && "));
                s.push_str(&inline_children(&[Child::El((**el).clone())], syntax));
                s.push('}');
            }
            Child::El(el) => {
                let attrs: Vec<String> = el.attrs.iter().map(|a| attr_text(a, syntax)).collect();
                let open = open_tag_flat(&el.tag, &attrs);
                if el.children.is_empty()
                    && (is_void(&el.tag) || syntax == Syntax::Jsx || is_component(&el.tag))
                {
                    s.push_str(&open[..open.len() - 1]);
                    s.push_str(" />");
                } else {
                    s.push_str(&open);
                    s.push_str(&inline_children(&el.children, syntax));
                    s.push_str(&format!("</{}>", el.tag));
                }
            }
        }
    }
    s
}

/// Converts a byte offset in `s` to a UTF-16 code unit offset (what JS and CodeMirror use).
pub fn utf16_offset(s: &str, byte: usize) -> usize {
    s[..byte].encode_utf16().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn print(el: &El, syntax: Syntax) -> String {
        let mut w = Writer::new();
        w.element(el, 0, syntax);
        w.out
    }

    #[test]
    fn short_elements_stay_on_one_line() {
        let el = El::new("p")
            .attr(Attr::str("className", "intro"))
            .child(Child::Text("Hello".into()));
        let el = El { inline: true, ..el };
        assert_eq!(
            print(&el, Syntax::Jsx),
            "<p className=\"intro\">Hello</p>\n"
        );
    }

    #[test]
    fn empty_elements_self_close_in_jsx_only() {
        let el = El::new("div").attr(Attr::str("class", "box"));
        assert_eq!(print(&el, Syntax::Jsx), "<div class=\"box\" />\n");
        assert_eq!(print(&el, Syntax::Astro), "<div class=\"box\"></div>\n");
        let img = El::new("img").attr(Attr::str("src", "/a.png"));
        assert_eq!(print(&img, Syntax::Astro), "<img src=\"/a.png\" />\n");
    }

    #[test]
    fn long_opening_tags_break_one_attribute_per_line() {
        let el = El::new("section")
            .attr(Attr::str("className", "a ".repeat(40).trim()))
            .attr(Attr::str("id", "x"))
            .child(Child::El(El::new("div")));
        let out = print(&el, Syntax::Jsx);
        assert!(out.starts_with("<section\n  className=\"a a"));
        assert!(out.contains("\n  id=\"x\"\n>\n  <div />\n</section>\n"));
    }

    #[test]
    fn long_inline_text_moves_to_its_own_line_without_rewrapping() {
        let text = "word ".repeat(30).trim().to_string();
        let el = El {
            inline: true,
            ..El::new("p").child(Child::Text(text.clone()))
        };
        assert_eq!(print(&el, Syntax::Jsx), format!("<p>\n  {text}\n</p>\n"));
    }

    #[test]
    fn spans_cover_whole_elements() {
        let inner = El::new("span").node("b").child(Child::Text("x".into()));
        let inner = El {
            inline: true,
            ..inner
        };
        let outer = El::new("div").node("a").child(Child::El(inner));
        let mut w = Writer::new();
        w.element(&outer, 2, Syntax::Jsx);
        let spans = w.spans.clone();
        assert_eq!(&w.out[spans[0].start..spans[0].end], "<span>x</span>");
        assert_eq!(spans[0].node, "b");
        assert!(w.out[spans[1].start..spans[1].end].starts_with("<div>"));
        assert!(w.out[spans[1].start..spans[1].end].ends_with("</div>"));
    }

    #[test]
    fn text_and_attributes_are_escaped() {
        assert_eq!(escape_text("a<b>{c}&"), "a&lt;b&gt;&#123;c&#125;&amp;");
        let el = El::new("a").attr(Attr::str("title", "say \"hi\""));
        assert_eq!(
            print(&el, Syntax::Jsx),
            "<a title={\"say \\\"hi\\\"\"} />\n"
        );
        assert_eq!(
            print(&el, Syntax::Astro),
            "<a title=\"say &quot;hi&quot;\"></a>\n"
        );
    }

    #[test]
    fn conditionals_wrap_like_prettier() {
        let short = El::new("p").node("n").child(Child::Text("Hi".into()));
        let short = El {
            inline: true,
            ..short
        };
        let el = El::new("div").child(Child::Cond("props.show".into(), Box::new(short)));
        let mut w = Writer::new();
        w.element(&el, 0, Syntax::Jsx);
        assert_eq!(
            w.out,
            "<div>
  {props.show && <p>Hi</p>}
</div>
"
        );
        let span = &w.spans[0];
        assert_eq!(&w.out[span.start..span.end], "<p>Hi</p>");

        let long = El::new("p").attr(Attr::str("className", "x".repeat(70)));
        let el = El::new("div").child(Child::Cond("props.show".into(), Box::new(long)));
        let mut w = Writer::new();
        w.element(&el, 0, Syntax::Jsx);
        assert!(w.out.starts_with(
            "<div>
  {props.show && (
    <p
"
        ));
        assert!(w.out.ends_with(
            "    />
  )}
</div>
"
        ));
    }

    #[test]
    fn utf16_offsets_count_surrogate_pairs() {
        let s = "a😀b";
        assert_eq!(utf16_offset(s, 1), 1);
        assert_eq!(utf16_offset(s, 5), 3);
    }
}
