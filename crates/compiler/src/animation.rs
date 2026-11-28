//! Layer animations (PRD F30, ARCHITECTURE §6.1): `animations.css`, the classes on animated
//! elements and the In view fallback scripts.
//!
//! An animated element gets `tf-anim` plus a trigger class, and Tailwind arbitrary properties
//! for whatever differs from the defaults in `animations.css` (`[--tf-y:24px]`). The keyframes
//! animate from those values to the element's own style. Everything sits in
//! `@media (prefers-reduced-motion: no-preference)`; only transform, opacity and filter move.
//!
//! Triggers: `tf-load` plays on load; `tf-loop` alternates forever; `tf-view` (In view, every
//! time) is a scroll-driven `view()` animation where supported, and otherwise waits for the
//! IntersectionObserver fallback to add `tf-in`; `tf-view-once` (In view, once) always uses the
//! fallback, because a scroll-driven animation reverses when the visitor scrolls back. The
//! waiting state is gated on `@media (scripting: enabled)`, so without JavaScript layers just
//! play on load instead of staying hidden.

use crate::model::{
    Animation, AnimationBreakpoint, AnimationEasing, AnimationTrigger, Breakpoints, Node, Project,
};
use crate::names::num;

const DEFAULT_DURATION: f64 = 600.0;
const DEFAULT_EASE: &str = "ease-out";

/// What the project's animations need from the generated project.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct AnimUse {
    /// Any layer animates: emit `animations.css`.
    pub any: bool,
    /// Any layer animates In view: emit the IntersectionObserver fallback.
    pub in_view: bool,
}

pub fn uses(project: &Project) -> AnimUse {
    let mut u = AnimUse::default();
    for n in project.nodes.values() {
        if let Some(a) = n.animation() {
            u.any = true;
            u.in_view |= a.trigger == AnimationTrigger::InView;
        }
    }
    u
}

/// The animation an element plays, if any, and its delay in ms: its own (unless it staggers
/// its children), or its parent's stagger, `index` steps after the parent's delay.
pub fn of<'a>(id: &str, n: &'a Node, parent: Option<&'a Node>) -> Option<(&'a Animation, f64)> {
    if let Some(a) = n.animation() {
        return match a.stagger_children {
            Some(_) => None,
            None => Some((a, a.delay)),
        };
    }
    let p = parent?.animation()?;
    let step = p.stagger_children?;
    let index = parent?.children().iter().position(|c| c == id)?;
    Some((p, p.delay + step * index as f64))
}

fn ease(e: AnimationEasing) -> &'static str {
    match e {
        AnimationEasing::Ease => "ease",
        AnimationEasing::EaseIn => "ease-in",
        AnimationEasing::EaseOut => "ease-out",
        AnimationEasing::EaseInOut => "ease-in-out",
        AnimationEasing::Linear => "linear",
        AnimationEasing::BackOut => "cubic-bezier(0.34,1.56,0.64,1)",
    }
}

/// Custom properties for what differs from the defaults in `animations.css`, in a fixed order.
pub fn vars(a: &Animation, delay: f64) -> Vec<(&'static str, String)> {
    let f = &a.from;
    let mut out = Vec::new();
    let mut push = |name, v: Option<f64>, default: f64, unit: &str| {
        if let Some(v) = v.filter(|v| *v != default) {
            out.push((name, format!("{}{unit}", num(v))));
        }
    };
    push("--tf-opacity", f.opacity, 1.0, "");
    push("--tf-x", f.x, 0.0, "px");
    push("--tf-y", f.y, 0.0, "px");
    push("--tf-scale", f.scale, 1.0, "");
    push("--tf-rotate", f.rotate, 0.0, "deg");
    push("--tf-blur", f.blur, 0.0, "px");
    push("--tf-duration", Some(a.duration), DEFAULT_DURATION, "ms");
    push("--tf-delay", Some(delay), 0.0, "ms");
    let e = ease(a.easing);
    if e != DEFAULT_EASE {
        out.push(("--tf-ease", e.to_string()));
    }
    out
}

