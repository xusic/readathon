const CAMPUS_NAMES = { MLK: 'MLK', CHE: 'Chestnut', ADE: 'Adeline', CAR: 'Carolyn' };
const $ = (id) => document.getElementById(id);

let snapshots = {};
let activeView = 'minutes';
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
function latestRows() { return snapshots[currentDate()] || []; }
function gradeOrder(a,b) {
  const order=['TK','K','1','2','3','4','5','6','7','8'];
  return order.indexOf(a)-order.indexOf(b);
}
function populateGradeFilter() {
  const select=$('gradeFilter'), campus=$('campusFilter').value, old=select.value;
  select.disabled=!campus;
  const vals=[...new Set(latestRows().filter(r=>r.campus===campus).map(r=>r.grade))].sort(gradeOrder);
  select.innerHTML='<option value="">All grades</option>'+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value=vals.includes(old)?old:'';
}
function populateClassFilter() {
  const select=$('classFilter'), campus=$('campusFilter').value, grade=$('gradeFilter').value, old=select.value;
  select.disabled=!campus;
  const vals=[...new Set(latestRows().filter(r=>r.campus===campus&&(!grade||r.grade===grade)).map(r=>r.className))].sort((a,b)=>a.localeCompare(b));
  select.innerHTML='<option value="">All classes</option>'+vals.map(v=>`<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  select.value=vals.includes(old)?old:'';
}
function groupReaders(rows, sortField='minutes') {
  const groups = new Map();
  for (const r of rows) {
    const key = readerKey(r);
    const item = groups.get(key) || {...r, minutes:0, pledges:0};
    item.minutes += r.minutes;
    item.pledges += r.pledges;
    groups.set(key,item);
  }
  return [...groups.values()].sort((a,b)=>b[sortField]-a[sortField] || a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}
function readerKey(r) { return [r.firstName.toLowerCase(),r.lastName.toLowerCase(),r.className.toLowerCase(),r.campus].join('|'); }
function displayName(r) { const initial=String(r.lastName||'').trim().charAt(0); return `${r.firstName}${initial?` ${initial.toUpperCase()}.`:''}`; }
function drawChart() {
  const campus=$('campusFilter').value, grade=$('gradeFilter').value, className=$('classFilter').value;
  const matchesFilters=r=>(!campus||r.campus===campus)&&(!grade||r.grade===grade)&&(!className||r.className===className);
  const entries = Object.entries(snapshots).sort(([a],[b])=>a.localeCompare(b));
  if (!entries.length) return;
  const metric=activeView==='pledges'?'pledges':'minutes';
  const previous=new Map(), daily=[], cumulative=[];
  for (const [date,allSnapshotRows] of entries) {
    const rows=allSnapshotRows.filter(matchesFilters);
    let change=0; const current=new Map();
    for (const r of rows) {
      const key=readerKey(r);
      const delta=r[metric]-(previous.get(key) ?? 0); change+=delta; current.set(key,r[metric]);
    }
    daily.push([date,change]);
    previous.clear(); for(const [key,value] of current) previous.set(key,value);
    cumulative.push([date,rows.reduce((sum,r)=>sum+r[metric],0)]);
  }
  drawBars('historyChart',daily,metric==='pledges'?'new pledges':'new minutes');
  drawBars('cumulativeChart',cumulative,metric==='pledges'?'total pledges':'cumulative minutes');
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
  populateGradeFilter();
  populateClassFilter();
  const date=currentDate(), rows=selectedRows(), pledgesView=activeView==='pledges';
  const metric=pledgesView?'pledges':'minutes';
  const students=groupReaders(rows,metric);
  const displayed=pledgesView?students.filter(r=>r.pledges>0):students;
  const dates=Object.keys(snapshots).sort();
  const previous=dates.length>1 ? new Map(groupReaders(snapshots[dates.at(-2)],metric).map(r=>[readerKey(r),r[metric]])) : new Map();
  for(const r of students) r.delta=r[metric]-(previous.get(readerKey(r)) ?? 0);
  const total=rows.reduce((sum,r)=>sum+r[metric],0);
  const pledgers=students.filter(r=>r.pledges>0);
  const classes=pledgesView?new Set(pledgers.map(r=>`${r.campus}|${r.className}`)).size:new Set(rows.map(r=>r.className)).size;
  $('totalMetricLabel').textContent=pledgesView?'Total pledges':'Total reading minutes';
  $('countMetricLabel').textContent=pledgesView?'Pledgers':'Readers';
  $('classMetricLabel').textContent=pledgesView?'Classes with pledges':'Classes reading';
  $('totalMinutes').textContent=total.toLocaleString();
  $('readerCount').textContent=(pledgesView?pledgers.length:students.length).toLocaleString();
  $('classCount').textContent=classes.toLocaleString();
  $('latestDate').textContent=date ? prettyDate(date,{month:'short',day:'numeric',year:'numeric'}) : '—';
  $('chartTitle').textContent=pledgesView?'Pledges over time':'Reading minutes over time';
  $('dailyChartLabel').textContent=pledgesView?'Daily pledges':'Daily minutes';
  $('dailyChartCaption').textContent='Added since the last update';
  $('runningChartLabel').textContent=pledgesView?'Running total':'Running total';
  $('runningChartCaption').textContent=pledgesView?'Cumulative pledges':'Cumulative reading minutes';
  $('leaderboardTitle').textContent=pledgesView?'Top 10 pledgers':'Top 10 readers';
  $('totalMetricHeader').textContent=pledgesView?'TOTAL PLEDGES':'TOTAL MINUTES';
  $('changeMetricHeader').textContent=pledgesView?'NEW PLEDGES':'NEW MINUTES';
  const selected=[$('campusFilter').value,$('gradeFilter').value ? `Grade ${$('gradeFilter').value}` : '',$('classFilter').value].filter(Boolean);
  $('leaderboardLabel').textContent=selected.join(' · ') || 'Schoolwide';
  $('leaderboardBody').innerHTML=displayed.length ? displayed.slice(0,10).map((r,i)=>`<tr><td><span class="rank-badge ${i<3?'top':''}">${i+1}</span></td><td class="reader-name">${escapeHtml(displayName(r))}</td><td>${escapeHtml(r.className)}</td><td>${escapeHtml(r.campus)}</td><td>${escapeHtml(r.grade)}</td><td class="minutes-cell">${r[metric].toLocaleString()}</td><td class="change-cell ${r.delta<0?'down':''}">${r.delta>0?'+':''}${r.delta.toLocaleString()}</td></tr>`).join('') : `<tr><td colspan="7" class="table-empty">${pledgesView?'Pledgers will appear here as donations are recorded.':'Student leaders will appear here as reading gets underway.'}</td></tr>`;
  drawChart();
}
function parseImport(text) {
  const rows=parseCsv(text); if(rows.length<2) throw new Error('The CSV does not contain any student rows.');
  const headers=rows[0].map(normalizeHeader);
  const col=(name)=>headers.indexOf(name);
  const ix={last:col('last name'),first:col('first name'),className:col('class name'),minutes:col('minute count'),online:col('online donation #'),offline:col('offline donation #')};
  if([ix.last,ix.first,ix.className,ix.minutes].some(i=>i<0)) throw new Error('Could not find the required columns: Last Name, First Name, Class Name, and Minute Count.');
  const byStudent=new Map(); let skipped=0;
  for(const cells of rows.slice(1)) {
    const first=String(cells[ix.first]||'').trim(),last=String(cells[ix.last]||'').trim(), rawClass=String(cells[ix.className]||'').trim();
    if(/^total$/i.test(last) || /^total$/i.test(rawClass)) continue;
    if(!first && !last && !rawClass) continue;
    const parsed=parseClass(rawClass), amount=Number(String(cells[ix.minutes]||'').replace(/,/g,''));
    const countAt=index=>{if(index<0)return 0;const value=Number(String(cells[index]||'0').replace(/,/g,''));return Number.isFinite(value)&&value>0?value:0;};
    const pledges=countAt(ix.online)+countAt(ix.offline);
    if(!first || !last || !parsed || !Number.isFinite(amount) || amount<0) {skipped++; continue;}
    const key=[first.toLowerCase(),last.toLowerCase(),parsed.className.toLowerCase(),parsed.campus].join('|');
    const item=byStudent.get(key)||{firstName:first,lastName:last,...parsed,minutes:0,pledges:0}; item.minutes+=amount; item.pledges+=pledges; byStudent.set(key,item);
  }
  if(!byStudent.size) throw new Error('No valid student rows found. Check that class names end with MLK, CHE, ADE, or CAR.');
  return {records:[...byStudent.values()],skipped};
}
$('minutesTab').addEventListener('click',()=>{
  activeView='minutes';
  $('minutesTab').setAttribute('aria-selected','true');
  $('pledgesTab').setAttribute('aria-selected','false');
  $('dashboardView').setAttribute('aria-labelledby','minutesTab');
  document.title='Yu Ming Readathon 2026 | Reading minutes';
  render();
});
$('pledgesTab').addEventListener('click',()=>{
  activeView='pledges';
  $('minutesTab').setAttribute('aria-selected','false');
  $('pledgesTab').setAttribute('aria-selected','true');
  $('dashboardView').setAttribute('aria-labelledby','pledgesTab');
  document.title='Yu Ming Readathon 2026 | Pledges';
  render();
});
$('campusFilter').addEventListener('change',render);
$('gradeFilter').addEventListener('change',()=>{$('classFilter').value='';render();});
$('classFilter').addEventListener('change',()=>{
  const selected=$('classFilter').value, campus=$('campusFilter').value;
  const row=latestRows().find(r=>r.campus===campus&&r.className===selected);
  if(row) $('gradeFilter').value=row.grade;
  render();
});
$('resetFilters').addEventListener('click',()=>{['campusFilter','gradeFilter','classFilter'].forEach(id=>$(id).value='');render();});
async function initialize(){
  try { const response=await fetch('/site-data/snapshots.json'); if(!response.ok) throw new Error('Could not read sanitized website data.'); const files=await response.json();
    for(const item of files){try{snapshots[item.date]=parseImport(item.csv).records;}catch(error){console.warn(`Skipping ${item.filename}: ${error.message}`);}}
  } catch(error) { console.error('Could not read sanitized website data:',error); }
  render();
}
initialize();





