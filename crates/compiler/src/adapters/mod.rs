//! Framework adapters: turn the document into project files.

mod astro;
mod next;

use std::collections::BTreeSet;

use crate::model::Project;
use crate::printer::{Writer, utf16_offset};
use crate::style::media;
use crate::tree::{AssetUse, asset_file_names};
use crate::{AssetFile, CompileError, Framework, Output, Span};

pub fn compile(project: &Project, framework: Framework) -> Result<Output, CompileError> {
    let mut out = Emit::default();
    match framework {
        Framework::Next => next::emit(project, &mut out)?,
        Framework::Astro => astro::emit(project, &mut out)?,
    }
    let mut output = out.output;
    output.spans.sort_by(|a, b| {
        (a.path.as_str(), a.start, a.node.as_str()).cmp(&(
            b.path.as_str(),
            b.start,
            b.node.as_str(),
        ))
    });
    output.assets.sort_by(|a, b| a.path.cmp(&b.path));
    output.assets.dedup();
    Ok(output)
}

/// Collects files and converts each file's byte spans to UTF-16 spans.
#[derive(Debug, Default)]
pub struct Emit {
    pub output: Output,
}

impl Emit {
    pub fn file(&mut self, path: &str, text: impl Into<String>) {
        self.output.files.insert(path.to_string(), text.into());
    }

    pub fn writer(&mut self, path: &str, w: Writer) {
        // One pass over the file for all offsets; converting each from the start of the file
        // made compile time quadratic in page size.
        let mut offsets: Vec<usize> = w.spans.iter().flat_map(|s| [s.start, s.end]).collect();
        offsets.sort_unstable();
        offsets.dedup();
        let utf16: std::collections::HashMap<usize, usize> = if w.out.is_ascii() {
            offsets.iter().map(|&o| (o, o)).collect()
        } else {
            let mut map = std::collections::HashMap::with_capacity(offsets.len());
            let (mut byte, mut units) = (0, 0);
            for &o in &offsets {
                units += utf16_offset(&w.out[byte..], o - byte);
                byte = o;
                map.insert(o, units);
            }
            map
        };
        let at = |b: usize| utf16.get(&b).copied().unwrap_or(0);
        for s in &w.spans {
            self.output.spans.push(Span {
                node: s.node.clone(),
                path: path.to_string(),
                start: at(s.start),
                end: at(s.end),
            });
        }
        self.output.files.insert(path.to_string(), w.out);
    }

    /// Records the asset files a generated file needs.
    pub fn assets(&mut self, used: &BTreeSet<(String, AssetUse)>, project: &Project) {
        let names = asset_file_names(project);
        for (id, how) in used {
            let (Some(file), Some(asset)) = (names.get(id), project.assets.get(id)) else {
                continue;
            };
            let dir = match how {
                AssetUse::Public => "public/assets",
                AssetUse::Src => "src/assets",
            };
            self.output.assets.push(AssetFile {
                asset_id: id.clone(),
                key: asset.key.clone(),
                path: format!("{dir}/{file}"),
            });
        }
    }
}

/// The generated project's README: how to run it and how the breakpoints work.
pub fn readme(project: &Project, framework: Framework) -> String {
    let (tablet, mobile) = media(&project.breakpoints);
    let (run, out_dir, css) = match framework {
        Framework::Next => ("npm run dev", "out/", "app/globals.css"),
        Framework::Astro => ("npm run dev", "dist/", "src/styles/global.css"),
    };
    let fw = match framework {
        Framework::Next => "Next.js (App Router)",
        Framework::Astro => "Astro",
    };
    let mut s = format!(
        "# Site\n\nA {fw} site styled with Tailwind CSS v4.\n\n## Run it\n\n```sh\nnpm install\n{run}\n```\n\n`npm run build` writes a static site to `{out_dir}`. `npm run typecheck` checks the types.\n\n## Breakpoints\n\nStyles are desktop-first: classes without a prefix are the desktop design (designed at {}px wide).\n",
        project.breakpoints.desktop.width
    );
    if tablet.is_some() || mobile.is_some() {
        s.push_str(&format!(
            "Smaller screens override them with two custom variants declared in `{css}`:\n\n"
        ));
        if let Some(q) = &tablet {
            s.push_str(&format!("- `tablet:` applies when `{q}`.\n"));
        }
        if let Some(q) = &mobile {
            s.push_str(&format!(
                "- `mobile:` applies when `{q}` and wins over `tablet:`.\n"
            ));
        }
        s.push_str("\nFor example, `gap-8 tablet:gap-6 mobile:gap-4`.\n");
    } else {
        s.push_str("This design has no tablet or mobile overrides.\n");
    }
    s.push_str("\nThe first class on each element (such as `hero-section`) names its layer in the design. It has no styles.\n\nDesign variables are CSS custom properties in `tokens.css`.\n");
    // Unsplash asks for credit wherever its photos appear (INTEGRATIONS: Unsplash).
    let credits: Vec<String> = project
        .assets
        .values()
        .filter_map(|a| {
            a.credit.as_ref().map(|c| {
                format!(
                    "- {}: photo by [{}]({}) on [Unsplash]({})\n",
                    a.name, c.author, c.author_url, c.source_url
                )
            })
        })
        .collect();
    if !credits.is_empty() {
        s.push_str("\n## Photo credits\n\n");
        s.push_str(&credits.concat());
    }
    s.push_str("\n---\n\nGenerated with Truframe.\n");
    s
}
