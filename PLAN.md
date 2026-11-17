# Plan: web de control de alimentación para dos personas

## 1. Qué vamos a construir

Una web mobile-first, en español, donde dos personas (cada una con su usuario) registran lo que comen, planifican la semana y siguen un objetivo a largo plazo que se traduce automáticamente en metas diarias, semanales y mensuales.

**Decisiones ya tomadas**

| Tema | Decisión |
|---|---|
| Carga de comidas | Buscador de alimentos + escáner de código de barras. Sin IA. |
| Objetivos | Tres modos: peso objetivo con fecha, composición corporal, macros manuales. |
| Datos entre usuarios | Totalmente privados. Solo se comparte el catálogo de alimentos. |
| Login | Usuario y contraseña, dos cuentas creadas de antemano, sin registro público. |
| Planificación | Registro diario + plan semanal + lista de compras. Sin recetas. |
| Progreso | Peso, medidas y % de grasa, agua, ejercicio, ajuste automático de calorías. |
| Dispositivo | Celular, web simple (sin PWA ni modo offline). |
| Stack | React + Vite + TypeScript / Hono en Cloudflare Workers / Drizzle + Neon. |

**Supuestos confirmados**

- Interfaz en español, unidades métricas (kg, cm, g, ml, kcal).
- El repositorio será público (GitHub Pages gratis lo exige en cuentas Free). El código del frontend queda a la vista; ningún secreto va al repo.
- "Plan semanal" asigna alimentos sueltos a cada comida del día; no hay recetas, pero sí "copiar día" y "copiar semana" para no recargar todo.

## 2. Arquitectura

```
Celular ──HTTPS──> GitHub Pages (estáticos: React)
   │
   └──HTTPS/JSON──> Cloudflare Worker (Hono, API REST)
                        ├──> Neon Postgres (driver HTTP)
                        └──> Open Food Facts (búsqueda y código de barras)
```

**Monorepo con pnpm workspaces**

```
/web      React + Vite + TS (se publica en Pages)
/api      Worker con Hono + Drizzle
/shared   Tipos, esquemas zod y el motor de cálculo de objetivos (TS puro)
```

`/shared` es la pieza clave: el motor de objetivos vive ahí, se testea aislado y lo usan tanto el frontend (vista previa en el asistente) como el backend (valor que se guarda).

**Librerías**

- Web: React Router (`HashRouter`, evita el problema de rutas en Pages), TanStack Query, Tailwind CSS, Radix UI para diálogos y menús, Recharts para gráficos, react-hook-form + zod.
- Escáner: polyfill `barcode-detector` (basado en ZXing WASM). Safari en iOS no trae `BarcodeDetector` nativo, así que el polyfill es obligatorio.
- API: Hono, Drizzle ORM, `@neondatabase/serverless` en modo HTTP, zod para validar cada request.

## 3. Restricciones del free tier que condicionan el diseño

1. **Workers: 10 ms de CPU por request.** bcrypt o argon2 dentro del Worker lo superan. Solución: el hash de contraseñas lo hace Postgres con la extensión `pgcrypto` (`crypt()` con bcrypt), así el costo de CPU cae en Neon y no en el Worker.
2. **Cookies entre `github.io` y `workers.dev`.** Son sitios distintos y Safari bloquea cookies de terceros. Solución: token de sesión opaco enviado en el header `Authorization`, guardado en `localStorage`, con CSP estricta para acotar el riesgo de XSS. Si más adelante usan un dominio propio para ambos, se puede migrar a cookie `HttpOnly`.
3. **Neon se suspende tras 5 minutos sin uso.** El primer request tarda cerca de un segundo. La UI muestra esqueletos de carga y no bloquea.
4. **Open Food Facts limita la búsqueda (unas 10 por minuto por IP).** El Worker hace de proxy, busca primero en la base propia y guarda en caché todo producto que alguien elige.
5. **Workers: 100.000 requests por día.** Sobra para dos personas; no requiere diseño especial.

## 4. Seguridad (la web está expuesta a internet)

