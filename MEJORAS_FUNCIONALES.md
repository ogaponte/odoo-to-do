# Sugerencias de Mejoras Funcionales — Odoo-To-Do

## Resumen del Proyecto

**Odoo-To-Do** es una aplicación de escritorio Tauri 2.x (Rust + React) que funciona como interfaz offline-first para las tareas de Odoo Project. Estilo similar a Apple Notes / Microsoft To-Do, con soporte multi-instancia de Odoo, gestión de proyectos/stages/tareas, editor de notas HTML y sincronización bidireccional via SQLite local + API REST de Odoo.

**Stack tecnológico:**
| Capa | Tecnología |
|------|-----------|
| Framework desktop | Tauri 2.x (macOS) |
| Frontend | React 19, Vite, TailwindCSS v4 |
| Backend | Rust, SQLite (rusqlite), reqwest |
| Estado | useState / useEffect (sin librería de state management) |
| Editor HTML | `contentEditable` + `document.execCommand` con DOMPurify |
| Imágenes | Base64 inline en notas, ImageViewer personalizado |

---

## 1. Gestión del Estado y Arquitectura

### 1.1 Migrar a Context API o Zustand
**Problema:** Toda la lógica de estado vive en `App.tsx` (prop drilling masivo). El componente recibe +15 props solo para navegar entre vistas. No existe ninguna librería de state management.

**Impacto:** Acoplamiento fuerte, dificultad para refactorizar componentes independientes, testing complicado.

**Sugerencia:**
- Implementar `useContext` con un `AppContext` que centralice `activeView`, `instances`, `selectedInstance`, `projects`, `projectId`, etc.
- Alternativamente, migrar a **Zustand** (ligera, ~1KB) para tener un store global sin boilerplate excesivo.
- Reducir prop drilling al menos en un 70%.

### 1.2 Separar hooks de lógica de negocio de componentes
**Problema:** `App.tsx` contiene tanto la definición del estado como toda la lógica de sincronización, filtrado y navegación embebida en `useCallback`.

**Sugerencia:** Crear hooks personalizados (`useInstanceSync`, `useTaskQuery`, `useProjectFilter`) que encapsulen cada dominio. Mejora la legibilidad en un orden de magnitud.

---

## 2. Sincronización y Offline

### 2.1 Indicador visual de estado de sincronización
**Problema:** No hay ningún feedback visual al usuario sobre el estado actual de la sincronización (¿estoy offline? ¿se está sincronizando? ¿hubo un error?).

**Sugerencia:**
- Agregar un badge/icono en la barra superior que muestre: `sincronizando...` con spinner, `✓ Sincronizado`, o `⚠ Offline` con advertencia.
- Mostrar toast/notificación cuando una sincronización falle (actualmente se hace `console.error` y silently fails).

### 2.2 Conflict resolution strategy para sync bidireccional
**Problema:** El motor de sincronización (`sync.rs`, `db.rs`) usa un patrón outbox/inbox, pero no hay visibilidad sobre qué ocurre cuando hay conflictos (mismo campo modificado en Odoo y localmente).

**Sugerencia:**
- Documentar e implementar una estrategia de resolución de conflictos: "última modificación gana" vs. "promt al usuario".
- Agregar un panel/overlay que muestre tareas con conflictos potenciales para revisión manual.

### 2.3 Sync incremental con ETags / Last-Modified
**Problema:** La sincronización actual puede realizar llamadas completas a la API de Odoo (`getAllFromOdoo` en `odoo.rs`), lo que es ineficiente para instancias con miles de tareas.

**Sugerencia:**
- Implementar headers `If-Modified-Since` y `ETag` en las peticiones GET a Odoo.
- Solo traer registros que cambiaron desde la última sincronización exitosa.
- Reducir el tiempo de sync para instancias grandes en un ~80%.

### 2.4 Websocket para notificaciones en tiempo real (Opcional)
**Problema:** La sync es pull-based, lo que significa que las tareas cambian solo al abrir la app o forzar sync manual.

**Sugerencia a futuro:**
- Integrar con los websocket notifications de Odoo 16+ para recibir actualizaciones en tiempo real sin polling.

---

## 3. Editor de Notas HTML (`HtmlNotes.tsx`)

### 3.1 Reemplazar `document.execCommand` (deprecated)
**Problema:** El editor usa `document.execCommand` que está **oficialmente deprecated** y tiene comportamiento inconsistente entre navegadores (aunque en Tauri/WebKit es menos problemático).

**Sugerencia:**
- Migrar a una librería como **Quill**, **TipTap** o **Slate.js** para un editor contentEditable robusto.
- Alternativa más ligera: usar `surfer-editor` (wrap de TipTap optimizado para Tauri sin React render overhead).

