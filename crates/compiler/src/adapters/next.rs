//! Next.js App Router adapter (ARCHITECTURE §6.1): `app/` routes and layout, `components/`,
//! Tailwind v4 through PostCSS, `next/image`, `next/font/google`, static export.

use crate::fonts::{WebFont, web_fonts};
use crate::model::{Component, Page, Project};
use crate::names::{pascal, path_segments};
use crate::printer::{PRINT_WIDTH, Writer, js_string};
use crate::tree::{Builder, Flavor, code_classes};
use crate::{CompileError, Framework};

use super::{Emit, readme};

const PACKAGE_JSON: &str = include_str!("../../templates/next/package.json");
const PACKAGE_LOCK: &str = include_str!("../../templates/next/package-lock.json");
const NEXT_CONFIG: &str = include_str!("../../templates/next/next.config.ts");
const POSTCSS_CONFIG: &str = include_str!("../../templates/next/postcss.config.mjs");
const TSCONFIG: &str = include_str!("../../templates/next/tsconfig.json");
const GITIGNORE: &str = include_str!("../../templates/next/gitignore");

pub fn emit(project: &Project, out: &mut Emit) -> Result<(), CompileError> {
    out.file("package.json", PACKAGE_JSON);
    out.file("package-lock.json", PACKAGE_LOCK);
    out.file("next.config.ts", NEXT_CONFIG);
    out.file("postcss.config.mjs", POSTCSS_CONFIG);
    out.file("tsconfig.json", TSCONFIG);
    out.file(".gitignore", GITIGNORE);
    out.file("README.md", readme(project, Framework::Next));
    out.file("app/layout.tsx", layout(project, &web_fonts(project)?));
    out.file(
        "app/globals.css",
        crate::tokens::global_css(project, "./tokens.css"),
    );
    out.file("app/tokens.css", crate::tokens::tokens_css(project));
    for c in project.components.values() {
        component_file(project, c, out)?;
    }
    for page in &project.pages {
        page_file(project, page, out)?;
    }
    Ok(())
}

/// `/` → `app/page.tsx`, `/blog/post` → `app/blog/post/page.tsx`.
pub fn page_path(page: &Page) -> String {
    let mut p = String::from("app/");
    for s in path_segments(&page.path) {
        p.push_str(s);
        p.push('/');
    }
    p.push_str("page.tsx");
    p
}

fn layout(project: &Project, fonts: &[WebFont]) -> String {
    let mut w = Writer::new();
    w.line(0, "import type { ReactNode } from \"react\";");
    if !fonts.is_empty() {
        let names: Vec<String> = fonts.iter().map(WebFont::next_import).collect();
        w.line(
            0,
            &format!(
                "import {{ {} }} from \"next/font/google\";",
                names.join(", ")
            ),
        );
    }
    w.line(0, "import \"./globals.css\";");
    w.line(0, "");
    for f in fonts {
        let weights: Vec<String> = f.weights.iter().map(|w| format!("\"{w}\"")).collect();
        w.line(0, &format!("const {} = {}({{", f.ident(), f.next_import()));
        w.line(2, "subsets: [\"latin\"],");
        w.line(2, &format!("weight: [{}],", weights.join(", ")));
        w.line(2, &format!("variable: \"{}\",", f.variable));
        w.line(0, "});");
        w.line(0, "");
    }
    w.line(
        0,
        "export default function RootLayout({ children }: { children: ReactNode }) {",
    );
    w.line(2, "return (");
    let lang = js_string(&project.settings.lang);
    if fonts.is_empty() {
        w.line(4, &format!("<html lang={lang}>"));
    } else {
        let vars: Vec<String> = fonts
            .iter()
            .map(|f| format!("${{{}.variable}}", f.ident()))
            .collect();
        let class = format!("className={{`{}`}}", vars.join(" "));
        let open = format!("<html lang={lang} {class}>");
        if 4 + open.len() <= PRINT_WIDTH {
            w.line(4, &open);
        } else {
            w.line(4, "<html");
            w.line(6, &format!("lang={lang}"));
            w.line(6, &class);
            w.line(4, ">");
        }
    }
    w.line(6, "<body>{children}</body>");
    w.line(4, "</html>");
    w.line(2, ");");
    w.line(0, "}");
    w.out
}

