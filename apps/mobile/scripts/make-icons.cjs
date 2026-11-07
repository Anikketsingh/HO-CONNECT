/**
 * Draws the app icon, splash logo and notification icon from the HairOriginals logo (docs/brand).
 * Run from the repo root: node apps/mobile/scripts/make-icons.cjs
 * Replace the files in apps/mobile/assets with the designer's versions when you have them.
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(require.resolve('sharp', { paths: [process.cwd(), path.join(process.cwd(), 'apps/dashboard')] }));

const logo = fs.readFileSync(path.join(__dirname, '../../dashboard/public/logo.svg'), 'utf8');
const paths = [...logo.matchAll(/<path\b[^>]*\/>/g)].map((m) => m[0]);
const VB = { x: 58, y: 135, w: 384, h: 230 };
const out = path.join(__dirname, '../assets');

/** The logo centred in a square canvas, `fraction` of the canvas wide. */
function canvas(size, fraction, { background, mono } = {}) {
  const w = size * fraction;
  const h = (w * VB.h) / VB.w;
  const body = paths.map((p) => (mono ? p.replace(/fill="[^"]*"/, '').replace('<path', `<path fill="${mono}"`) : p)).join('');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
      (background ? `<rect width="${size}" height="${size}" fill="${background}"/>` : '') +
      `<svg x="${(size - w) / 2}" y="${(size - h) / 2}" width="${w}" height="${h}" viewBox="${VB.x} ${VB.y} ${VB.w} ${VB.h}">${body}</svg></svg>`,
  );
}

(async () => {
  const files = {
    // iOS and store icon: opaque, logo fills about 78% of the width
    'icon.png': canvas(1024, 0.78, { background: '#F7EFEC' }),
    // Android adaptive icon: transparent; Android crops to a circle or squircle, so keep the logo inside the centre 66%
    'adaptive-icon.png': canvas(1024, 0.58),
    // Splash: logo on the splash background colour (set in app.config)
    'splash-icon.png': canvas(1024, 0.7),
    // Android status-bar icon: must be a plain white silhouette on transparent
    'notification-icon.png': canvas(256, 0.9, { mono: '#FFFFFF' }),
  };
  for (const [name, svg] of Object.entries(files)) {
    await sharp(svg).png().toFile(path.join(out, name));
    console.log('wrote', name);
  }
})();
