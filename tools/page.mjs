// Tiny page scaffolder: wraps a body fragment in the shared <head>. Usage: node tools/page.mjs <name> "<title>" "<description>" [script]
import { readFileSync, writeFileSync } from 'node:fs';
const [name, title, desc, script] = process.argv.slice(2);
const body = readFileSync(`tools/fragments/${name}.html`, 'utf8');
writeFileSync(`public/${name}.html`, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${desc}">
  <meta name="theme-color" content="#000911">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/app.css?v=2">
  <script type="module" src="/assets/js/${script || 'app'}.js"></script>
</head>
<body>
${body.trim()}
</body>
</html>
`);
console.log(`public/${name}.html`);
