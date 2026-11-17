# To-do · mejoras pendientes

## PWA (iOS / instalación)

- [ ] **Service worker**: agregar uno (por ejemplo con `vite-plugin-pwa`) para que la app cargue sin conexión y quede preparada para notificaciones push web (en iOS solo funcionan con la app instalada en inicio, con service worker y permiso del usuario).
- [ ] **Unificar `theme_color`**: el manifest (`web/public/manifest.webmanifest`) usa `#087f70`, mientras que los `<meta name="theme-color">` de `web/index.html` usan `#f7f8fa` (claro) / `#11161c` (oscuro). Elegir un criterio y dejarlos coherentes.
