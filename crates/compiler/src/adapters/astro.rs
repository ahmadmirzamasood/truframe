//! Astro adapter (ARCHITECTURE §6.1): `src/pages/` routes, a `Base` layout, `src/components/`,
//! Tailwind v4 through its Vite plugin, `astro:assets` images and the Fonts API.

use crate::fonts::{WebFont, web_fonts};
use crate::model::{Component, Page, Project};
use crate::names::{pascal, path_segments};
use crate::printer::{Writer, js_string};
use crate::snippets::print_html;
use crate::tree::{Builder, Flavor, code_classes};
use crate::{CompileError, Framework};

use super::{Emit, readme};

const PACKAGE_JSON: &str = include_str!("../../templates/astro/package.json");
const PACKAGE_LOCK: &str = include_str!("../../templates/astro/package-lock.json");
const TSCONFIG: &str = include_str!("../../templates/astro/tsconfig.json");
const GITIGNORE: &str = include_str!("../../templates/astro/gitignore");

pub fn emit(project: &Project, out: &mut Emit) -> Result<(), CompileError> {
    let fonts = web_fonts(project)?;
    let anim = crate::animation::uses(project);
    out.file("package.json", PACKAGE_JSON);
    out.file("package-lock.json", PACKAGE_LOCK);
    out.file("tsconfig.json", TSCONFIG);
    out.file(".gitignore", GITIGNORE);
    out.file("README.md", readme(project, Framework::Astro));
    out.file("astro.config.mjs", config(&fonts));
    out.file(
        "src/layouts/Base.astro",
        layout(project, &fonts, anim.in_view),
    );
    if anim.any {
        out.file(
            "src/styles/animations.css",
            crate::animation::animations_css(),
        );
    }
    out.file(
        "src/styles/global.css",
        crate::tokens::global_css(project, "./tokens.css", anim.any),
    );
    out.file("src/styles/tokens.css", crate::tokens::tokens_css(project));
    for c in project.components.values() {
        component_file(project, c, out)?;
    }
    for page in &project.pages {
        page_file(project, page, out)?;
    }
    Ok(())
}

/// `/` → `src/pages/index.astro`, `/blog/post` → `src/pages/blog/post.astro`.
pub fn page_path(page: &Page) -> String {
    let segs = path_segments(&page.path);
    if segs.is_empty() {
        "src/pages/index.astro".into()
    } else {
        format!("src/pages/{}.astro", segs.join("/"))
    }
}

/// Relative path from a page file back to `src/`.
fn to_src(page: &Page) -> String {
    let depth = path_segments(&page.path).len().saturating_sub(1);
    "../".repeat(depth + 1)
}

/// An attribute value inside double quotes.
fn attr(s: &str) -> String {
    s.replace('&', "&amp;").replace('"', "&quot;")
}

fn config(fonts: &[WebFont]) -> String {
    let mut w = Writer::new();
    w.line(0, "// @ts-check");
    if fonts.is_empty() {
        w.line(0, "import { defineConfig } from \"astro/config\";");
    } else {
        w.line(
            0,
            "import { defineConfig, fontProviders } from \"astro/config\";",
        );
    }
    w.line(0, "import tailwindcss from \"@tailwindcss/vite\";");
    w.line(0, "");
    w.line(0, "export default defineConfig({");
    if !fonts.is_empty() {
        w.line(2, "fonts: [");
        for f in fonts {
            let weights: Vec<String> = f.weights.iter().map(u16::to_string).collect();
            w.line(4, "{");
            w.line(6, "provider: fontProviders.google(),");
            w.line(6, &format!("name: {},", js_string(&f.family)));
            w.line(6, &format!("cssVariable: \"{}\",", f.variable));
            w.line(6, &format!("weights: [{}],", weights.join(", ")));
            w.line(6, "subsets: [\"latin\"],");
            w.line(4, "},");
        }
        w.line(2, "],");
    }
    w.line(2, "vite: {");
    w.line(4, "plugins: [tailwindcss()],");
    w.line(2, "},");
    w.line(0, "});");
    w.out
}

fn layout(project: &Project, fonts: &[WebFont], in_view: bool) -> String {
    let mut w = Writer::new();
    w.line(0, "---");
    if !fonts.is_empty() {
        w.line(0, "import { Font } from \"astro:assets\";");
    }
    w.line(0, "import \"../styles/global.css\";");
    w.line(0, "");
    w.line(0, "interface Props {");
    w.line(2, "title: string;");
    w.line(2, "description?: string;");
    w.line(2, "noindex?: boolean;");
    w.line(0, "}");
    w.line(0, "");
    w.line(
        0,
        "const { title, description, noindex = false } = Astro.props;",
    );
    w.line(0, "---");
    w.line(0, "");
    w.line(
        0,
        &format!("<html lang=\"{}\">", attr(&project.settings.lang)),
    );
    w.line(2, "<head>");
    w.line(4, "<meta charset=\"utf-8\" />");
    w.line(
        4,
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    );
    w.line(4, "<title>{title}</title>");
    w.line(
        4,
        "{description && <meta name=\"description\" content={description} />}",
    );
    w.line(
        4,
        "{noindex && <meta name=\"robots\" content=\"noindex, nofollow\" />}",
    );
    for f in fonts {
        w.line(
            4,
            &format!("<Font cssVariable=\"{}\" preload />", f.variable),
        );
    }
    // Pages with head code (P6-5) fill this slot.
    if project
        .pages
        .iter()
        .any(|p| p.code.as_ref().is_some_and(|c| !c.head.is_empty()))
    {
        w.line(4, "<slot name=\"head\" />");
    }
    w.line(2, "</head>");
    w.line(2, "<body>");
    w.line(4, "<slot />");
    if in_view {
        for line in crate::animation::astro_in_view_lines() {
            w.line(4, &line);
        }
    }
    w.line(2, "</body>");
    w.line(0, "</html>");
    w.out
}

