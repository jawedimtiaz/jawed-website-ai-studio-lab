import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const distDir = path.resolve('dist');
const SITE_ORIGIN = 'https://jawed.co.in';

if (!fs.existsSync(distDir)) {
  console.error('dist directory does not exist. Run vite build first.');
  process.exit(1);
}

const filesToCopy = [
  '_headers',
  '_redirects',
  '_routes.json',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'offline.html',
  'service-worker.js',
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
  'pwa-192.png',
  'pwa-512.png',
  'pwa-maskable-512.png'
];

for (const file of filesToCopy) {
  const src = path.resolve(file);
  const dest = path.join(distDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
}

// Copy assets and static page directories if needed
const dirsToCopy = ['assets', 'contact'];
for (const dir of dirsToCopy) {
  const src = path.resolve(dir);
  const dest = path.join(distDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function getStringLiteralProperty(objLiteral, propName) {
  for (const prop of objLiteral.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      ((ts.isIdentifier(prop.name) && prop.name.text === propName) ||
        (ts.isStringLiteral(prop.name) && prop.name.text === propName))
    ) {
      if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
        return prop.initializer.text;
      }
    }
  }
  return '';
}

function readRegisteredTools() {
  const toolsDataPath = path.resolve('src/data/toolsData.ts');
  const sourceText = fs.readFileSync(toolsDataPath, 'utf8');
  const sourceFile = ts.createSourceFile(toolsDataPath, sourceText, ts.ScriptTarget.Latest, true);
  const tools = [];

  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'toolsList' &&
      node.initializer &&
      ts.isArrayLiteralExpression(node.initializer)
    ) {
      for (const element of node.initializer.elements) {
        if (ts.isObjectLiteralExpression(element)) {
          const slug = getStringLiteralProperty(element, 'slug');
          const title = getStringLiteralProperty(element, 'title');
          const description = getStringLiteralProperty(element, 'description');
          const category = getStringLiteralProperty(element, 'category');
          const routePath = getStringLiteralProperty(element, 'path') || `/tools/${slug}/`;
          if (slug && title) {
            tools.push({ slug, title, description, category, path: routePath });
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tools;
}

function renderRouteHtml(baseHtml, { title, description, canonicalPath }) {
  const normalizedPath = canonicalPath.endsWith('/') ? canonicalPath : `${canonicalPath}/`;
  const canonicalUrl = `${SITE_ORIGIN}${normalizedPath}`;
  const fullTitle = `${title} | Jawed Imtiaz`;
  const escapedTitle = escapeHtml(fullTitle);
  const escapedHeading = escapeHtml(title);
  const escapedDesc = escapeHtml(description);
  const escapedUrl = escapeHtml(canonicalUrl);

  let html = baseHtml
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapedTitle}</title>`)
    .replace(/<meta\s+name="description"\s+content="[^"]*"\s*\/?>/i, `<meta name="description" content="${escapedDesc}" />`)
    .replace(/<link\s+rel="canonical"\s+href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${escapedUrl}" />`)
    .replace(/<meta\s+property="og:title"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:title" content="${escapedTitle}" />`)
    .replace(/<meta\s+property="og:description"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:description" content="${escapedDesc}" />`)
    .replace(/<meta\s+property="og:url"\s+content="[^"]*"\s*\/?>/i, `<meta property="og:url" content="${escapedUrl}" />`)
    .replace(/<meta\s+name="twitter:title"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:title" content="${escapedTitle}" />`)
    .replace(/<meta\s+name="twitter:description"\s+content="[^"]*"\s*\/?>/i, `<meta name="twitter:description" content="${escapedDesc}" />`);

  if (!/<main\b/i.test(html)) {
    html = html.replace(
      /<div\s+id="root"><\/div>/i,
      `<div id="root"></div>\n    <noscript><main id="main-content"><h1>${escapedHeading}</h1><p>${escapedDesc}</p></main></noscript>`
    );
  }

  return html;
}

function generateToolStaticRoutes() {
  const indexHtmlPath = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexHtmlPath)) {
    console.error('dist/index.html does not exist. Run vite build first.');
    process.exit(1);
  }

  const baseHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const tools = readRegisteredTools();
  if (tools.length === 0) {
    console.error('Failed to extract registered tools from src/data/toolsData.ts.');
    process.exit(1);
  }

  if (!tools.some((tool) => tool.slug === 'portfolio-tracker')) {
    console.error('Missing required tool registration: portfolio-tracker in src/data/toolsData.ts.');
    process.exit(1);
  }

  const routesToGenerate = [
    {
      canonicalPath: '/tools/',
      title: 'Interactive Tools',
      description: `Browse ${tools.length} privacy-first interactive browser utilities for IT Service Desk, Apple & macOS, Microsoft 365, career planning, and personal finance including the Multi-Asset Portfolio Tracker.`
    },
    ...tools.map((tool) => ({
      canonicalPath: tool.path.startsWith('/') ? tool.path : `/tools/${tool.slug}/`,
      title: tool.title,
      description: tool.description
    }))
  ];

  for (const route of routesToGenerate) {
    const relativeDir = route.canonicalPath.replace(/^\/+|\/+$/g, '');
    const targetDir = path.join(distDir, relativeDir);
    fs.mkdirSync(targetDir, { recursive: true });
    const html = renderRouteHtml(baseHtml, route);
    fs.writeFileSync(path.join(targetDir, 'index.html'), html, 'utf8');
  }

  const financeCount = tools.filter((t) => t.category === 'Finance & Planning').length;
  console.log(
    `✓ Generated ${routesToGenerate.length} static SPA tool entry points in dist/tools/ (${tools.length} tools total, ${financeCount} in Finance & Planning, including /tools/portfolio-tracker/).`
  );
}

generateToolStaticRoutes();
console.log('✓ Successfully prepared self-contained dist/ for production deployment.');

