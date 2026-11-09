# Abarrotería POS

Punto de venta para tiendas de abarrotes. Es una app web sin servidor: se abre desde un enlace, se puede instalar en el teléfono y sigue funcionando sin internet.

## Qué hace

- **Vender:** búsqueda, lector de códigos USB, productos por peso, monto libre, descuentos y ticket de 80 mm.
- **Cámara:** escaneo continuo que agrega cada producto al ticket.
- **Códigos nuevos:** un código desconocido se busca en un catálogo abierto para sugerir nombre y foto. También se puede ligar a un producto que ya exista.
- **Inventario:** varios códigos por producto, cajas, caducidades, alertas y movimientos.
- **Corte de caja:** fondo, entradas y salidas, efectivo esperado contra contado.
- **Fiado:** cuentas por cliente y abonos.
- **Facturas:** captura de datos fiscales por ticket y factura global.
- **Más:** historial y cancelación de ventas, reportes, importación CSV y respaldos.

## Antes de usarla en tu negocio

- **Los datos viven en cada dispositivo.** No se sincronizan entre cajas o teléfonos. Descarga un respaldo seguido desde Ajustes, porque borrar los datos del navegador borra todo.
- **Las facturas no se timbran aquí.** La app prepara los datos. Para que una factura tenga validez, debes timbrarla con un PAC o en el portal del SAT.
- **No tiene usuarios ni contraseñas.** Quien abra la app en un dispositivo puede ver y cambiar sus datos.
- **La cámara requiere https.** GitHub Pages ya lo da.

## Desarrollo

No necesita compilación. Requiere Node.js solo para el servidor local y las pruebas.

```bash
npm start
```

```bash
npm test
```

La lógica de dinero e impuestos está en `js/core.js` y trabaja en centavos enteros.

## Publicar en GitHub Pages

En el repositorio, ve a **Settings → Pages**, elige **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`.

## Formato CSV de productos

Columnas: `codigo, nombre, categoria, precio, costo, existencias, minimo, unidad, iva, caducidad, piezas_por_caja`. Solo `nombre` y `precio` son obligatorias. Separa varios códigos con `|` y escribe la caducidad como `AAAA-MM-DD`.

## Licencias de terceros

Los nombres y fotos sugeridos vienen de [Open Food Facts](https://world.openfoodfacts.org), Open Beauty Facts y Open Products Facts (datos ODbL, fotos CC BY-SA). La app solo les envía el código de barras consultado.

`vendor/zxing.min.js` es [ZXing para JavaScript](https://github.com/zxing-js/library), con licencia MIT (`vendor/zxing-LICENSE.txt`).