/// `tf-anim` and its trigger class, plus `tf-blur` when the from state is blurred.
pub fn base_classes(a: &Animation) -> Vec<&'static str> {
    let mut out = vec![
        "tf-anim",
        match (a.trigger, a.once) {
            (AnimationTrigger::Load, _) => "tf-load",
            (AnimationTrigger::Loop, _) => "tf-loop",
            (AnimationTrigger::InView, true) => "tf-view-once",
            (AnimationTrigger::InView, false) => "tf-view",
        },
    ];
    if a.from.blur.is_some_and(|b| b > 0.0) {
        out.push("tf-blur");
    }
    out
}

/// Whether the animation plays at Tablet and at Mobile (Desktop always plays).
pub fn enabled(a: &Animation, bps: &Breakpoints) -> (bool, bool) {
    let off = |b| a.disabled_on.contains(&b);
    (
        bps.tablet.is_none() || !off(AnimationBreakpoint::Tablet),
        bps.mobile.is_none() || !off(AnimationBreakpoint::Mobile),
    )
}

/// Every class an animated element gets: base classes, `[--tf-*:…]` values and the
/// per-breakpoint switches. `tablet:` covers Mobile too (desktop-first), so Mobile undoes a
/// Tablet switch-off with `revert-layer`, which falls back to the `animations.css` rule.
pub fn classes(a: &Animation, delay: f64, bps: &Breakpoints) -> Vec<String> {
    let mut out: Vec<String> = base_classes(a).into_iter().map(String::from).collect();
    for (name, value) in vars(a, delay) {
        out.push(format!("[{name}:{value}]"));
    }
    let (tablet, mobile) = enabled(a, bps);
    let has_tablet = bps.tablet.is_some();
    if !tablet {
        out.push("tablet:[animation:none]".into());
    }
    match (has_tablet && !tablet, mobile) {
        (true, true) if bps.mobile.is_some() => out.push("mobile:[animation:revert-layer]".into()),
        (false, false) => out.push("mobile:[animation:none]".into()),
        _ => {}
    }
    out
}

/// The canvas form (P6A-4): custom property declarations instead of arbitrary classes.
pub fn canvas_vars(a: &Animation, delay: f64) -> String {
    vars(a, delay)
        .iter()
        .map(|(k, v)| format!("{k}: {v};"))
        .collect::<Vec<_>>()
        .join(" ")
}

/// `animations.css`. The same for every project that animates (breakpoints live in classes).
pub fn animations_css() -> String {
    String::from(concat!(
        "/*\n",
        " * Layer animations. An animated element plays from the values in its --tf-*\n",
        " * properties to its own style. Only transform, opacity and filter animate, and only\n",
        " * for visitors who haven't asked their system for reduced motion.\n",
        " *\n",
        " * tf-load: on load. tf-loop: back and forth forever. tf-view-once: the first time it\n",
        " * scrolls into view. tf-view: every time it scrolls into view (driven by scrolling where\n",
        " * the browser supports animation-timeline: view()). In view layers wait for the\n",
        " * IntersectionObserver script to add tf-in.\n",
        " */\n",
        "@layer base {\n",
        "  @media (prefers-reduced-motion: no-preference) {\n",
        "    @keyframes tf-in {\n",
        "      from {\n",
        "        opacity: var(--tf-opacity);\n",
        "        transform: translate(var(--tf-x), var(--tf-y)) scale(var(--tf-scale))\n",
        "          rotate(var(--tf-rotate));\n",
        "      }\n",
        "    }\n",
        "    @keyframes tf-in-blur {\n",
        "      from {\n",
        "        opacity: var(--tf-opacity);\n",
        "        transform: translate(var(--tf-x), var(--tf-y)) scale(var(--tf-scale))\n",
        "          rotate(var(--tf-rotate));\n",
        "        filter: blur(var(--tf-blur));\n",
        "      }\n",
        "    }\n",
        "    .tf-anim {\n",
        "      --tf-opacity: 1;\n",
        "      --tf-x: 0px;\n",
        "      --tf-y: 0px;\n",
        "      --tf-scale: 1;\n",
        "      --tf-rotate: 0deg;\n",
        "      --tf-blur: 0px;\n",
        "      --tf-duration: 600ms;\n",
        "      --tf-delay: 0ms;\n",
        "      --tf-ease: ease-out;\n",
        "      animation: tf-in var(--tf-duration) var(--tf-ease) var(--tf-delay) both;\n",
        "    }\n",
        "    .tf-anim.tf-blur {\n",
        "      animation-name: tf-in-blur;\n",
        "    }\n",
        "    .tf-anim.tf-loop {\n",
        "      animation-direction: alternate;\n",
        "      animation-iteration-count: infinite;\n",
        "    }\n",
        "    @media (scripting: enabled) {\n",
        "      .tf-anim.tf-view-once:not(.tf-in) {\n",
        "        animation-play-state: paused;\n",
        "      }\n",
        "    }\n",
        "    @supports (animation-timeline: view()) {\n",
        "      .tf-anim.tf-view {\n",
        "        animation-delay: 0s;\n",
        "        animation-duration: auto;\n",
        "        animation-range: entry 0% cover 35%;\n",
        "        animation-timeline: view();\n",
        "      }\n",
        "    }\n",
        "    @supports not (animation-timeline: view()) {\n",
        "      @media (scripting: enabled) {\n",
        "        .tf-anim.tf-view:not(.tf-in) {\n",
        "          animation-play-state: paused;\n",
        "        }\n",
        "      }\n",
        "    }\n",
        "  }\n",
        "}\n",
    ))
}

