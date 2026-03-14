const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HOST = '127.0.0.1';
const PORT = 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

http.createServer((req, res) => {
  const rawUrl = (req.url || '/').split('?')[0];
  const relPath = rawUrl === '/' ? 'index.html' : decodeURIComponent(rawUrl.slice(1));
  const filePath = path.join(ROOT, relPath);
  const ext = path.extname(filePath).toLowerCase();

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
    res.end(data);
  });
}).listen(PORT, HOST, () => {
  console.log(`http://${HOST}:${PORT}`);
});
