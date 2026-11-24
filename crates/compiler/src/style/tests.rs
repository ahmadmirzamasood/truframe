//! Style engine cases: one assertion per case, props written as model JSON.

use std::collections::BTreeMap;

use serde_json::{Value, json};

use super::*;
use crate::model::{Breakpoint, Breakpoints, Props, Style, Tag, Variable};

struct Assets;
impl AssetUrls for Assets {
    fn background_url(&self, asset_id: &str) -> Option<String> {
        Some(format!("/assets/{asset_id}.png"))
    }
}

#[allow(clippy::unwrap_used, clippy::expect_used)]
fn vars() -> BTreeMap<String, Variable> {
    let v: BTreeMap<String, Variable> = serde_json::from_value(json!({
        "brand": { "id": "brand", "type": "color", "name": "Brand", "group": "Brand",
            "cssName": "--brand-accent", "value": { "desktop": "#ec221f" } },
        "space": { "id": "space", "type": "spacing", "name": "M", "group": "",
            "cssName": "--space-md", "value": { "desktop": 16 } },
        "heading": { "id": "heading", "type": "font", "name": "Heading", "group": "",
            "cssName": "--heading", "value": { "desktop": { "family": "Inter", "weight": 700,
                "size": 48, "lineHeight": 1.1, "letterSpacing": -0.02 } } }
    }))
    .expect("vars");
    v
}

#[allow(clippy::expect_used)]
fn props(v: Value) -> Props {
    serde_json::from_value(v).expect("props")
}

fn run(inputs: Vec<(Bp, BpInput)>, tag: Tag) -> Styled {
    let vars = vars();
    let env = Env {
        vars: &vars,
        assets: &Assets,
    };
    style_element(&inputs, NodeInfo { tag }, &env, SlotFilter::All)
}

fn input(p: Value, parent: Option<ParentLayout>) -> BpInput {
    BpInput {
        props: props(p),
        hidden: false,
        parent,
        has_absolute_child: false,
    }
}

/// Classes for desktop-only props in a block parent.
fn c(p: Value) -> String {
    run(vec![(Bp::Desktop, input(p, None))], Tag::Div)
        .classes
        .join(" ")
}

const ROW: Option<ParentLayout> = Some(ParentLayout {
    display: Some(Display::Stack),
    direction: Direction::Row,
});
const COLUMN: Option<ParentLayout> = Some(ParentLayout {
    display: Some(Display::Stack),
    direction: Direction::Column,
});
const GRID: Option<ParentLayout> = Some(ParentLayout {
    display: Some(Display::Grid),
    direction: Direction::Row,
});

fn in_parent(parent: Option<ParentLayout>, p: Value) -> String {
    run(vec![(Bp::Desktop, input(p, parent))], Tag::Div)
        .classes
        .join(" ")
}

#[allow(clippy::expect_used)]
fn cascade(style: Value) -> Styled {
    let style: Style = serde_json::from_value(style).expect("style");
    let bps = Breakpoints {
        desktop: Breakpoint { width: 1200 },
        tablet: Some(Breakpoint { width: 810 }),
        mobile: Some(Breakpoint { width: 390 }),
    };
    let inputs = effective(&style, &bps)
        .into_iter()
        .map(|(bp, props)| {
            (
                bp,
                BpInput {
                    props,
                    hidden: false,
                    parent: None,
                    has_absolute_child: false,
                },
            )
        })
        .collect();
    run(inputs, Tag::Div)
}

