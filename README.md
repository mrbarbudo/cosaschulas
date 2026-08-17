# La Vaquita 🐮

Cuentas claras de viaje entre amigos. Anota los gastos del grupo, indica cuántos días estuvo cada persona, y la app calcula cuánto le corresponde pagar a cada quien y las transferencias mínimas para quedar a mano.

Es un solo archivo (`index.html`), sin dependencias ni servidor: funciona abriéndolo en cualquier navegador.

## Qué hace

- **Viajes**: crea varios viajes, cada uno con nombre, periodo (desde/hasta) y moneda. El periodo configurado define qué gastos se muestran y se reparten.
- **Personas con estadías distintas**: cada persona tiene check-in y check-out (convención hotelera: presente la noche `d` si `checkIn <= d < checkOut`).
- **Tres tipos de reparto por gasto** (`per_day` / `shared_all` / `custom_split`), cada uno con categoría (alojamiento, transporte, comida, otros):
  - **Por noche**: el costo diario (monto / noches) se divide estrictamente entre quienes duermen esa noche; el costo de cada persona es la suma de sus noches. Ideal para arriendos.
  - **Todos por igual**: partes iguales entre todas las personas del viaje.
  - **Grupo del día**: partes iguales dentro del subgrupo elegido, o —si dejas a todos marcados— entre los presentes ese día (ej: auto día 1 entre 4, auto día 2 entre 3).
- **Hitos de salida (settlement cronológico)**: cada persona salda su cuenta exacta al momento de su check-out — la app indica a quién transferir y cuánto, minimizando transferencias; el último check-out cierra el viaje con el clásico mayor-deudor → mayor-acreedor.
- **Desglose y WhatsApp**: tabla por persona y categoría (le toca / pagó / saldo) y botón que copia un resumen con emojis listo para pegar en el grupo.
- **Se guarda solo**: los datos quedan en el navegador (`localStorage`); al cerrar y volver, todo sigue ahí.
- **Compartir con el grupo**: el botón *Copiar enlace del viaje* genera una URL que lleva todos los datos comprimidos. Al abrirla, otra persona guarda el viaje en su navegador, dice quién es, y agrega sus propios gastos (cada gasto registra quién lo agregó). Cuando te comparte *su* enlace de vuelta, los cambios se combinan automáticamente: gana la edición más reciente de cada gasto o persona. También se puede exportar/importar como archivo JSON.

## Cómo publicarla para el grupo

La app es 100% estática, así que basta con GitHub Pages:

1. Fusiona esta rama a `main`.
2. En GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. En unos minutos quedará disponible en `https://<usuario>.github.io/cosaschulas/`.

Cada amigo abre esa URL, y se pasan los enlaces del viaje para sincronizar los gastos.

## Inicio de sesión con Google (opcional)

La app trae integrado el botón "Iniciar sesión con Google" (Google Identity Services): al entrar, cada amigo queda identificado con su nombre de Google — se usa para prellenar su persona, marcar automáticamente "tú eres" cuando su nombre coincide, y firmar los gastos que agrega. Para activarlo:

1. Publica la app en un dominio propio (por ejemplo GitHub Pages, ver arriba). El login **no** funciona en la vista previa de Claude ni abriendo el archivo localmente.
2. En [Google Cloud Console](https://console.cloud.google.com/apis/credentials) crea un proyecto (gratis) → **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
3. En "Orígenes de JavaScript autorizados" agrega tu dominio, p. ej. `https://<usuario>.github.io`.
4. Copia el Client ID (termina en `.apps.googleusercontent.com`) y pégalo en `index.html`, en la constante `GOOGLE_CLIENT_ID`.

Sin Client ID configurado, el botón no aparece y todo lo demás funciona igual (la identidad se elige manualmente con "¿Quién eres tú?"). Nota: el login identifica a las personas, pero no crea una base de datos compartida — la sincronización entre amigos sigue siendo por enlaces/respaldos.

## Notas técnicas

- Los montos se manejan internamente en centavos con reparto por *método del resto mayor*, así las partes de cada gasto siempre suman el total exacto y los saldos del grupo suman cero.
- Los enlaces compartidos usan `CompressionStream` (deflate) + base64url en el fragmento `#viaje=…`; los datos nunca pasan por un servidor.
- Sin build, sin frameworks: HTML + CSS + JS vanilla, tipografías incrustadas (Bricolage Grotesque e Instrument Sans), tema claro y oscuro.
