import http from 'node:http';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncSanitizedData, watchRawData } from './prepare-data.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(root, 'site-data');
const rawDataDir = path.join(root, 'data');
const port = Number(process.env.PORT || 4173);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.json':'application/json; charset=utf-8' };
await mkdir(rawDataDir, { recursive: true });
await syncSanitizedData(root);
const rawDataWatcher = watchRawData(root);

function send(res, status, body, type='text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
  res.end(body);
}
const server=http.createServer(async (req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/api/snapshots' && req.method==='GET') {
      const names=(await readdir(dataDir)).filter(name=>/^\d{4}[_-]\d{2}[_-]\d{2}\.csv$/i.test(name)).sort();
      const files=await Promise.all(names.map(async name=>{
        const parts=name.match(/^(\d{4})[_-](\d{2})[_-](\d{2})\.csv$/i);
        const [,year,month,day]=parts; const parsed=new Date(Number(year),Number(month)-1,Number(day));
        if(parsed.getFullYear()!==Number(year)||parsed.getMonth()!==Number(month)-1||parsed.getDate()!==Number(day)) return null;
        return {date:`${year}-${month}-${day}`,filename:name,csv:await readFile(path.join(dataDir,name),'utf8')};
      }));
      const validFiles=files.filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date));
      return send(res,200,JSON.stringify(validFiles),'application/json; charset=utf-8');
    }
    if(req.method!=='GET' && req.method!=='HEAD') return send(res,405,'Method not allowed.');
    let pathname=decodeURIComponent(url.pathname);
    const normalizedPath=pathname.replaceAll('\\','/');
    if(normalizedPath==='/data'||normalizedPath.startsWith('/data/'))return send(res,403,'Raw source data is not served.');
    if(pathname==='/' || pathname.endsWith('/')) pathname += 'index.html';
    const filePath=path.resolve(root,`.${pathname}`);
    if(!filePath.startsWith(root+path.sep)) return send(res,403,'Forbidden.');
    const body=await readFile(filePath);
    return send(res,200,body,mime[path.extname(filePath)] || 'application/octet-stream');
  } catch(error) {
    if(error.code==='ENOENT') return send(res,404,'Not found.');
    return send(res,error.message.includes('10 MB')?413:500,error.message || 'Server error.');
  }
});
server.listen(port,'127.0.0.1',()=>console.log(`Readathon site running at http://localhost:${port}`));
process.on('SIGINT',()=>{rawDataWatcher.close();server.close(()=>process.exit(0));});

