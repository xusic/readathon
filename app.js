const CAMPUS_NAMES = { MLK: 'MLK', CHE: 'Chestnut', ADE: 'Adeline', CAR: 'Carolyn' };
const $ = (id) => document.getElementById(id);
const FILTER_STORAGE_KEY = 'yu-ming-readathon-filters-v1';

let snapshots = {};
let activeView = 'minutes';
let enrollment = [];
let goals = { participationGoalPercent: 100, minutesGoal: 400000, dollarsGoal: 55000, dollarsRaised: null };
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
  // Some exports append the enrolled student count, for example "5ElephantMLK (25)".
  const value = String(raw || '').trim().replace(/\s*\(\d+\)\s*$/, '');
  const match = value.match(/^(TK|K|[1-8])(.+?)(MLK|CHE|ADE|CAR)$/i);
  if (!match) return null;
  const campusCode = match[3].toUpperCase();
  return { grade: match[1].toUpperCase(), className: match[2].trim(), campusCode, campus: CAMPUS_NAMES[campusCode] };
}
function normalizeHeader(value) { return String(value || '').replace(/^\uFEFF/, '').trim().toLowerCase(); }
function parseEnrollment(text) {
  const rows=parseCsv(text); if(rows.length<2)throw new Error('The enrollment CSV has no class rows.');
  const headers=rows[0].map(normalizeHeader),col=name=>headers.indexOf(name);
  const ix={campus:col('campus'),campusCode:col('campus code'),grade:col('grade'),className:col('class name'),students:col('total students')};
  if(Object.values(ix).some(i=>i<0))throw new Error('Enrollment CSV needs Campus, Campus Code, Grade, Class Name, and Total Students columns.');
  return rows.slice(1).map(cells=>({campus:String(cells[ix.campus]||'').trim(),campusCode:String(cells[ix.campusCode]||'').trim().toUpperCase(),grade:String(cells[ix.grade]||'').trim().toUpperCase(),className:String(cells[ix.className]||'').trim(),totalStudents:Number(String(cells[ix.students]||'').replace(/,/g,''))})).filter(r=>r.campus&&r.campusCode&&r.grade&&r.className&&Number.isFinite(r.totalStudents)&&r.totalStudents>0);
}

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
function readSavedFilters() {
  try { return JSON.parse(localStorage.getItem(FILTER_STORAGE_KEY) || 'null'); }
  catch { return null; }
}
function saveFilters() {
  try {
    localStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify({
      campus:$('campusFilter').value,
      grade:$('gradeFilter').value,
      className:$('classFilter').value,
    }));
  } catch (error) { console.warn('Could not save filter preferences in this browser:', error); }
}
function restoreFilters() {
  const saved=readSavedFilters();
  if(!saved||typeof saved!=='object')return;
  const campus=$('campusFilter'),grade=$('gradeFilter'),classSelect=$('classFilter');
  if([...campus.options].some(option=>option.value===saved.campus))campus.value=saved.campus;
  populateGradeFilter();
  if([...grade.options].some(option=>option.value===saved.grade))grade.value=saved.grade;
  populateClassFilter();
  if([...classSelect.options].some(option=>option.value===saved.className))classSelect.value=saved.className;
  saveFilters();
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
function readerKey(r) { return r.studentId ? `id:${r.studentId}` : [r.firstName.toLowerCase(),r.lastName.toLowerCase(),r.className.toLowerCase(),r.campus].join('|'); }
function displayName(r) { const initial=String(r.lastName||'').trim().charAt(0); return `${r.firstName}${initial?` ${initial.toUpperCase()}.`:''}`; }
function classKey(r) { return [r.campusCode,r.grade,String(r.className||'').toLowerCase()].join('|'); }
function classLabel(r) { return `${r.campusCode} - ${r.grade} - ${r.className}`; }
function drawChart() {
  const rows=selectedRows();
  if(activeView==='pledges') drawPledgeChart(rows);
  else drawReadingCharts(rows);
}
function selectedEnrollment() {
  const campus=$('campusFilter').value, grade=$('gradeFilter').value, className=$('classFilter').value;
  return enrollment.filter(r=>(!campus||r.campus===campus)&&(!grade||r.grade===grade)&&(!className||r.className===className));
}
function drawReadingCharts(rows) {
  const classes=selectedEnrollment().map(r=>({...r,minutes:0,loggedStudents:0}));
  const byClass=new Map(classes.map(r=>[classKey(r),r]));
  for(const row of rows) {
    const item=byClass.get(classKey(row));
    if(!item)continue;
    item.minutes+=row.minutes;
    if(row.minutes>0)item.loggedStudents++;
  }
  const minutes=classes.map(r=>({...r,value:r.minutes}));
  const participation=classes.map(r=>({...r,value:r.totalStudents?100*r.loggedStudents/r.totalStudents:0}));
  drawClassChart('classMinutesChart',minutes,'minutes');
  drawClassChart('participationChart',participation,'percent',80);
}
function drawPledgeChart(rows) {
  const totals=new Map();
  for(const row of rows) {
    const key=classKey(row);
    const item=totals.get(key)||{campus:row.campus,campusCode:row.campusCode,grade:row.grade,className:row.className,value:0};
    item.value+=row.pledges; totals.set(key,item);
  }
  drawClassChart('pledgeClassChart',[...totals.values()],'pledges',80);
}
function updatePledgeScrollHint() {
  const chart=$('pledgeClassChart'),hint=$('pledgeScrollHint');
  if(!chart||!hint)return;
  hint.hidden=!chart.querySelector('.class-chart')||chart.scrollWidth<=chart.clientWidth+1;
}
function drawClassChart(elementId,items,unit,goal=null) {
  const chart=$(elementId);
  const classes=[...items].sort((a,b)=>b.value-a.value||a.campusCode.localeCompare(b.campusCode)||gradeOrder(a.grade,b.grade)||a.className.localeCompare(b.className));
  if(!classes.length){chart.innerHTML='<div class="empty-state">No class data is available for these filters.</div>';if(elementId==='pledgeClassChart')updatePledgeScrollHint();return;}
  const slot=classes.length>24?70:82,left=48,right=18,top=20,plotHeight=220,bottom=88;
  const width=left+right+slot*classes.length,height=top+plotHeight+bottom,plotWidth=slot*classes.length;
  const largest=Math.max(...classes.map(r=>r.value),0);
  // Leave a full label-height of headroom above the tallest bar. Without it,
  // the value label is clamped to the chart top and can sit inside the bar.
  const maxValue=unit==='percent'?110:goal===80?Math.max(100,Math.ceil(largest/20)*20)+20:Math.max(200,Math.ceil(largest*1.15/100)*100);
  const step=maxValue<=120?20:Math.ceil(maxValue/5/50)*50;
  const y=value=>top+plotHeight-(value/maxValue)*plotHeight,grid=[];
  const tickLabel=value=>unit==='percent'?`${value}%`:value.toLocaleString();
  for(let value=0;value<=maxValue;value+=step){const py=y(value);grid.push(`<line x1="${left}" y1="${py}" x2="${left+plotWidth}" y2="${py}" class="class-gridline"/><text x="${left-9}" y="${py+3}" text-anchor="end" class="class-axis-label">${tickLabel(value)}</text>`);}
  const bars=classes.map((item,index)=>{
    const cx=left+index*slot+slot/2,barWidth=Math.min(38,slot*.58),barHeight=item.value?Math.max(2,item.value/maxValue*plotHeight):0,barY=top+plotHeight-barHeight;
    const labelY=top+plotHeight+23,detail=unit==='percent'?`${item.value.toFixed(1)}% (${item.loggedStudents} of ${item.totalStudents})`:item.value.toLocaleString(),title=`${classLabel(item)}: ${detail}${unit==='pledges'?' pledges':unit==='minutes'?' minutes':''}`;
    return `<g><title>${escapeHtml(title)}</title><rect x="${cx-barWidth/2}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4" class="class-bar"/><text x="${cx}" y="${Math.max(top+10,barY-5)}" text-anchor="middle" class="class-value-label">${unit==='percent'?`${item.value.toFixed(0)}%`:item.value.toLocaleString()}</text><text x="${cx}" y="${labelY}" text-anchor="middle" class="class-name-label"><tspan x="${cx}" dy="0">${escapeHtml(item.campusCode)}</tspan><tspan x="${cx}" dy="15">${escapeHtml(item.grade)}</tspan><tspan x="${cx}" dy="15">${escapeHtml(item.className)}</tspan></text></g>`;
  }).join('');
  const goalLine=goal===null?'':`<line x1="${left}" y1="${y(goal)}" x2="${left+plotWidth}" y2="${y(goal)}" class="class-goal-line"/><text x="${left+plotWidth-3}" y="${y(goal)-6}" text-anchor="end" class="class-goal-label">Goal ${goal}${unit==='percent'?'%':''}</text>`;
  const description=unit==='percent'?'Student participation by class, with an 80 percent goal':unit==='pledges'?'Total pledges by class, with an 80 pledge goal':'Total reading minutes by class';
  chart.innerHTML=`<svg class="class-chart" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${description}">${grid.join('')}${bars}${goalLine}</svg>`;
  if(elementId==='pledgeClassChart')requestAnimationFrame(updatePledgeScrollHint);
}
function setGoal(prefix, current, goal, valueText, detailText) {
  const percent=goal>0&&Number.isFinite(current)?Math.max(0,current/goal*100):0;
  $(`${prefix}Value`).textContent=valueText;
  $(`${prefix}Detail`).textContent=detailText;
  $(`${prefix}Bar`).style.width=`${Math.min(100,percent)}%`;
  const bar=$(`${prefix}Bar`).parentElement;
  bar.setAttribute('aria-valuenow',String(Math.round(Math.min(100,percent))));
  bar.classList.toggle('complete',percent>=100);
}
function renderGoals() {
  // School-wide goals always use the latest snapshot and ignore the filters.
  const rows=latestRows();
  const minutes=rows.reduce((sum,r)=>sum+r.minutes,0);
  const readers=new Set(rows.filter(r=>r.minutes>0).map(readerKey)).size;
  const enrolled=enrollment.reduce((sum,r)=>sum+r.totalStudents,0);
  const pctOf=(value,goal)=>goal>0?`${Math.round(value/goal*100)}% of goal`:'';
  const {participationGoalPercent:pGoal,minutesGoal:mGoal,dollarsGoal:dGoal,dollarsRaised:raised}=goals;
  $('participationGoal').textContent=`${pGoal}%`;
  $('minutesGoal').textContent=mGoal.toLocaleString();
  $('dollarsGoal').textContent=`$${dGoal.toLocaleString()}`;
  const participation=enrolled?readers/enrolled*100:0;
  setGoal('participation',participation,pGoal,enrolled?`${participation.toFixed(1)}%`:'—',enrolled?`${readers.toLocaleString()} of ${enrolled.toLocaleString()} students reading`:'Enrollment totals unavailable');
  setGoal('minutes',minutes,mGoal,minutes.toLocaleString(),pctOf(minutes,mGoal));
  const hasRaised=typeof raised==='number'&&Number.isFinite(raised);
  setGoal('dollars',hasRaised?raised:0,dGoal,hasRaised?`$${raised.toLocaleString(undefined,{maximumFractionDigits:0})}`:'—',hasRaised?pctOf(raised,dGoal):'Total coming soon');
}
function render() {
  renderGoals();
  populateGradeFilter();
  populateClassFilter();
  const date=currentDate(), rows=selectedRows(), pledgesView=activeView==='pledges';
  const metric=pledgesView?'pledges':'minutes';
  const students=groupReaders(rows,metric);
  const displayed=pledgesView?students.filter(r=>r.pledges>0):students;
  const dates=Object.keys(snapshots).sort();
  const previous=dates.length>1 ? new Map(groupReaders(snapshots[dates.at(-2)],metric).map(r=>[readerKey(r),r[metric]])) : new Map();
  for(const r of students) r.delta=r[metric]-(previous.get(readerKey(r)) ?? 0);
  $('latestDate').textContent=date ? prettyDate(date,{month:'short',day:'numeric',year:'numeric'}) : '—';
  $('chartTitle').textContent=pledgesView?'Pledges by class':'Reading minutes by class';
  $('minutesCharts').hidden=pledgesView;
  $('pledgeCharts').hidden=!pledgesView;
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
  const ix={studentId:col('student id'),last:col('last name'),first:col('first name'),className:col('class name'),minutes:col('minute count'),online:col('online donation #'),offline:col('offline donation #')};
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
    const id=ix.studentId>=0?String(cells[ix.studentId]||'').trim():'';
    const key=id?`id:${id}`:[first.toLowerCase(),last.toLowerCase(),parsed.className.toLowerCase(),parsed.campus].join('|');
    const item=byStudent.get(key)||{studentId:id,firstName:first,lastName:last,...parsed,minutes:0,pledges:0}; item.minutes+=amount; item.pledges+=pledges; byStudent.set(key,item);
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
$('campusFilter').addEventListener('change',()=>{render();saveFilters();});
$('gradeFilter').addEventListener('change',()=>{$('classFilter').value='';render();saveFilters();});
$('classFilter').addEventListener('change',()=>{
  const selected=$('classFilter').value, campus=$('campusFilter').value;
  const row=latestRows().find(r=>r.campus===campus&&r.className===selected);
  if(row) $('gradeFilter').value=row.grade;
  render();saveFilters();
});
$('resetFilters').addEventListener('click',()=>{['campusFilter','gradeFilter','classFilter'].forEach(id=>$(id).value='');render();try{localStorage.removeItem(FILTER_STORAGE_KEY);}catch(error){console.warn('Could not clear saved filters in this browser:',error);}});
window.addEventListener('resize',()=>requestAnimationFrame(updatePledgeScrollHint));
async function initialize(){
  try { const response=await fetch('/site-data/snapshots.json'); if(!response.ok) throw new Error('Could not read sanitized website data.'); const files=await response.json();
    for(const item of files){try{snapshots[item.date]=parseImport(item.csv).records;}catch(error){console.warn(`Skipping ${item.filename}: ${error.message}`);}}
  } catch(error) { console.error('Could not read sanitized website data:',error); }
  try { const response=await fetch('/site-data/enrollment.csv'); if(!response.ok) throw new Error('Could not read class enrollment totals.'); enrollment=parseEnrollment(await response.text()); }
  catch(error) { console.error('Could not read class enrollment totals:',error); }
  try { const response=await fetch('/site-data/goals.json'); if(!response.ok) throw new Error('Could not read goals.'); goals={...goals,...await response.json()}; }
  catch(error) { console.error('Could not read school-wide goals:',error); }
  restoreFilters();
  render();
}
initialize();






