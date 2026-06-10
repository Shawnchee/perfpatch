## Remix-specific fix knowledge

> **Reference, not a checklist.** The items below are background knowledge about
> how to fix common Remix issues. They are NOT a list of problems in this
> project. Only act on a point here if it directly addresses one of the failing
> audits in the findings above, and only after confirming the project doesn't
> already do it.

- **Images**: Remix has no built-in image component. Add `fetchpriority="high"`
  and `loading="eager"` to the LCP `<img>`; lazy-load the rest with
  `loading="lazy"`. Consider an external optimizer (imgix/cloudinary) or
  `unpic` for responsive images.
- **Preloading**: use route `links` export with `rel="preload"` for the LCP
  image and critical fonts.
- **Bundle**: Remix uses Vite. Use `React.lazy` + `Suspense` for heavy
  client-only components. Move logic into `loader`/`action` to keep client JS
  small.
- **Fonts**: declare them in the route `links` export with `rel="preload"` and
  set `font-display: swap` in the `@font-face`.
- **Render-blocking**: link CSS via the `links` export so Remix can manage it
  per-route.
- Config: `vite.config.ts` with the `@remix-run/dev` Vite plugin.