### 3.2 Historial de cambios / Versiones en notas
**Problema:** No hay ningún sistema de versionado para las notas. Si un usuario borra accidentalmente contenido, no hay forma de recuperar versiones anteriores.

**Sugerencia:**
- Agregar un mini-log de cambios local (timestamp + diff simple) almacenado en SQLite adicional a la versión Odoo.
- Botón "Revertir última edición" o panel de historial con diffs lado a lado.

### 3.3 Soporte para enlaces internos entre tareas
**Problema:** Los links solo soportan URLs HTTP/HTTPS/mailto. No hay forma de crear un link que apunte a otra tarea dentro del mismo proyecto Odoo.

**Sugerencia:**
- Al escribir `#`, mostrar un autocomplete con las tareas disponibles de la instancia activa.
- Generar links como `task://projectId/taskId` que la app resuelva localmente.

### 3.4 Búsqueda y replace en notas
**Problema:** No hay forma de buscar texto dentro de las notas HTML ni hacer find-and-replace.

**Sugerencia:** Agregar un panel "Find & Replace" sobre el editor, similar al de un editor de código.

---

## 4. Vista Kanban y Gestión de Tareas

### 4.1 Mover tareas entre proyectos (Drag & Drop inter-proyectos)
**Problema:** El drag-and-drop actual solo permite reordenar tareas **dentro del mismo stage**. No se puede mover una tarea de un proyecto a otro.

**Sugerencia:**
- Agregar soporte para drag-out desde un kanban hacia la lista de proyectos en el sidebar.
- O agregar un botón "Mover" que abra un modal con selector de proyecto+stage.

### 4.2 Selección múltiple y acciones batch
**Problema:** No existe selección múltiple de tareas para realizar acciones masivas (cambiar stage, cambiar assignee, marcar como leídas).

**Sugerencia:**
- Checkbox en cada card de tarea para seleccionar varias.
- Botón "Batch Actions" que aparezca cuando hay ≥1 tarea seleccionada: mover a stage, reasignar, cerrar.

### 4.3 Vista de Lista alternativa al Kanban
**Problema:** Solo existe vista kanban (columnas) y lista básica en `TaskList`. No hay una tabla tipo Excel con todas las columnas del modelo de Odoo visibles.

**Sugerencia:**
- Agregar una **vista tabla** que muestre: Título, Stage, Assignee, Priority, Tags, Due Date en filas ordenables.
- Columnas reordenables y filtrables individualmente (tipo Notion/ClickUp).

### 4.4 Mini-calendar de fechas límite
**Problema:** Las tareas pueden tener fecha límite (`due_date`), pero no hay vista de calendario para ver las deadlines agrupadas por día/semana.

**Sugerencia:**
- Agregar un componente `CalendarView` que muestre un mini-calendar mensual con las tasks debowmarked en los días correspondientes.
- Click en un día filtra las tareas de esa fecha.

---

## 5. Experiencia de Usuario (UX)

### 5.1 Búsqueda global unificada
**Problema:** La búsqueda está limitada a `TaskList` y busca solo por nombre de tarea dentro del proyecto actual.

**Sugerencia:**
- Agregar una **barra de búsqueda global** accesible con `Cmd+K` (command palette style).
- Buscar en: nombre, notas, etiquetas, description, across **todas** las instancias y proyectos.
- Mostrar resultados agrupados por instancia/proyecto con opción de navegar al resultado.

### 5.2 Atajos de teclado para acciones comunes
**Problema:** No hay atajos de teclado documentados ni implementados más allá de los nativos del navegador.

**Sugerencia implementar:**
| Atajo | Acción |
|-------|--------|
| `Cmd+N` | Crear nueva tarea en el proyecto actual |
| `Cmd+Shift+N` | Nueva instancia |
| `Esc` | Cerrar task detail, cancelar modal |
| `Cmd+/` | Buscar global (command palette) |
| `1-9` con `Cmd` | Ir al proyecto n |
| `Delete` | Eliminar tarea seleccionada (con confirmación) |

### 5.3 Notificaciones nativas del sistema
**Problema:** No hay integración con las notificaciones de macOS para alertar sobre tareas próximas a vencer o reasignadas.

**Sugerencia:**
- Usar `tauri-plugin-notification` para enviar notificaciones locales cuando:
  - Una tarea asignada al usuario cambia su status.
  - La fecha límite de una tarea está por vencer (configurable: 1 hora antes, 1 día antes).
  - Se sincroniza exitosamente tras estar offline.

### 5.4 Modo oscuro automático basado en sistema + override manual
**Problema:** El tema parece seguir `prefers-color-scheme` del sistema pero no hay toggle explícito ni persistencia del preference del usuario.

**Sugerencia:**
- Agregar toggle en Preferencias para: Auto, Light, Dark.
- Persistir la elección en SQLite local con overrides a `prefers-color-scheme`.

