//! Names derived from the document: layer code classes (PRD F27), identifiers, routes.

use std::collections::BTreeSet;

/// Kebab-case of `name`, ASCII letters and digits only.
pub fn kebab(name: &str) -> String {
    let mut out = String::new();
    let mut prev_lower_or_digit = false;
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            // "HeroSection" → "hero-section"
            if c.is_ascii_uppercase() && prev_lower_or_digit && !out.ends_with('-') {
                out.push('-');
            }
            out.push(c.to_ascii_lowercase());
            prev_lower_or_digit = c.is_ascii_lowercase() || c.is_ascii_digit();
        } else {
            if !out.is_empty() && !out.ends_with('-') {
                out.push('-');
            }
            prev_lower_or_digit = false;
        }
    }
    while out.ends_with('-') {
        out.pop();
    }
    out
}

/// PascalCase of `name` (ASCII), e.g. "About us" → "AboutUs".
pub fn pascal(name: &str) -> String {
    kebab(name)
        .split('-')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let mut cs = p.chars();
            match cs.next() {
                Some(f) => f.to_ascii_uppercase().to_string() + cs.as_str(),
                None => String::new(),
            }
        })
        .collect()
}

/// camelCase identifier of `name`, e.g. "Hero image" → "heroImage".
pub fn camel(name: &str) -> String {
    let p = pascal(name);
    let mut cs = p.chars();
    match cs.next() {
        Some(f) => f.to_ascii_lowercase().to_string() + cs.as_str(),
        None => String::new(),
    }
}

/// Exact class names Tailwind generates CSS for, or that are variants (PRD F27).
const RESERVED: &[&str] = &[
    "absolute",
    "antialiased",
    "block",
    "border",
    "capitalize",
    "collapse",
    "container",
    "contents",
    "dark",
    "fixed",
    "flex",
    "flow-root",
    "grid",
    "grow",
    "group",
    "hidden",
    "inline",
    "inline-block",
    "inline-flex",
    "inline-grid",
    "invisible",
    "isolate",
    "italic",
    "lowercase",
    "mobile",
    "not-italic",
    "outline",
    "overline",
    "peer",
    "relative",
    "ring",
    "rounded",
    "shadow",
    "shrink",
    "sr-only",
    "static",
    "sticky",
    "table",
    "tablet",
    "transform",
    "transition",
    "truncate",
    "underline",
    "uppercase",
    "visible",
    "blur",
    "filter",
    "grayscale",
    "invert",
    "sepia",
    "list-item",
    "line-through",
    "no-underline",
    "ordinal",
    "resize",
    "start",
    "end",
    "first",
    "last",
    "odd",
    "even",
    "open",
    "hover",
    "focus",
    "active",
    "disabled",
    "print",
    "portrait",
    "landscape",
    "rtl",
    "ltr",
];

/// Utility prefixes that turn a following keyword or number into a utility (`text-center`).
const UTILITY_PREFIXES: &[&str] = &[
    "align",
    "aspect",
    "basis",
    "bg",
    "border",
    "bottom",
    "col",
    "columns",
    "content",
    "cursor",
    "decoration",
    "divide",
    "duration",
    "ease",
    "fill",
    "flex",
    "font",
    "from",
    "gap",
    "grid",
    "h",
    "inset",
    "items",
    "justify",
    "leading",
    "left",
    "list",
    "m",
    "max",
    "mb",
    "min",
    "ml",
    "mr",
    "mt",
    "mx",
    "my",
    "object",
    "opacity",
    "order",
    "outline",
    "overflow",
    "p",
    "pb",
    "pl",
    "place",
    "pr",
    "pt",
    "px",
    "py",
    "right",
    "ring",
    "rotate",
    "rounded",
    "row",
    "scale",
    "self",
    "shadow",
    "size",
    "space",
    "stroke",
    "text",
    "to",
    "top",
    "tracking",
    "translate",
    "via",
    "w",
    "whitespace",
    "z",
];

/// Keywords that complete a utility after one of the prefixes above.
const UTILITY_KEYWORDS: &[&str] = &[
    "auto",
    "baseline",
    "between",
    "around",
    "evenly",
    "black",
    "white",
    "transparent",
    "current",
    "inherit",
    "base",
    "bold",
    "semibold",
    "medium",
    "light",
    "thin",
    "normal",
    "extrabold",
    "extralight",
    "center",
    "left",
    "right",
    "justify",
    "start",
    "end",
    "full",
    "screen",
    "fit",
    "min",
    "max",
    "none",
    "xs",
    "sm",
    "md",
    "lg",
    "xl",
    "2xl",
    "3xl",
    "4xl",
    "5xl",
    "6xl",
    "7xl",
    "8xl",
    "9xl",
    "col",
    "row",
    "wrap",
    "nowrap",
    "stretch",
    "cover",
    "contain",
    "hidden",
    "visible",
    "clip",
    "scroll",
    "px",
    "sans",
    "serif",
    "mono",
    "tight",
    "snug",
    "relaxed",
    "loose",
    "wide",
    "wider",
    "widest",
    "tighter",
    "square",
    "video",
    "lowercase",
    "uppercase",
    "ellipsis",
    "balance",
    "pretty",
    "inner",
    "reverse",
    "grow",
    "shrink",
    "initial",
    "dvh",
    "svh",
    "lvh",
];

