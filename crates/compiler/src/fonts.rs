//! Web fonts the project loads (`next/font/google` in Next.js, the Fonts API in Astro).
//!
//! A font family set on a layer is inherited by its descendants, which may set only a
//! weight, so weights are collected by walking each tree with the inherited family.

use std::collections::{BTreeMap, BTreeSet};

use crate::CompileError;
use crate::model::{Node, Project, Variable};
use crate::names::camel;
use crate::style::{effective, family_slug, system_stack};
use crate::tree::{component, node};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WebFont {
    pub family: String,
    /// `--tf-font-<slug>`
    pub variable: String,
    pub weights: BTreeSet<u16>,
}

impl WebFont {
    /// `Playfair Display` → `Playfair_Display` (the `next/font/google` export).
    pub fn next_import(&self) -> String {
        self.family.replace(' ', "_")
    }
    /// `Playfair Display` → `playfairDisplay`.
    pub fn ident(&self) -> String {
        let c = camel(&self.family);
        if c.is_empty() || c.starts_with(|ch: char| ch.is_ascii_digit()) {
            format!("font{}", crate::names::pascal(&self.family))
        } else {
            c
        }
    }
}

/// Web fonts (not system stacks) with the weights used with each, sorted by family.
pub fn web_fonts(project: &Project) -> Result<Vec<WebFont>, CompileError> {
    let mut pairs: BTreeMap<String, BTreeSet<u16>> = BTreeMap::new();
    let mut visited = BTreeSet::new();
    for page in &project.pages {
        walk(project, &page.root, None, &mut pairs, &mut visited)?;
    }
    for c in project.components.values() {
        walk(project, &c.root, None, &mut pairs, &mut visited)?;
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
                pairs.entry(f.family.clone()).or_default().insert(f.weight);
            }
        }
    }
    Ok(pairs
        .into_iter()
        .filter(|(family, _)| system_stack(family).is_none())
        .map(|(family, mut weights)| {
            if weights.is_empty() {
                weights.insert(400);
            }
            WebFont {
                variable: format!("--tf-font-{}", family_slug(&family)),
                family,
                weights,
            }
        })
        .collect())
}

fn walk(
    project: &Project,
    id: &str,
    inherited: Option<&str>,
    pairs: &mut BTreeMap<String, BTreeSet<u16>>,
    visited: &mut BTreeSet<(String, Option<String>)>,
) -> Result<(), CompileError> {
    if !visited.insert((id.to_string(), inherited.map(str::to_string))) {
        return Ok(());
    }
    let n = node(project, id)?;
    let mut family = inherited.map(str::to_string);
    for (_, p) in effective(n.style(), &project.breakpoints) {
        if let Some(f) = &p.font_family {
            family = Some(f.clone());
        }
        let Some(f) = p
            .font_family
            .as_ref()
            .or(inherited.map(str::to_string).as_ref())
            .cloned()
        else {
            continue;
        };
        let entry = pairs.entry(f).or_default();
        match p.font_weight {
            Some(w) => {
                entry.insert(w);
            }
            // Text with no weight of its own renders at the default.
            None if matches!(n, Node::Text { .. }) => {
                entry.insert(400);
            }
            None => {}
        }
    }
    if let Node::Instance { component_id, .. } = n {
        let c = component(project, component_id)?;
        walk(project, &c.root, family.as_deref(), pairs, visited)?;
    }
    for c in n.children() {
        walk(project, c, family.as_deref(), pairs, visited)?;
    }
    Ok(())
}
