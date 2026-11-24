//! Next.js App Router adapter (ARCHITECTURE §6.1).

use crate::CompileError;
use crate::model::{Page, Project};
use crate::names::{pascal, path_segments};
use crate::printer::{Writer, js_string};
use crate::tree::{Builder, Flavor, code_classes};

use super::Emit;

pub fn emit(project: &Project, out: &mut Emit) -> Result<(), CompileError> {
    out.file("app/layout.tsx", layout(project));
    out.file(
        "app/globals.css",
        crate::tokens::global_css(project, "./tokens.css"),
    );
    out.file("app/tokens.css", crate::tokens::tokens_css(project));
    for page in &project.pages {
        let path = page_file(page);
        let w = page_component(project, page, out)?;
        out.writer(&path, w);
    }
    Ok(())
}

/// `/` → `app/page.tsx`, `/blog/post` → `app/blog/post/page.tsx`.
pub fn page_file(page: &Page) -> String {
    let mut p = String::from("app/");
    for s in path_segments(&page.path) {
        p.push_str(s);
        p.push('/');
    }
    p.push_str("page.tsx");
    p
}

fn layout(project: &Project) -> String {
    format!(
        "import \"./globals.css\";

export default function RootLayout({{\n  children,\n}}: Readonly<{{\n  children: React.ReactNode;\n}}>) {{\n  return (\n    <html lang={}>\n      <body>{{children}}</body>\n    </html>\n  );\n}}\n",
        js_string(&project.settings.lang)
    )
}

fn page_component(project: &Project, page: &Page, out: &mut Emit) -> Result<Writer, CompileError> {
    let mut builder = Builder::new(
        project,
        Flavor::Next,
        code_classes(project, &page.root, None)?,
    );
    let root = builder.element(&page.root, None)?;
    out.output.css.append(&mut builder.css);
    let mut w = Writer::new();
    let name = match pascal(&page.name).as_str() {
        "" => "Page".to_string(),
        n if n.starts_with(|c: char| c.is_ascii_digit()) => format!("Page{n}"),
        n => format!("{n}Page"),
    };
    w.line(0, &format!("export default function {name}() {{"));
    w.line(2, "return (");
    w.element(&root, 4, Flavor::Next.syntax());
    w.line(2, ");");
    w.line(0, "}");
    Ok(w)
}
