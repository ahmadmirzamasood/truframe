//! Golden fixtures: every `fixtures/compiler/<name>/input.json` compiles, for each framework,
//! to exactly the files in `expected/<framework>/files/` plus the spans, canvas CSS and asset
//! list in `expected/<framework>/output.json`. Generated TS/TSX must parse (oxc).
//!
//! Inputs: `node scripts/compiler-fixtures.ts`. Expected output after a reviewed change:
//! `UPDATE_GOLDENS=1 cargo test -p truframe-compiler --test goldens`.

use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};

use oxc_allocator::Allocator;
use oxc_parser::Parser;
use oxc_span::SourceType;
use truframe_compiler::model::Project;
use truframe_compiler::{Framework, Output, compile_for};

/// Frameworks with goldens.
const FRAMEWORKS: &[Framework] = &[Framework::Next];

/// The lockfile is the same for every project of a framework; it's checked once, not stored
/// per fixture.
const SHARED: &[&str] = &["package-lock.json"];

#[allow(clippy::panic)]
fn fail(msg: &str) -> ! {
    panic!("{msg}")
}

fn root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/compiler")
}

fn fixtures() -> Vec<(String, Project)> {
    let mut out = Vec::new();
    let entries = fs::read_dir(root()).unwrap_or_else(|e| fail(&format!("read fixtures: {e}")));
    for entry in entries.flatten() {
        let input = entry.path().join("input.json");
        if !input.exists() {
            continue;
        }
        let json = fs::read_to_string(&input).unwrap_or_else(|e| fail(&format!("{input:?}: {e}")));
        let project =
            Project::from_json(&json).unwrap_or_else(|e| fail(&format!("{input:?}: {e}")));
        out.push((entry.file_name().to_string_lossy().into_owned(), project));
    }
    out.sort_by(|a, b| a.0.cmp(&b.0));
    out
}

fn read_tree(dir: &Path, base: &Path, out: &mut BTreeMap<String, String>) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            read_tree(&p, base, out);
        } else {
            let rel = p
                .strip_prefix(base)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            let text = fs::read_to_string(&p).unwrap_or_else(|e| fail(&format!("{p:?}: {e}")));
            out.insert(rel, text);
        }
    }
}

fn meta(output: &Output) -> String {
    let v = serde_json::json!({
        "spans": output.spans,
        "css": output.css,
        "assets": output.assets,
    });
    serde_json::to_string_pretty(&v).unwrap_or_default() + "\n"
}

fn write_expected(dir: &Path, output: &Output) {
    let _ = fs::remove_dir_all(dir);
    for (path, text) in &output.files {
        if SHARED.contains(&path.as_str()) {
            continue;
        }
        let p = dir.join("files").join(path);
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent).unwrap_or_else(|e| fail(&format!("{parent:?}: {e}")));
        }
        fs::write(&p, text).unwrap_or_else(|e| fail(&format!("{p:?}: {e}")));
    }
    fs::write(dir.join("output.json"), meta(output))
        .unwrap_or_else(|e| fail(&format!("write output.json: {e}")));
}

fn parse_errors(path: &str, text: &str) -> Vec<String> {
    let Ok(source_type) = SourceType::from_path(path) else {
        return Vec::new();
    };
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, text, source_type).parse();
    ret.diagnostics
        .errors()
        .map(|e| format!("{path}: {e}"))
        .collect()
}

#[test]
fn goldens_match() {
    let update = std::env::var("UPDATE_GOLDENS").is_ok_and(|v| v == "1");
    let fixtures = fixtures();
    assert!(fixtures.len() >= 20, "expected at least 20 fixture inputs");
    let mut problems = Vec::new();
    for (name, project) in &fixtures {
        for &fw in FRAMEWORKS {
            let output = compile_for(project, fw).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
            let dir = root().join(name).join("expected").join(fw.id());
            if update {
                write_expected(&dir, &output);
                continue;
            }
            let mut expected = BTreeMap::new();
            read_tree(&dir.join("files"), &dir.join("files"), &mut expected);
            let actual: BTreeMap<String, String> = output
                .files
                .iter()
                .filter(|(p, _)| !SHARED.contains(&p.as_str()))
                .map(|(p, t)| (p.clone(), t.clone()))
                .collect();
            if expected.is_empty() {
                problems.push(format!(
                    "{name}/{}: no expected files (run with UPDATE_GOLDENS=1)",
                    fw.id()
                ));
                continue;
            }
            for (path, text) in &actual {
                match expected.get(path) {
                    None => problems.push(format!("{name}/{}: unexpected file {path}", fw.id())),
                    Some(e) if e != text => {
                        problems.push(format!("{name}/{}: {path} differs", fw.id()))
                    }
                    Some(_) => {}
                }
            }
            for path in expected.keys() {
                if !actual.contains_key(path) {
                    problems.push(format!("{name}/{}: missing file {path}", fw.id()));
                }
            }
            let meta_path = dir.join("output.json");
            let expected_meta = fs::read_to_string(&meta_path).unwrap_or_default();
            if expected_meta != meta(&output) {
                problems.push(format!("{name}/{}: output.json differs", fw.id()));
            }
        }
    }
    assert!(
        problems.is_empty(),
        "golden mismatches:\n{}",
        problems.join("\n")
    );
}

#[test]
fn generated_scripts_parse() {
    let mut errors = Vec::new();
    for (name, project) in fixtures() {
        for &fw in FRAMEWORKS {
            let output =
                compile_for(&project, fw).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
            for (path, text) in &output.files {
                if path.ends_with(".ts") || path.ends_with(".tsx") || path.ends_with(".mjs") {
                    errors.extend(parse_errors(&format!("{name}/{path}"), text));
                }
            }
        }
    }
    assert!(errors.is_empty(), "{}", errors.join("\n"));
}

#[test]
fn compiling_is_deterministic() {
    for (name, project) in fixtures() {
        for &fw in FRAMEWORKS {
            let a = compile_for(&project, fw).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
            let b =
                compile_for(&project.clone(), fw).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
            assert_eq!(a, b, "{name} is not deterministic");
        }
    }
}

#[test]
fn spans_cover_their_elements() {
    for (name, project) in fixtures() {
        for &fw in FRAMEWORKS {
            let output =
                compile_for(&project, fw).unwrap_or_else(|e| fail(&format!("{name}: {e}")));
            for span in &output.spans {
                let text = &output.files[&span.path];
                let units: Vec<u16> = text.encode_utf16().collect();
                let slice = String::from_utf16_lossy(&units[span.start..span.end]);
                assert!(
                    slice.starts_with('<'),
                    "{name}: span of {} starts with {slice:?}",
                    span.node
                );
                assert!(
                    slice.ends_with('>'),
                    "{name}: span of {} ends badly",
                    span.node
                );
                assert!(
                    project.nodes.contains_key(&span.node),
                    "{name}: span for unknown node"
                );
            }
        }
    }
}
