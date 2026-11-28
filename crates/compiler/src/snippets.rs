//! Page head/body code (P6-5). Snippets are stored as allowlisted elements
//! (`packages/model/src/snippets.ts`); here they become HTML for Astro and elements for
//! Next.js, where scripts go through `next/script` so they also run after client-side
//! navigation.

use crate::model::{SnippetElement, SnippetTag};
use crate::printer::{Attr, El, js_string};

/// The elements as HTML, one per line. Must equal `printSnippet` in TypeScript.
pub fn print_html(els: &[SnippetElement]) -> String {
    els.iter()
        .map(|e| {
            let attrs: String = e
                .attrs
                .iter()
                .map(|(k, v)| {
                    if v.is_empty() {
                        format!(" {k}")
                    } else {
                        format!(
                            " {k}=\"{}\"",
                            v.replace('&', "&amp;").replace('"', "&quot;")
                        )
                    }
                })
                .collect();
            let tag = e.tag.as_str();
            if e.tag.is_void() {
                format!("<{tag}{attrs}>")
            } else {
                format!("<{tag}{attrs}>{}</{tag}>", e.text)
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

/// HTML attribute → React prop name, for the attributes snippets commonly carry. Others
/// (`data-*`, `aria-*`, lowercase names) pass through unchanged, as React allows.
fn jsx_name(name: &str) -> &str {
    match name {
        "class" => "className",
        "for" => "htmlFor",
        "charset" => "charSet",
        "http-equiv" => "httpEquiv",
        "crossorigin" => "crossOrigin",
        "referrerpolicy" => "referrerPolicy",
        "nomodule" => "noModule",
        "fetchpriority" => "fetchPriority",
        "hreflang" => "hrefLang",
        "itemprop" => "itemProp",
        "imagesrcset" => "imageSrcSet",
        "imagesizes" => "imageSizes",
        n => n,
    }
}

fn jsx_attr(name: &str, value: &str) -> Attr {
    // Only real boolean attributes become `{true}`; an empty value elsewhere stays a string
    // (`crossOrigin=""` is what the HTML means, and React types it as a string).
    if value.is_empty()
        && matches!(
            name,
            "async" | "defer" | "nomodule" | "itemscope" | "hidden"
        )
    {
        Attr::flag(jsx_name(name))
    } else {
        Attr::str(jsx_name(name), value.to_string())
    }
}

fn inner_html(text: &str) -> Attr {
    Attr::expr(
        "dangerouslySetInnerHTML",
        format!("{{ __html: {} }}", js_string(text)),
    )
}

/// A classic or module script runs through `next/script`; data scripts (JSON-LD, import
/// maps) stay plain `<script>` elements, as the Next.js docs recommend.
fn is_js(e: &SnippetElement) -> bool {
    let ty = e
        .attrs
        .iter()
        .find(|(k, _)| k == "type")
        .map(|(_, v)| v.trim().to_ascii_lowercase());
    matches!(
        ty.as_deref(),
        None | Some("") | Some("text/javascript") | Some("module") | Some("application/javascript")
    )
}

pub enum Slot {
    Head,
    Body,
}

/// Next.js elements for one slot, and whether `next/script` is needed.
pub fn next_elements(els: &[SnippetElement], slot: Slot, page_key: &str) -> (Vec<El>, bool) {
    let mut uses_script = false;
    let (prefix, strategy) = match slot {
        Slot::Head => ("head", "afterInteractive"),
        Slot::Body => ("body", "lazyOnload"),
    };
    let out = els
        .iter()
        .enumerate()
        .map(|(i, e)| {
            if e.tag == SnippetTag::Script && is_js(e) {
                uses_script = true;
                let mut el = El::new("Script");
                if !e.attrs.iter().any(|(k, _)| k == "id") {
                    el = el.attr(Attr::str("id", format!("tf-{page_key}-{prefix}-{}", i + 1)));
                }
                el = el.attr(Attr::str("strategy", strategy));
                // next/script decides when to load; async and defer don't apply.
                for (k, v) in &e.attrs {
                    if k != "async" && k != "defer" {
                        el = el.attr(jsx_attr(k, v));
                    }
                }
                if !e.text.is_empty() {
                    el = el.attr(inner_html(&e.text));
                }
                return el;
            }
            let mut el = El::new(e.tag.as_str());
            for (k, v) in &e.attrs {
                el = el.attr(jsx_attr(k, v));
            }
            if !e.tag.is_void() && !e.text.is_empty() {
                el = el.attr(inner_html(&e.text));
            }
            el
        })
        .collect();
    (out, uses_script)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn el(tag: SnippetTag, attrs: &[(&str, &str)], text: &str) -> SnippetElement {
        SnippetElement {
            tag,
            attrs: attrs
                .iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
            text: text.to_string(),
        }
    }

    #[test]
    fn prints_html_like_the_editor() {
        let els = [
            el(
                SnippetTag::Script,
                &[("async", ""), ("src", "https://a.example/x.js")],
                "",
            ),
            el(
                SnippetTag::Meta,
                &[("name", "a"), ("content", "say \"hi\"")],
                "",
            ),
        ];
        assert_eq!(
            print_html(&els),
            "<script async src=\"https://a.example/x.js\"></script>\n<meta name=\"a\" content=\"say &quot;hi&quot;\">"
        );
    }

    #[test]
    fn scripts_use_next_script_and_data_scripts_stay_plain() {
        let els = [
            el(
                SnippetTag::Script,
                &[("defer", ""), ("src", "https://p.example/s.js")],
                "",
            ),
            el(SnippetTag::Script, &[("type", "application/ld+json")], "{}"),
            el(
                SnippetTag::Meta,
                &[("http-equiv", "x"), ("content", "y")],
                "",
            ),
        ];
        let (out, uses) = next_elements(&els, Slot::Head, "home");
        assert!(uses);
        assert_eq!(out[0].tag, "Script");
        assert_eq!(out[1].tag, "script");
        assert_eq!(out[2].attrs[0].name, "httpEquiv");
    }
}