fn imports(w: &mut Writer, b: &Builder, components_from: &str) {
    if b.imports.image {
        w.line(0, "import Image from \"next/image\";");
    }
    if b.imports.link {
        w.line(0, "import Link from \"next/link\";");
    }
    for c in &b.imports.components {
        w.line(0, &format!("import {c} from \"{components_from}{c}\";"));
    }
}

fn page_file(project: &Project, page: &Page, out: &mut Emit) -> Result<(), CompileError> {
    let mut b = Builder::new(
        project,
        Flavor::Next,
        code_classes(project, &page.root, None)?,
    );
    let root = b.element(&page.root, None)?;

    let mut w = Writer::new();
    w.line(0, "import type { Metadata } from \"next\";");
    imports(&mut w, &b, "@/components/");
    w.line(0, "");
    w.line(0, "export const metadata: Metadata = {");
    w.line(2, &format!("title: {},", js_string(&page.seo.title)));
    if !page.seo.description.is_empty() {
        w.line(
            2,
            &format!("description: {},", js_string(&page.seo.description)),
        );
    }
    if page.seo.noindex {
        w.line(2, "robots: { index: false, follow: false },");
    }
    w.line(0, "};");
    w.line(0, "");
    w.line(
        0,
        &format!("export default function {}() {{", page_component_name(page)),
    );
    w.line(2, "return (");
    w.element(&root, 4, Flavor::Next.syntax());
    w.line(2, ");");
    w.line(0, "}");

    out.output.css.append(&mut b.css);
    out.assets(&b.take_assets(), project);
    out.writer(&page_path(page), w);
    Ok(())
}

/// `About us` → `AboutUsPage`.
fn page_component_name(page: &Page) -> String {
    match pascal(&page.name).as_str() {
        "" => "Page".to_string(),
        n if n.starts_with(|c: char| c.is_ascii_digit()) => format!("Page{n}"),
        n => format!("{n}Page"),
    }
}

fn component_file(project: &Project, c: &Component, out: &mut Emit) -> Result<(), CompileError> {
    let mut b = Builder::new(project, Flavor::Next, Default::default());
    let tree = b.component_tree(c)?;
    let name = pascal(&c.name);

    let mut w = Writer::new();
    imports(&mut w, &b, "./");
    if !w.out.is_empty() {
        w.line(0, "");
    }
    w.line(0, &format!("type {name}Props = {{"));
    w.line(2, "className: string;");
    for vp in &c.variant_props {
        let values: Vec<String> = vp.values.iter().map(|v| js_string(v)).collect();
        w.line(2, &format!("{}?: {};", vp.name, values.join(" | ")));
    }
    for (prop, ts) in &tree.prop_types {
        w.line(2, &format!("{prop}?: {ts};"));
    }
    w.line(0, "};");
    w.line(0, "");
    for l in &tree.lookups {
        for line in l.lines() {
            w.line(0, line);
        }
        w.line(0, "");
    }
    w.line(
        0,
        &format!("export default function {name}(props: {name}Props) {{"),
    );
    if !tree.lookups.is_empty() {
        w.line(2, &format!("const variant = `{}`;", variant_template(c)));
    }
    for p in &tree.prelude {
        for line in p.lines() {
            w.line(2, line);
        }
    }
    w.line(2, "return (");
    w.element(&tree.root, 4, Flavor::Next.syntax());
    w.line(2, ");");
    w.line(0, "}");

    out.output.css.append(&mut b.css);
    out.assets(&b.take_assets(), project);
    out.writer(&format!("components/{name}.tsx"), w);
    Ok(())
}

/// `size=${props.size ?? "default"},tone=…`: the runtime variant key.
pub fn variant_template(c: &Component) -> String {
    c.variant_props
        .iter()
        .map(|vp| {
            format!(
                "{}=${{props.{} ?? {}}}",
                vp.name,
                vp.name,
                js_string(&vp.default)
            )
        })
        .collect::<Vec<_>>()
        .join(",")
}