#[test]
fn layout_cases() {
    let cases: Vec<(Value, &str)> = vec![
        (json!({}), ""),
        (json!({ "display": "stack" }), "flex"),
        (
            json!({ "display": "stack", "direction": "column" }),
            "flex flex-col",
        ),
        (json!({ "display": "stack", "direction": "row" }), "flex"),
        (
            json!({ "display": "stack", "wrap": true }),
            "flex flex-wrap",
        ),
        (json!({ "display": "stack", "wrap": false }), "flex"),
        (
            json!({ "display": "stack", "align": "center", "justify": "between" }),
            "flex items-center justify-between",
        ),
        (
            json!({ "display": "stack", "align": "baseline", "justify": "evenly" }),
            "flex items-baseline justify-evenly",
        ),
        (json!({ "display": "stack", "gap": 16 }), "flex gap-4"),
        (json!({ "display": "stack", "gap": 18 }), "flex gap-4.5"),
        (json!({ "display": "stack", "gap": 13 }), "flex gap-[13px]"),
        (json!({ "display": "stack", "gap": 1 }), "flex gap-px"),
        (json!({ "display": "stack", "gap": 0 }), "flex gap-0"),
        (
            json!({ "display": "stack", "gap": { "var": "space" } }),
            "flex gap-(--space-md)",
        ),
        (
            json!({ "display": "grid", "gridColumns": 3, "gap": 24, "rowGap": 8 }),
            "grid grid-cols-3 gap-6 gap-y-2",
        ),
        (
            json!({ "display": "grid", "gridRows": 2 }),
            "grid grid-rows-2",
        ),
        // Layout props without a layout display are ignored.
        (json!({ "gap": 16, "align": "center" }), ""),
        (json!({ "direction": "column" }), ""),
    ];
    for (p, want) in cases {
        assert_eq!(c(p.clone()), want, "{p}");
    }
}

#[test]
fn padding_cases() {
    let pad = |t: Value, r: Value, b: Value, l: Value| json!({ "padding": { "top": t, "right": r, "bottom": b, "left": l } });
    let cases: Vec<(Value, &str)> = vec![
        (pad(json!(16), json!(16), json!(16), json!(16)), "p-4"),
        (pad(json!(8), json!(24), json!(8), json!(24)), "px-6 py-2"),
        (
            pad(json!(1), json!(2), json!(3), json!(4)),
            "pt-px pr-0.5 pb-[3px] pl-1",
        ),
        (pad(json!(0), json!(0), json!(0), json!(0)), "p-0"),
        (
            pad(
                json!({ "var": "space" }),
                json!({ "var": "space" }),
                json!({ "var": "space" }),
                json!({ "var": "space" }),
            ),
            "p-(--space-md)",
        ),
        (
            pad(json!(12.5), json!(12.5), json!(12.5), json!(12.5)),
            "p-[12.5px]",
        ),
    ];
    for (p, want) in cases {
        assert_eq!(c(p.clone()), want, "{p}");
    }
}

#[test]
fn size_cases() {
    let cases: Vec<(Option<ParentLayout>, Value, &str)> = vec![
        (
            None,
            json!({ "width": { "type": "fixed", "value": 320 } }),
            "w-80",
        ),
        (
            None,
            json!({ "width": { "type": "fixed", "value": 321 } }),
            "w-[321px]",
        ),
        (None, json!({ "width": { "type": "fill" } }), "w-full"),
        (None, json!({ "width": { "type": "fit" } }), "w-fit"),
        (None, json!({ "height": { "type": "fill" } }), "h-full"),
        (ROW, json!({ "width": { "type": "fill" } }), "flex-1"),
        (ROW, json!({ "height": { "type": "fill" } }), "self-stretch"),
        (
            ROW,
            json!({ "width": { "type": "fixed", "value": 200 } }),
            "flex-none w-50",
        ),
        (
            ROW,
            json!({ "width": { "type": "fit" } }),
            "flex-none w-fit",
        ),
        (
            COLUMN,
            json!({ "width": { "type": "fill" } }),
            "self-stretch",
        ),
        (COLUMN, json!({ "height": { "type": "fill" } }), "flex-1"),
        (
            COLUMN,
            json!({ "width": { "type": "fill" }, "height": { "type": "fixed", "value": 40 } }),
            "flex-none self-stretch h-10",
        ),
        (GRID, json!({ "width": { "type": "fill" } }), "w-full"),
        (
            GRID,
            json!({ "columnSpan": 2, "rowSpan": 3 }),
            "col-span-2 row-span-3",
        ),
        // Spans only mean something inside a grid.
        (ROW, json!({ "columnSpan": 2 }), ""),
        (
            None,
            json!({ "minWidth": 100, "maxWidth": 1200, "minHeight": 3, "maxHeight": 0 }),
            "min-w-25 max-w-300 min-h-[3px] max-h-0",
        ),
        (None, json!({ "aspectRatio": 1 }), "aspect-square"),
        (None, json!({ "aspectRatio": 1.7778 }), "aspect-video"),
        (None, json!({ "aspectRatio": 1.5 }), "aspect-[1.5]"),
        (None, json!({ "overflow": "clip" }), "overflow-clip"),
        (None, json!({ "overflow": "visible" }), "overflow-visible"),
    ];
    for (parent, p, want) in cases {
        assert_eq!(in_parent(parent, p.clone()), want, "{p} in {parent:?}");
    }
}

