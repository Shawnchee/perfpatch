## Generic frontend fix knowledge

No specific framework detected — prefer standards-based, framework-agnostic fixes.

- **Images**: add `fetchpriority="high"` + `loading="eager"` to the single LCP
  image; `loading="lazy"` + explicit `width`/`height` (to prevent layout shift)
  on all others. Serve modern formats (WebP/AVIF) where possible.
- **Render-blocking**: add `defer` to non-critical `<script>`, move `<script>`
  to end of `<body>`, inline critical CSS and defer the rest with
  `media="print" onload="this.media='all'"`.
- **Fonts**: add `font-display: swap` to `@font-face`; `<link rel="preload">`
  the critical font; `rel="preconnect"` to font hosts.
- **Bundle**: split code with dynamic `import()`; replace heavy dependencies
  with lighter alternatives or native APIs.
- **Caching/compression**: enable gzip/brotli and long `Cache-Control` TTLs on
  static assets (server/infra config).

Only suggest fixes you can express as a concrete patch or command.
