/* global React, ReactDOM */
// Southwood Project Tracker — v14 Multi-Page (Easier UI)
// Pages: Dashboard • Projects • Add Project • Project Detail

// =============================
// Constants & helpers (LOCAL-DATE SAFE)
// =============================
const PHASES = ["Design","Estimating","Permitting","Surveying","Manufacturing","Installing"];
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
// Default gaps (days) measured from Design = 0
const OFFSETS = { Design:0, Estimating:7, Permitting:21, Surveying:28, Manufacturing:60, Installing:75 };
const MS_DAY = 86400000;

const phaseColor = {
  Design:"bg-sky-600",
  Estimating:"bg-indigo-600",
  Permitting:"bg-amber-600",
  Surveying:"bg-teal-600",
  Manufacturing:"bg-fuchsia-600",
  Installing:"bg-emerald-600",
};
const currency = (n)=>Number(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});

// ----- LOCAL date helpers (no UTC drift)
function parseISO(iso){ if(!iso) return null; const [y,m,d]=iso.split("-").map(Number); if(!y||!m||!d) return null; return new Date(y,m-1,d); }
function toISO(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${da}`; }
function todayStart(){ const t=new Date(); t.setHours(0,0,0,0); return t; }
function todayISO(){ return toISO(todayStart()); }
function addDaysISO(baseOrIso,days){ const d = baseOrIso instanceof Date? new Date(baseOrIso): parseISO(baseOrIso); d.setDate(d.getDate()+days); return toISO(d); }
function dayNumber(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())/MS_DAY); }
function daysDiff(a,b){ return dayNumber(b)-dayNumber(a); }
function daysUntil(iso){ return daysDiff(todayStart(), parseISO(iso)); }
function daysSince(iso){ return daysDiff(parseISO(iso), todayStart()); }
function relLabel(iso){ const d=daysUntil(iso); if(d===0) return "today"; if(d===1) return "tomorrow"; if(d===-1) return "yesterday"; return d<0?`${Math.abs(d)}d overdue`:`in ${d}d`; }
function includesWord(h,n){ const s=` ${String(h).toLowerCase()} `, k=` ${String(n).toLowerCase()} `; return s.includes(k); }
function tryParseDate(txt){ const d=new Date(txt); return isNaN(d.getTime())?null:d; }
function readAmountAfter(text, keyword){ const lower=String(text).toLowerCase(); const idx=lower.indexOf(String(keyword).toLowerCase()); if(idx===-1) return null; const slice=String(text).slice(idx+keyword.length); const digits=[]; for(const ch of slice){ if((ch>="0"&&ch<="9")||ch===",") digits.push(ch); else if(ch===" "||ch==="$") continue; else break; } const raw=digits.join("").replace(/,/g,""); const num=Number(raw); return Number.isFinite(num)&&raw?num:null; }
function nextId(existing){ const nums=existing.map(p=>parseInt(String(p.id||"").replace(/[^0-9]/g,""),10)).filter(n=>!Number.isNaN(n)); const max=nums.length?Math.max(...nums):2400; return `SW-${max+1}`; }

// =============================
// ICS helpers (all-day, date-only)
// =============================
function downloadTextFile(filename,text,mime="text/plain"){ const blob=new Blob([text],{type:mime}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }
function makeICS({summary,description,dateISO}){ const d=parseISO(dateISO); const d2=new Date(d); d2.setDate(d.getDate()+1); const fmt=(x)=>`${x.getFullYear()}${String(x.getMonth()+1).padStart(2,"0")}${String(x.getDate()).padStart(2,"0")}`; const uid=`${Date.now()}-${Math.random().toString(36).slice(2)}@southwood`; return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Southwood Project Tracker//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH","BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`,`DTSTART;VALUE=DATE:${fmt(d)}`,`DTEND;VALUE=DATE:${fmt(d2)}`,`SUMMARY:${String(summary||"").replace(/\r?\n/g," ")}`,`DESCRIPTION:${String(description||"").replace(/\r?\n/g," ")}`,"END:VEVENT","END:VCALENDAR"].join("\r\n"); }

// =============================
// Scheduling logic
// =============================
function computeCascade(anchorPhase, anchorISO){ const base=parseISO(anchorISO); const anchorOffset=OFFSETS[anchorPhase]; const out={}; for(const ph of PHASES){ const delta=OFFSETS[ph]-anchorOffset; const d=new Date(base); d.setDate(d.getDate()+delta); out[ph]=toISO(d);} return out; }
function enforceNonDecreasing(m){ const copy={...m}; let last=null; for(const ph of PHASES){ const cur=copy[ph]?parseISO(copy[ph]):null; if(!cur) continue; if(last && dayNumber(cur)<dayNumber(last)) copy[ph]=toISO(last); last=parseISO(copy[ph]); } return copy; }

