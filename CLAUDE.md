# Instructions for Claude

## PWA Versioning

**IMPORTANT**: Every code change requires updating the version in TWO places:

1. **`service-worker.js`** - line 2:
   ```javascript
   const APP_VERSION = '1.2.0';  // Change here
   ```

2. **`index.html`** - find the `#versionInfo` div:
   ```html
   <div id="versionInfo">v1.2.0</div>  <!-- And here -->
   ```

This ensures that:
- The cache invalidates correctly
- Users can see the new version
- The update banner shows when there are changes