- Sin endpoint de registro. Los dos usuarios se crean con un script local (`pnpm seed:users`).
- Login: `SELECT ... WHERE username = $1 AND password_hash = crypt($2, password_hash)`.
- Sesiones: token aleatorio de 256 bits; en la base se guarda solo su SHA-256. Vencen a los 30 días, se renuevan con el uso y se pueden revocar ("cerrar sesión en todos los dispositivos").
- Fuerza bruta: tabla `login_attempts`; 5 fallos en 15 minutos por usuario o IP bloquean el login ese lapso. Respuesta idéntica para usuario inexistente y contraseña incorrecta.
- Aislamiento: un middleware resuelve `userId` desde la sesión y **todas** las consultas filtran por él. Nunca se acepta un `userId` del cliente. Tests de integración verifican que el usuario A recibe 404 al pedir datos del usuario B.
- CORS: solo el origen de Pages. CSP en `index.html`: `default-src 'self'`, `connect-src` solo al Worker, sin scripts inline.
- Secretos (`DATABASE_URL`) en `wrangler secret`, nunca en el repo. Rol de base con permisos mínimos para la app; migraciones con un rol aparte.

## 5. Modelo de datos

| Tabla | Contenido |
|---|---|
| `users` | id, username, password_hash, nombre visible |
| `sessions` | token_hash, user_id, expires_at, last_used_at |
| `login_attempts` | username, ip, created_at |
| `profiles` | user_id, sexo, fecha de nacimiento, altura, nivel de actividad, zona horaria |
| `foods` | id, origen (`off` / `seed` / `custom`), owner_id (solo custom), código de barras, nombre, marca, kcal/proteína/carbos/grasa por 100 g, porción sugerida |
| `meal_entries` | user_id, fecha, comida (desayuno/almuerzo/merienda/cena/snack), food_id, gramos, estado (`planned` / `eaten`), macros congelados al momento de cargar |
| `goals` | user_id, modo, peso inicial, peso objetivo, fecha objetivo, preset de composición, estado (activo/archivado) |
| `targets` | goal_id, vigente_desde, kcal, proteína, carbos, grasa, agua, motivo (`inicial` / `ajuste` / `manual`) |
| `milestones` | goal_id, fecha, peso esperado (hitos semanales y mensuales) |
| `checkins` | goal_id, semana, promedio de ingesta, peso de tendencia, TDEE estimado, ajuste propuesto, aceptado sí/no |
| `body_logs` | user_id, fecha, peso, % grasa, cintura, cadera, pecho, brazo, muslo (todos opcionales) |
| `water_logs` | user_id, fecha, ml |
| `exercise_logs` | user_id, fecha, actividad, minutos, kcal estimadas |
| `shopping_items` | user_id, semana, food_id o texto libre, gramos totales, comprado sí/no |

Notas de diseño:

- `meal_entries` sirve a la vez para el plan y el diario: planificar crea filas `planned`; "ya lo comí" las pasa a `eaten`. Evita duplicar tablas y permite comparar plan contra realidad.
- Los macros se copian en la entrada al cargarla, así corregir un alimento no altera el historial.
- `targets` lleva fecha de vigencia: cada día histórico se compara con la meta que regía ese día.
- La fecha es el día local que envía el cliente (`YYYY-MM-DD`), no un timestamp UTC, para que una cena a las 23:30 no caiga en el día siguiente.
- Búsqueda con `pg_trgm` sobre nombre y marca (tolera errores de tipeo).

## 6. Motor de objetivos (`/shared/goals`)

**Entrada:** perfil, peso actual, % de grasa si existe, y el objetivo elegido.

**Gasto estimado (TDEE):** Mifflin-St Jeor; si hay % de grasa, Katch-McArdle. Se multiplica por el factor de actividad (1,2 a 1,725).

**Tres modos**

1. **Peso objetivo con fecha.** Déficit o superávit diario = (kg a cambiar × 7700 kcal) ÷ días. Límites de seguridad: no más de 1 % del peso corporal por semana, piso de 1200 kcal (mujer) o 1500 kcal (hombre). Si la fecha pedida rompe un límite, el asistente lo dice y propone la fecha viable más cercana.
2. **Composición corporal.** Tres presets: definición (−20 %), recomposición (−5 %), volumen limpio (+10 %). Proteína alta: 2 g por kg.
3. **Manual.** El usuario escribe kcal y macros; no se calcula nada ni se ajusta solo.