---

## 6. Rendimiento y Escalabilidad

### 6.1 Virtualización de listas de tareas
**Problema:** `TaskList.tsx` renderiza **todas** las tareas del proyecto activo en el DOM simultáneamente. Con proyectos grandes (>5000 tareas), esto degrada el rendimiento significativamente.

**Sugerencia:**
- Implementar virtualización con `@tanstack/react-virtual` o similar.
- Solo renderizar en DOM las filas visibles + un buffer de ~10 items arriba/abajo.
- Reducir los re-renders de O(n) a O(visible).

### 6.2 Paginación en el lado de Odoo
**Problema:** `getAllFromOdoo` probablemente trae todo de una vez desde la API de Odoo, sin paginación.

**Sugerencia:**
- Implementar paginación cursor-based o offset-based al llamar `web.search_read` de Odoo.
- Cargar páginas bajo demanda cuando el usuario hace scroll (lazy loading).

### 6.3 Caché LRU para proyectos e instancias
**Problema:** Cada vez que se cambia de proyecto/instancia, se recargan todos los datos desde SQLite sin ninguna caché intermedia en memoria.

**Sugerencia:**
- Implementar un mapa de caché en memoria (WeakMap) con TTL configurable por proyecto.
- Si el proyecto ya está en caché y no cambió, devolver datos instantáneamente.

---

## 7. Seguridad y Validación

### 7.1 Sanitización completa de entradas del usuario
**Problema:** Aunque `HtmlNotes.tsx` usa `DOMPurify.sanitize()`, hay puntos donde las entradas van directo:
- `window.prompt` para URLs en `addLink()` no valida completamente el input sanitizado antes de `execCommand`.
- Los datos de Odoo se renderizan sin sanitización explícita en algunos componentes.

**Sugerencia:**
- Centralizar la sanitización en un utility function reutilizable (`sanitizeForDisplay`, `sanitizeHtml`).
- Agregar sanitización en el frontend para todos los campos HTML antes de pasarlos a `innerHTML` o `insertHTML`.

### 7.2 Rate limiting local de peticiones a Odoo
**Problema:** No hay rate limiter visible que proteja contra floods de requests a la API de Odoo si el usuario hace acciones rápidas consecutivas (crear/eliminar tareas en secuencia).

**Sugerencia:**
- Implementar un simple token bucket o sliding window limiter en el backend Rust (`commands.rs`) para throttlear las llamadas a `odoo.rs`.
- Retransmitir requests colapsados con backoff exponencial.

---

## 8. Interoperabilidad y Exportación

### 8.1 Exportar tareas a CSV / Markdown
**Problema:** No existe ninguna forma de exportar los datos fuera de la app.

**Sugerencia:**
- Agregar botones de export en TaskList/Sidebar:
  - **Exportar CSV**: Todas las columnas relevantes de Odoo Project tasks.
  - **Exportar Markdown**: Formato legible con título, description, tags, stage, dates.
  - **Exportar JSON**: Para backup completo con metadatos.

### 8.2 Importar tareas desde CSV/Excel
**Problema:** No hay importación de datos externa.

**Sugerencia:**
- Agregar un diálogo de import que lea CSV/Excel y mapee columnas a campos de Odoo (title, description, tags, due_date, priority).
- Previsualizar el mapeo antes de confirmar la sincronización con Odoo.

### 8.3 Share / Copy como link
**Problema:** No hay forma de compartir una tarea por URL o copiar su contenido al clipboard.

**Sugerencia:**
- Botón "Copy as Markdown" que copie título + description + tags al clipboard del sistema.
- Opción "Copiar link" para generar una URL deep-link si Odoo tiene project tasks URLs públicas.

---

## 9. Gestión de Instancias y Multi-tenancy

### 9.1 Auto-complete de credenciales de instancias
**Problema:** Al crear/editar una instancia, el usuario debe escribir manualmente la URL del servidor Odoo. No hay auto-complete ni validación early.

**Sugerencia:**
- Al escribir la URL y presionar Enter, validar automáticamente si es una instancia Odoo válida (probar endpoint `/web/database/health` o similar).
- Mostrar estado: `✓ Odoo v17` / `✗ No válido`.

### 9.2 Backup/restauración de configuración local
**Problema:** No hay forma de exportar/importar la configuración de instancias, proyectos y preferencias locales.

**Sugerencia:**
- Menu "File > Export Config" que genere un JSON encriptado con todas las credenciales (con clave maestra).
- "Import Config" para migrar a otro dispositivo.

---

## 10. Accesibilidad (a11y)

### 10.1 Navegación completa por teclado
**Problema:** Algunas interacciones dependen exclusivamente de mouse/drag-and-drop. Los componentes no tienen `tabIndex` ni roles ARIA consistentes en todas partes.

