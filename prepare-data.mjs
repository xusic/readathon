import { watch } from 'node:fs';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const modulePath = fileURLToPath(import.meta.url);
const root = path.dirname(modulePath);
const datePattern = /^(\d{4})[_-](\d{2})[_-](\d{2})\.csv$/i;
const outputHeaders = ['Last Name', 'First Name', 'Class Name', 'Minute Count', 'Online Donation #', 'Offline Donation #'];

function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"') quoted=false;
      else cell+=ch;
    } else if(ch==='"') quoted=true;
    else if(ch===','){row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r'){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);if(row.some(value=>value.trim()))rows.push(row);row=[];cell='';
    } else cell+=ch;
  }
  row.push(cell);if(row.some(value=>value.trim()))rows.push(row);
  return rows;
}
function csvCell(value) {
  const text=String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"','""')}"` : text;
}
function dateFromFilename(filename) {
  const match=filename.match(datePattern);
  if(!match)return null;
  const [,year,month,day]=match;
  const value=new Date(Number(year),Number(month)-1,Number(day));
  if(value.getFullYear()!==Number(year)||value.getMonth()!==Number(month)-1||value.getDate()!==Number(day))return null;
  return `${year}-${month}-${day}`;
}
function nonnegativeCount(value, filename, columnName) {
  const text=String(value ?? '').trim().replaceAll(',','');
  if(!text)return '0';
  const count=Number(text);
  if(!Number.isInteger(count)||count<0)throw new Error(`${filename}: ${columnName} must contain a nonnegative whole number.`);
  return String(count);
}

async function sanitizeFile(sourceDir, outputDir, filename) {
  const source=await readFile(path.join(sourceDir,filename),'utf8');
  const rows=parseCsv(source);
  if(rows.length<2)throw new Error(`${filename}: no data rows found.`);
  const headers=rows[0].map(value=>String(value||'').replace(/^\uFEFF/,'').trim().toLowerCase());
  const column=name=>headers.indexOf(name);
  const ix={last:column('last name'),first:column('first name'),className:column('class name'),minutes:column('minute count'),online:column('online donation #'),offline:column('offline donation #')};
  if([ix.last,ix.first,ix.className,ix.minutes].some(index=>index<0))throw new Error(`${filename}: required columns are Last Name, First Name, Class Name, and Minute Count.`);
  const safeRows=[];
  for(const cells of rows.slice(1)) {
    const first=String(cells[ix.first]||'').trim();
    const last=String(cells[ix.last]||'').trim();
    const className=String(cells[ix.className]||'').trim();
    if(/^total$/i.test(last)||/^total$/i.test(className)||(!first&&!last&&!className))continue;
    if(!first||!last||!className)continue;
    const minutesText=String(cells[ix.minutes]||'').trim().replaceAll(',','');
    const minutes=Number(minutesText);
    if(!Number.isFinite(minutes)||minutes<0)continue;
    safeRows.push([
      [...last][0].toUpperCase(), first, className, String(minutes),
      ix.online<0?'0':nonnegativeCount(cells[ix.online],filename,'Online Donation #'),
      ix.offline<0?'0':nonnegativeCount(cells[ix.offline],filename,'Offline Donation #'),
    ]);
  }
  if(!safeRows.length)throw new Error(`${filename}: no valid student records found.`);
  const output=[outputHeaders,...safeRows].map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
  await writeFile(path.join(outputDir,filename),output,'utf8');
  return safeRows.length;
}

export async function syncSanitizedData(projectRoot=root) {
  const sourceDir=path.join(projectRoot,'data');
  const outputDir=path.join(projectRoot,'site-data');
  await mkdir(sourceDir,{recursive:true});
  await mkdir(outputDir,{recursive:true});
  const filenames=(await readdir(sourceDir)).filter(name=>datePattern.test(name)).sort();
  let updated=0;
  for(const filename of filenames) {
    if(!dateFromFilename(filename)){console.warn(`Skipping invalid dated CSV filename: ${filename}`);continue;}
    try {
      const count=await sanitizeFile(sourceDir,outputDir,filename);
      console.log(`Sanitized ${filename}: ${count} student rows -> site-data/${filename}`);
      updated++;
    } catch(error) {
      console.error(`Could not sanitize ${filename}: ${error.message}`);
    }
  }
  return updated;
}

export function watchRawData(projectRoot=root) {
  const sourceDir=path.join(projectRoot,'data');
  let timer;
  const watcher=watch(sourceDir,{persistent:true},(_event,filename)=>{
    if(filename&&!datePattern.test(filename.toString()))return;
    clearTimeout(timer);
    timer=setTimeout(()=>syncSanitizedData(projectRoot),1000);
  });
  watcher.on('error',error=>console.error(`Raw data folder watcher error: ${error.message}`));
  return watcher;
}

if(process.argv[1]&&path.resolve(process.argv[1])===modulePath) {
  const count=await syncSanitizedData();
  console.log(`Sanitization complete. ${count} dated file(s) updated.`);
}