/// True when `class` would be read by Tailwind as a utility or variant.
pub fn collides_with_tailwind(class: &str) -> bool {
    if RESERVED.contains(&class) {
        return true;
    }
    // `-mt-4`-style negatives and `bg-red-500`-style palette names.
    let parts: Vec<&str> = class.split('-').collect();
    let Some((first, rest)) = parts.split_first() else {
        return false;
    };
    if rest.is_empty() || !UTILITY_PREFIXES.contains(first) {
        return false;
    }
    let tail = rest.join("-");
    let numeric = |s: &str| !s.is_empty() && s.chars().all(|c| c.is_ascii_digit() || c == '.');
    if numeric(&tail) || UTILITY_KEYWORDS.contains(&tail.as_str()) {
        return true;
    }
    // Palette colors: `text-red-500`, `bg-slate-50`.
    rest.len() == 2 && numeric(rest[1]) && PALETTE.contains(&rest[0])
}

const PALETTE: &[&str] = &[
    "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal", "cyan", "sky", "blue",
    "indigo", "violet", "purple", "fuchsia", "pink", "rose", "slate", "gray", "zinc", "neutral",
    "stone", "mauve", "olive", "mist", "taupe",
];

/// The base code class for a layer: kebab name, or the type when the name has no letters;
/// `-el` when it would collide with Tailwind; `layer-` when it would start with a digit.
pub fn class_base(name: &str, node_type: &str) -> String {
    let mut k = kebab(name);
    if k.is_empty() {
        k = node_type.to_string();
    }
    if k.starts_with(|c: char| c.is_ascii_digit()) {
        k = format!("layer-{k}");
    }
    if collides_with_tailwind(&k) {
        k.push_str("-el");
    }
    k
}

/// Hands out unique classes within one page or component, in tree order (`hero`, `hero-2`).
#[derive(Debug, Default)]
pub struct ClassNamer {
    taken: BTreeSet<String>,
}

impl ClassNamer {
    pub fn new() -> ClassNamer {
        ClassNamer::default()
    }

    pub fn reserve(&mut self, class: &str) {
        self.taken.insert(class.to_string());
    }

    pub fn unique(&mut self, base: &str) -> String {
        if self.taken.insert(base.to_string()) {
            return base.to_string();
        }
        let mut n = 2;
        loop {
            let mut candidate = format!("{base}-{n}");
            if collides_with_tailwind(&candidate) {
                candidate = format!("{base}-el-{n}");
            }
            if self.taken.insert(candidate.clone()) {
                return candidate;
            }
            n += 1;
        }
    }
}

/// Route segments of a page path: "/" → [], "/blog/post" → ["blog", "post"].
pub fn path_segments(path: &str) -> Vec<&str> {
    path.split('/').filter(|s| !s.is_empty()).collect()
}

/// Formats a number without float noise: 16 → "16", 0.5 → "0.5", 1/3 → "0.3333".
pub fn num(v: f64) -> String {
    let r = (v * 10_000.0).round() / 10_000.0;
    if r == 0.0 {
        return "0".into();
    }
    format!("{r}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kebab_handles_spaces_case_and_symbols() {
        assert_eq!(kebab("Hero Section"), "hero-section");
        assert_eq!(kebab("HeroSection"), "hero-section");
        assert_eq!(kebab("  Call to action!! "), "call-to-action");
        assert_eq!(kebab("Café menu"), "caf-menu");
        assert_eq!(kebab("H1 title"), "h1-title");
        assert_eq!(kebab("✨"), "");
    }

    #[test]
    fn pascal_and_camel() {
        assert_eq!(pascal("about us"), "AboutUs");
        assert_eq!(pascal("PricingCard"), "PricingCard");
        assert_eq!(camel("Hero image"), "heroImage");
    }

    #[test]
    fn classes_avoid_tailwind_names() {
        assert_eq!(class_base("Container", "frame"), "container-el");
        assert_eq!(class_base("Flex", "frame"), "flex-el");
        assert_eq!(class_base("Text center", "text"), "text-center-el");
        assert_eq!(class_base("BG Red 500", "frame"), "bg-red-500-el");
        assert_eq!(class_base("Hero", "frame"), "hero");
        assert_eq!(class_base("", "text"), "text");
        assert_eq!(class_base("2024 plans", "frame"), "layer-2024-plans");
        assert_eq!(class_base("Grid", "frame"), "grid-el");
    }

    #[test]
    fn namer_numbers_duplicates_in_order() {
        let mut n = ClassNamer::new();
        assert_eq!(n.unique("card"), "card");
        assert_eq!(n.unique("card"), "card-2");
        assert_eq!(n.unique("card"), "card-3");
        // "p-2" would be a utility.
        assert_eq!(n.unique("p"), "p");
        assert_eq!(n.unique("p"), "p-el-2");
    }

    #[test]
    fn numbers_print_without_noise() {
        assert_eq!(num(16.0), "16");
        assert_eq!(num(0.1 + 0.2), "0.3");
        assert_eq!(num(-0.0), "0");
        assert_eq!(num(1.0 / 3.0), "0.3333");
    }
}