/// The IntersectionObserver fallback's body: watches In view layers, adds `tf-in` when one
/// enters, and for "every time" layers rewinds the animation when it leaves. Kept under 1 KB
/// with the wrapper of either framework (tested).
pub const OBSERVER_JS: &str = concat!(
    "const view = CSS.supports(\"animation-timeline: view()\");\n",
    "const io = new IntersectionObserver(\n",
    "  (entries) => {\n",
    "    for (const { target, isIntersecting } of entries) {\n",
    "      const el = target as HTMLElement;\n",
    "      const once = el.classList.contains(\"tf-view-once\");\n",
    "      if (isIntersecting) {\n",
    "        el.classList.add(\"tf-in\");\n",
    "        if (once) io.unobserve(el);\n",
    "      } else if (!once && el.classList.contains(\"tf-in\")) {\n",
    "        // Rewind, so it plays again next time.\n",
    "        el.classList.remove(\"tf-in\");\n",
    "        el.style.animation = \"none\";\n",
    "        void el.offsetWidth;\n",
    "        el.style.animation = \"\";\n",
    "      }\n",
    "    }\n",
    "  },\n",
    "  { threshold: 0.15 },\n",
    ");\n",
    "const selector = view ? \".tf-view-once\" : \".tf-view-once, .tf-view\";\n",
    "for (const el of document.querySelectorAll(selector)) io.observe(el);\n",
);

/// The fallback as plain JavaScript (Astro's inline script): the TS cast removed.
pub fn observer_js_plain() -> String {
    OBSERVER_JS.replace("const el = target as HTMLElement;", "const el = target;")
}

/// `components/InView.tsx` (Next.js): a client component in the layout that re-scans after
/// every client-side navigation.
pub fn next_in_view() -> String {
    let mut s = String::from(concat!(
        "\"use client\";\n",
        "\n",
        "import { usePathname } from \"next/navigation\";\n",
        "import { useEffect } from \"react\";\n",
        "\n",
        "// Plays In view animations when layers scroll into view (see animations.css).\n",
        "export default function InView() {\n",
        "  const pathname = usePathname();\n",
        "  useEffect(() => {\n",
        "    if (!pathname || !(\"IntersectionObserver\" in window)) return;\n",
    ));
    for line in OBSERVER_JS.lines() {
        s.push_str("    ");
        s.push_str(line);
        s.push('\n');
    }
    s.push_str(concat!(
        "    return () => io.disconnect();\n",
        "  }, [pathname]);\n",
        "  return null;\n",
        "}\n",
    ));
    s
}

