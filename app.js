// Southwood Project Tracker — v13 Pro UI (Full features, simpler UX)
// - Compact, no horizontal scroll; sticky header
// - Phase filters + min/max value + search + AI chips
// - One-click Complete Phase (advances); Install-date driven schedule
// - Auto-cascade from ANY edited phase (smart, respects manual overrides)
// - Phases checklist with Done (Today) + on-time/late indicator
// - Follow-ups: last contact + cadence days + ICS reminder + Log Contact
// - AI queries: focus now, overdue, by phase/month/range, highest value,
//   follow-ups due, completed on time/late, not contacted in N days, client:
// - Local-date-safe math (no UTC drift)
// - Delete + Clear All + inline Value edit + Email contact
// Storage key: southwood_projects_v13

// =============================
// Constants & helpers (LOCAL-DATE SAFE)
// =============================
const PHASES = [
  "Design",
  "Estimating",
  "Permitting",
  "Surveying",
  "Manufacturing",
  "Installing",
];
const MONTHS = [
  "january","february","march","april","may","june","july","august","september","october","november","december"
];
// Offsets measured from Design (0). Adjust these if you want different spacing.
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
function addDaysISO(baseOrIso, days){ const d = baseOrIso instanceof Date ? new Date(baseOrIso) : parseISO(baseOrIso); d.setDate(d.getDate()+days); return toISO(d); }
function dayNumber(d){ return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())/MS_DAY); }
function daysDiff(a,b){ return dayNumber(b)-dayNumber(a); }
function daysUntil(iso){ return daysDiff(todayStart(), parseISO(iso)); }
function daysSince(iso){ return daysDiff(parseISO(iso), todayStart()); }
function relLabel(iso){ const d=daysUntil(iso); if(d===0) return "today"; if(d===1) return "tomorrow"; if(d===-1) return "yesterday"; return d<0?`${Math.abs(d)}d overdue`:`in ${d}d`; }
function includesWord(h, n){ const s=` ${String(h).toLowerCase()} `, k=` ${String(n).toLowerCase()} `; return s.includes(k); }
function tryParseDate(txt){ const d=new Date(txt); return isNaN(d.getTime())?null:d; }
function readAmountAfter(text, keyword){
  const lower=String(text).toLowerCase(); const idx=lower.indexOf(String(keyword).toLowerCase()); if(idx===-1) return null;
  const slice=String(text).slice(idx+keyword.length); const digits=[];
  for(const ch of slice){ if((ch>="0"&&ch<="9")||ch===",") digits.push(ch); else if(ch===" "||ch==="$") continue; else break; }
  const raw=digits.join("").replace(/,/g,""); const num=Number(raw); return Number.isFinite(num)&&raw?num:null;
}
function nextId(existing){ const nums=existing.map(p=>parseInt(String(p.id).replace(/[^0-9]/g,""),10)).filter(n=>!Number.isNaN(n)); const max=nums.length?Math.max(...nums):2400; return `SW-${max+1}`; }

// =============================
// ICS helpers (all-day, date-only)
// =============================
function downloadTextFile(filename, text, mime="text/plain"){
  const blob = new Blob([text], { type:mime }); const url=URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url);
}
function makeICS({ summary, description, dateISO }){
  const d=parseISO(dateISO); const d2=new Date(d); d2.setDate(d.getDate()+1); // exclusive end
  const fmt=(x)=>`${x.getFullYear()}${String(x.getMonth()+1).padStart(2,"0")}${String(x.getDate()).padStart(2,"0")}`;
  const uid=`${Date.now()}-${Math.random().toString(36).slice(2)}@southwood`;
  return [
    "BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Southwood Project Tracker//EN","CALSCALE:GREGORIAN","METHOD:PUBLISH",
    "BEGIN:VEVENT",`UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`,
    `DTSTART;VALUE=DATE:${fmt(d)}`,`DTEND;VALUE=DATE:${fmt(d2)}`,
    `SUMMARY:${String(summary||"").replace(/\r?\n/g," ")}`,
    `DESCRIPTION:${String(description||"").replace(/\r?\n/g," ")}`,
    "END:VEVENT","END:VCALENDAR"
  ].join("\r\n");
}

// =============================
// Schedule logic
// =============================
function computeCascade(anchorPhase, anchorISO){
  const base=parseISO(anchorISO); const anchorOffset=OFFSETS[anchorPhase]; const out={};
  for(const ph of PHASES){ const delta=OFFSETS[ph]-anchorOffset; const d=new Date(base); d.setDate(d.getDate()+delta); out[ph]=toISO(d); }
  return out;
}
function enforceNonDecreasing(m){ const copy={...m}; let last=null; for(const ph of PHASES){ const cur=copy[ph]?parseISO(copy[ph]):null; if(!cur) continue; if(last && dayNumber(cur)<dayNumber(last)) copy[ph]=toISO(last); last=parseISO(copy[ph]); } return copy; }

