//! `tokens.css`: variables as CSS custom properties, per breakpoint, plus `@theme inline`
//! mappings so the exported project can also use them as Tailwind utilities (PRD F12, F29).

use std::collections::BTreeSet;

use crate::model::{FontValue, PerBreakpoint, Project, Variable};
use crate::names::num;
use crate::style::{family_slug, media, system_stack};

/// Font families used anywhere in the document (layers, components, text styles).
pub fn families(project: &Project) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    for n in project.nodes.values() {
        let s = n.style();
        for p in [Some(&s.desktop), s.tablet.as_ref(), s.mobile.as_ref()]
            .into_iter()
            .flatten()
        {
            if let Some(f) = &p.font_family {
                out.insert(f.clone());
            }
        }
    }
    for v in project.variables.values() {
        if let Variable::Font { value, .. } = v {
            for f in [
                Some(&value.desktop),
                value.tablet.as_ref(),
                value.mobile.as_ref(),
            ]
            .into_iter()
            .flatten()
            {
                out.insert(f.family.clone());
            }
        }
    }
    out
}

/// The value of `--tf-font-<slug>` for a family: a web font's variable is set by the
/// framework's font loader, so only system stacks are declared here.
fn family_value(family: &str) -> String {
    format!("var(--tf-font-{})", family_slug(family))
}

fn font_decls(css: &str, f: &FontValue, base: Option<&FontValue>) -> Vec<String> {
    let mut out = Vec::new();
    let changed = |a: bool| base.is_none() || a;
    if changed(base.is_some_and(|b| b.family != f.family)) {
        out.push(format!("{css}-family: {};", family_value(&f.family)));
    }
    if changed(base.is_some_and(|b| b.size != f.size)) {
        out.push(format!("{css}-size: {}px;", num(f.size)));
    }
    if changed(base.is_some_and(|b| b.weight != f.weight)) {
        out.push(format!("{css}-weight: {};", f.weight));
    }
    if changed(base.is_some_and(|b| b.line_height != f.line_height)) {
        out.push(format!("{css}-line-height: {};", num(f.line_height)));
    }
    if changed(base.is_some_and(|b| b.letter_spacing != f.letter_spacing)) {
        out.push(format!(
            "{css}-letter-spacing: {}em;",
            num(f.letter_spacing)
        ));
    }
    out
}

/// Declarations at each breakpoint: desktop, then only values that change.
fn per_bp<T: PartialEq>(
    v: &PerBreakpoint<T>,
    has_tablet: bool,
    has_mobile: bool,
) -> [Option<&T>; 3] {
    let tablet = if has_tablet { v.tablet.as_ref() } else { None };
    let above_mobile = tablet.unwrap_or(&v.desktop);
    let tablet = tablet.filter(|t| *t != &v.desktop);
    let mobile = if has_mobile {
        v.mobile.as_ref().filter(|m| *m != above_mobile)
    } else {
        None
    };
    [Some(&v.desktop), tablet, mobile]
}

pub fn tokens_css(project: &Project) -> String {
    let bps = &project.breakpoints;
    let (has_t, has_m) = (bps.tablet.is_some(), bps.mobile.is_some());
    let mut blocks: [Vec<String>; 3] = [Vec::new(), Vec::new(), Vec::new()];
    let mut theme = Vec::new();

    for f in families(project) {
        if let Some(stack) = system_stack(&f) {
            blocks[0].push(format!("--tf-font-{}: {stack};", family_slug(&f)));
        }
    }

    let mut vars: Vec<&Variable> = project.variables.values().collect();
    vars.sort_by_key(|v| css_name(v));
    for v in vars {
        let name = css_name(v);
        let slug = name.trim_start_matches("--");
        match v {
            Variable::Color { value, .. } => {
                for (i, c) in per_bp(value, has_t, has_m).into_iter().enumerate() {
                    if let Some(c) = c {
                        blocks[i].push(format!("{name}: {c};"));
                    }
                }
                theme.push(format!("--color-{slug}: var({name});"));
            }
            Variable::Spacing { value, .. } => {
                for (i, px) in per_bp(value, has_t, has_m).into_iter().enumerate() {
                    if let Some(px) = px {
                        blocks[i].push(format!("{name}: {}px;", num(*px)));
                    }
                }
                theme.push(format!("--spacing-{slug}: var({name});"));
            }
            Variable::Font { value, .. } => {
                let [d, t, m] = per_bp(value, has_t, has_m);
                if let Some(d) = d {
                    blocks[0].extend(font_decls(name, d, None));
                }
                if let Some(t) = t {
                    blocks[1].extend(font_decls(name, t, Some(&value.desktop)));
                }
                if let Some(m) = m {
                    let above = t
                        .or(value.tablet.as_ref().filter(|_| has_t))
                        .unwrap_or(&value.desktop);
                    blocks[2].extend(font_decls(name, m, Some(above)));
                }
                theme.push(format!("--font-{slug}: var({name}-family);"));
                theme.push(format!("--text-{slug}: var({name}-size);"));
                theme.push(format!(
                    "--text-{slug}--line-height: var({name}-line-height);"
                ));
                theme.push(format!(
                    "--text-{slug}--letter-spacing: var({name}-letter-spacing);"
                ));
                theme.push(format!("--text-{slug}--font-weight: var({name}-weight);"));
            }
        }
    }

    let mut css = String::from(
        "/* Design variables. Generated from the design; edits here are overwritten. */\n",
    );
    let block = |css: &mut String, indent: &str, decls: &[String]| {
        for d in decls {
            css.push_str(indent);
            css.push_str(d);
            css.push('\n');
        }
    };
    css.push_str("\n:root {\n");
    block(&mut css, "  ", &blocks[0]);
    css.push_str("}\n");
    let (tablet, mobile) = media(bps);
    for (i, q) in [(1, tablet), (2, mobile)] {
        if let Some(q) = q
            && !blocks[i].is_empty()
        {
            css.push_str(&format!("
@media {q} {{
  :root {{
"));
            block(&mut css, "    ", &blocks[i]);
            css.push_str("  }
}
");
        }
    }
    if !theme.is_empty() {
        css.push_str("\n@theme inline {\n");
        block(&mut css, "  ", &theme);
        css.push_str("}\n");
    }
    css
}

fn css_name(v: &Variable) -> &str {
    match v {
        Variable::Color { css_name, .. }
        | Variable::Spacing { css_name, .. }
        | Variable::Font { css_name, .. } => css_name,
    }
}

/// The Tailwind entry stylesheet: Tailwind, the tokens and the breakpoint variants.
pub fn global_css(project: &Project, tokens_import: &str) -> String {
    let (tablet, mobile) = media(&project.breakpoints);
    let mut css = String::from(
        "@import \"tailwindcss\";
",
    );
    css.push_str(&format!(
        "@import \"{tokens_import}\";
"
    ));
    if tablet.is_some() || mobile.is_some() {
        css.push_str(
            "
/*
 * Desktop-first breakpoints: unprefixed classes are the desktop design;
 * `tablet:` and `mobile:` classes override them on smaller screens.
 * Declared tablet first so mobile wins where both apply.
 */
",
        );
    }
    if let Some(q) = tablet {
        css.push_str(&format!(
            "@custom-variant tablet (@media {q});
"
        ));
    }
    if let Some(q) = mobile {
        css.push_str(&format!(
            "@custom-variant mobile (@media {q});
"
        ));
    }
    css
}