/// The Astro layout's inline script, placed at the end of `<body>` so the page is parsed.
pub fn astro_in_view_lines() -> Vec<String> {
    let mut out = vec!["<script is:inline>".to_string()];
    out.push("  if (\"IntersectionObserver\" in window) {".to_string());
    for line in observer_js_plain().lines() {
        out.push(format!("    {line}"));
    }
    out.push("  }".to_string());
    out.push("</script>".to_string());
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AnimationFrom, Breakpoint};

    fn anim() -> Animation {
        Animation {
            trigger: AnimationTrigger::InView,
            from: AnimationFrom {
                opacity: Some(0.0),
                y: Some(24.0),
                ..Default::default()
            },
            duration: 600.0,
            delay: 0.0,
            easing: AnimationEasing::EaseOut,
            once: true,
            stagger_children: None,
            disabled_on: vec![],
        }
    }

    fn bps(tablet: bool, mobile: bool) -> Breakpoints {
        Breakpoints {
            desktop: Breakpoint { width: 1200 },
            tablet: tablet.then_some(Breakpoint { width: 810 }),
            mobile: mobile.then_some(Breakpoint { width: 390 }),
        }
    }

    #[test]
    fn only_non_default_values_become_classes() {
        assert_eq!(
            classes(&anim(), 0.0, &bps(true, true)),
            [
                "tf-anim",
                "tf-view-once",
                "[--tf-opacity:0]",
                "[--tf-y:24px]"
            ]
        );
        let mut a = anim();
        a.trigger = AnimationTrigger::Loop;
        a.easing = AnimationEasing::BackOut;
        a.duration = 1200.0;
        a.from = AnimationFrom {
            scale: Some(0.9),
            rotate: Some(-5.0),
            blur: Some(8.0),
            ..Default::default()
        };
        assert_eq!(
            classes(&a, 150.0, &bps(true, true)),
            [
                "tf-anim",
                "tf-loop",
                "tf-blur",
                "[--tf-scale:0.9]",
                "[--tf-rotate:-5deg]",
                "[--tf-blur:8px]",
                "[--tf-duration:1200ms]",
                "[--tf-delay:150ms]",
                "[--tf-ease:cubic-bezier(0.34,1.56,0.64,1)]",
            ]
        );
    }

    #[test]
    fn breakpoints_switch_off_on_their_own() {
        let mut a = anim();
        a.disabled_on = vec![AnimationBreakpoint::Tablet];
        let tail = |a: &Animation, b: &Breakpoints| classes(a, 0.0, b)[4..].to_vec();
        assert_eq!(
            tail(&a, &bps(true, true)),
            ["tablet:[animation:none]", "mobile:[animation:revert-layer]"]
        );
        assert_eq!(tail(&a, &bps(true, false)), ["tablet:[animation:none]"]);
        a.disabled_on = vec![AnimationBreakpoint::Mobile];
        assert_eq!(tail(&a, &bps(true, true)), ["mobile:[animation:none]"]);
        assert_eq!(tail(&a, &bps(false, true)), ["mobile:[animation:none]"]);
        assert!(tail(&a, &bps(true, false)).is_empty());
        a.disabled_on = vec![AnimationBreakpoint::Tablet, AnimationBreakpoint::Mobile];
        assert_eq!(tail(&a, &bps(true, true)), ["tablet:[animation:none]"]);
    }

    #[test]
    fn fallback_scripts_stay_under_one_kilobyte() {
        // What a minifier can't remove: the code without indentation and comment lines.
        let size = |s: &str| -> usize {
            s.lines()
                .map(str::trim)
                .filter(|l| !l.starts_with("//"))
                .map(|l| l.len() + 1)
                .sum()
        };
        let next = next_in_view();
        assert!(size(&next) <= 1024, "{}", size(&next));
        let astro = astro_in_view_lines().join("\n");
        assert!(size(&astro) <= 1024, "{}", size(&astro));
        assert!(!astro.contains(" as "));
    }

    #[test]
    fn css_animates_only_transform_opacity_and_filter_inside_reduced_motion() {
        let css = animations_css();
        let body = css
            .split("@media (prefers-reduced-motion: no-preference) {")
            .nth(1);
        assert!(body.is_some());
        for block in css.split("from {").skip(1) {
            let block = block.split('}').next().unwrap_or("");
            for decl in block.split(';').map(str::trim).filter(|d| !d.is_empty()) {
                let prop = decl.split(':').next().unwrap_or("").trim();
                assert!(["opacity", "transform", "filter"].contains(&prop), "{prop}");
            }
        }
    }
}