#[test]
fn position_cases() {
    let cases: Vec<(Option<ParentLayout>, Value, &str)> = vec![
        (
            None,
            json!({ "position": "absolute", "top": 0, "left": 16 }),
            "absolute top-0 left-4",
        ),
        (
            None,
            json!({ "position": "absolute", "right": -8, "bottom": -13 }),
            "absolute -right-2 bottom-[-13px]",
        ),
        (None, json!({ "zIndex": 10 }), "z-10"),
        (None, json!({ "zIndex": -1 }), "-z-1"),
        (None, json!({ "position": "auto" }), ""),
        // An absolute child doesn't take part in its parent's flex layout.
        (
            ROW,
            json!({ "position": "absolute", "width": { "type": "fill" } }),
            "absolute w-full",
        ),
    ];
    for (parent, p, want) in cases {
        assert_eq!(in_parent(parent, p.clone()), want, "{p}");
    }
    let mut parent = input(json!({ "display": "stack" }), None);
    parent.has_absolute_child = true;
    let s = run(vec![(Bp::Desktop, parent)], Tag::Div);
    assert_eq!(s.classes.join(" "), "flex relative");
}

#[test]
fn typography_cases() {
    let cases: Vec<(Value, &str)> = vec![
        (json!({ "fontSize": 14 }), "text-sm"),
        (json!({ "fontSize": 48 }), "text-5xl"),
        (json!({ "fontSize": 15 }), "text-[15px]"),
        (
            json!({ "fontSize": 16, "lineHeight": 1.5 }),
            "text-base leading-normal",
        ),
        (json!({ "lineHeight": 1.4 }), "leading-[1.4]"),
        (json!({ "lineHeight": 1 }), "leading-none"),
        (json!({ "fontWeight": 700 }), "font-bold"),
        (json!({ "fontWeight": 400 }), "font-normal"),
        (json!({ "fontWeight": 100 }), "font-thin"),
        (json!({ "letterSpacing": -0.025 }), "tracking-tight"),
        (json!({ "letterSpacing": 0.02 }), "tracking-[0.02em]"),
        (json!({ "letterSpacing": -0.01 }), "tracking-[-0.01em]"),
        (json!({ "textAlign": "center" }), "text-center"),
        (json!({ "textDecoration": "line-through" }), "line-through"),
        (json!({ "textDecoration": "none" }), "no-underline"),
        (json!({ "textTransform": "uppercase" }), "uppercase"),
        (json!({ "textColor": "#111111" }), "text-[#111111]"),
        (
            json!({ "textColor": { "var": "brand" } }),
            "text-(color:--brand-accent)",
        ),
        (
            json!({ "fontFamily": "Inter" }),
            "font-(family-name:--tf-font-inter)",
        ),
        (
            json!({ "fontFamily": "Playfair Display" }),
            "font-(family-name:--tf-font-playfair-display)",
        ),
        (
            json!({ "font": { "var": "heading" } }),
            "font-(family-name:--heading-family) text-(length:--heading-size) [font-weight:var(--heading-weight)] leading-(--heading-line-height) tracking-(--heading-letter-spacing)",
        ),
        // The layer's own value wins over the text style for that part only.
        (
            json!({ "font": { "var": "heading" }, "fontWeight": 400 }),
            "font-(family-name:--heading-family) text-(length:--heading-size) font-normal leading-(--heading-line-height) tracking-(--heading-letter-spacing)",
        ),
    ];
    for (p, want) in cases {
        assert_eq!(c(p.clone()), want, "{p}");
    }
}