/// Frontmatter imports shared by pages and components.
fn imports(w: &mut Writer, b: &Builder, to_src: &str, components_from: &str) {
    if b.imports.image {
        w.line(0, "import { Image } from \"astro:assets\";");
    }
    for c in &b.imports.components {
        w.line(
            0,
            &format!("import {c} from \"{components_from}{c}.astro\";"),
        );
    }
    for (ident, file) in &b.imports.astro_images {
        w.line(
            0,
            &format!("import {ident} from \"{to_src}assets/{file}\";"),
        );
    }
}

fn page_file(project: &Project, page: &Page, out: &mut Emit) -> Result<(), CompileError> {
    let mut b = Builder::new(
        project,
        Flavor::Astro,
        code_classes(project, &page.root, None)?,
    );
    let root = b.element(&page.root, None)?;
    let src = to_src(page);

    let mut w = Writer::new();
    w.line(0, "---");
    w.line(0, &format!("import Base from \"{src}layouts/Base.astro\";"));
    imports(&mut w, &b, &src, &format!("{src}components/"));
    w.line(0, "---");
    w.line(0, "");
    let mut open = format!("<Base title=\"{}\"", attr(&page.seo.title));
    if !page.seo.description.is_empty() {
        open.push_str(&format!(" description=\"{}\"", attr(&page.seo.description)));
    }
    if page.seo.noindex {
        open.push_str(" noindex");
    }
    open.push('>');
    w.line(0, &open);
    let code = page.code.as_ref();
    if let Some(head) = code.map(|c| &c.head).filter(|h| !h.is_empty()) {
        w.line(
            2,
            &format!(
                "<Fragment slot=\"head\" set:html={{{}}} />",
                js_string(&print_html(head))
            ),
        );
    }
    w.element(&root, 2, Flavor::Astro.syntax());
    if let Some(body) = code.map(|c| &c.body).filter(|b| !b.is_empty()) {
        w.line(
            2,
            &format!("<Fragment set:html={{{}}} />", js_string(&print_html(body))),
        );
    }
    w.line(0, "</Base>");

    out.output.css.append(&mut b.css);
    out.output.instance_css.append(&mut b.instance_css);
    out.output.animations.append(&mut b.animations);
    out.assets(&b.take_assets(), project);
    out.writer(&page_path(page), w);
    Ok(())
}

fn component_file(project: &Project, c: &Component, out: &mut Emit) -> Result<(), CompileError> {
    let mut b = Builder::new(project, Flavor::Astro, Default::default());
    let tree = b.component_tree(c)?;
    let name = pascal(&c.name);

    let mut w = Writer::new();
    w.line(0, "---");
    imports(&mut w, &b, "../", "./");
    if tree
        .prop_types
        .iter()
        .any(|(_, ts)| ts.contains("ImageMetadata"))
    {
        w.line(0, "import type { ImageMetadata } from \"astro\";");
    }
    if w.out != "---\n" {
        w.line(0, "");
    }
    w.line(0, "interface Props {");
    w.line(2, "class: string;");
    for vp in &c.variant_props {
        let values: Vec<String> = vp.values.iter().map(|v| js_string(v)).collect();
        w.line(2, &format!("{}?: {};", vp.name, values.join(" | ")));
    }
    for (prop, ts) in &tree.prop_types {
        w.line(2, &format!("{prop}?: {ts};"));
    }
    w.line(0, "}");
    w.line(0, "");
    for l in &tree.lookups {
        for line in l.lines() {
            w.line(0, line);
        }
        w.line(0, "");
    }
    w.line(0, "const props = Astro.props;");
    if !tree.lookups.is_empty() {
        w.line(
            0,
            &format!("const variant = `{}`;", super::next::variant_template(c)),
        );
    }
    for p in &tree.prelude {
        for line in p.lines() {
            w.line(0, line);
        }
    }
    w.line(0, "---");
    w.line(0, "");
    w.element(&tree.root, 0, Flavor::Astro.syntax());

    out.output.css.append(&mut b.css);
    out.output.instance_css.append(&mut b.instance_css);
    out.output.animations.append(&mut b.animations);
    out.assets(&b.take_assets(), project);
    out.writer(&format!("src/components/{name}.astro"), w);
    Ok(())
}
