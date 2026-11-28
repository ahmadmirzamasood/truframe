/**
 * Syntax highlighting for the generated files. Astro has no CodeMirror package, so it is
 * HTML (with self-closing component tags) plus TypeScript in the `---` frontmatter and the
 * usual JavaScript / CSS inside `<script>` / `<style>`.
 */
import { css, cssLanguage } from "@codemirror/lang-css";
import { htmlLanguage } from "@codemirror/lang-html";
import { javascript, javascriptLanguage, typescriptLanguage } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { LanguageSupport } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { parseMixed } from "@lezer/common";
import type { LanguageId } from "./files.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

const astroLanguage = htmlLanguage.configure({
  dialect: "selfClosing noMatch",
  wrap: parseMixed((node, input) => {
    if (node.type.isTop) {
      const m = FRONTMATTER.exec(input.read(0, Math.min(input.length, 200_000)));
      const body = m?.[1];
      if (!body) return null;
      const from = m[0].indexOf(body);
      return { parser: typescriptLanguage.parser, overlay: [{ from, to: from + body.length }] };
    }
    if (node.name === "ScriptText") return { parser: javascriptLanguage.parser };
    if (node.name === "StyleText") return { parser: cssLanguage.parser };
    return null;
  }),
});

let cache: Partial<Record<LanguageId, Extension>> = {};

export function languageExtension(id: LanguageId): Extension {
  const hit = cache[id];
  if (hit) return hit;
  const ext: Extension = (() => {
    switch (id) {
      case "tsx":
        return javascript({ jsx: true, typescript: true });
      case "ts":
        return javascript({ typescript: true });
      case "js":
        return javascript();
      case "astro":
        return new LanguageSupport(astroLanguage);
      case "css":
        return css();
      case "json":
        return json();
      // README.md stays plain text: Markdown support would add ~45 KB for one file.
      case "markdown":
      case "text":
        return [];
    }
  })();
  cache = { ...cache, [id]: ext };
  return ext;
}