// =============================
// Risk & priority
// =============================
const STALL_THRESHOLDS={Design:14,Estimating:10,Permitting:21,Surveying:10,Manufacturing:20,Installing:7};
function getNextUpcoming(p){ const t0=todayStart(); const future=[]; for(const ph of PHASES){ const iso=p.milestones?.[ph]; if(!iso) continue; const d=parseISO(iso); if(dayNumber(d)>=dayNumber(t0)) future.push({phase:ph,date:iso}); } if(!future.length) return null; future.sort((a,b)=>parseISO(a.date)-parseISO(b.date)); return future[0]; }
function overduePhases(p){ const t0=todayStart(); return PHASES.filter(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; return dayNumber(parseISO(iso))<dayNumber(t0); }); }
const hasOverdue=(p)=>overduePhases(p).length>0;
const ageInCurrentPhase=(p)=>p.phaseSince?Math.max(0,daysSince(p.phaseSince)):null;
const isStalled=(p)=>{ if(p.completedAt) return false; const age=ageInCurrentPhase(p); if(age===null) return false; const lim=STALL_THRESHOLDS[p.phase]??14; return age>lim; };
function riskTier(p){ if(p.completedAt) return {tier:"Done",badge:"bg-zinc-800 text-zinc-300 border border-zinc-700"}; const overdue=overduePhases(p); if(overdue.length) return {tier:"Overdue",badge:"bg-rose-600/15 text-rose-300 border border-rose-700"}; const next=getNextUpcoming(p); if(!next) return {tier:"None",badge:"bg-zinc-800 text-zinc-300 border border-zinc-700"}; const d=daysUntil(next.date); if(d<=3) return {tier:"High",badge:"bg-amber-500/15 text-amber-300 border border-amber-700"}; if(d<=10) return {tier:"Medium",badge:"bg-yellow-500/10 text-yellow-200 border border-yellow-700"}; return {tier:"Low",badge:"bg-emerald-600/10 text-emerald-300 border border-emerald-700"}; }
function priorityScore(p){ if(p.completedAt) return -1e9; const od=overduePhases(p); if(od.length){ const worst=Math.min(...od.map(ph=>daysUntil(p.milestones[ph]))); return 100000+Math.abs(worst)*100+p.value/1000;} const next=getNextUpcoming(p); const d=next?daysUntil(next.date):9999; return (60-Math.min(d,60))*100+p.value/1000; }
function isPhaseOnTime(p,ph){ const done=p?.done?.[ph], due=p?.milestones?.[ph]; if(!done||!due) return null; return dayNumber(parseISO(done))<=dayNumber(parseISO(due)); }

// =============================
// Follow-ups
// =============================
function nextFollowUpDate(p){ const cadence=Number(p.cadenceDays||14); if(!p.lastContact) return null; const base=parseISO(p.lastContact); const out=new Date(base); out.setDate(base.getDate()+cadence); return out; }
function followUpStatus(p){ if(p.completedAt) return {text:"Project complete",due:false,class:"text-zinc-400"}; const cadence=Number(p.cadenceDays||14); const last=p.lastContact?parseISO(p.lastContact):null; const next=nextFollowUpDate(p); const now=todayStart(); if(!last) return {text:`No contact yet (every ${cadence}d)`,due:true,class:"text-rose-300"}; if(dayNumber(next)<=dayNumber(now)){ const od=Math.abs(Math.min(0,daysUntil(toISO(next)))); return {text:`Follow-up due (${od}d overdue)`,due:true,class:"text-rose-300"}; } return {text:`Next in ${daysUntil(toISO(next))}d`,due:false,class:"text-zinc-400"}; }
function addMilestoneICS(p){ const next=getNextUpcoming(p); if(!next){ alert("No upcoming milestone."); return;} const ics=makeICS({summary:`${p.id} — ${p.name}: ${next.phase}`,description:`${p.client} • ${p.location}`,dateISO:next.date}); downloadTextFile(`${p.id}-${next.phase}.ics`,ics,"text/calendar"); }
function addFollowUpICS(p){ const next=nextFollowUpDate(p); const dateISO=next?toISO(next):todayISO(); const ics=makeICS({summary:`${p.id} — ${p.name}: Follow-up`,description:`Every ${p.cadenceDays||14}d • Contact ${p.contactPerson||""} ${p.contactEmail||""}`,dateISO}); downloadTextFile(`${p.id}-follow-up.ics`,ics,"text/calendar"); }

