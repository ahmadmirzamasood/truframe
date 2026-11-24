//! Single values → Tailwind v4 class fragments and CSS values.
//!
//! Scale classes are used when a value lands exactly on Tailwind's default theme; anything
//! else becomes an arbitrary value (`p-[13px]`). Variables become `(--css-name)` references,
//! so classes never depend on theme names a variable could collide with.

use crate::model::{ColorValue, SpacingValue, Variable};
use crate::names::num;

/// Variable lookups the style engine needs.
pub trait Vars {
    fn css_name(&self, id: &str) -> Option<&str>;
}

impl Vars for std::collections::BTreeMap<String, Variable> {
    fn css_name(&self, id: &str) -> Option<&str> {
        self.get(id).map(|v| match v {
            Variable::Color { css_name, .. }
            | Variable::Spacing { css_name, .. }
            | Variable::Font { css_name, .. } => css_name.as_str(),
        })
    }
}

/// `--missing` keeps output valid if a reference slipped past validation.
pub fn var_name<'a>(vars: &'a dyn Vars, id: &str) -> &'a str {
    vars.css_name(id).unwrap_or("--missing")
}

/// A spacing length on Tailwind's `--spacing` scale (0.25rem = 4px) when it lands on a
/// quarter or half step we print readably (even px), `px` for 1px, else arbitrary.
/// Returns (class suffix, CSS value).
pub fn length(v: f64) -> (String, String) {
    let css = format!("{}px", num(v));
    if v == 0.0 {
        return ("0".into(), "0px".into());
    }
    if v == 1.0 {
        return ("px".into(), css);
    }
    if v.fract() == 0.0 && (v as i64) % 2 == 0 {
        return (num(v / 4.0), css);
    }
    (format!("[{css}]"), css)
}

/// A signed offset: `top-4`, `-top-4`, `top-[-13px]`.
pub fn offset(prefix: &str, v: f64) -> (String, String) {
    let css = format!("{}px", num(v));
    if v < 0.0 {
        let (s, _) = length(-v);
        if s.starts_with('[') {
            return (format!("{prefix}-[{css}]"), css);
        }
        return (format!("-{prefix}-{s}"), css);
    }
    let (s, _) = length(v);
    (format!("{prefix}-{s}"), css)
}

/// `prefix-<length>` or `prefix-(--var)`.
pub fn spacing(prefix: &str, v: &SpacingValue, vars: &dyn Vars) -> (String, String) {
    match v {
        SpacingValue::Px(px) => {
            let (s, css) = length(*px);
            (format!("{prefix}-{s}"), css)
        }
        SpacingValue::Var(r) => {
            let n = var_name(vars, &r.var);
            (format!("{prefix}-({n})"), format!("var({n})"))
        }
    }
}

/// CSS value of a color.
pub fn color_css(c: &ColorValue, vars: &dyn Vars) -> String {
    match c {
        ColorValue::Literal(hex) => hex.clone(),
        ColorValue::Var(r) => format!("var({})", var_name(vars, &r.var)),
    }
}

/// `bg-[#fff]`, `text-(color:--brand)`. `hint` disambiguates utilities that also take lengths.
pub fn color(prefix: &str, c: &ColorValue, vars: &dyn Vars, hint: bool) -> (String, String) {
    match c {
        ColorValue::Literal(hex) => (format!("{prefix}-[{hex}]"), hex.clone()),
        ColorValue::Var(r) => {
            let n = var_name(vars, &r.var);
            let class = if hint {
                format!("{prefix}-(color:{n})")
            } else {
                format!("{prefix}-({n})")
            };
            (class, format!("var({n})"))
        }
    }
}

/// Default theme font sizes (px) and their line heights.
pub const TEXT_SIZES: &[(f64, &str, &str, &str)] = &[
    (12.0, "xs", "0.75rem", "calc(1 / 0.75)"),
    (14.0, "sm", "0.875rem", "calc(1.25 / 0.875)"),
    (16.0, "base", "1rem", "calc(1.5 / 1)"),
    (18.0, "lg", "1.125rem", "calc(1.75 / 1.125)"),
    (20.0, "xl", "1.25rem", "calc(1.75 / 1.25)"),
    (24.0, "2xl", "1.5rem", "calc(2 / 1.5)"),
    (30.0, "3xl", "1.875rem", "calc(2.25 / 1.875)"),
    (36.0, "4xl", "2.25rem", "calc(2.5 / 2.25)"),
    (48.0, "5xl", "3rem", "1"),
    (60.0, "6xl", "3.75rem", "1"),
    (72.0, "7xl", "4.5rem", "1"),
    (96.0, "8xl", "6rem", "1"),
    (128.0, "9xl", "8rem", "1"),
];

pub fn weight_name(w: u16) -> &'static str {
    match w {
        100 => "thin",
        200 => "extralight",
        300 => "light",
        500 => "medium",
        600 => "semibold",
        700 => "bold",
        800 => "extrabold",
        900 => "black",
        _ => "normal",
    }
}

pub fn leading(v: f64) -> String {
    match v {
        1.0 => "leading-none".into(),
        1.25 => "leading-tight".into(),
        1.375 => "leading-snug".into(),
        1.5 => "leading-normal".into(),
        1.625 => "leading-relaxed".into(),
        2.0 => "leading-loose".into(),
        _ => format!("leading-[{}]", num(v)),
    }
}

/// Letter spacing in em.
pub fn tracking(v: f64) -> String {
    let named = [
        (-0.05, "tighter"),
        (-0.025, "tight"),
        (0.0, "normal"),
        (0.025, "wide"),
        (0.05, "wider"),
        (0.1, "widest"),
    ];
    for (val, name) in named {
        if (v - val).abs() < 1e-9 {
            return format!("tracking-{name}");
        }
    }
    format!("tracking-[{}em]", num(v))
}

/// Radius suffix: `-lg`, `-full`, `-[10px]`, or "" for the bare default is never used.
pub fn radius(v: f64) -> String {
    let named = [
        (0.0, "-none"),
        (2.0, "-xs"),
        (4.0, "-sm"),
        (6.0, "-md"),
        (8.0, "-lg"),
        (12.0, "-xl"),
        (16.0, "-2xl"),
        (24.0, "-3xl"),
        (32.0, "-4xl"),
    ];
    for (val, name) in named {
        if v == val {
            return name.into();
        }
    }
    if v >= 9999.0 {
        return "-full".into();
    }
    format!("-[{}px]", num(v))
}

pub fn radius_css(v: f64) -> String {
    if v >= 9999.0 {
        "calc(infinity * 1px)".into()
    } else {
        format!("{}px", num(v))
    }
}

/// Border width suffix for `border`: "" (1px), `-2`, `-[3px]`.
pub fn border_width(v: f64) -> String {
    match v {
        1.0 => String::new(),
        0.0 => "-0".into(),
        2.0 | 4.0 | 8.0 => format!("-{}", num(v)),
        _ => format!("-[{}px]", num(v)),
    }
}

/// An arbitrary value inside `[...]`: spaces become underscores.
pub fn arbitrary(css: &str) -> String {
    css.replace(' ', "_")
}
