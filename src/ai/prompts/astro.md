## Astro-specific fix knowledge

> **Reference, not a checklist.** The items below are background knowledge about
> how to fix common Astro issues. They are NOT a list of problems in this
> project. Only act on a point here if it directly addresses one of the failing
> audits in the findings above, and only after confirming the project doesn't
> already do it.

- **Images**: use `astro:assets` `<Image />` for automatic optimization,
  responsive `srcset`, and modern formats. Add `loading="eager"` +
  `fetchpriority="high"` to the LCP image only.
- **JS shipped**: Astro ships zero JS by default. If a component hydrates
  unnecessarily, change its client directive — prefer `client:visible` or
  `client:idle` over `client:load`, or drop the directive entirely for static
  content.
- **Render-blocking**: Astro inlines small stylesheets automatically. Use
  `<style>` in `.astro` files (scoped) rather than global CSS imports.
- **Fonts**: self-host with `@font-face` and `font-display: swap`, or use an
  integration like `astro-font`.
- Config file is `astro.config.mjs`.
- Islands architecture: only hydrate what needs interactivity.
