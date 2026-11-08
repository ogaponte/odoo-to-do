# Odoo To Do

Aplicación de escritorio para gestionar tus tareas de Odoo desde macOS. Desarrollada con Tauri 2, Rust, React y TypeScript, con SQLite local y sincronización mediante JSON-RPC.

## Funciones

- Conexión a múltiples instancias de Odoo, cada una con su usuario y color.
- Solo muestra tareas asignadas al usuario conectado en `user_ids`; las nuevas tareas se autoasignan a ese usuario.
- Usa el campo `state`: las tareas hechas (`1_done`) se ocultan de la lista habitual y se pueden consultar en Completadas.
- Creación y edición local con una cola de cambios pendientes para sincronizar cuando haya conexión.
- Sincronización manual, después de cambios locales y periódica cada tres minutos.
- Notas y descripción en HTML con guardado automático y sanitización mediante DOMPurify.
- Editor con negritas, cursivas, subrayado, listas, enlaces, deshacer y rehacer. Permite pegar imágenes con Cmd+V o insertarlas desde archivos PNG, JPEG, GIF y WebP (hasta 5 MB por imagen y 10 MB por inserción).
- Las imágenes insertadas se guardan dentro del HTML de la descripción, incluso sin conexión, y se envían a la tarea de Odoo mediante la cola de sincronización.
- Visor de imágenes con tamaño original, ajuste a ventana y pantalla completa cuando el sistema lo admite.
- Tres columnas: lista de tareas con ancho estable y panel flexible para Notas y descripción.
- Ventana translúcida, modo claro y oscuro, y nombre e icono de Odoo To Do en el Dock y Cmd+Tab.

## Requisitos

- macOS con las herramientas de desarrollo de Xcode y los requisitos de Tauri 2.
- Rust y Cargo, Node.js y pnpm.
- Python 3 para el arranque de desarrollo en macOS.
- Una instancia de Odoo con acceso a proyectos y tareas mediante JSON-RPC. El modelo `project.task` debe tener los campos `state` y `user_ids`.

## Desarrollo

Desde la carpeta que contiene el proyecto:

```bash
cd "Odoo To Do"
pnpm install
pnpm tauri dev
```

En macOS, Cargo utiliza `src-tauri/scripts/macos-dev-runner.py` para ejecutar el binario dentro de `src-tauri/target/debug/dev-bundle/Odoo To Do.app`. Esto conserva el nombre y el icono en Cmd+Tab, la recarga de Vite y los reinicios automáticos del backend.

`pnpm dev` inicia únicamente el frontend, sin la ventana nativa ni los comandos de Tauri.

## Compilación y pruebas

```bash
# Comprobar TypeScript y compilar el frontend
pnpm build

# Ejecutar las pruebas del backend
cd src-tauri
cargo test --lib
```

Desde la raíz del proyecto, `pnpm build:app` genera la aplicación macOS de desarrollo en `src-tauri/target/debug/bundle/macos/Odoo To Do.app`.

`pnpm tauri build` genera los paquetes de distribución en modo release. La aplicación macOS se genera en `src-tauri/target/release/bundle/macos/Odoo To Do.app`.

## Conectar Odoo

1. Pulsa **+** junto a Instancias Odoo.
2. Indica un nombre, la URL del servidor, la base de datos, el usuario y su API key o contraseña.
3. Usa **Probar conexión** para verificar las credenciales.
4. Conecta la instancia y sincroniza. Las tareas visibles corresponden al usuario de esa conexión.

El botón de sincronización y **Cmd+R** permiten solicitar una sincronización manual.

## Datos locales

El identificador de la aplicación es `com.odootodo.desktop`. En macOS, la base de datos se guarda en `~/Library/Application Support/com.odootodo.desktop/odoo_tasks.db`. Contiene las conexiones, los registros descargados y la cola de cambios pendientes.

## Estructura

```text
Odoo To Do/
├── public/logo.png                 # Icono usado por la interfaz
├── src/
│   ├── components/                 # Navegación, tareas, editor HTML y visor de imágenes
│   ├── api.ts                      # Comandos IPC de Tauri
│   ├── App.tsx                     # Estado y distribución de los paneles
│   └── App.css                     # Tipografía, transparencia y estilos
└── src-tauri/
    ├── .cargo/config.toml          # Runner de desarrollo en macOS
    ├── scripts/macos-dev-runner.py  # Bundle de desarrollo con nombre e icono propios
    ├── icons/                      # Iconos nativos, incluido icon.icns
    ├── src/                        # Base de datos, cliente Odoo y sincronización
    ├── Info.plist                  # Nombre visible en macOS
    └── tauri.conf.json             # Ventana, identidad y empaquetado
```

Para regenerar los iconos nativos a partir del logo actual:

```bash
pnpm tauri icon public/logo.png --output src-tauri/icons
```
