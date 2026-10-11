// خادم ملفات ثابتة للمعاينة فقط؛ ليس باك إند للشكاوى ولا يستقبل بيانات.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf' };
const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
  try {
    const url = new URL(request.url, 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const filename = path.resolve(root, relativePath);
    const allowed = relativePath === 'index.html' || /^(assets|css|js)\//.test(relativePath);
    if (!filename.startsWith(root + path.sep) || !allowed) { response.writeHead(404); response.end('Not found'); return; }
    const content = await readFile(filename);
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) { response.writeHead(404); response.end('Not found'); }
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `المنفذ ${port} مستخدم. جرّب PORT=8081 npm start` : error.message); process.exitCode = 1; });
server.listen(port, '127.0.0.1', () => console.log(`نظام الشكاوى: http://localhost:${port}`));
