// Instala las devDependencies si faltan, para que `npm test` funcione en un
// checkout recién clonado (p. ej. una sesión cloud nueva) sin pasos manuales.
const { existsSync } = require('node:fs');
const { execSync } = require('node:child_process');

const needed = ['@playwright/test', 'http-server'];
const missing = needed.filter(name => !existsSync(`node_modules/${name}/package.json`));

if (missing.length) {
    console.log(`[pretest] Faltan dependencias (${missing.join(', ')}): ejecutando npm ci...`);
    execSync('npm ci --no-audit --no-fund', { stdio: 'inherit' });
}