**Reparto de macros (modos 1 y 2):** proteína 1,8–2,2 g/kg, grasa 0,8 g/kg, el resto en carbohidratos. Agua: 35 ml por kg.

**Salida: metas en tres horizontes**

- **Diaria:** kcal, proteína, carbos, grasa, agua.
- **Semanal:** presupuesto calórico de la semana (permite compensar un día alto con otro bajo), peso esperado al cierre, días registrados.
- **Mensual y final:** hitos de peso hasta la fecha objetivo, dibujados como línea de referencia en el gráfico.

**Ajuste automático (check-in semanal)**

- Peso de tendencia: media móvil exponencial, para no reaccionar a las oscilaciones diarias.
- TDEE real = ingesta promedio − (cambio del peso de tendencia × 7700 ÷ días).
- Solo corre con 14 días de historia y al menos 10 días registrados; si faltan datos, lo dice y no ajusta.
- Cambio máximo de ±150 kcal por semana, respetando los pisos.
- **Se propone, no se impone:** aparece una tarjeta "Vas más lento de lo previsto: bajar a 1.850 kcal" con Aceptar o Mantener. Al aceptar se crea un `target` nuevo.
- Se calcula al abrir la app si hay una semana cerrada sin check-in. No hace falta cron.

Todo el motor son funciones puras con tests unitarios (Vitest): casos normales, fechas imposibles, pisos, datos insuficientes.

## 7. API (todas bajo `/api`, JSON, sesión obligatoria salvo login)

