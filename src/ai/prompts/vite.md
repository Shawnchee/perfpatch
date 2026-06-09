## Vite-specific fix knowledge

- **Images**: no built-in component. Add `fetchpriority="high"` +
  `loading="eager"` to the LCP image, `loading="lazy"` elsewhere. Use
  `vite-imagetools` or `vite-plugin-image-optimizer` for build-time optimization
  and modern formats.
- **Code splitting**: use dynamic `import()` and `React.lazy` for routes and
  heavy components. Configure `build.rollupOptions.output.manualChunks` to split
  large vendor deps.
- **Render-blocking**: Vite inlines small assets. Preload critical fonts in
  `index.html` with `<link rel="preload" as="font" crossorigin>`.
- **Bundle analysis**: `rollup-plugin-visualizer` reveals heavy deps.
- **Legacy JS**: only add `@vitejs/plugin-legacy` if you truly need old
  browsers — it doubles output. Drop it to shrink the bundle.
- Config: `vite.config.ts`.
