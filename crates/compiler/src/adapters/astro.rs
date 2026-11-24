//! Astro adapter (ARCHITECTURE §6.1).

use crate::CompileError;
use crate::model::{Page, Project};
use crate::names::path_segments;
use crate::printer::Writer;
use crate::tree::{Builder, Flavor, code_classes};

use super::Emit;

pub fn emit(project: &Project, out: &mut Emit) -> Result<(), CompileError> {
    out.file("src/layouts/Base.astro", layout(project));
    for page in &project.pages {
        let path = page_file(page);
        out.writer(&path, page_component(project, page)?);
    }
    Ok(())
}

/// `/` → `src/pages/index.astro`, `/blog/post` → `src/pages/blog/post.astro`.
pub fn page_file(page: &Page) -> String {
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

fn layout(project: &Project) -> String {
    format!(
        "---\ninterface Props {{\n  title: string;\n}}\n\nconst {{ title }} = Astro.props;\n---\n\n<html lang=\"{}\">\n  <head>\n    <meta charset=\"utf-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />\n    <title>{{title}}</title>\n  </head>\n  <body>\n    <slot />\n  </body>\n</html>\n",
        project.settings.lang.replace('"', "&quot;")
    )
}

fn page_component(project: &Project, page: &Page) -> Result<Writer, CompileError> {
    let builder = Builder {
        project,
        flavor: Flavor::Astro,
        classes: code_classes(project, &page.root, None)?,
    };
    let root = builder.element(&page.root)?;
    let mut w = Writer::new();
    w.line(0, "---");
    w.line(
        0,
        &format!("import Base from \"{}layouts/Base.astro\";", to_src(page)),
    );
    w.line(0, "---");
    w.line(0, "");
    w.line(
        0,
        &format!(
            "<Base title=\"{}\">",
            page.seo.title.replace('&', "&amp;").replace('"', "&quot;")
        ),
    );
    w.element(&root, 2, Flavor::Astro.syntax());
    w.line(0, "</Base>");
    Ok(w)
}