#[test]
fn appearance_cases() {
    let border = |w: f64, sides: [bool; 4], style: &str| {
        json!({ "border": { "width": w, "color": "#e5e5e5", "style": style,
            "sides": { "top": sides[0], "right": sides[1], "bottom": sides[2], "left": sides[3] } } })
    };
    let cases: Vec<(Value, &str)> = vec![
        (
            json!({ "fill": { "type": "solid", "color": "#ffffff" } }),
            "bg-[#ffffff]",
        ),
        (
            json!({ "fill": { "type": "solid", "color": { "var": "brand" } } }),
            "bg-(--brand-accent)",
        ),
        (
            json!({ "fill": { "type": "linearGradient", "angle": 90, "stops": [
                { "color": "#000000", "position": 0 }, { "color": "#ffffff", "position": 1 }] } }),
            "bg-[linear-gradient(90deg,#000000_0%,#ffffff_100%)]",
        ),
        (
            json!({ "fill": { "type": "image", "assetId": "hero", "fit": "fill" } }),
            "bg-[url(/assets/hero.png)] bg-cover bg-center bg-no-repeat",
        ),
        (
            json!({ "fill": { "type": "image", "assetId": "tile", "fit": "tile" } }),
            "bg-[url(/assets/tile.png)] bg-auto bg-repeat",
        ),
        (border(1.0, [true; 4], "solid"), "border border-[#e5e5e5]"),
        (
            border(2.0, [true; 4], "dashed"),
            "border-2 border-dashed border-[#e5e5e5]",
        ),
        (
            border(3.0, [false, false, true, false], "solid"),
            "border-b-[3px] border-[#e5e5e5]",
        ),
        (
            border(1.0, [true, false, true, false], "dotted"),
            "border-t border-b border-dotted border-[#e5e5e5]",
        ),
        (json!({ "radius": 8 }), "rounded-lg"),
        (json!({ "radius": 10 }), "rounded-[10px]"),
        (json!({ "radius": 9999 }), "rounded-full"),
        (json!({ "radius": 0 }), "rounded-none"),
        (
            json!({ "radius": { "topLeft": 8, "topRight": 8, "bottomRight": 0, "bottomLeft": 0 } }),
            "rounded-tl-lg rounded-tr-lg rounded-br-none rounded-bl-none",
        ),
        (
            json!({ "radius": { "topLeft": 4, "topRight": 4, "bottomRight": 4, "bottomLeft": 4 } }),
            "rounded-sm",
        ),
        (
            json!({ "shadows": [{ "x": 0, "y": 4, "blur": 6, "spread": 0, "color": "#0000001a", "inset": false }] }),
            "shadow-[0px_4px_6px_0px_#0000001a]",
        ),
        (
            json!({ "shadows": [
                { "x": 0, "y": 1, "blur": 2, "spread": 0, "color": "#00000033", "inset": true },
                { "x": 0, "y": 8, "blur": 24, "spread": -4, "color": { "var": "brand" }, "inset": false }] }),
            "shadow-[inset_0px_1px_2px_0px_#00000033,0px_8px_24px_-4px_var(--brand-accent)]",
        ),
        (json!({ "shadows": [] }), "shadow-none"),
        (json!({ "opacity": 0.5 }), "opacity-50"),
        (json!({ "opacity": 0.333 }), "opacity-[0.333]"),
        (json!({ "opacity": 1 }), "opacity-100"),
        (json!({ "blend": "color-dodge" }), "mix-blend-color-dodge"),
        (json!({ "blur": 4 }), "blur-[4px]"),
        (json!({ "blur": 0 }), "blur-none"),
    ];
    for (p, want) in cases {
        assert_eq!(c(p.clone()), want, "{p}");
    }
}

