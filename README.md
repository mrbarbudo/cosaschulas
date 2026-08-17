# La Vaquita 🐮

Cuentas claras de viaje entre amigos. Anota los gastos del grupo, indica cuántos días estuvo cada persona, y la app calcula cuánto le corresponde pagar a cada quien y las transferencias mínimas para quedar a mano.

Es un solo archivo (`index.html`), sin dependencias ni servidor: funciona abriéndolo en cualquier navegador.

## Qué hace

- **Viajes**: crea varios viajes, cada uno con nombre, periodo (desde/hasta) y moneda. El periodo configurado define qué gastos se muestran y se reparten.
- **Personas con estadías distintas**: cada persona tiene fecha de llegada y de salida. Un gasto prorrateado "por días" se divide según cuántos de esos días estuvo presente cada participante — quien estuvo 2 días no paga lo mismo que quien estuvo 7.
- **Gastos flexibles**: cada gasto tiene monto, quién lo pagó, qué días cubre (un día, un rango o todo el viaje), entre quiénes se divide, y el modo de reparto: *por días de estadía* o *en partes iguales*.
- **Saldar cuentas**: calcula el balance de cada persona (pagó vs. le corresponde) y sugiere el mínimo de transferencias para que todos queden a mano (a lo más n−1 transferencias).
- **Se guarda solo**: los datos quedan en el navegador (`localStorage`); al cerrar y volver, todo sigue ahí.
- **Compartir con el grupo**: el botón *Copiar enlace del viaje* genera una URL que lleva todos los datos comprimidos. Al abrirla, otra persona guarda el viaje en su navegador, dice quién es, y agrega sus propios gastos (cada gasto registra quién lo agregó). Cuando te comparte *su* enlace de vuelta, los cambios se combinan automáticamente: gana la edición más reciente de cada gasto o persona. También se puede exportar/importar como archivo JSON.

## Cómo publicarla para el grupo

La app es 100% estática, así que basta con GitHub Pages:

1. Fusiona esta rama a `main`.
2. En GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / root**.
3. En unos minutos quedará disponible en `https://<usuario>.github.io/cosaschulas/`.

Cada amigo abre esa URL, y se pasan los enlaces del viaje para sincronizar los gastos.

## Notas técnicas

- Los montos se manejan internamente en centavos con reparto por *método del resto mayor*, así las partes de cada gasto siempre suman el total exacto y los saldos del grupo suman cero.
- Los enlaces compartidos usan `CompressionStream` (deflate) + base64url en el fragmento `#viaje=…`; los datos nunca pasan por un servidor.
- Sin build, sin frameworks: HTML + CSS + JS vanilla, tipografías incrustadas (Bricolage Grotesque e Instrument Sans), tema claro y oscuro.
