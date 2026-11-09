const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(__dirname, 'data', 'content.json');
const UPLOADS = path.join(__dirname, 'uploads');
const AUTH = path.join(__dirname, 'data', 'auth.json');
const PORT = Number(process.env.PORT || 3000);
const ADMIN_USER = process.env.CMS_USER || 'admin';
const ADMIN_PASS = process.env.CMS_PASS || 'rafm2026';
const sessions = new Map();

const MIME = {
  '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8',
  '.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif',
  '.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8','.pdf':'application/pdf'
};

async function ensure() {
  await fsp.mkdir(path.dirname(DATA), { recursive:true });
  await fsp.mkdir(UPLOADS, { recursive:true });
  if (!fs.existsSync(DATA)) await fsp.writeFile(DATA, '{}', 'utf8');
  if (!fs.existsSync(AUTH)) await fsp.writeFile(AUTH, JSON.stringify({ user: ADMIN_USER, pass: ADMIN_PASS }, null, 2), 'utf8');
}
function json(res, status, body, headers={}) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':buf.length, ...headers });
  res.end(buf);
}
function parseCookies(req) {
  const out = {}; const raw = req.headers.cookie || '';
  raw.split(';').forEach(p => { const i=p.indexOf('='); if(i>-1) out[p.slice(0,i).trim()] = decodeURIComponent(p.slice(i+1).trim()); });
  return out;
}
function authed(req) {
  const t = parseCookies(req).cms_session;
  if (!t) return false;
  const s = sessions.get(t);
  if (!s || s.exp < Date.now()) { sessions.delete(t); return false; }
  s.exp = Date.now() + 1000*60*60*8; return true;
}
async function readBody(req, limit=15*1024*1024) {
  return await new Promise((resolve,reject)=>{
    const chunks=[]; let n=0;
    req.on('data',c=>{ n+=c.length; if(n>limit){ reject(Object.assign(new Error('Body too large'),{status:413})); req.destroy(); return; } chunks.push(c); });
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',reject);
  });
}
async function getAuth() {
  try { return JSON.parse(await fsp.readFile(AUTH,'utf8')); } catch { return { user: ADMIN_USER, pass: ADMIN_PASS }; }
}
async function handleApi(req,res,url) {
  if (req.method==='POST' && url.pathname==='/api/login') {
    const body = JSON.parse((await readBody(req, 1024*64)).toString('utf8')||'{}');
    const auth = await getAuth();
    if (body.username === auth.user && body.password === auth.pass) {
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token,{exp:Date.now()+1000*60*60*8});
      res.setHeader('Set-Cookie', `cms_session=${token}; HttpOnly; Path=/; SameSite=Lax`);
      return json(res,200,{ok:true});
    }
    return json(res,401,{ok:false,error:'Invalid credentials'});
  }
  if (req.method==='POST' && url.pathname==='/api/logout') {
    const t = parseCookies(req).cms_session; if (t) sessions.delete(t);
    res.setHeader('Set-Cookie','cms_session=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax');
    return json(res,200,{ok:true});
  }
  if (req.method==='GET' && url.pathname==='/api/session') return json(res,200,{ok:true,authed:authed(req)});
  if (req.method==='GET' && url.pathname==='/api/content') {
    const raw = await fsp.readFile(DATA,'utf8').catch(()=> '{}');
    res.writeHead(200,{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' });
    return res.end(raw);
  }
  if (req.method==='PUT' && url.pathname==='/api/content') {
    if (!authed(req)) return json(res,401,{ok:false,error:'Unauthorized'});
    const buf = await readBody(req);
    let data;
    try { data = JSON.parse(buf.toString('utf8')); } catch { return json(res,400,{ok:false,error:'Invalid JSON'}); }
    data._updatedAt = new Date().toISOString();
    await fsp.writeFile(DATA, JSON.stringify(data,null,2), 'utf8');
    return json(res,200,{ok:true,updatedAt:data._updatedAt});
  }
  if (req.method==='POST' && url.pathname==='/api/upload') {
    if (!authed(req)) return json(res,401,{ok:false,error:'Unauthorized'});
    const ct = req.headers['content-type'] || '';
    const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!m) return json(res,400,{ok:false,error:'Expected multipart/form-data'});
    const boundary = Buffer.from('--' + (m[1]||m[2]));
    const body = await readBody(req, 20*1024*1024);
    const parts = [];
    let start = 0;
    while (true) {
      const idx = body.indexOf(boundary, start); if (idx < 0) break;
      const next = body.indexOf(boundary, idx + boundary.length); if (next < 0) break;
      parts.push(body.slice(idx + boundary.length, next));
      start = next;
    }
    let saved = null;
    for (const part of parts) {
      const sep = part.indexOf('\r\n\r\n'); if (sep < 0) continue;
      const head = part.slice(0, sep).toString('utf8');
      let chunk = part.slice(sep+4);
      if (chunk.slice(-2).toString()==='\r\n') chunk = chunk.slice(0,-2);
      const fn = (head.match(/filename="([^"]*)"/i)||[])[1];
      if (!fn) continue;
      const ext = (path.extname(fn)||'').toLowerCase();
      if (!['.png','.jpg','.jpeg','.gif','.webp','.svg','.pdf'].includes(ext)) return json(res,400,{ok:false,error:'Unsupported file type'});
      const name = Date.now() + '-' + crypto.randomBytes(4).toString('hex') + ext;
      await fsp.writeFile(path.join(UPLOADS,name), chunk);
      saved = '/cms/uploads/' + name;
    }
    if (!saved) return json(res,400,{ok:false,error:'No file uploaded'});
    return json(res,200,{ok:true,url:saved});
  }
  if (req.method==='POST' && url.pathname==='/api/password') {
    if (!authed(req)) return json(res,401,{ok:false,error:'Unauthorized'});
    const body = JSON.parse((await readBody(req, 1024*16)).toString('utf8')||'{}');
    if (!body.password || String(body.password).length < 6) return json(res,400,{ok:false,error:'Password must be at least 6 characters'});
    const auth = await getAuth(); auth.pass = String(body.password);
    if (body.username) auth.user = String(body.username);
    await fsp.writeFile(AUTH, JSON.stringify(auth,null,2), 'utf8');
    return json(res,200,{ok:true});
  }
  return json(res,404,{ok:false,error:'Not found'});
}