#[test]
fn breakpoint_cases() {
    let cases: Vec<(Value, &str)> = vec![
        // Overrides emit only what changes, with the breakpoint variant.
        (
            json!({ "desktop": { "display": "stack", "gap": 32 }, "tablet": { "gap": 16 }, "mobile": { "gap": 8 } }),
            "flex gap-8 tablet:gap-4 mobile:gap-2",
        ),
        // Inherited values aren't repeated.
        (
            json!({ "desktop": { "display": "stack", "gap": 32 }, "mobile": { "gap": 8 } }),
            "flex gap-8 mobile:gap-2",
        ),
        // A row that stacks on mobile.
        (
            json!({ "desktop": { "display": "stack" }, "mobile": { "direction": "column" } }),
            "flex mobile:flex-col",
        ),
        // Setting the same value as above emits nothing.
        (
            json!({ "desktop": { "fontSize": 16 }, "tablet": { "fontSize": 16 } }),
            "text-base",
        ),
        // A stack that becomes a grid drops stack-only classes.
        (
            json!({ "desktop": { "display": "stack", "direction": "column" }, "tablet": { "display": "grid", "gridColumns": 2 } }),
            "flex flex-col tablet:grid tablet:flex-row tablet:grid-cols-2",
        ),
        // A gradient on tablet clears the solid color from desktop.
        (
            json!({ "desktop": { "fill": { "type": "solid", "color": "#ffffff" } },
                    "tablet": { "fill": { "type": "linearGradient", "angle": 180, "stops": [
                        { "color": "#000000", "position": 0 }, { "color": "#ffffff", "position": 1 }] } } }),
            "bg-[#ffffff] tablet:bg-transparent tablet:bg-[linear-gradient(180deg,#000000_0%,#ffffff_100%)]",
        ),
        (
            json!({ "desktop": { "padding": { "top": 64, "right": 64, "bottom": 64, "left": 64 } },
                    "mobile": { "padding": { "top": 24, "right": 16, "bottom": 24, "left": 16 } } }),
            "p-16 mobile:px-4 mobile:py-6",
        ),
        (
            json!({ "desktop": { "fontSize": 48 }, "tablet": { "fontSize": 36 }, "mobile": { "fontSize": 30 } }),
            "text-5xl tablet:text-4xl mobile:text-3xl",
        ),
    ];
    for (style, want) in cases {
        assert_eq!(cascade(style.clone()).classes.join(" "), want, "{style}");
    }
}

#[test]
fn hidden_per_breakpoint_resets_to_the_natural_display() {
    let mk = |hidden: bool, p: Value| BpInput {
        props: props(p),
        hidden,
        parent: None,
        has_absolute_child: false,
    };
    let s = run(
        vec![
            (Bp::Desktop, mk(false, json!({ "display": "stack" }))),
            (Bp::Tablet, mk(true, json!({ "display": "stack" }))),
            (Bp::Mobile, mk(false, json!({ "display": "stack" }))),
        ],
        Tag::Div,
    );
    assert_eq!(s.classes.join(" "), "flex tablet:hidden mobile:flex");
    let s = run(
        vec![
            (Bp::Desktop, mk(true, json!({}))),
            (Bp::Mobile, mk(false, json!({}))),
        ],
        Tag::Span,
    );
    assert_eq!(s.classes.join(" "), "hidden mobile:inline");
}

