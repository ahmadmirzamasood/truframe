# Site

A Astro site styled with Tailwind CSS v4.

## Run it

```sh
npm install
npm run dev
```

`npm run build` writes a static site to `dist/`. `npm run typecheck` checks the types.

## Breakpoints

Styles are desktop-first: classes without a prefix are the desktop design (designed at 1440px wide).
This design has no tablet or mobile overrides.

The first class on each element (such as `hero-section`) names its layer in the design. It has no styles.

Design variables are CSS custom properties in `tokens.css`.

---

Generated with Truframe.
