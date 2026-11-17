# To-do · mejoras pendientes

## PWA (iOS / instalación)

- [x] **Service worker** para notificaciones push (`web/public/sw.js`, T110): muestra los recordatorios y abre la app al tocarlos.
- [ ] **Modo sin conexión**: el service worker todavía no cachea la app, así que no carga sin conexión. Evaluar `vite-plugin-pwa` o un caché propio del shell.
- [ ] **Unificar `theme_color`**: el manifest (`web/public/manifest.webmanifest`) usa `#087f70`, mientras que los `<meta name="theme-color">` de `web/index.html` usan `#f7f8fa` (claro) / `#11161c` (oscuro). Elegir un criterio y dejarlos coherentes.

## Recordatorios push

- [ ] Al tocar un recordatorio de comida, abrir directamente la hoja "Agregar alimento" de esa comida (hoy abre Hoy).
- [ ] Si los defaults cambian en el futuro, quien ya guardó sus recordatorios conserva los suyos (se guardan los seis). Decidir si migrar.