**Sugerencia:**
- Agregar navegación Tab/Shift+Tab visible en el kanban para mover entre columnas y tarjetas.
- Atajos de teclado para abrir/cerrar TaskDetail, guardar, cancelar.
- Labels ARIA completos en todos los botones interactivos.

### 10.2 Soporte para screen readers en el editor HTML
**Problema:** El `contentEditable` no tiene announcements dinámicos para cambios de estado o errores del editor.

**Sugerencia:**
- Agregar `aria-live="polite"` regions para mensajes de error y estados de sync.
- Announce counts de tareas filtradas: "6 tareas en Seleccionado".

---

## 11. Prácticas de Código

### 11.1 Testing automatizado (frontend)
**Problema:** No hay tests escritos para ninguno de los componentes React ni hooks.

**Sugerencia:**
- Agregar **Vitest** + **@testing-library/react** para testing unitario de hooks y renderizado.
- Agregar **Playwright** para e2e testing del flujo principal: crear instancia → crear tarea → sync → verificar.

### 11.2 Testing automatizado (backend Rust)
**Problema:** No se detectaron tests en el código backend (`cargo test` probablemente vacío).

**Sugerencia:**
- Agregar tests para: `db.rs` (CRUD + sync engine), `sync.rs` (outbox/inbox flow), `odoo.rs` (mock API responses).
- Cover casos edge: empty database, corrupted outbox entries, network failures during sync.

### 11.3 ESLint config consistente
**Problema:** No se detectó archivo `.eslintrc` o `eslint.config.js`. Los componentes tienen estilos de formateo inconsistentes (indentación mixta, spacing variable).

**Sugerencia:**
- Configurar ESLint + Prettier con reglas estrictas para React.
- Agregar **biome** como alternativa más rápida (ya está en ecosistema Rust/JS híbrido).

---

## 12. Funcionalidades Nuevas Sugeridas

### 12.1 Subtareas / Hierarquía de tareas
Odoo Project no soporta subtareas nativamente, pero el modelo `project.task` tiene campos `child_ids` en versiones recientes. Si la instancia Odoo usa `project.task` estándar (no `project.project` como task), se podría implementar:
- Vista de árbol para tareas con hijos expandibles.
- Crear subtarea desde TaskDetail con referencia a padre.

### 12.2 Recordatorios locales programados
Usando la API nativa de macOS (`NSCalendar` / `UserNotificationsFramework`) vía Tauri plugin custom:
- Programar recordatorios para tareas con `due_date`.
- Notificación local en la hora especificada incluso si la app está cerrada.

### 12.3 Búsqueda avanzada con filtros persistentes
Guardar filtros/combinaciones de búsqueda comunes:
- "Mis tareas pendientes" (assignee = me, state != done).
- "Tasks del proyecto X con priority alta".
- Filtros guardados en sidebar como secciones favoritas.

### 12.4 Dark mode de etiquetas por tag
Asignar colores automáticos a las etiquetas según el project/task de Odoo, pero persistirlos localmente para que sean consistentes across syncs y reinicios.

---

## Priorización Recomendada

| Prioridad | Mejora | Justificación |
|-----------|--------|---------------|
| **P0** | 2.1 Indicador de sync | Feedback crítico de estado sin refactor mayor |
| **P0** | 5.1 Búsqueda global Cmd+K | Mejora de UX más solicitada por usuarios de productivity apps |
| **P1** | 6.1 Virtualización de listas | Escalabilidad real para proyectos grandes |
| **P1** | 1.1 Context API / Zustand | Reduce deuda técnica acumulada |
| **P1** | 7.1 Sanitización centralizada | Seguridad ante XSS en editor HTML |
| **P2** | 4.1 Drag & Drop inter-proyectos | Mejora significativa de productividad |
| **P2** | 8.1 Export CSV/Markdown | Independencia de datos |
| **P3** | 3.1 Reemplazar execCommand | Modernización a largo plazo |
| **P3** | 4.3 Vista tabla + Calendario | Features diferenciadores |

---

## Conclusión

Odoo-To-Do es una aplicación bien construida con un backend Rust sólido (offline-first con motor de sync robusto) y un frontend React pulido visualmente (estilo Apple Notes con translucidez macOS). Las áreas de mayor impacto están en:

1. **Estado global** — Reducir prop drilling y separar lógica de UI de datos.
2. **Feedback de sincronización** — El usuario necesita saber si está online/offline y si la sync fue exitosa.
3. **Rendimiento para datasets grandes** — Virtualización, paginación y caché son esenciales antes de escalar a proyectos con miles de tareas.
4. **Productividad avanzada** — Búsqueda global, atajos de teclado, exportación y filtros persistentes convertirían la app de "cliente Odoo" a "productivity tool".
