## Next.js-specific fix knowledge

> **Reference, not a checklist.** The items below are background knowledge about
> how to fix common Next.js issues. They are NOT a list of problems in this
> project. Only act on a point here if it directly addresses one of the failing
> audits in the findings above, and only after confirming the project doesn't
> already do it.

- **LCP image**: use `next/image` with `priority` (App Router) — this sets
  `fetchpriority="high"` and preloads. For a plain `<img>`, add
  `fetchpriority="high"` and `loading="eager"`.
- **Legacy JS polyfills**: Next ships polyfills for old browsers. Set a modern
  `browserslist` (e.g. `"defaults and supports es6-module"`) in package.json to
  drop them. ~20-30KB savings.
- **Render-blocking CSS**: prefer CSS Modules / Tailwind over global imports;
  use `next/font` for fonts (it self-hosts and inlines font-face with
  `font-display: swap`).
- **Bundle**: use `next/dynamic` for below-the-fold or heavy client components.
  Check `experimental.optimizePackageImports` in `next.config` for barrel files
  (e.g. icon libraries, lodash-es).
- **Fonts**: `next/font/google` or `next/font/local` removes the render-blocking
  network request and layout shift.
- Config file is `next.config.js` / `next.config.ts` / `next.config.mjs`.
- App Router pages live in `app/`, Pages Router in `pages/`.
