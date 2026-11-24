//! Rust half of the model parity check (TS half: packages/model/src/parity.test.ts).
//!
//! Every fixture in fixtures/model/valid was produced and validated by the TypeScript schema;
//! the Rust types must read it and write back the same JSON. Every fixture in
//! fixtures/model/invalid has a shape error that both sides must reject.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;
use truframe_compiler::model::Project;

fn fixtures(dir: &str) -> Vec<(String, String)> {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../fixtures/model");
    let mut out: Vec<(String, String)> = fs::read_dir(root.join(dir))
        .unwrap_or_else(|e| fail(&format!("read fixtures/model/{dir}: {e}")))
        .filter_map(|entry| entry.ok().map(|e| e.path()))
        .filter(|p: &PathBuf| p.extension().is_some_and(|x| x == "json"))
        .map(|p| {
            let name = p
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_default();
            let json = fs::read_to_string(&p).unwrap_or_else(|e| fail(&format!("read {p:?}: {e}")));
            (name, json)
        })
        .collect();
    out.sort();
    if out.is_empty() {
        fail(&format!("no fixtures in fixtures/model/{dir}"));
    }
    out
}

/// Test-only failure helper (the crate denies `panic!`/`unwrap` in library code).
#[allow(clippy::panic)]
fn fail(msg: &str) -> ! {
    panic!("{msg}")
}

/// JSON numbers compare by value: `24` from TypeScript equals `24.0` from serde's f64.
fn normalize(v: Value) -> Value {
    match v {
        Value::Number(n) => n
            .as_f64()
            .and_then(serde_json::Number::from_f64)
            .map_or(Value::Number(n), Value::Number),
        Value::Array(a) => Value::Array(a.into_iter().map(normalize).collect()),
        Value::Object(o) => Value::Object(o.into_iter().map(|(k, v)| (k, normalize(v))).collect()),
        other => other,
    }
}

fn parse(json: &str) -> Value {
    serde_json::from_str(json).unwrap_or_else(|e| fail(&format!("not JSON: {e}")))
}

#[test]
fn reads_and_writes_every_valid_fixture_unchanged() {
    let mut failures = Vec::new();
    for (name, json) in fixtures("valid") {
        match Project::from_json(&json).and_then(|p| p.to_json()) {
            Ok(out) => {
                if normalize(parse(&out)) != normalize(parse(&json)) {
                    failures.push(format!("{name}: round trip changed the JSON:\n{out}"));
                }
            }
            Err(e) => failures.push(format!("{name}: {e}")),
        }
    }
    assert!(failures.is_empty(), "{}", failures.join("\n\n"));
}

#[test]
fn rejects_every_invalid_fixture() {
    let accepted: Vec<String> = fixtures("invalid")
        .into_iter()
        .filter(|(_, json)| Project::from_json(json).is_ok())
        .map(|(name, _)| name)
        .collect();
    assert!(
        accepted.is_empty(),
        "Rust accepted invalid fixtures: {accepted:?}"
    );
}

#[test]
fn rejects_other_schema_versions() {
    let (_, json) = fixtures("valid").remove(0);
    let mut doc = parse(&json);
    doc["schemaVersion"] = Value::from(2);
    let result = Project::from_json(&doc.to_string());
    assert!(result.is_err(), "schema version 2 was accepted");
}
