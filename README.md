# Mis horas

App Android (WebView + `assets/index.html`) para registrar jornadas: entrada/salida con reloj de Managua (AM/PM), contador en vivo, turnos (Día 5:00–12:30, Noche 16:00–21:00, Domingo 5:00–11:00), acumulado semanal y mensual e historial (Fecha, Turno, Entrada, Salida, Horas trabajadas, Diferencia). Funciona sin internet; los datos quedan solo en el teléfono.

**Historial en otra pantalla** (botón *Historial* arriba; el botón Atrás de Android vuelve al inicio), con **Compartir por WhatsApp** (informe de texto) y **Exportar archivo (CSV)** para enviarlo por WhatsApp u otra app. Pedido de Pinol el 22-11-2026.

- Diseño: `app/src/main/assets/index.html` (diseño aprobado por Pinol, referencia anterior en `referencia/`).
- Paquete: `com.donpinol.mishoras` · minSdk 26.
- Pruebas de la lógica (`tests/`, Node + jsdom, tiempo simulado): persistencia al cerrar y abrir, jornadas que cruzan medianoche, cambio de semana/mes/fecha, datos dañados, zona horaria. Se ejecutan en CI.
- No verificado: ejecución en un teléfono real (las pruebas simulan el WebView), ni el aspecto visual de la nueva pantalla, ni el envío real a WhatsApp.

## Cambios respecto al paquete recibido de Work (22-11-2026)
- `index.html`: una sola línea cambiada (lectura del almacenamiento). Antes, un dato guardado dañado o con formato inesperado dejaba la pantalla en blanco; ahora se valida, se ignora y se guarda una copia en `donpinol.mishoras.v1.respaldo-danado`. Diseño y controles intactos.
- Historial en pantalla aparte + compartir/exportar (pedido de Pinol): `index.html` con navegación por `#historial`; `MainActivity.java` con puente `MisHorasNativo` (WhatsApp directo, o selector de apps si no está instalado; CSV por FileProvider) y botón Atrás.
- `MainActivity.java`: fondo del WebView igual al diseño; el manifiesto evita recrear la actividad al girar.
- Se añadió ícono de la app y el proyecto Gradle para compilar de forma reproducible en CI.

## Versiones y firma
`RELEASE_TAG` indica la versión; si aún no existe, el CI publica `MisHoras-unsigned.apk` + `sha256.txt` en esa release (nunca se sobrescribe). Se firma con la llave DonPinol mediante el repo DonPinol-Firma, tras aprobar la huella en un PR.
