# Instrucciones para Claude

## Versionado de la PWA

**IMPORTANTE**: Cada cambio en el código requiere actualizar la versión en DOS lugares:

1. **`service-worker.js`** - línea 2:
   ```javascript
   const APP_VERSION = '1.2.0';  // Cambiar aquí
   ```

2. **`index.html`** - buscar el div `#versionInfo`:
   ```html
   <div id="versionInfo">v1.2.0</div>  <!-- Y aquí -->
   ```

Esto asegura que:
- El caché se invalide correctamente
- Los usuarios vean la nueva versión
- Se muestre el banner de actualización cuando haya cambios