function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(base)) return null;
  return p;
}

const server = http.createServer(async (req,res)=>{
  try {
    const url = new URL(req.url, `http://${req.headers.host||'localhost'}`);
    if (url.pathname.startsWith('/api/')) return await handleApi(req,res,url);
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') rel = '/Online Church Website Layout – Figma Make.html';
    const file = safeJoin(ROOT, rel);
    if (!file) return json(res,403,{ok:false,error:'Forbidden'});
    let stat = await fsp.stat(file).catch(()=>null);
    if (stat && stat.isDirectory()) stat = await fsp.stat(path.join(file,'index.html')).then(s=> (rel=path.join(rel,'index.html'), s)).catch(()=>null);
    if (!stat || !stat.isFile()) return json(res,404,{ok:false,error:'Not found'});
    const finalFile = safeJoin(ROOT, rel) || file;
    const ext = path.extname(finalFile).toLowerCase();
    res.writeHead(200,{ 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': ext==='.html'||ext==='.json' ? 'no-store' : 'public, max-age=300' });
    fs.createReadStream(finalFile).pipe(res);
  } catch (e) {
    const status = e.status || 500;
    if (!res.headersSent) json(res,status,{ok:false,error:e.message||'Server error'}); else res.end();
  }
});

ensure().then(()=> server.listen(PORT, ()=> console.log(`RAFM CMS running at http://localhost:${PORT}\nAdmin: http://localhost:${PORT}/admin.html`)));
