## Astro-specific fix knowledge

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
