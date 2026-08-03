# Tickets → Claude Code

Panel local que lista tus tickets de Jira abiertos y, desde ahí, deja lista una sesión
de Claude Code para trabajarlos: crea la rama, crea el worktree y abre la sesión con el
prompt inicial escrito.

No reemplaza a Jira ni a la app de Claude Code. Cubre solo el tramo entre «veo mi
ticket» y «tengo una sesión lista», que normalmente se hace a mano.

```
┌──────────────────┐   REST    ┌──────────────┐
│  Panel web       │◀─────────▶│     Jira     │
│  (localhost)     │           └──────────────┘
└────────┬─────────┘
         │ POST /api/initialize
         ▼
┌──────────────────────────────┐
│  Servicio local (Node)       │
│   · git worktree add         │
│   · compone el prompt        │
│   · abre la sesión           │──▶ Claude Code
└──────────────────────────────┘
```

El servicio escucha **solo en 127.0.0.1**: ejecuta git y abre sesiones en tu máquina,
así que no tiene por qué ser alcanzable desde la red.

## Puesta en marcha

```bash
npx jira-kickoff
```

Eso es todo. Abre el navegador solo y, si es la primera vez, te lleva a un asistente de
dos pasos: conectar con Jira y añadir un proyecto. El
[API token](https://id.atlassian.com/manage-profile/security/api-tokens) se comprueba
contra Jira **antes** de guardarlo, para que un token mal pegado se vea en el momento y
no como una lista vacía diez minutos después.

GitHub no necesita token: las ramas remotas se leen con `git ls-remote`, que usa las
credenciales que git ya tiene configuradas.

### Dónde vive tu configuración

Con `npx` el paquete corre desde una caché temporal que npm puede borrar, así que nada
se guarda junto al código:

| Archivo | Qué contiene |
|---|---|
| `config.json` | Proyectos, prompt, patrón de rama, preferencias |
| `credentials.json` | Solo el token de Jira, con permisos `0600` |
| `history.json` | Registro de inicializaciones |

En `%APPDATA%\jira-kickoff` (Windows), `~/Library/Application Support/jira-kickoff` (macOS)
o `$XDG_CONFIG_HOME/…` (Linux). El token va **aparte** a propósito: `config.json` se
comparte, se pega en un issue o sale en una captura, y no debe viajar con él.

`JIRA_EMAIL` y `JIRA_API_TOKEN` en el entorno ganan al archivo, que es lo que permite
ejecutarlo en CI o en un contenedor sin dejar el token escrito en disco.

### Desarrollo

```bash
git clone https://github.com/ing-fcastellanos/jira-kickoff
cd jira-kickoff
npm install
npm run dev
```

La UI queda en <http://127.0.0.1:5100> y la API en <http://127.0.0.1:8787>. Para trabajar
sin tocar tu configuración real, define `JTW_CONFIG_DIR` apuntando a una carpeta
desechable.

## Opciones

Todo lo configurable se edita desde la interfaz y se guarda en `config.json`, con
validación antes de escribir y escritura atómica:

| Sección | Qué contiene |
|---|---|
| Apariencia | Claro, oscuro o según el sistema. Se guarda en el navegador, no en `config.json`. |
| Jira | Dominio, qué status incluir y un filtro JQL adicional opcional. |
| Proyectos | Cada clave de Jira apuntando a un repositorio local, con su rama base. Se pueden desactivar sin borrarlos. |
| Rama y worktree | Patrón del nombre de rama, con vista previa en vivo, dónde se crean los worktrees y si alinear `origin/HEAD` con la rama base. |
| Editor | Qué comando abre un worktree desde la lista, y con qué argumentos. |
| Prompt inicial | El comando base y las líneas fijas que lo acompañan. |
| Al inicializar | Abrir la sesión o solo copiar el prompt, y el modo de permisos de la sesión. |

El token de Jira **no** se edita desde la web a propósito: vive en `.env` y no hay razón
para meterlo en un formulario cuando un archivo lo resuelve igual.

## El prompt inicial

Se compone en tres capas, y la última siempre eres tú:

```
prompt.base           →  Vamos a trabajar el ticket {{ticket}}.
+ prompt.additions    →  líneas fijas configurables
= textarea editable   →  lo ajustas en el momento
→ se envía tal cual
```

Lo que queda en el textarea es literalmente lo que recibe la sesión. Nada se concatena
por detrás después de que editas.

Placeholders: `{{ticket}}`, `{{summary}}`, `{{url}}`, `{{branch}}`, `{{repo}}`,
`{{worktree}}`. Cada proyecto puede sobrescribir `base` y `additions`; un `additions`
de proyecto reemplaza la lista global completa en vez de extenderla, para que se pueda
*quitar* una línea global desde un proyecto.

## Ramas

Las remotas se leen con `git ls-remote --heads origin`. Si el remoto no responde la
pantalla no falla: cae a las ramas locales y lo dice, porque saber que ya existe una
rama para el ticket vale más que un error.

El nombre propuesto sale de `branch.pattern` — placeholders `{{ticket}}`,
`{{ticket-lower}}` y `{{slug}}`. El slug se recorta en frontera de palabra
(`…override-pric` se lee peor que `…override`) y las marcas diacríticas se quitan antes
de colapsar lo no alfanumérico, para que «Añadir» no termine en `an-adir`.

Una rama pertenece al ticket si menciona su clave sin que la siga un dígito, de modo
que `ABC-123` no reclame `abc-1230`. Cubierto por `npm test`.

## Qué hace «Inicializar»

```
POST /api/initialize { ticketKey, branch, prompt }
  1. valida el nombre de rama con `git check-ref-format`
  2. `git fetch origin`  ← imprescindible: ls-remote no actualiza refs locales
  3. `git worktree add` en <repo>/<worktrees.dir>/<ticket>
  4. construye el deep link y lo entrega al sistema
```

El worktree se llama como el ticket, no como la rama: es corto, predecible y hace la
operación idempotente. Reinicializar el mismo ticket con la misma rama lo reutiliza.

| Situación | Qué hace |
|---|---|
| Worktree ya existe con esa rama | lo reutiliza |
| La rama existe en local | `worktree add <ruta> <rama>` |
| La rama existe solo en el remoto | `worktree add --track -b <rama> … origin/<rama>` |
| La rama no existe | `worktree add -b <rama> … origin/<base>` |

Los conflictos responden 409 con instrucciones concretas: worktree ocupado por otra
rama, carpeta huérfana que git no reconoce, o la misma rama ya usada por otro worktree.

**El worktree se crea antes de intentar el deep link, siempre.** Si el enlace falla, la
pantalla lo dice, ofrece copiar el prompt y un enlace para abrirlo a mano — no se pierde
ningún paso anterior.

## Cómo abre la sesión

Mediante el deep link de la app de escritorio de Claude Code:

```
claude://code/new?q=<prompt>&folder=<ruta del worktree>
```

La app abre una sesión nueva en esa carpeta con el prompt escrito en el compositor,
esperando un Enter.

**Esto es interfaz interna de la app, no una API pública.** Se dedujo inspeccionando el
binario de la versión 1.24012.9 y puede dejar de funcionar en cualquier actualización.
Por eso existe el modo «solo copiar el prompt» en Opciones, y por eso el worktree se
crea siempre antes de intentar abrir nada.

Límites conocidos del handler: `q` se trunca a 14 336 caracteres, y el parámetro `file`
se acepta pero nunca se reenvía a la UI.

### Dos cosas que el deep link no transporta

**La rama base.** Claude Code deduce la rama principal de un repo ejecutando
`git symbolic-ref --short refs/remotes/origin/HEAD` y quitándole el prefijo `origin/`.
No mira la rama base configurada aquí. Si tu remoto declara `main` como rama por
defecto pero trabajas sobre otra, la sesión mostrará la equivocada. La opción
*Apuntar `origin/HEAD` a la rama base* ejecuta `git remote set-head origin <base>` al
inicializar; es configuración local del clon y nunca se sube. El equivalente manual,
una vez por repositorio:

```bash
git remote set-head origin <rama-base>
```

**El modo de permisos.** La URL solo lleva `q` y `folder`, así que no hay forma de
pedir un modo. Se resuelve desde los settings, y una carpeta recién creada no hereda
nada que no esté en el tier de usuario. La opción *Modo de permisos de la sesión*
escribe `permissions.defaultMode` en el `.claude/settings.local.json` del worktree.

Tiene que ser ese archivo y no el `settings.json` versionado del repositorio: los modos
elevados (`auto`, `acceptEdits`, `bypassPermissions`) que llegan desde el tier
`project` la app los **descarta en silencio**, para que un repositorio no pueda
auto-concederse permisos. Desde el tier `local` o el de usuario sí se respetan.

### El lanzador en Windows

`Start-Process` de PowerShell, que es ShellExecute. Se probaron dos alternativas más
baratas y ninguna sirve:

- `rundll32 url.dll,FileProtocolHandler` — la app recibe la invocación pero pierde los
  parámetros: el `folder` nunca llega.
- `explorer.exe <url>` — no activa el protocolo, no ocurre nada en absoluto.

El proceso lanzador **no** se suelta con `detached`: al hacerlo moría antes de invocar el
protocolo. Esperarlo, además, convierte su código de salida en una señal real de si la
invocación se aceptó.

En macOS y Linux se usan `open` y `xdg-open`. Solo está verificado en Windows.

## Detalle del ticket

Cada tarjeta tiene un botón **Detalle** que abre la ficha completa sin salir del panel:
estado, tipo, prioridad, asignado, quién reporta, fechas, componentes, etiquetas, el
ticket padre si lo hay, y la descripción y los comentarios de Jira.

La descripción llega en **ADF** (Atlassian Document Format), un árbol JSON — ni texto ni
HTML. Se convierte a Markdown en el servidor y se renderiza en el cliente.

La alternativa era pedir `expand=renderedFields`, que devuelve HTML ya montado por Jira,
pero pintarlo obligaría a inyectar HTML de terceros en la página. Convertir nosotros deja
el control del resultado y evita esa superficie: el render no habilita HTML crudo, así
que cualquier etiqueta que venga en un ticket se muestra como texto y no se ejecuta.

El conversor cubre lo que estos tickets usan de verdad —párrafos, encabezados, listas
anidadas, tablas, bloques de código con lenguaje, citas, reglas y las marcas
`code`/`strong`/`em`/`link`— y degrada con elegancia lo que no conoce: un nodo
desconocido con hijos aporta igualmente su texto en vez de desaparecer. Está cubierto por
`npm test`.

El detalle se pide siempre fresco a Jira, sin pasar por la caché de la lista: se abre
justamente para leer lo último del ticket.

## Seguimiento de lo ya iniciado

Cada ticket de la lista muestra si ya lo empezaste, y el botón cambia a **Retomar**
cuando hay algo que retomar. La cabecera resume cuántos tienen worktree.

El estado sale de dos sitios distintos, y la diferencia importa:

| Señal | De dónde sale | Por qué |
|---|---|---|
| **Worktree activo** + su rama y si tiene cambios sin commitear | de git, en cada carga | No puede desincronizarse. Si borras el worktree a mano, el ticket vuelve a figurar como no empezado — que es la verdad. |
| **Inicializado hace X · sin worktree** | de `history.json` | Cubre lo que git ya olvidó: que le diste clic y limpiaste el worktree después. |

Que exista worktree manda sobre el historial: es lo único que puedes retomar ahora.

El emparejamiento es directo porque el worktree se nombra como el ticket. En esa misma
carpeta conviven los worktrees que crea la propia app de Claude Code, con nombres
generados (`silly-turing-0ec969`) o derivados (`abc-123-explore-2fa6d7`), así que solo
se consideran los que tienen exactamente forma de clave de Jira.

`/api/activity` consulta únicamente git local — sin `ls-remote`— porque se pide junto
con la lista de tickets y no puede costar lo que cuesta una llamada de red.
`history.json` no se versiona.

## Limpieza de worktrees

El botón **Worktrees** lista los de todos los repos configurados con su estado real:
cambios sin commitear, commits sin subir, si la rama está fusionada y si sigue en el
remoto. Borrar exige confirmación y, cuando hay algo que perder, lo dice antes.

Tres salvaguardas, en orden de importancia:

1. **Solo se toca lo que está dentro de la carpeta de worktrees del proyecto.** La ruta
   se resuelve y se compara contra esa raíz antes de nada. Sin esta comprobación un
   `path` manipulado borraría cualquier carpeta del disco.
2. **El worktree principal del repo nunca es candidato.**
3. **Un worktree con trabajo vivo exige forzar.** Y «trabajo vivo» incluye los que están
   en *detached HEAD*: no tienen rama que comparar, pero sí pueden tener cambios sin
   guardar, así que se inspeccionan igual.

Borrar la rama local es una casilla aparte, desmarcada por defecto, que avisa cuando la
rama no está fusionada.

Cada fila tiene además un botón para abrirla en el editor, en una ventana nueva. El
comando es configurable, con `{{path}}` sustituido por la ruta del worktree:

```json
"editor": { "label": "VS Code", "command": "code", "args": ["-n", "{{path}}"] }
```

Sirve igual para `cursor {{path}}` o `idea {{path}}`. En Windows la llamada pasa por
`cmd.exe /c`, porque estos lanzadores son scripts (`code.cmd`) y `spawn` no ejecuta un
`.cmd` directamente; los argumentos van en un array y nunca concatenados, para que una
ruta con espacios o con `&` no rompa el comando.

Abrir usa **el mismo cerrojo de ruta que borrar**: solo se abre lo que esté dentro de
la carpeta de worktrees del proyecto. Sin esa comprobación, una petición manipulada
podría lanzar el editor sobre cualquier ruta del disco.

## Detalles de Jira que cuestan descubrir

Se usa `POST /rest/api/3/search/jql`. El viejo `/rest/api/3/search` está deprecado y la
paginación va por `nextPageToken`, no por índice.

**Los status se enumeran por nombre, nunca por categoría.** En una instancia real,
`Rejected` puede compartir la categoría `indeterminate` con `In Progress` pese a
significar lo contrario, así que filtrar por categoría los mezcla o los pierde. Por eso
la lista de status es configurable y explícita, y por eso `Rejected` se colorea por
nombre en la interfaz.

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | API con recarga en caliente + Vite, en paralelo |
| `npm run build` | Compila la UI a `dist/web` y empaqueta el servidor en `dist/server` |
| `npm start` | Levanta el servidor compilado sirviendo la UI en un solo puerto |
| `npm test` | Tests de la lógica pura (nombres de rama) |
| `npm run typecheck` | TypeScript sobre servidor y UI |
