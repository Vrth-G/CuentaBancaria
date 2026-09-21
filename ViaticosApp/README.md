# Viáticos — control de gastos de viaje

Aplicación web (PWA) para registrar, viaje por viaje, cada gasto de tus viáticos
y saber al final **cuánto gastaste ante la empresa** y **cuánto es tuyo**.
Funciona sin internet y guarda todo únicamente en tu teléfono (localStorage),
no requiere servidor ni cuenta.

## Instalar en el teléfono

No necesita Play Store / App Store: se instala como acceso directo desde el navegador.

**Android (Chrome):**
1. Abre `index.html` de esta carpeta con Chrome (puedes subir la carpeta a algún hosting
   estático gratuito como GitHub Pages, o abrirla localmente).
2. Toca el menú ⋮ → **"Agregar a la pantalla de inicio" / "Instalar app"**.
3. Se crea un ícono como cualquier otra app; abre sin barra de navegador y funciona sin conexión.

**iPhone (Safari):**
1. Abre `index.html` con Safari.
2. Toca el ícono de compartir (□↑) → **"Agregar a pantalla de inicio"**.

## Cómo está pensada

Cada **viaje** tiene un presupuesto dividido en **rubros** (igual que la tabla de
viáticos que te dan: Pasajes, Movilización, Alojamiento, Desayuno, Almuerzo, Cena…).
Cada rubro se reparte automáticamente en registros individuales (por ejemplo,
"Desayuno" con cantidad 5 crea un registro de desayuno para cada día del viaje).

Por cada registro, tú decides qué pasó:

| Opción | Qué significa |
|---|---|
| ✅ Gasté igual | Gastaste exactamente lo presupuestado |
| ✏️ Gasté diferente | Gastaste más o menos de lo presupuestado (útil para el hotel) |
| 😊 No lo usé — es mío | No gastaste ese rubro pero el viaje sigue en pie (ej. no desayunaste el martes). **Ese dinero se queda contigo, no se devuelve.** |
| ↩️ No lo usé — debo devolverlo | Ese gasto ya no aplica (ej. regresaste antes) y el dinero **debe volver a la empresa** |

### Los dos tipos de rubro

- **Ahorro** (por defecto para comidas y movilización interna): si no usas el
  dinero mientras el viaje sigue activo, es tuyo. Si el viaje termina antes de
  lo planeado, los días que ya no aplican se marcan automáticamente para devolver.
- **Reembolsable** (por defecto para alojamiento y pasajes): la diferencia
  siempre se ajusta con la empresa — si gastaste menos, devuelves la diferencia;
  si gastaste más, te lo reembolsan.

### Acortar el viaje

Si tu viaje termina antes de lo planeado (por ejemplo viajas el jueves de noche
en vez del viernes), usa **"Acortar viaje"** e indica el último día real. La app
marca automáticamente como "a devolver" todos los registros pendientes de los
días que ya no viajaste (por ejemplo, el desayuno del viernes) — sin tocar los
días anteriores que ya hayas marcado como ahorro tuyo.

### Resumen final

La pestaña **Resumen** muestra:
- Total recibido de la empresa
- Total gastado y comprobado (lo que rindes con recibos/registro)
- Total que es tuyo (ahorro, no se devuelve)
- Total a devolver a la empresa
- Total que la empresa te debe reembolsar (si gastaste de más en un rubro reembolsable)

Desde ahí puedes tocar **"Compartir liquidación"** para enviar un resumen de
texto (por WhatsApp, correo, etc.) a quien te pida validar tus gastos.

## Archivos

- `index.html`, `styles.css`, `app.js` — la aplicación.
- `manifest.webmanifest`, `sw.js`, `icons/` — soporte para instalarla como app (PWA) y funcionar offline.

Todos los datos viven en `localStorage` del navegador; si limpias los datos del
navegador o cambias de teléfono, se pierden (no hay respaldo en la nube en esta
primera versión).