// =============================
// Risk & priority
// =============================
const STALL_THRESHOLDS = { Design:14, Estimating:10, Permitting:21, Surveying:10, Manufacturing:20, Installing:7 };
function getNextUpcoming(p){ const t0=todayStart(); const future=[]; for(const ph of PHASES){ const iso=p.milestones?.[ph]; if(!iso) continue; const d=parseISO(iso); if(dayNumber(d)>=dayNumber(t0)) future.push({phase:ph,date:iso}); } if(!future.length) return null; future.sort((a,b)=>parseISO(a.date)-parseISO(b.date)); return future[0]; }
function overduePhases(p){ const t0=todayStart(); return PHASES.filter(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; return dayNumber(parseISO(iso))<dayNumber(t0); }); }
const hasOverdue=(p)=>overduePhases(p).length>0;
const ageInCurrentPhase=(p)=>p.phaseSince?Math.max(0,daysSince(p.phaseSince)):null;
const isStalled=(p)=>{ if(p.completedAt) return false; const age=ageInCurrentPhase(p); if(age===null) return false; const lim=STALL_THRESHOLDS[p.phase]??14; return age>lim; };
function riskTier(p){
  if (p.completedAt) return { tier:"Done", badge:"bg-zinc-800 text-zinc-300 border border-zinc-700" };
  const overdue=overduePhases(p); if(overdue.length) return { tier:"Overdue", badge:"bg-rose-600/15 text-rose-300 border border-rose-700" };
  const next=getNextUpcoming(p); if(!next) return { tier:"None", badge:"bg-zinc-800 text-zinc-300 border border-zinc-700" };
  const d=daysUntil(next.date);
  if(d<=3) return { tier:"High", badge:"bg-amber-500/15 text-amber-300 border border-amber-700" };
  if(d<=10) return { tier:"Medium", badge:"bg-yellow-500/10 text-yellow-200 border border-yellow-700" };
  return { tier:"Low", badge:"bg-emerald-600/10 text-emerald-300 border border-emerald-700" };
}
function priorityScore(p){ if(p.completedAt) return -1e9; const od=overduePhases(p); if(od.length){ const worst=Math.min(...od.map(ph=>daysUntil(p.milestones[ph]))); return 100000 + Math.abs(worst)*100 + p.value/1000; } const next=getNextUpcoming(p); const d=next?daysUntil(next.date):9999; return (60-Math.min(d,60))*100 + p.value/1000; }
function isPhaseOnTime(p, ph){ const done=p?.done?.[ph], due=p?.milestones?.[ph]; if(!done||!due) return null; return dayNumber(parseISO(done))<=dayNumber(parseISO(due)); }

// =============================
// Follow-ups
// =============================
function nextFollowUpDate(p){ const cadence=Number(p.cadenceDays||14); if(!p.lastContact) return null; const d=parseISO(p.lastContact); const out=new Date(d); out.setDate(d.getDate()+cadence); return out; }
function followUpStatus(p){ if(p.completedAt) return { text:"Project complete", due:false, class:"text-zinc-400" };
  const cadence=Number(p.cadenceDays||14); const last=p.lastContact?parseISO(p.lastContact):null; const next=nextFollowUpDate(p); const now=todayStart();
  if(!last) return { text:`No contact yet (every ${cadence}d)`, due:true, class:"text-rose-300" };
  if(dayNumber(next) <= dayNumber(now)){
    const od = Math.abs(Math.min(0, daysUntil(toISO(next))));
    return { text:`Follow-up due (${od}d overdue)`, due:true, class:"text-rose-300" };
  }
  return { text:`Next in ${daysUntil(toISO(next))}d`, due:false, class:"text-zinc-400" };
}
function addMilestoneICS(p){ const next=getNextUpcoming(p); if(!next){ alert("This project has no upcoming milestone."); return; } const ics=makeICS({ summary:`${p.id} — ${p.name}: ${next.phase}`, description:`${p.client} • ${p.location}`, dateISO:next.date }); downloadTextFile(`${p.id}-${next.phase}.ics`, ics, "text/calendar"); }
function addFollowUpICS(p){ const next=nextFollowUpDate(p); const dateISO=next?toISO(next):todayISO(); const ics=makeICS({ summary:`${p.id} — ${p.name}: Follow-up`, description:`Every ${p.cadenceDays||14}d • Contact ${p.contactPerson||""} ${p.contactEmail||""}`, dateISO }); downloadTextFile(`${p.id}-follow-up.ics`, ics, "text/calendar"); }

