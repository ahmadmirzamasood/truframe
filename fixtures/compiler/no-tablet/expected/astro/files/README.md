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
Smaller screens override them with two custom variants declared in `src/styles/global.css`:

- `mobile:` applies when `(width < 1200px)` and wins over `tablet:`.

For example, `gap-8 tablet:gap-6 mobile:gap-4`.

The first class on each element (such as `hero-section`) names its layer in the design. It has no styles.

Design variables are CSS custom properties in `tokens.css`.

---

Generated with Truframe.