// =============================
// AI parsing & filtering
// =============================
function extractDateRange(q){ const lower=String(q).toLowerCase(); const now=todayStart(); if(includesWord(lower,"today")) return {start:now,end:new Date(now.getTime()+MS_DAY)}; if(includesWord(lower,"tomorrow")) return {start:new Date(now.getTime()+MS_DAY),end:new Date(now.getTime()+2*MS_DAY)}; if(includesWord(lower,"next 7 days")||includesWord(lower,"next seven days")) return {start:now,end:new Date(now.getTime()+7*MS_DAY)}; if(includesWord(lower,"next 30 days")) return {start:now,end:new Date(now.getTime()+30*MS_DAY)}; if(includesWord(lower,"this week")){ const d=new Date(now), day=d.getDay(), mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; } if(includesWord(lower,"next week")){ const d=new Date(now), day=d.getDay(), mon=new Date(d); mon.setDate(d.getDate()+(7-((day+6)%7))); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; } if(includesWord(lower,"this month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth(),1),end:new Date(d.getFullYear(),d.getMonth()+1,1)}; } if(includesWord(lower,"next month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth()+1,1),end:new Date(d.getFullYear(),d.getMonth()+2,1)}; } if(lower.includes("due before ")||lower.includes("due by ")){ const key=lower.includes("due before ")?"due before ":"due by "; const part=String(q).slice(lower.indexOf(key)+key.length).trim(); const d=tryParseDate(part); if(d) return {end:d}; } if(lower.includes("due after ")){ const part=String(q).slice(lower.indexOf("due after ")+10).trim(); const d=tryParseDate(part); if(d) return {start:d}; } if(lower.includes("between ")&&lower.includes(" and ")){ const si=lower.indexOf("between ")+8; const ai=lower.indexOf(" and ",si); if(ai>-1){ const a=String(q).slice(si,ai).trim(); const b=String(q).slice(ai+5).trim(); const da=tryParseDate(a); const db=tryParseDate(b); if(da&&db) return {start:da,end:db}; } } for(let i=0;i<MONTHS.length;i++){ if(includesWord(lower,MONTHS[i])){ const d=new Date(now.getFullYear(),i,1); const e=new Date(now.getFullYear(),i+1,1); return {start:d,end:e}; } } const m=String(q).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?/); if(m){ const d=tryParseDate(m[0]); if(d) return {start:d,end:new Date(d.getTime()+MS_DAY)}; } return null; }
function applyAIQuery(projects, query){ if(!String(query).trim()) return projects; let list=[...projects]; const lower=String(query).toLowerCase();
  // completed filters
  if (includesWord(lower,"completed on time")) list = list.filter(p => p.completedAt && (!p.milestones?.Installing || dayNumber(parseISO(p.completedAt)) <= dayNumber(parseISO(p.milestones.Installing))));
  else if (includesWord(lower,"completed late")) list = list.filter(p => p.completedAt && (p.milestones?.Installing && dayNumber(parseISO(p.completedAt)) > dayNumber(parseISO(p.milestones.Installing))));
  else if (includesWord(lower,"completed")) list = list.filter(p => p.completedAt);
  else if (includesWord(lower,"not completed") || includesWord(lower,"active only")) list = list.filter(p => !p.completedAt);
  // money
  const over=readAmountAfter(query,"over"); if(over!==null) list=list.filter(p=>p.value>over);
  const under=readAmountAfter(query,"under"); if(under!==null) list=list.filter(p=>p.value<under);
  // phase mention
  const mentioned=PHASES.filter(ph=>includesWord(lower, ph.toLowerCase()));
  if(mentioned.length) list=list.filter(p=>mentioned.some(ph=>p.milestones?.[ph] || p.phase===ph));
  // overdue
  if(includesWord(lower,"overdue")) list=list.filter(p=>{ if(!mentioned.length) return hasOverdue(p); return mentioned.some(ph=>{ const d=p.milestones?.[ph]; return d? dayNumber(parseISO(d)) < dayNumber(todayStart()) : false; }); });
  // ranges
  const range=extractDateRange(lower); if(range){ const start=range.start?dayNumber(range.start):-Infinity; const end=range.end?dayNumber(range.end):Infinity;
    list=list.filter(p=>{ const phases=mentioned.length?mentioned:PHASES; return phases.some(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; const dn=dayNumber(parseISO(iso)); return dn>=start && dn<=end; }); }); }
  // client:
  const ci=lower.indexOf("client:"); if(ci!==-1){ const name=lower.slice(ci+7).trim().split(" ").slice(0,5).join(" "); list=list.filter(p=>p.client.toLowerCase().includes(name)); }
  // focus / urgent
  if(includesWord(lower,"focus")||includesWord(lower,"right away")||includesWord(lower,"urgent")){ const soon=dayNumber(todayStart())+7; list=list.filter(p=> !p.completedAt && (hasOverdue(p) || (getNextUpcoming(p)&&dayNumber(parseISO(getNextUpcoming(p).date))<=soon)) ); list.sort((a,b)=>priorityScore(b)-priorityScore(a)); }
  // stalled
  if(includesWord(lower,"stalled")) list=list.filter(p=>isStalled(p));
  const olderMatch=lower.match(/in phase over (\d+)\s*days?/); if(olderMatch){ const n=Number(olderMatch[1]); list=list.filter(p=>{ const age=ageInCurrentPhase(p); return age!==null && age>n; }); }
  // follow-ups
  if(includesWord(lower,"follow-ups due")||includesWord(lower,"overdue follow-ups")||includesWord(lower,"follow up due")) list=list.filter(p=>!p.completedAt && followUpStatus(p).due);
  const notContacted=lower.match(/not contacted in (\d+)\s*days?/); if(notContacted){ const n=Number(notContacted[1]); list=list.filter(p=>!p.completedAt && (!p.lastContact || daysSince(p.lastContact)>=n)); }
  if(includesWord(lower,"contacted today")) list=list.filter(p=>p.lastContact && daysSince(p.lastContact)===0);
  if(includesWord(lower,"contacted this week")){ const now=todayStart(), day=now.getDay(), mon=new Date(now); mon.setDate(now.getDate()-((day+6)%7)); list=list.filter(p=>p.lastContact && dayNumber(parseISO(p.lastContact))>=dayNumber(mon)); }
  // highest value
  if(includesWord(lower,"highest value")||includesWord(lower,"top value")||includesWord(lower,"largest")||includesWord(lower,"biggest")) list=[...list].sort((a,b)=>b.value-a.value);
  return list;
}
function summarizeQuery(projects, query){ const list=applyAIQuery(projects,query); const count=list.length; const total=list.reduce((s,p)=>s+p.value,0); const lower=String(query).toLowerCase(); const wantsList=lower.includes("which")||lower.includes("list")||lower.includes("show");
  if(lower.includes("completed")){ const lines=list.slice(0,15).map(p=>{ const ot=p.milestones?.Installing?(dayNumber(parseISO(p.completedAt))<=dayNumber(parseISO(p.milestones.Installing))):null; const tag=ot===null?"":ot?"On time":"Late"; return `• ${p.id||"—"} — ${p.name} — completed ${new Date(parseISO(p.completedAt)).toLocaleDateString()} ${tag?`(${tag})`:""}`; }).join("\n"); return `Completed (${count}):\n${lines}`; }
  if(lower.includes("focus")||lower.includes("urgent")){ const lines=list.slice(0,12).map(p=>{ const od=overduePhases(p); const next=getNextUpcoming(p); const age=ageInCurrentPhase(p); const badge=od.length?`OVERDUE: ${od.join(" / ")}`:(next?`${next.phase} ${new Date(parseISO(next.date)).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming"); return `• ${p.id||"—"} — ${p.name} (${p.client}) — ${currency(p.value)} — ${badge} — Age ${age??"?"}d`; }).join("\n"); return `Focus Now (${count}):\n${lines}`; }
  if(lower.includes("follow-ups due")||lower.includes("overdue follow-ups")||lower.match(/not contacted in \d+\s*days?/)){ const due=list.filter(p=>followUpStatus(p).due); const lines=due.slice(0,15).map(p=>`• ${p.id||"—"} — ${p.name} (${p.client}) — ${followUpStatus(p).text}`).join("\n"); return `Follow-ups (${due.length} due, ${list.length} matched):\n${lines}`; }
  if(lower.includes("stalled")||lower.match(/in phase over \d+\s*days?/)){ const lines=list.slice(0,15).map(p=>{ const age=ageInCurrentPhase(p)??"-"; const lim=STALL_THRESHOLDS[p.phase]??14; return `• ${p.id||"—"} — ${p.name} (${p.phase}) — Age ${age}d (limit ${lim}d)`; }).join("\n"); return `Stalled / aging (${list.length}):\n${lines}`; }
  if(lower.includes("highest value")||lower.includes("top value")||lower.includes("largest")||lower.includes("biggest")){ const top=[...list].sort((a,b)=>b.value-a.value).slice(0,5); const lines=top.map((p,i)=>`${i+1}. ${p.id||"—"} — ${p.name} (${p.client}) — ${currency(p.value)}`).join("\n"); const maxLine=top[0]?`Highest: ${top[0].id||"—"} — ${currency(top[0].value)}`:"Highest: (none)"; return `Top value projects (${count} total, ${currency(total)} combined):\n${lines}\n${maxLine}`; }
  if(lower.includes("overdue") && wantsList){ const lines=list.map(p=>`• ${p.id||"—"} — ${p.name} — OVERDUE: ${overduePhases(p).join(", ")}`).join("\n"); return `${list.length} overdue\n${lines}`; }
  const range=extractDateRange(lower); if(range){ const lines=list.slice(0,20).map(p=>{ const next=getNextUpcoming(p); const badge=next?`${next.phase} ${new Date(parseISO(next.date)).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming"; return `• ${p.id||"—"} — ${p.name} — ${badge}`; }).join("\n"); return `${count} match • Total ${currency(total)}\n${lines}`; }
  if(lower.includes("how many")) return `${count} project${count===1?"":"s"} match.`; if(lower.includes("total value")||lower.includes("total amount")||lower.includes("pipeline")) return `Total value for those: ${currency(total)}.`; const nextThree=list.map(p=>({p,next:getNextUpcoming(p)})).filter(x=>x.next).sort((a,b)=>parseISO(a.next.date)-parseISO(b.next.date)).slice(0,3).map(({p,next})=>`${p.id||"—"} ${next.phase} (${new Date(parseISO(next.date)).toLocaleDateString()})`); return `${count} match • Total ${currency(total)} • Next due: ${nextThree.join(", ") || "(none)"}`; }

// =============================
// UI primitives
// =============================
const Card=({children,className=""})=> <div className={`rounded-2xl border border-zinc-800 bg-[#0f172a] ${className}`}>{children}</div>;
const CardHeader=({children,className=""})=> <div className={`px-5 pt-5 ${className}`}>{children}</div>;
const CardTitle=({children})=> <h2 className="text-xl font-semibold text-zinc-100">{children}</h2>;
const CardContent=({children,className=""})=> <div className={`px-5 pb-5 ${className}`}>{children}</div>;

// =============================
// App (simple router, no libs)
// =============================
function App(){
  const [projects,setProjects]=React.useState(()=>{ try{ const v=localStorage.getItem("southwood_projects_v14"); return v?JSON.parse(v):[]; }catch{ return []; } });
  React.useEffect(()=>{ try{ localStorage.setItem("southwood_projects_v14", JSON.stringify(projects)); }catch{} },[projects]);

  // Router state
  const [route,setRoute]=React.useState({page:"dashboard", id:null}); // pages: dashboard | projects | add | detail
  const go=(page, id=null)=>setRoute({page,id});

  // Shared filters/sort/AI state (Projects page)
  const [search,setSearch]=React.useState("");
  const [phasesFilter,setPhasesFilter]=React.useState([...PHASES]);
  const [minVal,setMinVal]=React.useState(""); const [maxVal,setMaxVal]=React.useState("");
  const [hideCompleted,setHideCompleted]=React.useState(true);
  const [sortKey,setSortKey]=React.useState("priority"); const [sortDir,setSortDir]=React.useState("desc");
  const [aiQuery,setAiQuery]=React.useState(""); const [aiAnswer,setAiAnswer]=React.useState("");

  // Quick add
  const [qa,setQa]=React.useState({ name:"", client:"", location:"Rock Hill, SC", value:"", phase:"Design", contact:"", email:"", cadence:"14" });

  // Toast
  const [toast,setToast]=React.useState("");

  // Derived KPIs
  const kpi=React.useMemo(()=>{
    const active=projects.filter(p=>!p.completedAt);
    const nowDN=dayNumber(todayStart()), in30=nowDN+30;
    const dueSoon=active.filter(p=>PHASES.some(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; const dn=dayNumber(parseISO(iso)); return dn>=nowDN && dn<=in30; })).length;
    const atRisk=active.filter(p=>hasOverdue(p)).length;
    const totalValue=active.reduce((s,p)=>s+p.value,0);
    const ages=active.map(p=>ageInCurrentPhase(p)).filter(x=>x!==null);
    const avgAge=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length):0;
    const stalled=active.filter(p=>isStalled(p)).length;
    const followDue=active.filter(p=>followUpStatus(p).due).length;
    const completed=projects.length - active.length;
    return { active:active.length, dueSoon, atRisk, totalValue, avgAge, stalled, followDue, completed };
  },[projects]);

  // Helpers
  const togglePhaseFilter=(ph)=>setPhasesFilter(prev=>prev.includes(ph)?prev.filter(x=>x!==ph):[...prev,ph]);
  const resetFilters=()=>{ setPhasesFilter([...PHASES]); setMinVal(""); setMaxVal(""); setAiQuery(""); setAiAnswer(""); setSearch(""); setSortKey("priority"); setSortDir("desc"); setHideCompleted(true); };
  const runAI=()=>{ if(!aiQuery.trim()){ setAiAnswer("Type a question or pick a chip."); return; } setAiAnswer(summarizeQuery(projects, aiQuery)); };

  // Actions
  function addProject(){
    const valueNum=Number(String(qa.value).replace(/,/g,""));
    if(!qa.name || !qa.client || Number.isNaN(valueNum)){ setToast("Fill Project Name, Client, numeric Value."); setTimeout(()=>setToast(""),1600); return; }
    const center=qa.phase; const anchorISO=addDaysISO(todayStart(), OFFSETS[center]);
    const milestones=computeCascade(center, anchorISO);
    const newP={ id: nextId(projects), name: qa.name.trim(), client: qa.client.trim(), location: qa.location.trim()||"Rock Hill, SC", value: valueNum, phase: center, milestones, phaseSince: todayISO(), contactPerson: qa.contact.trim(), contactEmail: qa.email.trim(), lastContact: null, cadenceDays: Number(qa.cadence||"14"), done: {}, completedAt: null };
    setProjects(prev=>[newP, ...prev]); setQa({ name:"", client:"", location:"Rock Hill, SC", value:"", phase:"Design", contact:"", email:"", cadence:"14" }); go("projects");
  }
  function deleteProject(p){ if(!confirm(`Delete ${p.id} — ${p.name}?`)) return; setProjects(prev=>prev.filter(x=>x.id!==p.id)); }
  function clearAll(){ if(!projects.length){ setToast("No projects to clear."); setTimeout(()=>setToast(""),1200); return; } if(!confirm("Clear ALL projects? This cannot be undone.")) return; setProjects([]); }
  function emailContact(p){ const to=encodeURIComponent(p.contactEmail||""); const subject=encodeURIComponent(`Southwood — ${p.id} ${p.name} update`); const next=getNextUpcoming(p); const od=overduePhases(p); const body=[`Hi ${p.contactPerson||"there"},`,"",`Quick update on ${p.name} (${p.id}).`, next?`• Next due: ${next.phase} on ${new Date(parseISO(next.date)).toLocaleDateString()}`:"• No upcoming milestones on the schedule", od.length?`• Overdue phases: ${od.join(", ")}`:"", "", "Thanks,"].join("\n"); window.location.href=`mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`; }
  function logContact(p){ const iso=todayISO(); setProjects(prev=>prev.map(x=>x.id===p.id?{...x,lastContact:iso}:x)); }

  // List derivation for Projects page
  const list=React.useMemo(()=>{
    let list=projects.filter(p=>phasesFilter.includes(p.phase));
    if(minVal) list=list.filter(p=>p.value>=Number(minVal));
    if(maxVal) list=list.filter(p=>p.value<=Number(maxVal));
    if(hideCompleted) list=list.filter(p=>!p.completedAt);
    if(search.trim()){ const s=search.toLowerCase(); list=list.filter(p=>[p.id,p.name,p.client,p.location,p.contactPerson,p.contactEmail].some(x=>String(x||"").toLowerCase().includes(s))); }
    if(aiQuery.trim()) list=applyAIQuery(list, aiQuery);
    const asc=(a,b)=>a<b?-1:a>b?1:0, desc=(a,b)=>a<b?1:a>b?-1:0;
    list.sort((A,B)=>{ let a,b; switch (sortKey){
      case "project": a=A.name.toLowerCase(); b=B.name.toLowerCase(); break;
      case "client": a=A.client.toLowerCase(); b=B.client.toLowerCase(); break;
      case "value": a=A.value; b=B.value; break;
      case "phase": a=A.phase; b=B.phase; break;
      case "next": { const na=(getNextUpcoming(A)?.date||"9999-12-31"); const nb=(getNextUpcoming(B)?.date||"9999-12-31"); a=dayNumber(parseISO(na)); b=dayNumber(parseISO(nb)); break; }
      case "age": a=ageInCurrentPhase(A)??0; b=ageInCurrentPhase(B)??0; break;
      default: a=priorityScore(A); b=priorityScore(B); break;
    } return (sortDir==="asc"?asc:desc)(a,b); });
    return list;
  },[projects,phasesFilter,minVal,maxVal,search,aiQuery,sortKey,sortDir,hideCompleted]);

  // ===== Page components
  const TopNav = () => (
    <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#0b1020]/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-emerald-500 grid place-items-center font-bold">S</div>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Southwood Project Tracker</h1>
            <p className="text-xs text-zinc-400">Multi-Page • Auto-schedule • Follow-ups • AI</p>
          </div>
        </div>
        <nav className="flex items-center gap-2">
          <button onClick={()=>go("dashboard")} className={`px-3 py-2 rounded-lg text-sm border ${route.page==="dashboard"?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>Dashboard</button>
          <button onClick={()=>go("projects")} className={`px-3 py-2 rounded-lg text-sm border ${route.page==="projects"?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>Projects</button>
          <button onClick={()=>go("add")} className={`px-3 py-2 rounded-lg text-sm border ${route.page==="add"?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>Add Project</button>
          <button onClick={clearAll} className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Clear All</button>
        </nav>
      </div>
    </header>
  );

  const Dashboard = () => (
    <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
      <section className="lg:col-span-2 space-y-6">
        <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Active</p><p className="text-3xl mt-2 font-semibold">{kpi.active}</p><p className="text-xs text-zinc-400 mt-1">Completed: {kpi.completed}</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Total Value</p><p className="text-3xl mt-2 font-semibold">{currency(kpi.totalValue)}</p><p className="text-xs text-zinc-400 mt-1">Across active</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Due ≤30d</p><p className="text-3xl mt-2 font-semibold">{kpi.dueSoon}</p><p className="text-xs text-zinc-400 mt-1">Any phase</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Overdue</p><p className="text-3xl mt-2 font-semibold">{kpi.atRisk}</p><p className="text-xs text-zinc-400 mt-1">Projects</p></CardContent></Card>
          <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Follow-ups due</p><p className="text-3xl mt-2 font-semibold">{kpi.followDue}</p><p className="text-xs text-zinc-400 mt-1">Avg age {kpi.avgAge}d</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>What should I focus on?</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={()=>{ setAiQuery("focus"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Focus now</button>
              <button onClick={()=>{ setAiQuery("follow-ups due"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Follow-ups</button>
              <button onClick={()=>{ setAiQuery("highest value"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Highest value</button>
              <button onClick={()=>{ setAiQuery("which are overdue"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Overdue</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") runAI(); }} placeholder="Ask: focus now • follow-ups due • overdue • highest value • Permitting in September • client: Atrium" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
              <button onClick={()=>{ setAiQuery(""); setAiAnswer(""); }} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm">Clear</button>
            </div>
            {aiAnswer && <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap">{aiAnswer}</div>}
          </CardContent>
        </Card>
      </section>

      <aside className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Quick actions</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <button onClick={()=>go("add")} className="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm font-medium">Add a project</button>
            <button onClick={()=>go("projects")} className="w-full bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg text-sm">Open Projects</button>
          </CardContent>
        </Card>
      </aside>
    </main>
  );

  const ProjectsPage = () => {
    const headerSort=(label,key)=>{ const active=sortKey===key; const arrow=active?(sortDir==="asc"?"▲":"▼"):"↕"; return (
      <button onClick={()=>{ if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortKey(key); setSortDir(key==="project"||key==="client"||key==="phase"?"asc":"desc"); } }} className={`inline-flex items-center gap-1 select-none ${active?"text-zinc-200":"text-zinc-400"} hover:text-zinc-100`} title={`Sort by ${label}`}>
        <span>{label}</span><span className="text-xs">{arrow}</span>
      </button>
    );};

    return (
      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by ID, client, contact…" className="w-80 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <label className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg text-sm">
              <input type="checkbox" checked={hideCompleted} onChange={()=>setHideCompleted(v=>!v)} />
              <span>Hide completed</span>
            </label>
            <select value={sortKey} onChange={(e)=>setSortKey(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <option value="priority">Sort: Priority</option>
              <option value="project">Sort: Project</option>
              <option value="client">Sort: Client</option>
              <option value="value">Sort: Value</option>
              <option value="phase">Sort: Phase</option>
              <option value="next">Sort: Next Due</option>
              <option value="age">Sort: Age in Phase</option>
            </select>
            <button onClick={resetFilters} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">Reset</button>
          </div>
          <div className="flex items-center gap-2">
            <input value={minVal} onChange={(e)=>setMinVal(e.target.value)} placeholder="Min $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm" />
            <input value={maxVal} onChange={(e)=>setMaxVal(e.target.value)} placeholder="Max $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm" />
          </div>
        </div>

        {/* AI row */}
        <Card>
          <CardHeader className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle>Projects</CardTitle>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={()=>{ setAiQuery("focus"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Focus now</button>
              <button onClick={()=>{ setAiQuery("follow-ups due"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Follow-ups</button>
              <button onClick={()=>{ setAiQuery("highest value"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Highest value</button>
              <button onClick={()=>{ setAiQuery("which are overdue"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Overdue</button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") runAI(); }} placeholder="Ask or filter… (e.g., permitting in September, client: Atrium, not contacted in 14 days)" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
              <button onClick={()=>{ setAiQuery(""); setAiAnswer(""); }} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm">Clear</button>
            </div>
            {aiAnswer && <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap">{aiAnswer}</div>}
          </CardContent>
        </Card>

        {/* Table (no horizontal scrolling) */}
        <div className="overflow-hidden border border-zinc-800 rounded-xl">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
              <tr>
                <th className="text-left py-3 px-3">{headerSort("Project","project")}</th>
                <th className="text-left py-3 px-3">{headerSort("Value","value")}</th>
                <th className="text-left py-3 px-3">{headerSort("Phase","phase")}</th>
                <th className="text-left py-3 px-3">{headerSort("Risk / Next","next")}</th>
                <th className="text-left py-3 px-3">Follow-up</th>
                <th className="text-right py-3 px-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map(p=>{
                const next=getNextUpcoming(p); const overdue=overduePhases(p); const age=ageInCurrentPhase(p); const risk=riskTier(p);
                return (
                  <tr key={p.id} className="border-t border-zinc-800 text-zinc-200 align-top">
                    <td className="py-3 px-3">
                      <div className="font-medium flex items-center gap-2">
                        <span className="bg-zinc-800 text-[11px] px-2 py-0.5 rounded-full">{p.id}</span>
                        <span className="truncate max-w-[320px]">{p.name}</span>
                      </div>
                      <div className="text-xs text-zinc-500">{p.client} • {p.location}</div>
                      {(p.contactPerson||p.contactEmail) && <div className="text-xs text-zinc-500 mt-0.5">Contact: {p.contactPerson||"—"} {p.contactEmail?`• ${p.contactEmail}`:""}</div>}
                    </td>
                    <td className="py-3 px-3 font-semibold">{currency(p.value)}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-white text-xs ${phaseColor[p.phase]}`}>{p.phase}</span>
                      <div className="mt-1 text-xs text-zinc-500">Age: {age ?? "—"}d{isStalled(p) && <span className="ml-2 text-amber-300">• Stalled</span>}</div>
                    </td>
                    <td className="py-3 px-3">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs ${risk.badge}`}>{risk.tier}</div>
                      <div className="mt-1">
                        {p.completedAt ? (
                          <span>Completed • {new Date(parseISO(p.completedAt)).toLocaleDateString()}</span>
                        ) : next ? (
                          <span>{next.phase} • {new Date(parseISO(next.date)).toLocaleDateString()} <span className="text-zinc-400">({relLabel(next.date)})</span>{overdue.length>0 && <span className="ml-2 text-rose-400">• Overdue: {overdue.join(", ")}</span>}</span>
                        ) : <span className="text-zinc-400">No upcoming</span>}
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className={`text-xs ${followUpStatus(p).class}`}>{followUpStatus(p).text}</div>
                      <div className="text-xs text-zinc-500">Last: {p.lastContact?new Date(parseISO(p.lastContact)).toLocaleDateString():"—"} • Every {p.cadenceDays||14}d</div>
                      <div className="flex items-center gap-2 mt-1 text-xs">
                        <button onClick={()=>addFollowUpICS(p)} className="underline text-emerald-300 hover:text-emerald-200">Add reminder</button>
                        <button onClick={()=>addMilestoneICS(p)} className="underline text-emerald-300 hover:text-emerald-200">Next milestone</button>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right space-x-2 whitespace-nowrap">
                      {!p.completedAt && <button onClick={()=>go("detail", p.id)} className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm">Edit / Complete</button>}
                      {p.completedAt && <button onClick={()=>go("detail", p.id)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">View / Edit</button>}
                      <button onClick={()=>logContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Log Contact</button>
                      <button onClick={()=>emailContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Email</button>
                      <button onClick={()=>deleteProject(p)} className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Delete</button>
                    </td>
                  </tr>
                );
              })}
              {list.length===0 && (
                <tr><td colSpan={6} className="py-6 text-center text-zinc-400">No projects match — use <b>Add Project</b> above.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    );
  };

  const AddPage = () => (
    <main className="max-w-3xl mx-auto px-4 py-6">
      <Card>
        <CardHeader><CardTitle>Add Project</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <input value={qa.name} onChange={e=>setQa({...qa, name:e.target.value})} placeholder="Project Name" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <input value={qa.client} onChange={e=>setQa({...qa, client:e.target.value})} placeholder="Client" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <input value={qa.location} onChange={e=>setQa({...qa, location:e.target.value})} placeholder="Location" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 items-center">
            <input value={qa.value} onChange={e=>setQa({...qa, value:e.target.value})} placeholder="Value ($)" inputMode="numeric" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <select value={qa.phase} onChange={e=>setQa({...qa, phase:e.target.value})} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              {PHASES.map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <input value={qa.contact} onChange={e=>setQa({...qa, contact:e.target.value})} placeholder="Contact Person" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
            <input value={qa.email} onChange={e=>setQa({...qa, email:e.target.value})} placeholder="Contact Email" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
          </div>
          <input value={qa.cadence} onChange={e=>setQa({...qa, cadence:e.target.value})} placeholder="Follow-up every (days)" inputMode="numeric" className="w-56 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
          <div className="flex items-center justify-end gap-2">
            <button onClick={()=>go("projects")} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Cancel</button>
            <button onClick={addProject} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">Add Project</button>
          </div>
        </CardContent>
      </Card>
    </main>
  );

  const ProjectDetail = () => {
    const p = projects.find(x=>x.id===route.id);
    const [phase,setPhase]=React.useState(p?.phase||"Design");
    const [milestones,setMilestones]=React.useState({...p?.milestones});
    const [install,setInstall]=React.useState(p?.milestones?.Installing||"");
    const [autoCascade,setAutoCascade]=React.useState(true);
    const [phaseSince,setPhaseSince]=React.useState(p?.phaseSince||"");
    const [done,setDone]=React.useState({...p?.done});
    const [lastContact,setLastContact]=React.useState(p?.lastContact||"");
    const [cadence,setCadence]=React.useState(String(p?.cadenceDays||"14"));
    const [contactPerson,setContactPerson]=React.useState(p?.contactPerson||"");
    const [contactEmail,setContactEmail]=React.useState(p?.contactEmail||"");
    const [touched,setTouched]=React.useState(new Set());
    const [valueDraft,setValueDraft]=React.useState(String(p?.value||""));

    if(!p) return <main className="max-w-3xl mx-auto px-4 py-10 text-sm text-zinc-300">Project not found. <button onClick={()=>go("projects")} className="underline">Back to Projects</button></main>;

    const onPhaseDateChange=(ph, iso)=>{
      setTouched(prev=>{ const s=new Set(prev); s.add(ph); return s; });
      setMilestones(curr=>{
        let next={ ...curr, [ph]: iso };
        if(autoCascade && iso){
          const cascade=computeCascade(ph, iso);
          for(const q of PHASES){ if(q===ph) continue; if(!touched.has(q)) next[q]=cascade[q]; }
          next=enforceNonDecreasing(next);
        }
        return next;
      });
    };
    const setInstallDate=(iso)=>{
      setInstall(iso);
      if(!iso) return;
      if(autoCascade){ const ms=computeCascade("Installing", iso); setMilestones(ms); }
      else setMilestones(m=>({...m, Installing: iso}));
    };
    const toggleDonePhase=(ph, checked)=>{ if(checked) setDone(d=>({...d,[ph]:todayISO()})); else setDone(d=>{ const nd={...d}; delete nd[ph]; return nd; }); };

    function completeCurrentPhase(){
      const i=PHASES.indexOf(phase); const today=todayISO();
      // mark current as done today and advance
      const newDone={...(done||{}), [phase]:today};
      if(phase==="Installing"){ // project completed
        setDone(newDone);
        save(true, today);
        return;
      }
      const nextPhase=PHASES[i+1]||"Installing";
      let ms={...milestones};
      if (ms.Installing) ms = computeCascade("Installing", ms.Installing);
      else if (ms[nextPhase]) ms = computeCascade(nextPhase, ms[nextPhase]);
      else ms = computeCascade(nextPhase, addDaysISO(todayStart(), OFFSETS[nextPhase]));
      setDone(newDone);
      setPhase(nextPhase);
      setPhaseSince(today);
      setMilestones(enforceNonDecreasing(ms));
    }

    function save(markComplete=false, completedAtISO=null){
      const v=Number(String(valueDraft).replace(/,/g,""));
      if(!Number.isFinite(v)) { alert("Value must be a number."); return; }
      let ms = {...milestones};
      if (autoCascade && install) ms = computeCascade("Installing", install);
      ms = enforceNonDecreasing(ms);

      const updated = {
        ...p,
        value: v,
        phase,
        milestones: ms,
        phaseSince: phaseSince || p.phaseSince || todayISO(),
        lastContact: lastContact || null,
        cadenceDays: Number(cadence||"14"),
        contactPerson: contactPerson.trim(),
        contactEmail: contactEmail.trim(),
        done: { ...(p.done||{}), ...done },
        ...(markComplete || done?.Installing ? { completedAt: completedAtISO || done.Installing || todayISO() } : {})
      };
      setProjects(prev=>prev.map(x=>x.id===p.id?updated:x));
      go("projects");
    }

    return (
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{p.id} — {p.name}</h2>
          <div className="flex items-center gap-2">
            <button onClick={()=>go("projects")} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Back</button>
            <button onClick={completeCurrentPhase} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm">Complete Phase</button>
            <button onClick={()=>emailContact(p)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Email</button>
            <button onClick={()=>addFollowUpICS(p)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Add Follow-up</button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>Overview</CardTitle></CardHeader>
          <CardContent className="grid md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-400 mb-1">Project Value</div>
              <input value={valueDraft} onChange={e=>setValueDraft(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
            </div>
            <div>
              <div className="text-xs text-zinc-400 mb-1">Current Phase</div>
              <select value={phase} onChange={e=>setPhase(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                {PHASES.map(ph=><option key={ph} value={ph}>{ph}</option>)}
              </select>
              <div className="text-xs text-zinc-400 mt-2">Phase since</div>
              <input type="date" value={phaseSince} onChange={e=>setPhaseSince(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
            </div>

            <div>
              <div className="text-xs text-zinc-400 mb-1">Install Date (drives schedule)</div>
              <input type="date" value={install} onChange={e=>setInstallDate(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
              <label className="inline-flex items-center gap-2 mt-2 text-sm">
                <input type="checkbox" checked={autoCascade} onChange={()=>setAutoCascade(v=>!v)} />
                <span>Auto-cascade</span>
              </label>
            </div>

            <div className="text-sm">
              <div className="text-xs text-zinc-400 mb-1">Contact</div>
              <input value={contactPerson} onChange={e=>setContactPerson(e.target.value)} placeholder="Contact Person" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-2" />
              <input value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="Contact Email" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm mb-2" />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-zinc-400 mb-1">Last Contact</div>
                  <input type="date" value={lastContact||""} onChange={e=>setLastContact(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                </div>
                <div>
                  <div className="text-xs text-zinc-400 mb-1">Follow-up every (days)</div>
                  <input type="number" min="1" value={cadence} onChange={e=>setCadence(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                </div>
              </div>
              <div className="text-xs mt-2">
                <span className={followUpStatus(p).class}>{followUpStatus({...p,lastContact,cadenceDays:Number(cadence)}).text}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Phase Dates & Done</CardTitle></CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {PHASES.map(ph=>(
              <div key={ph} className="rounded-xl border border-zinc-800 p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{ph}</div>
                  <label className="text-xs inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!done[ph]} onChange={e=>toggleDonePhase(ph,e.target.checked)} />
                    <span>Done</span>
                  </label>
                </div>
                <div className="mt-2 text-xs text-zinc-400">Due</div>
                <input type="date" value={milestones[ph]||""} onChange={e=>onPhaseDateChange(ph, e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                <div className="mt-2 text-xs text-zinc-400">Done Date</div>
                <div className="flex items-center gap-2">
                  <input type="date" value={done[ph]||""} onChange={e=>setDone(d=>({...d,[ph]:e.target.value}))} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                  <button onClick={()=>setDone(d=>({...d,[ph]:todayISO()}))} className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700">Today</button>
                </div>
                {done[ph] && milestones[ph] && (
                  <div className={`mt-1 text-xs ${isPhaseOnTime({milestones,done},ph)?"text-emerald-300":"text-rose-300"}`}>
                    {isPhaseOnTime({milestones,done},ph)?"On time":"Late"}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <button onClick={()=>go("projects")} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Cancel</button>
          <button onClick={()=>save(false,null)} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">Save</button>
          <button onClick={()=>save(true,todayISO())} className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm font-medium">Mark Project Complete</button>
        </div>
      </main>
    );
  };

  return (
    <div className="min-h-screen">
      <TopNav />
      {route.page==="dashboard" && <Dashboard />}
      {route.page==="projects" && <ProjectsPage />}
      {route.page==="add" && <AddPage />}
      {route.page==="detail" && <ProjectDetail />}
      {toast && <div className="fixed bottom-4 right-4 bg-zinc-900 border border-zinc-700 text-sm px-3 py-2 rounded-lg">{toast}</div>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
