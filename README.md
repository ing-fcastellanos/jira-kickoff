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
npm install
cp .env.example .env
cp config.example.json config.json
npm run dev
```

En `.env` va el único secreto: el
[API token de Jira](https://id.atlassian.com/manage-profile/security/api-tokens).
GitHub no necesita token — las ramas remotas se leen con `git ls-remote`, que usa las
credenciales que git ya tiene configuradas.

`config.json` no se versiona porque lleva rutas absolutas de tu máquina. Puedes
editarlo a mano o, más cómodo, dejarlo casi vacío y rellenarlo desde **Opciones** en la
propia interfaz.

La UI queda en <http://127.0.0.1:5173> y la API en <http://127.0.0.1:8787>.

## Opciones

Todo lo configurable se edita desde la interfaz y se guarda en `config.json`, con
validación antes de escribir y escritura atómica:

| Sección | Qué contiene |
|---|---|
| Apariencia | Claro, oscuro o según el sistema. Se guarda en el navegador, no en `config.json`. |
| Jira | Dominio, qué status incluir y un filtro JQL adicional opcional. |
| Proyectos | Cada clave de Jira apuntando a un repositorio local, con su rama base. Se pueden desactivar sin borrarlos. |
| Rama y worktree | Patrón del nombre de rama, con vista previa en vivo, y dónde se crean los worktrees. |
| Prompt inicial | El comando base y las líneas fijas que lo acompañan. |
| Al inicializar | Abrir la sesión, o solo crear el worktree y copiar el prompt. |

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
| `npm run build` | Compila la UI a `dist/web` |
| `npm start` | Levanta la API sirviendo la UI compilada en un solo puerto |
| `npm test` | Tests de la lógica pura (nombres de rama) |
| `npm run typecheck` | TypeScript sobre servidor y UI |