| Recurso | Endpoints |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/password`, `GET /me` |
| Perfil | `GET/PUT /profile` |
| Alimentos | `GET /foods/search?q=`, `GET /foods/barcode/:code`, `POST /foods` (personalizado), `GET /foods/recent` |
| Diario y plan | `GET /entries?from=&to=`, `POST /entries`, `PATCH /entries/:id`, `DELETE /entries/:id`, `POST /entries/copy` (día o semana) |
| Objetivos | `POST /goals/preview` (calcula sin guardar), `POST /goals`, `GET /goals/active`, `GET /targets?date=` |
| Check-in | `GET /checkins/pending`, `POST /checkins/:id/resolve` |
| Cuerpo | `GET/PUT /body-logs/:date`, `GET /body-logs?from=&to=` |
| Agua y ejercicio | `POST /water`, `GET/POST/DELETE /exercise` |
| Compras | `POST /shopping/generate?week=`, `GET /shopping?week=`, `PATCH /shopping/:id`, `POST /shopping` (ítem libre) |
| Resumen | `GET /summary/day?date=`, `GET /summary/week?week=` |

## 8. Pantallas

Navegación inferior fija con cinco pestañas: **Hoy · Plan · Compras · Progreso · Perfil**.

- **Login.** Usuario, contraseña, nada más.
- **Asistente inicial (4 pasos).** Datos personales → tipo de objetivo → detalle del objetivo → resumen con las metas diarias, semanales y la fecha estimada, antes de confirmar.
- **Hoy.** Anillo de calorías restantes, tres barras de macros, comidas del día agrupadas, agua con botones +250 ml, ejercicio, y la tarjeta de check-in cuando corresponde. Lo planificado aparece atenuado con un botón "Ya lo comí". Selector de fecha para ver o corregir otros días.
- **Agregar alimento.** Hoja inferior con buscador, pestañas Recientes y Frecuentes, botón de escáner y "Crear alimento". Al elegir: cantidad en gramos o porciones, con los macros actualizándose en vivo.
- **Plan.** Tira de siete días con el total de cada uno coloreado según se acerque a la meta. Detalle del día igual al de Hoy. Acciones: copiar día, copiar semana anterior, generar lista de compras.
- **Compras.** Ítems sumados por alimento para la semana, con casillas y posibilidad de agregar ítems a mano.
- **Progreso.** Gráfico de peso (real, tendencia y trayectoria esperada), medidas, cumplimiento semanal, historial de check-ins.
- **Perfil.** Datos personales, objetivo actual con "Cambiar objetivo", contraseña, cerrar sesión.

**Reglas de usabilidad**

- Cargar un alimento habitual en tres toques como máximo.
- Botones de 44 px mínimo, teclado numérico en los campos de cantidad.
- Cambios optimistas: la UI responde al instante y revierte si el servidor falla.
- Modo claro y oscuro según el sistema.
- Cada estado vacío explica qué hacer ("Todavía no cargaste nada hoy").

## 9. Datos de alimentos

- **Envasados:** Open Food Facts por código de barras y por texto, vía el Worker.
- **Genéricos (pollo, arroz, banana):** Open Food Facts los cubre mal. Se carga una semilla de unos 300 alimentos básicos en español (CSV en el repo, armado a partir de USDA FoodData Central, de dominio público).
- **Personalizados:** los carga cualquier usuario y los usan todos, por texto y por código de barras (cambio de T041; antes eran privados). Quien lo cargó queda como autor. Cualquier usuario puede corregirlo; solo el autor puede borrarlo, y solo si nadie lo usa en su diario. Hay un único personalizado por código de barras; si coincide con uno de Open Food Facts, gana el personalizado.
- Si un código no existe, se ofrece crear el alimento con ese código ya completado.

## 10. Etapas de construcción

Cada etapa termina en algo usable y desplegado.

| # | Etapa | Resultado verificable |
|---|---|---|
| 0 | Infraestructura | Monorepo, proyecto en Neon, Worker "hola" desplegado, Pages publicando por GitHub Actions, CORS y CSP funcionando |
| 1 | Autenticación | Login real con los dos usuarios, bloqueo por intentos, test de aislamiento entre usuarios |
| 2 | Alimentos | Semilla cargada, búsqueda, proxy a Open Food Facts con caché, alimentos personalizados |
| 3 | Diario | Pantalla Hoy completa con metas manuales: cargar, editar, borrar, recientes |
| 4 | Escáner | Lectura de códigos probada en iPhone y Android reales |
| 5 | Motor de objetivos | Asistente inicial, los tres modos, metas diarias, semanales e hitos |
| 6 | Progreso | Peso, medidas, agua, ejercicio y gráficos |
| 7 | Plan y compras | Plan semanal, copiar día y semana, lista de compras |
| 8 | Ajuste automático | Check-in semanal con propuesta |
| 9 | Pulido | Estados vacíos y de error, modo oscuro, accesibilidad, revisión de seguridad |

Las etapas 0 a 3 dan una versión mínima utilizable. La 5 es la de mayor valor y la 8 depende de tener al menos dos semanas de datos reales.

## 11. Despliegue

- **Web:** GitHub Actions en cada push a `main`: build de `/web` y publicación en Pages. La URL de la API entra como variable de build.
- **API:** `wrangler deploy` desde Actions con un token de Cloudflare guardado como secreto del repo.
- **Base:** migraciones con Drizzle Kit, ejecutadas a mano o en Actions antes del deploy. Una rama de Neon para desarrollo y otra para producción.
- **Respaldo:** un workflow semanal de Actions que hace `pg_dump` y lo guarda como artefacto cifrado (el free tier de Neon conserva poca historia).

## 12. Riesgos

| Riesgo | Mitigación |
|---|---|
| El escáner falla en algún celular | Probar en los dos teléfonos reales en la etapa 4; siempre queda el ingreso manual del código |
| Open Food Facts con datos incompletos o erróneos | Permitir corregir macros al cargar y guardar la corrección como alimento personalizado |
| Token en `localStorage` expuesto ante XSS | CSP estricta, sin HTML inyectado, dependencias mínimas; migrar a cookie con dominio propio |
| Objetivos poco saludables | Pisos de calorías y tope de ritmo en el motor, con aviso explícito en el asistente |
| Límites del free tier cambian | Ninguna pieza depende de un servicio pago; el Worker y Neon son reemplazables sin tocar el frontend |
