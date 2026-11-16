const CAMPUS_NAMES = { MLK: 'MLK', CHE: 'Chestnut', ADE: 'Adeline', CAR: 'Carolyn' };
const $ = (id) => document.getElementById(id);

let snapshots = {};
function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  for (let i=0; i<text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i+1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell=''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i+1] === '\n') i++; row.push(cell); if (row.some(v => v.trim())) rows.push(row); row=[]; cell=''; }
    else cell += ch;
  }
  row.push(cell); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
function parseClass(raw) {
  const value = String(raw || '').trim();
  const match = value.match(/^(TK|K|[1-8])(.+?)(MLK|CHE|ADE|CAR)$/i);
  if (!match) return null;
  const campusCode = match[3].toUpperCase();
  return { grade: match[1].toUpperCase(), className: match[2].trim(), campusCode, campus: CAMPUS_NAMES[campusCode] };
}
function normalizeHeader(value) { return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase(); }
function prettyDate(iso, options={month:'short',day:'numeric'}) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(y,m-1,d).toLocaleDateString(undefined, options);
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function currentDate() { return Object.keys(snapshots).sort().at(-1) || ''; }
function allRows() { return Object.entries(snapshots).flatMap(([date, rows]) => rows.map(r => ({...r,date}))); }
function selectedRows() { const date=currentDate(); return (snapshots[date] || []).filter(r => (!$('campusFilter').value || r.campus === $('campusFilter').value) && (!$('gradeFilter').value || r.grade === $('gradeFilter').value) && (!$('classFilter').value || r.className === $('classFilter').value)); }
function populateClassFilter() {
  const old = $('classFilter').value;
  const vals = [...new Set(allRows().filter(r => (!$('campusFilter').value || r.campus === $('campusFilter').value) && (!$('gradeFilter').value || r.grade === $('gradeFilter').value)).map(r => r.className))].sort((a,b)=>a.localeCompare(b));
  $('classFilter').innerHTML = '<option value="">All classes</option>' + vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  if (vals.includes(old)) $('classFilter').value = old;
}
function groupReaders(rows) {
  const groups = new Map();
  for (const r of rows) {
    const key = readerKey(r);
    const item = groups.get(key) || {...r, minutes:0}; item.minutes += r.minutes; groups.set(key,item);
  }
  return [...groups.values()].sort((a,b)=>b.minutes-a.minutes || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}
function readerKey(r) { return [r.firstName.toLowerCase(),r.lastName.toLowerCase(),r.className.toLowerCase(),r.campus].join('|'); }
function displayName(r) { const initial=String(r.lastName||'').trim().charAt(0); return `${r.firstName}${initial?` ${initial.toUpperCase()}.`:''}`; }
function drawChart() {
  const entries = Object.entries(snapshots).sort(([a],[b])=>a.localeCompare(b));
  if (!entries.length) return;
  const previous=new Map(), daily=[];
  for (const [date,rows] of entries) {
    let change=0; const current=new Map();
    for (const r of rows) {
      const key=readerKey(r);
      const delta=r.minutes-(previous.get(key) ?? 0); change+=delta; current.set(key,r.minutes);
    }
    daily.push([date,change]); previous.clear(); for(const [key,value] of current) previous.set(key,value);
  }
  drawBars('historyChart',daily,'new minutes');
  drawBars('cumulativeChart',entries.map(([date,rows])=>[date,rows.reduce((sum,r)=>sum+r.minutes,0)]),'cumulative minutes');
}
function drawBars(elementId, entries, unit) {
  const chart=$(elementId); const values=entries.map(([,v])=>v); const max=Math.max(...values.map(Math.abs),1);
  chart.innerHTML=entries.map(([date,value],i)=>{
    const label=value<0?`−${Math.abs(value).toLocaleString()}`:value.toLocaleString();
    const height=Math.max(2,Math.abs(value)/max*(elementId==='historyChart'?118:84));
    return `<div class="bar-group" title="${prettyDate(date,{month:'long',day:'numeric',year:'numeric'})}: ${label} ${unit}"><span class="bar-value">${label}</span><div class="bar ${i===entries.length-1?'latest':''} ${value<0?'negative':''}" style="height:${height}px"></div><span class="bar-label">${prettyDate(date)}</span></div>`;
  }).join('');
}
function render() {
  populateClassFilter();
  const date=currentDate(), rows=selectedRows(), readers=groupReaders(rows);
  const dates=Object.keys(snapshots).sort();
  const previous=dates.length>1 ? new Map(groupReaders(snapshots[dates.at(-2)]).map(r=>[readerKey(r),r.minutes])) : new Map();
  for(const r of readers) r.delta=r.minutes-(previous.get(readerKey(r)) ?? 0);
  const total=rows.reduce((s,r)=>s+r.minutes,0); const classes=new Set(rows.map(r=>r.className)).size;
  $('totalMinutes').textContent=total.toLocaleString(); $('readerCount').textContent=readers.length.toLocaleString(); $('classCount').textContent=classes.toLocaleString();
  $('totalContext').textContent=date ? `${prettyDate(date,{month:'long',day:'numeric',year:'numeric'})} cumulative total` : 'Reading totals will grow as the readathon begins';
  $('latestDate').textContent=date ? prettyDate(date,{month:'short',day:'numeric',year:'numeric'}) : '—';
  const selected=[$('campusFilter').value,$('gradeFilter').value ? `Grade ${$('gradeFilter').value}` : '',$('classFilter').value].filter(Boolean);
  $('leaderboardLabel').textContent=selected.join(' · ') || 'Schoolwide';
  $('leaderboardBody').innerHTML=readers.length ? readers.slice(0,10).map((r,i)=>`<tr><td><span class="rank-badge ${i<3?'top':''}">${i+1}</span></td><td class="reader-name">${escapeHtml(displayName(r))}</td><td>${escapeHtml(r.className)}</td><td>${escapeHtml(r.campus)}</td><td>${escapeHtml(r.grade)}</td><td class="minutes-cell">${r.minutes.toLocaleString()}</td><td class="change-cell ${r.delta<0?'down':''}">${r.delta>0?'+':''}${r.delta.toLocaleString()}</td></tr>`).join('') : '<tr><td colspan="7" class="table-empty">No readers match this view yet.</td></tr>';
  drawChart();
}
function parseImport(text) {
  const rows=parseCsv(text); if(rows.length<2) throw new Error('The CSV does not contain any student rows.');
  const headers=rows[0].map(normalizeHeader);
  const col=(name)=>headers.indexOf(name);
  const ix={last:col('last name'),first:col('first name'),className:col('class name'),minutes:col('minute count')};
  if(Object.values(ix).some(i=>i<0)) throw new Error('Could not find the required columns: Last Name, First Name, Class Name, and Minute Count.');
  const byStudent=new Map(); let skipped=0;
  for(const cells of rows.slice(1)) {
    const first=String(cells[ix.first]||'').trim(),last=String(cells[ix.last]||'').trim(), rawClass=String(cells[ix.className]||'').trim();
    if(/^total$/i.test(last) || /^total$/i.test(rawClass)) continue;
    if(!first && !last && !rawClass) continue;
    const parsed=parseClass(rawClass), amount=Number(String(cells[ix.minutes]||'').replace(/,/g,''));
    if(!first || !last || !parsed || !Number.isFinite(amount) || amount<0) {skipped++; continue;}
    const key=[first.toLowerCase(),last.toLowerCase(),parsed.className.toLowerCase(),parsed.campus].join('|');
    const item=byStudent.get(key)||{firstName:first,lastName:last,...parsed,minutes:0}; item.minutes+=amount; byStudent.set(key,item);
  }
  if(!byStudent.size) throw new Error('No valid student rows found. Check that class names end with MLK, CHE, ADE, or CAR.');
  return {records:[...byStudent.values()],skipped};
}
['campusFilter','gradeFilter','classFilter'].forEach(id=>$(id).addEventListener('change',render));
$('resetFilters').addEventListener('click',()=>{['campusFilter','gradeFilter','classFilter'].forEach(id=>$(id).value='');render();});
async function initialize(){
  try { const response=await fetch('/api/snapshots'); if(!response.ok) throw new Error('Could not read the project data folder.'); const files=await response.json();
    for(const item of files){try{snapshots[item.date]=parseImport(item.csv).records;}catch(error){console.warn(`Skipping ${item.filename}: ${error.message}`);}}
  } catch(error) { console.error('Could not read the data folder:',error); }
  render();
}
initialize();