#[test]
fn removed_props_reset_on_smaller_breakpoints() {
    // Effective props never lose a value in the cascade, but a parent's layout can change:
    // a fill child of a row becomes a stretch child of a column.
    let s = run(
        vec![
            (
                Bp::Desktop,
                input(json!({ "width": { "type": "fill" } }), ROW),
            ),
            (
                Bp::Mobile,
                input(json!({ "width": { "type": "fill" } }), COLUMN),
            ),
        ],
        Tag::Div,
    );
    assert_eq!(
        s.classes.join(" "),
        "flex-1 mobile:flex-initial mobile:self-stretch"
    );
    assert_eq!(s.css.desktop, "flex: 1 1 0%;");
    assert_eq!(
        s.css.mobile.as_deref(),
        Some("flex: 0 1 auto; align-self: stretch;")
    );
}

#[test]
fn canvas_css_matches_the_classes() {
    let s = cascade(json!({
        "desktop": { "display": "stack", "gap": 32, "fontSize": 14, "textColor": "#111111" },
        "tablet": { "gap": 16 }
    }));
    assert_eq!(
        s.css.desktop,
        "display: flex; gap: 32px; font-size: 0.875rem; line-height: calc(1.25 / 0.875); color: #111111;"
    );
    assert_eq!(s.css.tablet.as_deref(), Some("gap: 16px;"));
    assert_eq!(s.css.mobile, None);
}

#[test]
fn named_font_sizes_keep_an_explicit_line_height() {
    let s = cascade(json!({ "desktop": { "fontSize": 14, "lineHeight": 1.2 } }));
    assert_eq!(s.css.desktop, "font-size: 0.875rem; line-height: 1.2;");
}

#[test]
fn slot_filter_splits_outer_and_inner() {
    let vars = vars();
    let env = Env {
        vars: &vars,
        assets: &Assets,
    };
    let inputs = vec![(
        Bp::Desktop,
        input(
            json!({ "display": "stack", "gap": 8, "width": { "type": "fixed", "value": 320 }, "radius": 8 }),
            None,
        ),
    )];
    let node = NodeInfo { tag: Tag::Div };
    let outer = style_element(&inputs, node, &env, SlotFilter::Outer);
    let inner = style_element(&inputs, node, &env, SlotFilter::Inner);
    assert_eq!(outer.classes.join(" "), "flex w-80");
    assert_eq!(inner.classes.join(" "), "gap-2 rounded-lg");
}

#[test]
fn overrides_merge_field_by_field() {
    let style: Style =
        serde_json::from_value(json!({ "desktop": { "gap": 8, "radius": 4 } })).unwrap_or_default();
    let o: StyleOverride =
        serde_json::from_value(json!({ "desktop": { "radius": 12 }, "mobile": { "gap": 4 } }))
            .unwrap_or_default();
    let merged = apply_override(&style, &o);
    assert_eq!(merged.desktop.radius, Some(Radius::All(12.0)));
    assert_eq!(merged.desktop.gap, Some(SpacingValue::Px(8.0)));
    assert_eq!(
        merged.mobile.and_then(|m| m.gap),
        Some(SpacingValue::Px(4.0))
    );
}

#[test]
fn missing_breakpoints_are_skipped() {
    let style: Style =
        serde_json::from_value(json!({ "desktop": { "gap": 8 }, "tablet": { "gap": 4 } }))
            .unwrap_or_default();
    let bps = Breakpoints {
        desktop: Breakpoint { width: 1440 },
        tablet: None,
        mobile: Some(Breakpoint { width: 390 }),
    };
    let e = effective(&style, &bps);
    assert_eq!(e.len(), 2);
    assert_eq!(e[1].0, Bp::Mobile);
    // Tablet overrides are kept in the document but inactive while Tablet is removed.
    assert_eq!(e[1].1.gap, Some(SpacingValue::Px(8.0)));
}