// =============================
// AI parsing & filtering
// =============================
function extractDateRange(q){
  const lower=String(q).toLowerCase(); const now=todayStart();
  if(includesWord(lower,"today")) return {start:now,end:new Date(now.getTime()+MS_DAY)};
  if(includesWord(lower,"tomorrow")) return {start:new Date(now.getTime()+MS_DAY),end:new Date(now.getTime()+2*MS_DAY)};
  if(includesWord(lower,"next 7 days")||includesWord(lower,"next seven days")) return {start:now,end:new Date(now.getTime()+7*MS_DAY)};
  if(includesWord(lower,"next 30 days")) return {start:now,end:new Date(now.getTime()+30*MS_DAY)};
  if(includesWord(lower,"this week")){ const d=new Date(now); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; }
  if(includesWord(lower,"next week")){ const d=new Date(now); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()+(7-((day+6)%7))); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; }
  if(includesWord(lower,"this month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth(),1),end:new Date(d.getFullYear(),d.getMonth()+1,1)}; }
  if(includesWord(lower,"next month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth()+1,1),end:new Date(d.getFullYear(),d.getMonth()+2,1)}; }
  if(lower.includes("due before ")||lower.includes("due by ")){ const key=lower.includes("due before ")?"due before ":"due by "; const part=String(q).slice(lower.indexOf(key)+key.length).trim(); const d=tryParseDate(part); if(d) return {end:d}; }
  if(lower.includes("due after ")){ const part=String(q).slice(lower.indexOf("due after ")+10).trim(); const d=tryParseDate(part); if(d) return {start:d}; }
  if(lower.includes("between ")&&lower.includes(" and ")){ const si=lower.indexOf("between ")+8; const ai=lower.indexOf(" and ",si); if(ai>-1){ const a=String(q).slice(si,ai).trim(); const b=String(q).slice(ai+5).trim(); const da=tryParseDate(a); const db=tryParseDate(b); if(da&&db) return {start:da,end:db}; } }
  for(let i=0;i<MONTHS.length;i++){ if(includesWord(lower,MONTHS[i])){ const d=new Date(now.getFullYear(),i,1); const e=new Date(now.getFullYear(),i+1,1); return {start:d,end:e}; } }
  const m=String(q).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?/);
  if(m){ const d=tryParseDate(m[0]); if(d) return {start:d,end:new Date(d.getTime()+MS_DAY)}; }
  return null;
}
function applyAIQuery(projects, query){
  if(!String(query).trim()) return projects;
  let list=[...projects]; const lower=String(query).toLowerCase();

  // completed filters
  if (includesWord(lower,"completed on time")) {
    list = list.filter(p => p.completedAt && (!p.milestones?.Installing || dayNumber(parseISO(p.completedAt)) <= dayNumber(parseISO(p.milestones.Installing))));
  } else if (includesWord(lower,"completed late")) {
    list = list.filter(p => p.completedAt && (p.milestones?.Installing && dayNumber(parseISO(p.completedAt)) > dayNumber(parseISO(p.milestones.Installing))));
  } else if (includesWord(lower,"completed")) {
    list = list.filter(p => p.completedAt);
  } else if (includesWord(lower,"not completed") || includesWord(lower,"active only")) {
    list = list.filter(p => !p.completedAt);
  }

  // money
  const over=readAmountAfter(query,"over"); if(over!==null) list=list.filter(p=>p.value>over);
  const under=readAmountAfter(query,"under"); if(under!==null) list=list.filter(p=>p.value<under);

  // phase mention
  const mentioned=PHASES.filter(ph=>includesWord(lower, ph.toLowerCase()));
  if(mentioned.length) list=list.filter(p=>mentioned.some(ph=>p.milestones?.[ph] || p.phase===ph));

  // overdue (global or phase-specific)
  if(includesWord(lower,"overdue")){
    list=list.filter(p=>{
      if(!mentioned.length) return hasOverdue(p);
      return mentioned.some(ph=>{ const d=p.milestones?.[ph]; return d? dayNumber(parseISO(d)) < dayNumber(todayStart()) : false; });
    });
  }

  // ranges
  const range=extractDateRange(lower);
  if(range){ const start=range.start?dayNumber(range.start):-Infinity; const end=range.end?dayNumber(range.end):Infinity;
    list=list.filter(p=>{ const phases=mentioned.length?mentioned:PHASES; return phases.some(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; const dn=dayNumber(parseISO(iso)); return dn>=start && dn<=end; }); });
  }

  // client:
  const ci=lower.indexOf("client:"); if(ci!==-1){ const name=lower.slice(ci+7).trim().split(" ").slice(0,5).join(" "); list=list.filter(p=>p.client.toLowerCase().includes(name)); }

  // focus / urgent
  if(includesWord(lower,"focus")||includesWord(lower,"right away")||includesWord(lower,"urgent")){
    const soonDay = dayNumber(todayStart()) + 7;
    list=list.filter(p=> !p.completedAt && (hasOverdue(p) || (getNextUpcoming(p)&& dayNumber(parseISO(getNextUpcoming(p).date))<=soonDay)) );
    list.sort((a,b)=>priorityScore(b)-priorityScore(a));
  }

  // stalled
  if(includesWord(lower,"stalled")) list=list.filter(p=>isStalled(p));
  const olderMatch=lower.match(/in phase over (\d+)\s*days?/);
  if(olderMatch){ const n=Number(olderMatch[1]); list=list.filter(p=>{ const age=ageInCurrentPhase(p); return age!==null && age>n; }); }

  // follow-ups
  if(includesWord(lower,"follow-ups due")||includesWord(lower,"overdue follow-ups")||includesWord(lower,"follow up due")) list=list.filter(p=>!p.completedAt && followUpStatus(p).due);
  const notContacted=lower.match(/not contacted in (\d+)\s*days?/); if(notContacted){ const n=Number(notContacted[1]); list=list.filter(p=>!p.completedAt && (!p.lastContact || daysSince(p.lastContact)>=n)); }
  if(includesWord(lower,"contacted today")) list=list.filter(p=>p.lastContact && daysSince(p.lastContact)===0);
  if(includesWord(lower,"contacted this week")){
    const now=todayStart(); const day=now.getDay(); const monday=new Date(now); monday.setDate(now.getDate()-((day+6)%7));
    list=list.filter(p=>p.lastContact && dayNumber(parseISO(p.lastContact)) >= dayNumber(monday));
  }

  // highest value
  if(includesWord(lower,"highest value")||includesWord(lower,"top value")||includesWord(lower,"largest")||includesWord(lower,"biggest")) list=[...list].sort((a,b)=>b.value-a.value);

  return list;
}
function summarizeQuery(projects, query){
  const list=applyAIQuery(projects, query); const count=list.length; const total=list.reduce((s,p)=>s+p.value,0);
  const lower=String(query).toLowerCase(); const wantsList=lower.includes("which")||lower.includes("list")||lower.includes("show");

  if(lower.includes("completed")){
    const lines=list.slice(0,15).map(p=>{ const ot = p.milestones?.Installing ? (dayNumber(parseISO(p.completedAt)) <= dayNumber(parseISO(p.milestones.Installing))) : null; const tag = ot===null ? "" : ot ? "On time" : "Late"; return `• ${p.id||"—"} — ${p.name} — completed ${new Date(parseISO(p.completedAt)).toLocaleDateString()} ${tag?`(${tag})`:""}`; }).join("\n");
    return `Completed (${count}):\n${lines}`;
  }
  if(lower.includes("focus")||lower.includes("right away")||lower.includes("urgent")){
    const lines=list.slice(0,12).map(p=>{ const od=overduePhases(p); const next=getNextUpcoming(p); const age=ageInCurrentPhase(p); const badge=od.length?`OVERDUE: ${od.join(" / ")}`:(next?`${next.phase} ${new Date(parseISO(next.date)).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming"); return `• ${p.id||"—"} — ${p.name} (${p.client}) — ${currency(p.value)} — ${badge} — Age ${age ?? "?"}d`; }).join("\n");
    return `Focus Now (${count}):\n${lines}`;
  }
  if(lower.includes("follow-ups due")||lower.includes("overdue follow-ups")||lower.match(/not contacted in \d+\s*days?/)){
    const due=list.filter(p=>followUpStatus(p).due); const lines=due.slice(0,15).map(p=>`• ${p.id||"—"} — ${p.name} (${p.client}) — ${followUpStatus(p).text}`).join("\n");
    return `Follow-ups (${due.length} due, ${list.length} matched):\n${lines}`;
  }
  if(lower.includes("stalled")||lower.match(/in phase over \d+\s*days?/)){
    const lines=list.slice(0,15).map(p=>{ const age=ageInCurrentPhase(p)??"-"; const lim=STALL_THRESHOLDS[p.phase]??14; return `• ${p.id||"—"} — ${p.name} (${p.phase}) — Age ${age}d (limit ${lim}d)`; }).join("\n");
    return `Stalled / aging (${list.length}):\n${lines}`;
  }
  if(lower.includes("highest value")||lower.includes("top value")||lower.includes("largest")||lower.includes("biggest")){
    const top=[...list].sort((a,b)=>b.value-a.value).slice(0,5); const lines=top.map((p,i)=>`${i+1}. ${p.id||"—"} — ${p.name} (${p.client}) — ${currency(p.value)}`).join("\n"); const maxLine=top[0]?`Highest: ${top[0].id||"—"} — ${currency(top[0].value)}`:"Highest: (none)"; return `Top value projects (${count} total, ${currency(total)} combined):\n${lines}\n${maxLine}`;
  }
  if(lower.includes("overdue") && wantsList){ const lines=list.map(p=>`• ${p.id||"—"} — ${p.name} — OVERDUE: ${overduePhases(p).join(", ")}`).join("\n"); return `${list.length} overdue\n${lines}`; }

  const range=extractDateRange(lower); if(range){ const lines=list.slice(0,20).map(p=>{ const next=getNextUpcoming(p); const badge=next?`${next.phase} ${new Date(parseISO(next.date)).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming"; return `• ${p.id||"—"} — ${p.name} — ${badge}`; }).join("\n"); return `${count} match • Total ${currency(total)}\n${lines}`; }

  if(lower.includes("how many")) return `${count} project${count===1?"":"s"} match.`;
  if(lower.includes("total value")||lower.includes("total amount")||lower.includes("pipeline")) return `Total value for those: ${currency(total)}.`;

  const nextThree=list.map(p=>({p,next:getNextUpcoming(p)})).filter(x=>x.next).sort((a,b)=>parseISO(a.next.date)-parseISO(b.next.date)).slice(0,3).map(({p,next})=>`${p.id||"—"} ${next.phase} (${new Date(parseISO(next.date)).toLocaleDateString()})`);
  return `${count} match • Total ${currency(total)} • Next due: ${nextThree.join(", ") || "(none)"}`;
}

// =============================
// Blank data (no seed projects)
// =============================
const PROJECTS = [];

// =============================
// UI primitives
// =============================
const Card = ({children,className=""}) => <div className={`rounded-2xl border border-zinc-800 bg-[#0f172a] ${className}`}>{children}</div>;
const CardHeader = ({children,className=""}) => <div className={`px-5 pt-5 ${className}`}>{children}</div>;
const CardTitle = ({children,className=""}) => <h2 className="text-xl font-semibold text-zinc-100">{children}</h2>;
const CardContent = ({children,className=""}) => <div className={`px-5 pb-5 ${className}`}>{children}</div>;

// =============================
// Main App
// =============================
function App(){
  // load / persist
  const [projects,setProjects]=React.useState(()=>{ try{ const raw=localStorage.getItem("southwood_projects_v13"); return raw?JSON.parse(raw):PROJECTS; }catch{ return PROJECTS; } });
  React.useEffect(()=>{ try{ localStorage.setItem("southwood_projects_v13", JSON.stringify(projects)); }catch{} },[projects]);

  // filters & state
  const [search,setSearch]=React.useState("");
  const [phasesFilter,setPhasesFilter]=React.useState([...PHASES]);
  const [minVal,setMinVal]=React.useState(""); const [maxVal,setMaxVal]=React.useState("");
  const [hideCompleted,setHideCompleted]=React.useState(true);

  // AI
  const [aiQuery,setAiQuery]=React.useState(""); const [aiAnswer,setAiAnswer]=React.useState("");

  // sorting
  const [sortKey,setSortKey]=React.useState("priority"); const [sortDir,setSortDir]=React.useState("desc");

  // inline value edit
  const [editValueId,setEditValueId]=React.useState(null); const [valueDraft,setValueDraft]=React.useState("");

  // edit panel
  const [editId,setEditId]=React.useState(null);
  const [editPhase,setEditPhase]=React.useState("Design");
  const [editMilestones,setEditMilestones]=React.useState({});
  const [editInstall,setEditInstall]=React.useState("");
  const [editPhaseSince,setEditPhaseSince]=React.useState("");
  const [autoCascade,setAutoCascade]=React.useState(true);
  const [touched,setTouched]=React.useState(new Set());
  const [lastEditedPhase,setLastEditedPhase]=React.useState(null);
  const [editDone,setEditDone]=React.useState({});
  const [editLastContact,setEditLastContact]=React.useState("");
  const [editCadence,setEditCadence]=React.useState("14");
  const [editContactPerson,setEditContactPerson]=React.useState("");
  const [editContactEmail,setEditContactEmail]=React.useState("");

  const [toast,setToast]=React.useState("");

  const togglePhaseFilter=(ph)=>setPhasesFilter(prev=>prev.includes(ph)?prev.filter(x=>x!==ph):[...prev, ph]);

  function runClear(){ setPhasesFilter([...PHASES]); setMinVal(""); setMaxVal(""); setAiQuery(""); setAiAnswer(""); setSearch(""); setSortKey("priority"); setSortDir("desc"); setHideCompleted(true); }

  // Add project
  const [qaName,setQaName]=React.useState("");
  const [qaClient,setQaClient]=React.useState("");
  const [qaLocation,setQaLocation]=React.useState("Rock Hill, SC");
  const [qaValue,setQaValue]=React.useState("");
  const [qaPhase,setQaPhase]=React.useState("Design");
  const [qaContact,setQaContact]=React.useState("");
  const [qaEmail,setQaEmail]=React.useState("");
  const [qaCadence,setQaCadence]=React.useState("14");

  function addProject(){
    const valueNum=Number(String(qaValue).replace(/,/g,""));
    if(!qaName||!qaClient||Number.isNaN(valueNum)){ setToast("Fill Project Name, Client, numeric Value."); setTimeout(()=>setToast(""),1500); return; }
    // seed a timeline centered on chosen phase relative to today
    const center=qaPhase; const anchorISO=addDaysISO(todayStart(), OFFSETS[center]);
    const milestones=computeCascade(center, anchorISO);
    const newP={
      id: nextId(projects), name: qaName.trim(), client: qaClient.trim(), location: qaLocation.trim()||"Rock Hill, SC",
      value: valueNum, phase: center, milestones, phaseSince: todayISO(),
      contactPerson: qaContact.trim(), contactEmail: qaEmail.trim(),
      lastContact: null, cadenceDays: Number(qaCadence||"14"), done: {}, completedAt: null,
    };
    setProjects(prev=>[newP, ...prev]);
    setQaName(""); setQaClient(""); setQaLocation("Rock Hill, SC"); setQaValue(""); setQaPhase("Design"); setQaContact(""); setQaEmail(""); setQaCadence("14");
  }

  // Delete & Clear
  function deleteProject(p){ if(!confirm(`Delete ${p.id} — ${p.name}?`)) return; setProjects(prev=>prev.filter(x=>x.id!==p.id)); }
  function clearAll(){ if(!projects.length){ setToast("No projects to clear."); setTimeout(()=>setToast(""),1200); return; } if(!confirm("Clear ALL projects? This cannot be undone.")) return; setProjects([]); }

  // Contact
  function emailContact(p){ const to=encodeURIComponent(p.contactEmail||""); const subject=encodeURIComponent(`Southwood — ${p.id} ${p.name} update`); const next=getNextUpcoming(p); const od=overduePhases(p); const body=[`Hi ${p.contactPerson||"there"},`,"",`Quick update on ${p.name} (${p.id}).`, next?`• Next due: ${next.phase} on ${new Date(parseISO(next.date)).toLocaleDateString()}`:"• No upcoming milestones on the schedule", od.length?`• Overdue phases: ${od.join(", ")}`:"", "", "Thanks,"].join("\n"); window.location.href=`mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`; }
  function logContact(p){ const iso=todayISO(); setProjects(prev=>prev.map(x=>x.id===p.id?{...x,lastContact:iso}:x)); }

  // Inline value edit
  function beginValueEdit(p){ setEditValueId(p.id); setValueDraft(String(p.value)); }
  function commitValueEdit(p){ const v=Number(String(valueDraft).replace(/,/g,"")); if(!Number.isFinite(v)){ setEditValueId(null); return; } setProjects(prev=>prev.map(x=>x.id===p.id?{...x, value:v}:x)); setEditValueId(null); }

  // Quick Complete Phase
  function completeCurrentPhase(p){
    const i=PHASES.indexOf(p.phase); const today=todayISO();
    setProjects(prev=>prev.map(x=>{
      if(x.id!==p.id) return x;
      const done={...(x.done||{}), [p.phase]:today};
      if(p.phase==="Installing"){ return {...x, done, completedAt:today}; }
      const nextPhase=PHASES[i+1]||"Installing";
      let milestones={...x.milestones};
      if (milestones.Installing) milestones = computeCascade("Installing", milestones.Installing); else if (milestones[nextPhase]) milestones = computeCascade(nextPhase, milestones[nextPhase]); else milestones = computeCascade(nextPhase, addDaysISO(todayStart(), OFFSETS[nextPhase]));
      return {...x, done, phase:nextPhase, phaseSince:today, milestones:enforceNonDecreasing(milestones)};
    }));
  }

  // Edit panel open/close
  function startEdit(p){
    setEditId(p.id); setEditPhase(p.phase); setEditMilestones({...p.milestones}); setEditInstall(p.milestones?.Installing||""); setEditPhaseSince(p.phaseSince||""); setEditDone({...p.done}); setEditLastContact(p.lastContact||""); setEditCadence(String(p.cadenceDays||"14")); setEditContactPerson(p.contactPerson||""); setEditContactEmail(p.contactEmail||""); setTouched(new Set()); setLastEditedPhase(null);
  }
  function saveEdit(){ if(!editId) return; let ms={...editMilestones}; if (autoCascade && editInstall) ms=computeCascade("Installing", editInstall); ms=enforceNonDecreasing(ms);
    setProjects(prev=>prev.map(p=> p.id===editId ? {
      ...p,
      phase: editPhase,
      milestones: ms,
      phaseSince: editPhaseSince||p.phaseSince||todayISO(),
      lastContact: editLastContact||null,
      cadenceDays: Number(editCadence||"14"),
      contactPerson: editContactPerson.trim(),
      contactEmail: editContactEmail.trim(),
      done: { ...(p.done||{}), ...editDone },
      ...(editDone?.Installing ? { completedAt: editDone.Installing } : {})
    } : p));
    setEditId(null);
  }

  // In-edit cascading from ANY phase (smart overwrite)
  function onPhaseDateChange(ph, iso){
    setTouched(prev=>{ const s=new Set(prev); s.add(ph); return s; }); setLastEditedPhase(ph);
    setEditMilestones(curr=>{
      let next={ ...curr, [ph]: iso };
      if(autoCascade && iso){
        const cascade=computeCascade(ph, iso);
        for(const p of PHASES){ if(p===ph) continue; if(!touched.has(p)) next[p]=cascade[p]; }
        next=enforceNonDecreasing(next);
      }
      return next;
    });
  }
  function setInstallDate(iso){ setEditInstall(iso); if(!iso) return; if(autoCascade){ const ms=computeCascade("Installing", iso); setEditMilestones(ms); } else { setEditMilestones(m=>({...m, Installing: iso})); } }
  function toggleDonePhase(ph, checked){ if(checked) setEditDone(d=>({...d,[ph]:todayISO()})); else setEditDone(d=>{ const nd={...d}; delete nd[ph]; return nd; }); }

  // AI
  function runAI(){ if(!aiQuery.trim()){ setAiAnswer("Type a question or pick a chip."); return; } setAiAnswer(summarizeQuery(projects, aiQuery)); }

  // Derived list + sorting
  const filtered=React.useMemo(()=>{
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

  // KPIs
  const kpi=React.useMemo(()=>{
    const active=projects.filter(p=>!p.completedAt);
    const nowDN=dayNumber(todayStart()), in30=nowDN+30;
    const dueSoon=active.filter(p=>PHASES.some(ph=>{ const iso=p.milestones?.[ph]; if(!iso) return false; const dn=dayNumber(parseISO(iso)); return dn>=nowDN && dn<=in30; })).length;
    const atRisk=active.filter(p=>hasOverdue(p)).length;
    const totalValue=active.reduce((s,p)=>s+p.value,0);
    const ages=active.map(p=>ageInCurrentPhase(p)).filter(x=>x!==null); const avgAge=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length):0;
    const stalled=active.filter(p=>isStalled(p)).length;
    const followDue=active.filter(p=>followUpStatus(p).due).length;
    const completed=projects.length - active.length;
    return { active:active.length, dueSoon, atRisk, totalValue, avgAge, stalled, followDue, completed };
  },[projects]);

  function headerSort(label,key){ const active=sortKey===key; const arrow=active?(sortDir==="asc"?"▲":"▼"):"↕"; return (
    <button onClick={()=>{ if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortKey(key); setSortDir(key==="project"||key==="client"||key==="phase"?"asc":"desc"); } }} className={`inline-flex items-center gap-1 select-none ${active?"text-zinc-200":"text-zinc-400"} hover:text-zinc-100`} title={`Sort by ${label}`}>
      <span>{label}</span><span className="text-xs">{arrow}</span>
    </button>
  );}

  return (
    <div className="min-h-screen bg-[#0b1020] text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-[#0b1020]/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500 grid place-items-center font-bold">S</div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Southwood Project Tracker</h1>
              <p className="text-xs text-zinc-400">Pro UI • Auto-schedule • Follow-ups • AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by ID, client, contact…" className="w-80 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600" />
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
            <button onClick={runClear} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">Reset</button>
            <button onClick={clearAll} className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Clear All</button>
          </div>
        </div>
        {/* Secondary filters row */}
        <div className="max-w-7xl mx-auto px-4 pb-3">
          <div className="flex flex-wrap gap-2 items-center">
            <div className="flex flex-wrap gap-2">
              {PHASES.map(s=> (
                <label key={s} className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-2.5 py-1.5 rounded-lg text-sm">
                  <input type="checkbox" checked={phasesFilter.includes(s)} onChange={()=>togglePhaseFilter(s)} />
                  <span>{s}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <input value={minVal} onChange={(e)=>setMinVal(e.target.value)} placeholder="Min $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm" />
              <input value={maxVal} onChange={(e)=>setMaxVal(e.target.value)} placeholder="Max $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        {/* Left: KPIs + Table */}
        <section className="lg:col-span-2 space-y-6">
          {/* KPIs */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Active</p><p className="text-3xl mt-2 font-semibold">{kpi.active}</p><p className="text-xs text-zinc-400 mt-1">Completed: {kpi.completed}</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Total Value</p><p className="text-3xl mt-2 font-semibold">{currency(kpi.totalValue)}</p><p className="text-xs text-zinc-400 mt-1">Across active</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Due ≤30d</p><p className="text-3xl mt-2 font-semibold">{kpi.dueSoon}</p><p className="text-xs text-zinc-400 mt-1">Any phase</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Overdue</p><p className="text-3xl mt-2 font-semibold">{kpi.atRisk}</p><p className="text-xs text-zinc-400 mt-1">Projects</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Follow-ups due</p><p className="text-3xl mt-2 font-semibold">{kpi.followDue}</p><p className="text-xs text-zinc-400 mt-1">Avg age {kpi.avgAge}d</p></CardContent></Card>
          </div>

          {/* AI + Table */}
          <Card>
            <CardHeader className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle>Projects</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <button onClick={()=>{ setAiQuery("what should I focus on"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Focus now</button>
                <button onClick={()=>{ setAiQuery("follow-ups due"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Follow-ups</button>
                <button onClick={()=>{ setAiQuery("highest value"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Highest value</button>
                <button onClick={()=>{ setAiQuery("which are overdue"); setTimeout(runAI,0); }} className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700">Overdue</button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2">
                <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") runAI(); }} placeholder="Ask: focus now • follow-ups due • overdue • highest value • Permitting in September • client: CLT Airport" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
                <button onClick={()=>{ setAiQuery(""); setAiAnswer(""); }} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm">Clear</button>
              </div>
              {aiAnswer && <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap">{aiAnswer}</div>}

              {/* Table — compact, no horizontal scroll */}
              <div className="overflow-hidden border border-zinc-800 rounded-xl">
                <table className="min-w-full text-sm">
                  <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                    <tr>
                      <th className="text-left py-3 px-3">{headerSort("Project","project")}</th>
                      <th className="text-left py-3 px-3">{headerSort("Value","value")}</th>
                      <th className="text-left py-3 px-3">Phase</th>
                      <th className="text-left py-3 px-3">Risk / Next</th>
                      <th className="text-left py-3 px-3">Follow-up</th>
                      <th className="text-right py-3 px-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(p=>{
                      const next=getNextUpcoming(p); const overdue=overduePhases(p); const age=ageInCurrentPhase(p); const risk=riskTier(p);
                      return (
                        <React.Fragment key={p.id}>
                          <tr className="border-t border-zinc-800 text-zinc-200 align-top">
                            <td className="py-3 px-3">
                              <div className="font-medium flex items-center gap-2">
                                <span className="bg-zinc-800 text-[11px] px-2 py-0.5 rounded-full">{p.id}</span>
                                <span className="truncate max-w-[320px]">{p.name}</span>
                              </div>
                              <div className="text-xs text-zinc-500">{p.client} • {p.location}</div>
                              {(p.contactPerson||p.contactEmail) && <div className="text-xs text-zinc-500 mt-0.5">Contact: {p.contactPerson||"—"} {p.contactEmail?`• ${p.contactEmail}`:""}</div>}
                            </td>
                            <td className="py-3 px-3 font-semibold">
                              {editValueId===p.id ? (
                                <div className="flex items-center gap-1">
                                  <input value={valueDraft} onChange={(e)=>setValueDraft(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") commitValueEdit(p); if(e.key==="Escape") setEditValueId(null); }} className="w-28 bg-zinc-900 border border-zinc-800 rounded px-2 py-1" />
                                  <button onClick={()=>commitValueEdit(p)} className="text-xs px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600">Save</button>
                                  <button onClick={()=>setEditValueId(null)} className="text-xs px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700">Cancel</button>
                                </div>
                              ) : (
                                <span className="cursor-pointer" title="Click to edit" onClick={()=>beginValueEdit(p)}>{currency(p.value)}</span>
                              )}
                            </td>
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
                              {!p.completedAt && <button onClick={()=>completeCurrentPhase(p)} className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm">Complete Phase</button>}
                              <button onClick={()=>logContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Log Contact</button>
                              <button onClick={()=>emailContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Email</button>
                              <button onClick={()=>startEdit(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Edit</button>
                              <button onClick={()=>deleteProject(p)} className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Delete</button>
                            </td>
                          </tr>

                          {/* Edit row */}
                          {editId===p.id && (
                            <tr className="bg-zinc-950/60 border-t border-zinc-900">
                              <td colSpan={6} className="px-4 py-4">
                                <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
                                  <div className="flex items-end gap-3 flex-wrap">
                                    <div>
                                      <label className="text-xs text-zinc-400 block mb-1">Current Phase</label>
                                      <select value={editPhase} onChange={(e)=>setEditPhase(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                                        {PHASES.map(ph=> <option key={ph} value={ph}>{ph}</option>)}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="text-xs text-zinc-400 block mb-1">Install Date (drives schedule)</label>
                                      <input type="date" value={editInstall} onChange={(e)=>setInstallDate(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                    </div>
                                    <label className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg text-sm">
                                      <input type="checkbox" checked={autoCascade} onChange={()=>setAutoCascade(v=>!v)} />
                                      <span>Auto-cascade</span>
                                    </label>
                                    <div className="text-xs text-zinc-400">Phase since: <input type="date" value={editPhaseSince} onChange={(e)=>setEditPhaseSince(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1"/></div>
                                  </div>
                                  <div className="text-xs text-zinc-400">Edit any phase date; others pre-fill. Use “Done → Today” to mark completion.</div>
                                </div>

                                {/* Phases checklist */}
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                  {PHASES.map(ph=> (
                                    <div key={ph} className="rounded-xl border border-zinc-800 p-3">
                                      <div className="flex items-center justify-between">
                                        <div className="font-medium">{ph}</div>
                                        <label className="text-xs inline-flex items-center gap-2">
                                          <input type="checkbox" checked={!!editDone[ph]} onChange={(e)=>toggleDonePhase(ph,e.target.checked)} />
                                          <span>Done</span>
                                        </label>
                                      </div>
                                      <div className="mt-2 text-xs text-zinc-400">Due</div>
                                      <input type="date" value={editMilestones[ph]||""} onChange={(e)=>onPhaseDateChange(ph, e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                      <div className="mt-2 text-xs text-zinc-400">Done Date</div>
                                      <div className="flex items-center gap-2">
                                        <input type="date" value={editDone[ph]||""} onChange={(e)=>setEditDone(d=>({...d,[ph]:e.target.value}))} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                        <button onClick={()=>setEditDone(d=>({...d,[ph]:todayISO()}))} className="px-2 py-1 text-xs rounded bg-zinc-800 hover:bg-zinc-700">Today</button>
                                      </div>
                                      {editDone[ph]&&editMilestones[ph] && (
                                        <div className={`mt-1 text-xs ${isPhaseOnTime({milestones:editMilestones,done:editDone},ph)?"text-emerald-300":"text-rose-300"}`}>
                                          {isPhaseOnTime({milestones:editMilestones,done:editDone},ph)?"On time":"Late"}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>

                                {/* Contact & follow-up */}
                                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                                  <div>
                                    <label className="text-xs text-zinc-400 block mb-1">Last Contact</label>
                                    <input type="date" value={editLastContact} onChange={(e)=>setEditLastContact(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                  </div>
                                  <div>
                                    <label className="text-xs text-zinc-400 block mb-1">Follow-up every (days)</label>
                                    <input type="number" min="1" value={editCadence} onChange={(e)=>setEditCadence(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                  </div>
                                  <div>
                                    <label className="text-xs text-zinc-400 block mb-1">Contact Person</label>
                                    <input value={editContactPerson} onChange={(e)=>setEditContactPerson(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                  </div>
                                  <div>
                                    <label className="text-xs text-zinc-400 block mb-1">Contact Email</label>
                                    <input value={editContactEmail} onChange={(e)=>setEditContactEmail(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                  </div>
                                </div>

                                <div className="flex items-center justify-end gap-2 mt-4">
                                  <button onClick={()=>setEditId(null)} className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Cancel</button>
                                  <button onClick={saveEdit} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium">Save</button>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {filtered.length===0 && (
                      <tr><td colSpan={6} className="py-6 text-center text-zinc-400">No projects match — use <b>Quick Add</b> on the right.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Right: Quick Add & Tips */}
        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Quick Add</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input value={qaName} onChange={(e)=>setQaName(e.target.value)} placeholder="Project Name" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <input value={qaClient} onChange={(e)=>setQaClient(e.target.value)} placeholder="Client" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                <input value={qaLocation} onChange={(e)=>setQaLocation(e.target.value)} placeholder="Location" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex gap-2 items-center">
                <input value={qaValue} onChange={(e)=>setQaValue(e.target.value)} placeholder="Value ($)" inputMode="numeric" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                <select value={qaPhase} onChange={(e)=>setQaPhase(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                  {PHASES.map(s=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={qaContact} onChange={(e)=>setQaContact(e.target.value)} placeholder="Contact Person" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                <input value={qaEmail} onChange={(e)=>setQaEmail(e.target.value)} placeholder="Contact Email" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              </div>
              <input value={qaCadence} onChange={(e)=>setQaCadence(e.target.value)} placeholder="Follow-up every (days)" inputMode="numeric" className="w-56 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
              <button onClick={addProject} className="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm font-medium">Add Project</button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Tips</CardTitle></CardHeader>
            <CardContent className="text-sm text-zinc-300 space-y-2">
              <p><b>Complete Phase</b> advances the project and keeps your Install date (auto-fills earlier phases).</p>
              <p>Change <b>Install Date</b> or any phase date — with <b>Auto-cascade</b> on, others pre-fill sensibly and never go backwards.</p>
              <p>Use AI chips: <i>focus now</i>, <i>follow-ups due</i>, <i>highest value</i>, <i>overdue</i>, or ask things like <i>permitting in September</i>.</p>
            </CardContent>
          </Card>
        </aside>
      </main>

      {toast && <div className="fixed bottom-4 right-4 bg-zinc-900 border border-zinc-700 text-sm px-3 py-2 rounded-lg">{toast}</div>}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
