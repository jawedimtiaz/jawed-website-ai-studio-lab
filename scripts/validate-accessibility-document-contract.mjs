import {readdir, readFile} from "node:fs/promises";
import {join, relative} from "node:path";

const root = process.cwd();
const ignored = new Set([".git", "node_modules", ".wrangler"]);
const files = [];
async function walk(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (entry.isDirectory()) {
      if (!ignored.has(entry.name)) await walk(join(dir, entry.name));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      files.push(join(dir, entry.name));
    }
  }
}
const strip = value => value.replace(/<!--([\s\S]*?)-->/g, "")
  .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style\s*>/gi, "");
const visibleText = value => value.replace(/<[^>]*>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
const failures = [];
await walk(root);
files.sort();
for (const file of files) {
  const path = relative(root, file).replaceAll("\\", "/");
  // Google Search Console ownership tokens are machine-verification files, not user-facing documents.
  if (/^google[0-9a-f]+\.html$/i.test(path)) continue;
  const html = strip(await readFile(file, "utf8"));
  const fail = message => failures.push(path + ": " + message);
  if (!/<html\b[^>]*\blang\s*=\s*["'][a-z]{2,3}(?:-[a-z0-9]+)*["']/i.test(html)) fail("document must declare a valid primary language on <html lang>");
  if (!/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title\s*>/i.test(html)) fail("document must have a non-empty <title>");
  if (path === "index.html" && /<div id="root"><\\/div>/.test(html)) {
    const homeRoute = await readFile("src/pages/HomePage.tsx", "utf8");
    if (!/<main\\b[^>]*>/i.test(homeRoute)) fail("React SPA home route must expose a <main> landmark");
  } else if (!/<main\\b[^>]*>/i.test(html)) {
    fail("document must expose a <main> landmark");
  }
  for (const match of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/gi)) {
    const attrs = match[1], content = match[2];
    const hasName = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs)
      || /\baria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs)
      || /\btitle\s*=\s*["'][^"']+["']/i.test(attrs)
      || visibleText(content).length > 0
      || /<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(content);
    if (!hasName) fail("button has no detectable accessible name");
  }
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const attrs = match[1], content = match[2];
    const hasName = /\baria-label\s*=\s*["'][^"']+["']/i.test(attrs)
      || /\baria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs)
      || visibleText(content).length > 0
      || /<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(content);
    if (!hasName) fail("link has no detectable accessible name");
  }
}
console.log("Accessibility document contract: scanned " + files.length + " HTML files.");
if (failures.length) {
  console.error("Accessibility document contract FAILED (" + failures.length + " finding(s)):");
  for (const failure of failures) console.error("- " + failure);
  process.exit(1);
}
console.log("PASS: language, title, main landmark, and detectable names for static links/buttons.");
console.log("Scope note: this is a dependency-free static contract, not a WCAG conformance result; it does not evaluate computed names, contrast, focus behavior, live DOM states, or assistive technology.");
