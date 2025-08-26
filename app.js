// Southwood Project Tracker — Full + Completion Tracking (Blank Start)
// Keeps: Risk Tints • Sort • Inline Value Edit • AI Chips/Queries • Aging/Stalled
//        Contact tracking (lastContact, cadenceDays) • ICS reminders (milestone & follow-up)
//        Edit panel (milestones, phaseSince, contacts) • KPIs • Delete per row • Clear All
// Adds:  Per-phase Done dates • Mark Phase Done (with optional auto-advance)
//        Complete Project • On-time/Late flags • Hide Completed (default ON)
// Storage key: v8 (fresh)

// =====================================
// Constants & helpers
// =====================================
const PHASES = ["Design","Estimating","Permitting","Surveying","Manufacturing","Installing"];
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

const phaseColor = {
  Design: "bg-sky-600",
  Estimating: "bg-indigo-600",
  Permitting: "bg-amber-600",
  Surveying: "bg-teal-600",
  Manufacturing: "bg-fuchsia-600",
  Installing: "bg-emerald-600",
};

const currency = (n) => Number(n).toLocaleString(undefined,{style:"currency",currency:"USD",maximumFractionDigits:0});
function todayStart(){ const t=new Date(); t.setHours(0,0,0,0); return t; }
function addDaysISO(base, days){ const d=new Date(base); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function includesWord(h, n){ const s=` ${String(h).toLowerCase()} `; const k=` ${String(n).toLowerCase()} `; return s.includes(k); }
function tryParseDate(txt){ const d=new Date(txt); return isNaN(d.getTime())?null:d; }
function daysUntil(iso){ const a=todayStart().getTime(); const b=new Date(iso).setHours(0,0,0,0); return Math.round((b-a)/86400000); }
function daysSince(iso){ const a=todayStart().getTime(); const b=new Date(iso).setHours(0,0,0,0); return Math.round((a-b)/86400000); }
function relLabel(iso){ const d=daysUntil(iso); if(d===0)return"today"; if(d===1)return"tomorrow"; if(d===-1)return"yesterday"; return d<0?`${Math.abs(d)}d overdue`:`in ${d}d`; }
function readAmountAfter(text, keyword){
  const lower=String(text).toLowerCase(); const idx=lower.indexOf(String(keyword).toLowerCase()); if(idx===-1) return null;
  const slice=String(text).slice(idx+keyword.length); const digits=[];
  for(const ch of slice){ if((ch>="0"&&ch<="9")||ch===",") digits.push(ch); else if(ch===" "||ch==="$") continue; else break; }
  const raw=digits.join("").replace(/,/g,""); const num=Number(raw); return Number.isFinite(num)&&raw?num:null;
}
function nextId(existing){
  const nums = existing.map(p=>parseInt(String(p.id).replace(/[^0-9]/g,""),10)).filter(n=>!Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 2400;
  return `SW-${max+1}`;
}

// =====================================
// ICS (.ics) generation + download
// =====================================
function downloadTextFile(filename, text, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a=document.createElement("a"); a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
}
// All-day single day event
function makeICS({ summary, description, dateISO }){
  const d=new Date(dateISO); d.setHours(0,0,0,0);
  const d2=new Date(d); d2.setDate(d.getDate()+1); // DTEND exclusive
  const fmt = (x)=> x.toISOString().slice(0,10).replace(/-/g,"");
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@southwood`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Southwood Project Tracker//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`,
    `DTSTART;VALUE=DATE:${fmt(d)}`,
    `DTEND;VALUE=DATE:${fmt(d2)}`,
    `SUMMARY:${String(summary||"").replace(/\r?\n/g," ")}`,
    `DESCRIPTION:${String(description||"").replace(/\r?\n/g," ")}`,
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");
}

// =====================================
// Risk & aging rules
// =====================================
const STALL_THRESHOLDS = { Design:14, Estimating:10, Permitting:21, Surveying:10, Manufacturing:20, Installing:7 };

function getNextUpcoming(project){
  const t0=todayStart().getTime(); const future=[];
  for(const ph of PHASES){ const d=project.milestones?.[ph]; if(d){ const t=new Date(d).setHours(0,0,0,0); if(t>=t0) future.push({phase:ph,date:d}); } }
  if(!future.length) return null;
  future.sort((a,b)=>new Date(a.date)-new Date(b.date));
  return future[0];
}
function overduePhases(project){
  const t0=todayStart().getTime();
  return PHASES.filter(ph=>{ const d=project.milestones?.[ph]; return d? new Date(d).setHours(0,0,0,0) < t0 : false; });
}
const hasOverdue=(p)=>overduePhases(p).length>0;
function riskTier(project){
  if (project.completedAt) return { tier:"Done", row:"bg-zinc-900/40", badge:"bg-zinc-800 text-zinc-300 border border-zinc-700" };
  const overdue=overduePhases(project);
  if(overdue.length) return { tier:"Overdue", row:"bg-rose-950/40", badge:"bg-rose-600/15 text-rose-300 border border-rose-700" };
  const next=getNextUpcoming(project); if(!next) return { tier:"None", row:"bg-transparent", badge:"bg-zinc-800 text-zinc-300 border border-zinc-700" };
  const d=daysUntil(next.date);
  if(d<=3) return { tier:"High", row:"bg-amber-950/30", badge:"bg-amber-500/15 text-amber-300 border border-amber-700" };
  if(d<=10) return { tier:"Medium", row:"bg-yellow-950/20", badge:"bg-yellow-500/10 text-yellow-200 border-yellow-700 border" };
  return { tier:"Low", row:"bg-emerald-950/20", badge:"bg-emerald-600/10 text-emerald-300 border border-emerald-700" };
}
const ageInCurrentPhase=(p)=>p.phaseSince?Math.max(0,daysSince(p.phaseSince)):null;
const isStalled=(p)=>{ if(p.completedAt) return false; const age=ageInCurrentPhase(p); if(age===null) return false; const lim=STALL_THRESHOLDS[p.phase]??14; return age>lim; };
function priorityScore(p){
  if (p.completedAt) return -1e9; // push completed to the bottom
  const overdue=overduePhases(p);
  if(overdue.length){ const worst=Math.min(...overdue.map(ph=>daysUntil(p.milestones[ph]))); return 100000 + Math.abs(worst)*100 + p.value/1000; }
  const next=getNextUpcoming(p); const d=next?daysUntil(next.date):9999;
  return (60-Math.min(d,60))*100 + p.value/1000;
}

// =====================================
// Follow-ups (lastContact + cadenceDays)
// =====================================
function nextFollowUpDate(p){
  const cadence=Number(p.cadenceDays||14); if(!p.lastContact) return null;
  const d=new Date(p.lastContact); d.setHours(0,0,0,0); d.setDate(d.getDate()+cadence); return d;
}
function followUpStatus(p){
  if (p.completedAt) return { text:"Project complete", due:false, class:"text-zinc-400" };
  const cadence=Number(p.cadenceDays||14); const last=p.lastContact?new Date(p.lastContact):null; const next=nextFollowUpDate(p); const now=todayStart();
  if(!last) return { text:`No contact yet (cadence ${cadence}d)`, due:true, class:"text-rose-300" };
  if(next<=now){ const od=Math.abs(Math.min(0,daysUntil(next.toISOString().slice(0,10)))); return { text:`Follow-up due (${od}d overdue)`, due:true, class:"text-rose-300" }; }
  return { text:`Next in ${daysUntil(next.toISOString().slice(0,10))}d`, due:false, class:"text-zinc-400" };
}
function addMilestoneICS(p){
  const next=getNextUpcoming(p); if(!next){ alert("This project has no upcoming milestone."); return; }
  const ics=makeICS({ summary:`${p.id} — ${p.name}: ${next.phase}`, description:`${p.client} • ${p.location}`, dateISO:next.date });
  downloadTextFile(`${p.id}-${next.phase}.ics`, ics, "text/calendar");
}
function addFollowUpICS(p){
  const next=nextFollowUpDate(p); const dateISO=next?next.toISOString().slice(0,10):todayStart().toISOString().slice(0,10);
  const label=next?"Follow-up":"Initial follow-up";
  const ics=makeICS({ summary:`${p.id} — ${p.name}: ${label}`, description:`Cadence ${p.cadenceDays||14}d • Contact ${p.contactPerson||""} ${p.contactEmail||""}`, dateISO });
  downloadTextFile(`${p.id}-follow-up.ics`, ics, "text/calendar");
}

// =====================================
// Completion helpers
// =====================================
function isPhaseOnTime(p, ph) {
  const doneAt = p?.done?.[ph];
  const due = p?.milestones?.[ph];
  if (!doneAt || !due) return null; // unknown
  return new Date(doneAt).setHours(0,0,0,0) <= new Date(due).setHours(0,0,0,0);
}
function nextPhase(ph){
  const idx = PHASES.indexOf(ph);
  return idx>=0 && idx<PHASES.length-1 ? PHASES[idx+1] : null;
}

// These two rely on setProjects in component scope; we wrap them inside component later as closures.

// =====================================
// “AI” query parsing
// =====================================
function extractDateRange(q){
  const lower=String(q).toLowerCase(); const now=todayStart();
  if(includesWord(lower,"today")) return {start:now,end:new Date(now.getTime()+86400000)};
  if(includesWord(lower,"tomorrow")) return {start:new Date(now.getTime()+86400000),end:new Date(now.getTime()+2*86400000)};
  if(includesWord(lower,"next 7 days")||includesWord(lower,"next seven days")) return {start:now,end:new Date(now.getTime()+7*86400000)};
  if(includesWord(lower,"next 30 days")) return {start:now,end:new Date(now.getTime()+30*86400000)};
  if(includesWord(lower,"this week")){ const d=new Date(now); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()-((day+6)%7)); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; }
  if(includesWord(lower,"next week")){ const d=new Date(now); const day=d.getDay(); const mon=new Date(d); mon.setDate(d.getDate()+(7-((day+6)%7))); const sun=new Date(mon); sun.setDate(mon.getDate()+7); return {start:mon,end:sun}; }
  if(includesWord(lower,"this month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth(),1), end:new Date(d.getFullYear(),d.getMonth()+1,1)}; }
  if(includesWord(lower,"next month")){ const d=new Date(now); return {start:new Date(d.getFullYear(),d.getMonth()+1,1), end:new Date(d.getFullYear(),d.getMonth()+2,1)}; }
  if(lower.includes("due before ")||lower.includes("due by ")){ const key=lower.includes("due before ")?"due before ":"due by "; const part=String(q).slice(lower.indexOf(key)+key.length).trim(); const d=tryParseDate(part); if(d) return {end:d}; }
  if(lower.includes("due after ")){ const part=String(q).slice(lower.indexOf("due after ")+10).trim(); const d=tryParseDate(part); if(d) return {start:d}; }
  if(lower.includes("between ")&&lower.includes(" and ")){ const si=lower.indexOf("between ")+8; const ai=lower.indexOf(" and ",si); if(ai>-1){ const a=String(q).slice(si,ai).trim(); const b=String(q).slice(ai+5).trim(); const da=tryParseDate(a); const db=tryParseDate(b); if(da&&db) return {start:da,end:db}; } }
  for(let i=0;i<MONTHS.length;i++){ if(includesWord(lower,MONTHS[i])){ const d=new Date(now.getFullYear(),i,1); const e=new Date(now.getFullYear(),i+1,1); return {start:d,end:e}; } }
  const m=String(q).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?/);
  if(m){ const d=tryParseDate(m[0]); if(d) return {start:d,end:new Date(d.getTime()+86400000)}; }
  return null;
}

function applyAIQuery(projects, query){
  if(!String(query).trim()) return projects;
  let list=[...projects];
  const lower=String(query).toLowerCase();

  // completed / not completed filters
  if (includesWord(lower,"completed on time")) {
    list = list.filter(p => p.completedAt && (!p.milestones?.Installing || new Date(p.completedAt) <= new Date(p.milestones.Installing)));
  } else if (includesWord(lower,"completed late")) {
    list = list.filter(p => p.completedAt && (p.milestones?.Installing && new Date(p.completedAt) > new Date(p.milestones.Installing)));
  } else if (includesWord(lower,"completed")) {
    list = list.filter(p => p.completedAt);
  } else if (includesWord(lower,"not completed") || includesWord(lower,"active only")) {
    list = list.filter(p => !p.completedAt);
  }

  // value over/under
  const over=readAmountAfter(query,"over"); if(over!==null) list=list.filter(p=>p.value>over);
  const under=readAmountAfter(query,"under"); if(under!==null) list=list.filter(p=>p.value<under);

  // phase mentions
  const mentioned=PHASES.filter(ph=>includesWord(lower, ph.toLowerCase()));
  if(mentioned.length) list=list.filter(p=>mentioned.some(ph=>p.milestones?.[ph] || p.phase===ph));

  // overdue keyword (optionally scoped)
  if(includesWord(lower,"overdue")){
    list=list.filter(p=>{
      if(!mentioned.length) return hasOverdue(p);
      return mentioned.some(ph=>{ const d=p.milestones?.[ph]; return d? new Date(d).setHours(0,0,0,0) < todayStart().getTime() : false; });
    });
  }

  // date window
  const range=extractDateRange(lower);
  if(range){
    const start=range.start?range.start.getTime():-Infinity;
    const end=range.end?range.end.getTime():Infinity;
    list=list.filter(p=>{
      const phases=mentioned.length?mentioned:PHASES;
      return phases.some(ph=>{ const d=p.milestones?.[ph]; if(!d) return false; const t=new Date(d).setHours(0,0,0,0); return t>=start && t<=end; });
    });
  }

  // client:
  const ci=lower.indexOf("client:"); if(ci!==-1){ const name=lower.slice(ci+7).trim().split(" ").slice(0,5).join(" "); list=list.filter(p=>p.client.toLowerCase().includes(name)); }

  // focus intent
  if(includesWord(lower,"focus")||includesWord(lower,"right away")||includesWord(lower,"urgent")){
    const soon=todayStart().getTime()+7*86400000;
    list=list.filter(p=> !p.completedAt && (hasOverdue(p) || (getNextUpcoming(p)&&new Date(getNextUpcoming(p).date).getTime()<=soon)) );
    list.sort((a,b)=>priorityScore(b)-priorityScore(a));
  }

  // aging/stalled
  if(includesWord(lower,"stalled")) list=list.filter(p=>isStalled(p));
  const olderMatch=lower.match(/in phase over (\d+)\s*days?/);
  if(olderMatch){ const n=Number(olderMatch[1]); list=list.filter(p=>{ const age=ageInCurrentPhase(p); return age!==null && age>n; }); }

  // follow-ups
  if(includesWord(lower,"follow-ups due")||includesWord(lower,"overdue follow-ups")||includesWord(lower,"follow up due")) list=list.filter(p=>!p.completedAt && followUpStatus(p).due);
  const notContacted=lower.match(/not contacted in (\d+)\s*days?/); if(notContacted){ const n=Number(notContacted[1]); list=list.filter(p=>!p.completedAt && (!p.lastContact || daysSince(p.lastContact)>=n)); }
  if(includesWord(lower,"contacted today")) list=list.filter(p=>p.lastContact && daysSince(p.lastContact)===0);
  if(includesWord(lower,"contacted this week")){
    const now=todayStart(); const day=now.getDay(); const monday=new Date(now); monday.setDate(now.getDate()-((day+6)%7));
    list=list.filter(p=>p.lastContact && new Date(p.lastContact).setHours(0,0,0,0) >= monday.getTime());
  }

  return list;
}

function summarizeQuery(projects, query){
  const list=applyAIQuery(projects, query);
  const count=list.length; const total=list.reduce((s,p)=>s+p.value,0);
  const lower=String(query).toLowerCase(); const wantsList=lower.includes("which")||lower.includes("list")||lower.includes("show");

  if(lower.includes("completed")){
    const lines=list.slice(0,15).map(p=>{
      const ot = p.milestones?.Installing ? (new Date(p.completedAt) <= new Date(p.milestones.Installing)) : null;
      const tag = ot===null ? "" : ot ? "On time" : "Late";
      return `• ${p.id} — ${p.name} — completed ${new Date(p.completedAt).toLocaleDateString()} ${tag?`(${tag})`:""}`;
    }).join("\n");
    return `Completed (${count}):\n${lines}`;
  }

  if(lower.includes("focus")||lower.includes("right away")||lower.includes("urgent")){
    const lines=list.slice(0,12).map(p=>{
      const od=overduePhases(p); const next=getNextUpcoming(p); const age=ageInCurrentPhase(p);
      const badge=od.length?`OVERDUE: ${od.join(" / ")}`:(next?`${next.phase} ${new Date(next.date).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming");
      return `• ${p.id} — ${p.name} (${p.client}) — ${currency(p.value)} — ${badge} — Age ${age ?? "?"}d`;
    }).join("\n");
    return `Focus Now (${count}):\n${lines}`;
  }

  if(lower.includes("follow-ups due")||lower.includes("overdue follow-ups")||lower.includes("follow up due")||lower.match(/not contacted in \d+\s*days?/)){
    const due=list.filter(p=>followUpStatus(p).due);
    const lines=due.slice(0,15).map(p=>`• ${p.id} — ${p.name} (${p.client}) — ${followUpStatus(p).text}`).join("\n");
    return `Follow-ups (${due.length} due, ${list.length} matched):\n${lines}`;
  }

  if(lower.includes("stalled")||lower.match(/in phase over \d+\s*days?/)){
    const lines=list.slice(0,15).map(p=>{
      const age=ageInCurrentPhase(p)??"-"; const lim=STALL_THRESHOLDS[p.phase]??14;
      return `• ${p.id} — ${p.name} (${p.phase}) — Age ${age}d (limit ${lim}d)`;
    }).join("\n");
    return `Stalled / aging (${list.length}):\n${lines}`;
  }

  if(lower.includes("highest value")||lower.includes("top value")||lower.includes("largest")||lower.includes("biggest")||lower.includes("highest total value")){
    const top=[...list].sort((a,b)=>b.value-a.value).slice(0,5);
    const lines=top.map((p,i)=>`${i+1}. ${p.id} — ${p.name} (${p.client}) — ${currency(p.value)}`).join("\n");
    const maxLine=top[0]?`Highest: ${top[0].id} — ${currency(top[0].value)}`:"Highest: (none)";
    return `Top value projects (${count} total, ${currency(total)} combined):\n${lines}\n${maxLine}`;
  }

  if(lower.includes("overdue") && wantsList){
    const lines=list.map(p=>`• ${p.id} — ${p.name} — OVERDUE: ${overduePhases(p).join(", ")}`).join("\n");
    return `${list.length} overdue:\n${lines}`;
  }

  const range=extractDateRange(lower);
  if(range){
    const lines=list.slice(0,20).map(p=>{
      const next=getNextUpcoming(p);
      const badge=next?`${next.phase} ${new Date(next.date).toLocaleDateString()} (${relLabel(next.date)})`:"No upcoming";
      return `• ${p.id} — ${p.name} — ${badge}`;
    }).join("\n");
    return `${count} match in that window • Total ${currency(total)}\n${lines}`;
  }

  if(lower.includes("how many")) return `${count} project${count===1?"":"s"} match.`;
  if(lower.includes("total value")||lower.includes("total amount")||lower.includes("pipeline")) return `Total value for those: ${currency(total)}.`;

  const nextThree=list.map(p=>({p,next:getNextUpcoming(p)})).filter(x=>x.next).sort((a,b)=>new Date(a.next.date)-new Date(b.next.date)).slice(0,3).map(({p,next})=>`${p.id} ${next.phase} (${new Date(next.date).toLocaleDateString()})`);
  return `${count} match • Total ${currency(total)} • Next due: ${nextThree.join(", ") || "(none)"}`;
}

// =====================================
// Blank demo data (no prebuilt projects/quotes)
// =====================================
const PROJECTS = [];   // start empty
const QUOTES   = [];   // start empty

// =====================================
// UI primitives
// =====================================
const Card = ({children,className=""}) => <div className={`rounded-2xl border border-zinc-800 bg-[#0f172a] ${className}`}>{children}</div>;
const CardHeader = ({children,className=""}) => <div className={`px-5 pt-5 ${className}`}>{children}</div>;
const CardTitle = ({children,className=""}) => <h2 className={`text-xl font-semibold text-zinc-100 ${className}`}>{children}</h2>;
const CardContent = ({children,className=""}) => <div className={`px-5 pb-5 ${className}`}>{children}</div>;

// =====================================
// Main App
// =====================================
function App(){
  // load / persist (new key v8)
  const [projects,setProjects]=React.useState(()=>{
    try{ const raw=localStorage.getItem("southwood_projects_v8"); return raw?JSON.parse(raw):PROJECTS; }catch{ return PROJECTS; }
  });
  const [quotes]=React.useState(QUOTES);
  React.useEffect(()=>{ try{ localStorage.setItem("southwood_projects_v8", JSON.stringify(projects)); }catch{} },[projects]);

  // tabs & filters
  const [tab,setTab]=React.useState("projects");
  const [search,setSearch]=React.useState("");
  const [phasesFilter,setPhasesFilter]=React.useState([...PHASES]);
  const [minVal,setMinVal]=React.useState(""); const [maxVal,setMaxVal]=React.useState("");
  const [hideCompleted, setHideCompleted] = React.useState(true);

  // AI
  const [aiQuery,setAiQuery]=React.useState("");
  const [aiAnswer,setAiAnswer]=React.useState("");
  const aiChips=[
    "what should I focus on",
    "which projects are overdue",
    "due next 7 days",
    "highest value projects",
    "stalled",
    "in phase over 14 days",
    "follow-ups due",
    "not contacted in 14 days",
    "contacted this week",
    "completed",
    "completed on time",
    "completed late",
  ];

  // sorting
  const [sortKey,setSortKey]=React.useState("priority"); // project|client|value|phase|next|age|priority
  const [sortDir,setSortDir]=React.useState("desc");

  // inline value edit
  const [editValueId,setEditValueId]=React.useState(null); const [valueDraft,setValueDraft]=React.useState("");

  // edit panel
  const [editId,setEditId]=React.useState(null);
  const [editPhase,setEditPhase]=React.useState("Design");
  const [editMilestones,setEditMilestones]=React.useState({});
  const [editPhaseSince,setEditPhaseSince]=React.useState("");
  const [editLastContact,setEditLastContact]=React.useState("");
  const [editCadence,setEditCadence]=React.useState("14");
  const [editContactPerson,setEditContactPerson]=React.useState("");
  const [editContactEmail,setEditContactEmail]=React.useState("");
  const [editDone, setEditDone] = React.useState({}); // per-phase done dates

  // quick add
  const [qaName,setQaName]=React.useState("");
  const [qaClient,setQaClient]=React.useState("");
  const [qaLocation,setQaLocation]=React.useState("Rock Hill, SC");
  const [qaValue,setQaValue]=React.useState("");
  const [qaPhase,setQaPhase]=React.useState("Design");
  const [qaContact,setQaContact]=React.useState("");
  const [qaEmail,setQaEmail]=React.useState("");
  const [qaCadence,setQaCadence]=React.useState("14");

  const [toast,setToast]=React.useState("");

  // utils
  const togglePhaseFilter=(ph)=>setPhasesFilter(prev=>prev.includes(ph)?prev.filter(x=>x!==ph):[...prev,ph]);
  function runClear(){ setPhasesFilter([...PHASES]); setMinVal(""); setMaxVal(""); setAiQuery(""); setAiAnswer(""); setSearch(""); setSortKey("priority"); setSortDir("desc"); setHideCompleted(true); }

  // Add project
  function addProject(){
    const valueNum=Number(String(qaValue).replace(/,/g,""));
    if(!qaName||!qaClient||Number.isNaN(valueNum)){ setToast("Fill Project Name, Client, and a numeric Value."); setTimeout(()=>setToast(""),2000); return; }
    const base=todayStart();
    const milestones={ Design:addDaysISO(base,7), Estimating:addDaysISO(base,14), Permitting:addDaysISO(base,28), Surveying:addDaysISO(base,35), Manufacturing:addDaysISO(base,60), Installing:addDaysISO(base,75) };
    const newP={
      id: nextId(projects),
      name: qaName.trim(),
      client: qaClient.trim(),
      location: qaLocation.trim() || "Rock Hill, SC",
      value: valueNum,
      phase: qaPhase,
      milestones,
      phaseSince: todayStart().toISOString().slice(0,10),
      tags: [],
      contactPerson: qaContact.trim(),
      contactEmail: qaEmail.trim(),
      lastContact: null,
      cadenceDays: Number(qaCadence || "14"),
      done: {},          // per-phase done dates
      completedAt: null, // overall completion date
    };
    setProjects(prev=>[newP,...prev]);
    setQaName(""); setQaClient(""); setQaLocation("Rock Hill, SC"); setQaValue(""); setQaPhase("Design"); setQaContact(""); setQaEmail(""); setQaCadence("14");
    setToast(`Added ${newP.id}`); setTimeout(()=>setToast(""),1500);
  }

  // Edit flow
  function startEdit(p){
    setEditId(p.id); setEditPhase(p.phase); setEditMilestones({...p.milestones}); setEditPhaseSince(p.phaseSince||"");
    setEditLastContact(p.lastContact||""); setEditCadence(String(p.cadenceDays||14)); setEditContactPerson(p.contactPerson||""); setEditContactEmail(p.contactEmail||"");
    setEditDone({ ...(p.done || {}) });
  }
  function saveEdit(){
    if(!editId) return;
    setProjects(prev=>prev.map(p=> p.id===editId ? {
      ...p,
      phase: editPhase,
      milestones: { ...editMilestones },
      phaseSince: p.phase!==editPhase ? (editPhaseSince||todayStart().toISOString().slice(0,10)) : (editPhaseSince||p.phaseSince||todayStart().toISOString().slice(0,10)),
      lastContact: editLastContact || null,
      cadenceDays: Number(editCadence||"14"),
      contactPerson: editContactPerson.trim(),
      contactEmail: editContactEmail.trim(),
      done: { ...(p.done || {}), ...editDone },
      ...(editDone?.Installing ? { completedAt: editDone.Installing } : {})
    } : p));
    setEditId(null);
  }

  // Inline value edit
  function beginValueEdit(p){ setEditValueId(p.id); setValueDraft(String(p.value)); }
  function commitValueEdit(p){
    const v=Number(String(valueDraft).replace(/,/g,"")); if(!Number.isFinite(v)){ setEditValueId(null); return; }
    setProjects(prev=>prev.map(x=>x.id===p.id?{...x,value:v}:x)); setEditValueId(null);
  }

  // Contacts
  function logContact(p){
    const iso=todayStart().toISOString().slice(0,10);
    setProjects(prev=>prev.map(x=>x.id===p.id?{...x,lastContact:iso}:x));
    setToast(`Logged contact for ${p.id}`); setTimeout(()=>setToast(""),1500);
  }
  function emailContact(p){
    const to=encodeURIComponent(p.contactEmail||"");
    const subject=encodeURIComponent(`Southwood — ${p.id} ${p.name} update`);
    const next=getNextUpcoming(p); const od=overduePhases(p);
    const body=[`Hi ${p.contactPerson||"there"},`,"",`Quick update on ${p.name} (${p.id}).`, next?`• Next due: ${next.phase} on ${new Date(next.date).toLocaleDateString()}`:"• No upcoming milestones on the schedule", od.length?`• Overdue phases: ${od.join(", ")}`:"", "", "Let me know if you have any questions.","","— Southwood PM"].join("\n");
    window.location.href=`mailto:${to}?subject=${subject}&body=${encodeURIComponent(body)}`;
  }

  // Delete
  function deleteProject(p){
    if(!confirm(`Delete ${p.id} — ${p.name}? This cannot be undone.`)) return;
    setProjects(prev=>prev.filter(x=>x.id!==p.id));
  }
  function clearAll(){
    if(!projects.length){ setToast("No projects to clear."); setTimeout(()=>setToast(""),1500); return; }
    if(!confirm("Clear ALL projects? This cannot be undone.")) return;
    setProjects([]);
  }

  // Completion actions (closures over setProjects)
  function markPhaseDone(p, ph, dateISO = todayStart().toISOString().slice(0,10)) {
    setProjects(prev => prev.map(x => {
      if (x.id !== p.id) return x;
      const updated = { ...x, done: { ...(x.done || {}), [ph]: dateISO } };
      // Auto-advance (ask)
      if (x.phase === ph && !x.completedAt) {
        const nxt = nextPhase(ph);
        if (nxt && confirm(`Move ${x.id} to next phase (${nxt})?`)) {
          updated.phase = nxt;
          updated.phaseSince = dateISO;
        } else {
          updated.phaseSince = dateISO;
        }
      }
      if (ph === "Installing") updated.completedAt = dateISO;
      return updated;
    }));
  }
  function completeProject(p, dateISO = todayStart().toISOString().slice(0,10)) {
    setProjects(prev => prev.map(x => x.id === p.id ? {
      ...x,
      done: { ...(x.done || {}), Installing: dateISO },
      completedAt: dateISO
    } : x));
  }

  // AI
  function runAI(){ if(!aiQuery.trim()){ setAiAnswer("Type a question or pick a chip."); return; } setAiAnswer(summarizeQuery(projects, aiQuery)); }

  // Derived list
  const filtered=React.useMemo(()=>{
    let list=projects.filter(p=>phasesFilter.includes(p.phase));
    if(minVal) list=list.filter(p=>p.value>=Number(minVal));
    if(maxVal) list=list.filter(p=>p.value<=Number(maxVal));
    if(hideCompleted) list=list.filter(p=>!p.completedAt);
    if(search.trim()){ const s=search.toLowerCase(); list=list.filter(p=>[p.id,p.name,p.client,p.location,p.contactPerson,p.contactEmail].some(x=>String(x||"").toLowerCase().includes(s))); }
    if(aiQuery.trim()) list=applyAIQuery(list, aiQuery);

    // Sorting
    const cmpAsc=(a,b)=>(a<b?-1:a>b?1:0), cmpDesc=(a,b)=>(a<b?1:a>b?-1:0);
    list.sort((A,B)=>{
      let a,b;
      switch (sortKey){
        case "project": a=A.name.toLowerCase(); b=B.name.toLowerCase(); break;
        case "client":  a=A.client.toLowerCase(); b=B.client.toLowerCase(); break;
        case "value":   a=A.value; b=B.value; break;
        case "phase":   a=A.phase; b=B.phase; break;
        case "next": { const na=(getNextUpcoming(A)?.date||"9999-12-31"); const nb=(getNextUpcoming(B)?.date||"9999-12-31"); a=new Date(na).getTime(); b=new Date(nb).getTime(); break; }
        case "age": a=ageInCurrentPhase(A)??0; b=ageInCurrentPhase(B)??0; break;
        default: a=priorityScore(A); b=priorityScore(B); break;
      }
      return (sortDir==="asc"?cmpAsc:cmpDesc)(a,b);
    });
    return list;
  },[projects,phasesFilter,minVal,maxVal,search,aiQuery,sortKey,sortDir,hideCompleted]);

  // KPIs (exclude completed)
  const kpi=React.useMemo(()=>{
    const activeList = projects.filter(p=>!p.completedAt);
    const now=todayStart().getTime(); const in30=now+30*86400000;
    const dueSoon=activeList.filter(p=>PHASES.some(ph=>{ const d=p.milestones?.[ph]; if(!d) return false; const t=new Date(d).getTime(); return t>=now && t<=in30; })).length;
    const atRisk=activeList.filter(p=>hasOverdue(p)).length;
    const totalValue=activeList.reduce((s,p)=>s+p.value,0);
    const pipeline=quotes.reduce((acc,q)=>acc+q.amount*q.probability,0);
    const ages=activeList.map(p=>ageInCurrentPhase(p)).filter(x=>x!==null);
    const avgAge=ages.length?Math.round(ages.reduce((a,b)=>a+b,0)/ages.length):0;
    const stalled=activeList.filter(p=>isStalled(p)).length;
    const followDue=activeList.filter(p=>followUpStatus(p).due).length;
    const completedCount = projects.length - activeList.length;
    return { active:activeList.length, pipeline, dueSoon, atRisk, totalValue, avgAge, stalled, followDue, completedCount };
  },[projects,quotes]);

  // header sort UI
  function headerSort(label,key){
    const active=sortKey===key; const arrow=active?(sortDir==="asc"?"▲":"▼"):"↕";
    return (
      <button
        onClick={()=>{ if(sortKey===key) setSortDir(d=>d==="asc"?"desc":"asc"); else { setSortKey(key); setSortDir(key==="project"||key==="client"||key==="phase"?"asc":"desc"); } }}
        className={`inline-flex items-center gap-1 select-none ${active?"text-zinc-200":"text-zinc-400"} hover:text-zinc-100`}
        title={`Sort by ${label}`}
      >
        <span>{label}</span><span className="text-xs">{arrow}</span>
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b1020] text-zinc-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-50 border-b border-zinc-800/60 bg-gradient-to-b from-[#0b1020] to-[#0b1020]/80 backdrop-blur supports-[backdrop-filter]:bg-[#0b1020]/70">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-emerald-500 grid place-items-center font-bold">S</div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">Southwood Project Tracker</h1>
              <p className="text-xs text-zinc-400">Rock Hill, SC • PM Companion</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search by ID, client, location, contact…" className="w-72 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600" />
            <select value={sortKey} onChange={(e)=>setSortKey(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
              <option value="priority">Sort: Priority</option>
              <option value="project">Sort: Project</option>
              <option value="client">Sort: Client</option>
              <option value="value">Sort: Value</option>
              <option value="phase">Sort: Phase</option>
              <option value="next">Sort: Next Due</option>
              <option value="age">Sort: Age</option>
            </select>
            <label className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-2 rounded-lg text-sm">
              <input type="checkbox" checked={hideCompleted} onChange={()=>setHideCompleted(v=>!v)} />
              <span>Hide completed</span>
            </label>
            <button onClick={runClear} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">Reset</button>
            <button onClick={clearAll} className="px-3 py-2 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Clear All Projects</button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        {/* Left: KPIs + Projects/Quotes/Calendar */}
        <section className="lg:col-span-2 space-y-6">
          {/* KPIs */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-5 gap-4">
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Active Projects</p><p className="text-3xl mt-2 font-semibold">{kpi.active}</p><p className="text-xs text-zinc-400 mt-1">Completed hidden by default (Done: {kpi.completedCount})</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Pipeline (Weighted)</p><p className="text-3xl mt-2 font-semibold">{currency(kpi.pipeline)}</p><p className="text-xs text-zinc-400 mt-1">Quotes × probability</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Milestones due ≤30d</p><p className="text-3xl mt-2 font-semibold">{kpi.dueSoon}</p><p className="text-xs text-zinc-400 mt-1">Across all phases</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Overdue</p><p className="text-3xl mt-2 font-semibold">{kpi.atRisk}</p><p className="text-xs text-zinc-400 mt-1">Any overdue phase</p></CardContent></Card>
            <Card><CardContent className="p-5"><p className="text-xs uppercase tracking-widest text-zinc-400">Avg Days in Phase</p><p className="text-3xl mt-2 font-semibold">{kpi.avgAge}</p><p className="text-xs text-zinc-400 mt-1">Stalled: {kpi.stalled} • Follow-ups Due: {kpi.followDue}</p></CardContent></Card>
          </div>

          {/* Tabs */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <button onClick={()=>setTab("projects")} className={`px-3 py-1.5 rounded-lg border ${tab==="projects"?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>List</button>
                <button onClick={()=>setTab("quotes")} className={`px-3 py-1.5 rounded-lg border ${tab==="quotes"  ?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>Quotes</button>
                <button onClick={()=>setTab("calendar")} className={`px-3 py-1.5 rounded-lg border ${tab==="calendar"?"bg-zinc-800 border-zinc-600":"bg-zinc-900 border-zinc-800"}`}>Calendar</button>
              </div>
            </CardHeader>
            <CardContent>
              {tab==="projects" && (
                <div className="space-y-4">
                  {/* Filters */}
                  <div className="flex flex-wrap items-end gap-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      {PHASES.map(s=>(
                        <label key={s} className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
                          <input type="checkbox" checked={phasesFilter.includes(s)} onChange={()=>togglePhaseFilter(s)} />
                          <span>{s}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <input value={minVal} onChange={(e)=>setMinVal(e.target.value)} placeholder="Min $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5" />
                      <input value={maxVal} onChange={(e)=>setMaxVal(e.target.value)} placeholder="Max $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5" />
                    </div>
                  </div>

                  {/* AI */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") runAI(); }} placeholder="Try: completed on time • completed late • follow-ups due • stalled • in phase over 14 days • due next 7 days • highest value projects" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                      <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
                      <button onClick={()=>{ setAiQuery(""); setAiAnswer(""); }} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {aiChips.map(c=>(
                        <button key={c} onClick={()=>{ setAiQuery(c); setTimeout(runAI,0); }} className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">{c}</button>
                      ))}
                    </div>
                  </div>

                  {aiAnswer && <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap text-zinc-200">{aiAnswer}</div>}

                  {/* Table */}
                  <div className="overflow-auto border border-zinc-800 rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                        <tr>
                          <th className="text-left py-3 px-3">{headerSort("Project","project")}</th>
                          <th className="text-left py-3 px-3">{headerSort("Client","client")}</th>
                          <th className="text-left py-3 px-3">{headerSort("Value","value")}</th>
                          <th className="text-left py-3 px-3">{headerSort("Phase","phase")}</th>
                          <th className="text-left py-3 px-3">{headerSort("Next / Status","next")}</th>
                          <th className="text-left py-3 px-3">{headerSort("Age (days)","age")}</th>
                          <th className="text-left py-3 px-3">Risk</th>
                          <th className="text-left py-3 px-3">Follow-up</th>
                          <th className="text-right py-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(p=>{
                          const next=getNextUpcoming(p);
                          const overdue=overduePhases(p);
                          const risk=riskTier(p);
                          const age=ageInCurrentPhase(p);
                          const stalled=isStalled(p);
                          const fup=followUpStatus(p);

                          return (
                            <React.Fragment key={p.id}>
                              <tr className={`border-t border-zinc-800 text-zinc-200 align-top ${risk.row}`}>
                                <td className="py-3 px-3 font-medium">
                                  <span className="inline-flex items-center gap-2">
                                    <span className="bg-zinc-800 text-[11px] px-2 py-0.5 rounded-full">{p.id}</span>
                                    {p.name}
                                  </span>
                                  <div className="text-xs text-zinc-500">{p.location}</div>
                                  {(p.contactPerson||p.contactEmail) && <div className="text-xs text-zinc-500 mt-0.5">Contact: {p.contactPerson||"—"} {p.contactEmail?`• ${p.contactEmail}`:""}</div>}
                                </td>

                                <td className="py-3 px-3">{p.client}</td>

                                {/* Inline value edit */}
                                <td className="py-3 px-3 font-semibold">
                                  {editValueId===p.id ? (
                                    <input autoFocus value={valueDraft} onChange={(e)=>setValueDraft(e.target.value)} onBlur={()=>commitValueEdit(p)} onKeyDown={(e)=>{ if(e.key==="Enter") commitValueEdit(p); if(e.key==="Escape") setEditValueId(null); }} className="w-28 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"/>
                                  ) : (
                                    <button onClick={()=>beginValueEdit(p)} className="hover:underline">{currency(p.value)}</button>
                                  )}
                                </td>

                                <td className="py-3 px-3"><span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-white text-xs ${phaseColor[p.phase]}`}>{p.phase}</span></td>

                                {/* Next / Status */}
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {p.completedAt ? (
                                    <span>
                                      <span className="font-medium">Completed</span> • {new Date(p.completedAt).toLocaleDateString()}
                                      {p.milestones?.Installing && (
                                        <span className={`ml-2 text-xs ${new Date(p.completedAt) <= new Date(p.milestones.Installing) ? "text-emerald-300" : "text-rose-300"}`}>
                                          {new Date(p.completedAt) <= new Date(p.milestones.Installing) ? "On time" : "Late"}
                                        </span>
                                      )}
                                    </span>
                                  ) : (
                                    <>
                                      {next ? (
                                        <span>
                                          {next.phase} • {new Date(next.date).toLocaleDateString()} (<span className="text-zinc-400">{relLabel(next.date)}</span>)
                                          {/* Show on-time of that phase when done */}
                                          {p.done?.[next.phase] && (
                                            <span className={`ml-2 text-xs ${isPhaseOnTime(p,next.phase) ? "text-emerald-300" : "text-rose-300"}`}>
                                              {isPhaseOnTime(p,next.phase) ? "On time" : "Late"}
                                            </span>
                                          )}
                                          <button onClick={()=>addMilestoneICS(p)} className="ml-2 text-xs underline text-emerald-300 hover:text-emerald-200">Add to calendar</button>
                                        </span>
                                      ) : (<span className="text-zinc-400">No upcoming</span>)}
                                      {overdue.length>0 && <span className="block text-xs text-rose-400">Overdue: {overdue.join(", ")}</span>}
                                    </>
                                  )}
                                </td>

                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-2"><span className="text-sm">{age ?? "—"}</span>{stalled && <span className="text-xs text-rose-300">• Stalled</span>}</div>
                                </td>

                                <td className="py-3 px-3"><span className={`inline-block text-xs px-2 py-1 rounded-lg ${risk.badge}`}>{risk.tier}</span></td>

                                <td className="py-3 px-3 whitespace-nowrap">
                                  <div className={`text-xs ${fup.class}`}>{fup.text}</div>
                                  <div className="text-xs text-zinc-500">Last: {p.lastContact?new Date(p.lastContact).toLocaleDateString():"—"} • Cadence: {p.cadenceDays||14}d</div>
                                  {!p.completedAt && <button onClick={()=>addFollowUpICS(p)} className="mt-1 text-xs underline text-emerald-300 hover:text-emerald-200">Add reminder</button>}
                                </td>

                                <td className="py-3 px-3 text-right space-x-2">
                                  {!p.completedAt && (
                                    <>
                                      <button onClick={()=>markPhaseDone(p, p.phase)} title="Stamp current phase as finished today (optionally advance)" className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Done Phase</button>
                                      <button onClick={()=>completeProject(p)} title="Mark entire project as complete today" className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-sm">Complete</button>
                                    </>
                                  )}
                                  <button onClick={()=>emailContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Email</button>
                                  <button onClick={()=>logContact(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Log</button>
                                  <button onClick={()=>startEdit(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Edit</button>
                                  <button onClick={()=>deleteProject(p)} className="px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-sm">Delete</button>
                                </td>
                              </tr>

                              {/* Edit row */}
                              {editId===p.id && (
                                <tr className="bg-zinc-950/60 border-t border-zinc-900">
                                  <td colSpan={9} className="px-4 py-4">
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Current Phase</label>
                                        <select value={editPhase} onChange={(e)=>setEditPhase(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                                          {PHASES.map(ph=><option key={ph} value={ph}>{ph}</option>)}
                                        </select>
                                      </div>
                                      {PHASES.map(ph=>(
                                        <div key={ph} className="space-y-2">
                                          <label className="text-xs text-zinc-400">{ph} Due Date</label>
                                          <input type="date" value={editMilestones[ph]||""} onChange={(e)=>setEditMilestones(m=>({ ...m, [ph]: e.target.value }))} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                          <div className="flex items-center gap-2">
                                            <label className="text-xs text-zinc-400 w-28">Done Date</label>
                                            <input type="date" value={editDone[ph]||""} onChange={(e)=>setEditDone(d=>({ ...d, [ph]: e.target.value }))} className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                          </div>
                                          {editDone[ph] && (
                                            <div className={`text-xs ${isPhaseOnTime({ milestones: editMilestones, done: editDone }, ph) ? "text-emerald-300" : "text-rose-300"}`}>
                                              {isPhaseOnTime({ milestones: editMilestones, done: editDone }, ph) ? "On time" : "Late"}
                                            </div>
                                          )}
                                        </div>
                                      ))}
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Phase Since</label>
                                        <input type="date" value={editPhaseSince} onChange={(e)=>setEditPhaseSince(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Last Contact</label>
                                        <input type="date" value={editLastContact} onChange={(e)=>setEditLastContact(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Cadence (days)</label>
                                        <input type="number" min="1" value={editCadence} onChange={(e)=>setEditCadence(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Contact Person</label>
                                        <input value={editContactPerson} onChange={(e)=>setEditContactPerson(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                                      </div>
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Contact Email</label>
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
                          <tr><td colSpan={9} className="py-6 text-center text-zinc-400">No projects yet — use <b>Quick Add</b> on the right.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab==="quotes" && (
                <div className="rounded-xl border border-zinc-800 p-6 text-zinc-300">
                  <p className="text-sm">No quotes configured. (You can extend this later with a Quick Add for quotes.)</p>
                </div>
              )}

              {tab==="calendar" && (
                <div className="rounded-xl border border-zinc-800 p-6 text-zinc-300">
                  <p className="mb-2 font-medium text-zinc-200">Install & Phase Dates (mock)</p>
                  <p className="text-sm">A compact calendar/Gantt view would live here so you can scan deadlines for each phase at a glance. Use the Edit button in the List to set exact due dates per phase.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Right: AI + Quick Add */}
        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>AI Assistant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-zinc-300">
                Ask anything — it filters the table and summarizes:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>completed / completed on time / completed late</li>
                  <li>follow-ups due / not contacted in 14 days / contacted this week</li>
                  <li>what should I focus on</li>
                  <li>which projects are overdue</li>
                  <li>stalled / in phase over 14 days</li>
                  <li>due next 7 days</li>
                  <li>highest value projects</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if(e.key==="Enter") runAI(); }} placeholder="Type a question or pick a chip…" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {aiChips.map(c=>(
                  <button key={c} onClick={()=>{ setAiQuery(c); setTimeout(runAI,0); }} className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">{c}</button>
                ))}
              </div>
              {aiAnswer && <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap text-zinc-200">{aiAnswer}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Quick Add</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <input value={qaName} onChange={(e)=>setQaName(e.target.value)} placeholder="Project Name" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
              <div className="flex gap-2">
                <input value={qaClient} onChange={(e)=>setQaClient(e.target.value)} placeholder="Client" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                <input value={qaLocation} onChange={(e)=>setQaLocation(e.target.value)} placeholder="Location" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div className="flex gap-2 items-center">
                <input value={qaValue} onChange={(e)=>setQaValue(e.target.value)} placeholder="Value ($)" inputMode="numeric" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                <select value={qaPhase} onChange={(e)=>setQaPhase(e.target.value)} className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                  {PHASES.map(s=><option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <input value={qaContact} onChange={(e)=>setQaContact(e.target.value)} placeholder="Contact Person" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
                <input value={qaEmail} onChange={(e)=>setQaEmail(e.target.value)} placeholder="Contact Email" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <div className="flex gap-2">
                <input value={qaCadence} onChange={(e)=>setQaCadence(e.target.value)} placeholder="Cadence (days)" inputMode="numeric" className="w-40 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"/>
              </div>
              <button onClick={addProject} className="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm font-medium">Add Project</button>
              <p className="text-xs text-zinc-400">New projects auto-seed milestones; set exact dates & done dates via <b>Edit</b>. Phase aging starts today.</p>
            </CardContent>
          </Card>
        </aside>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-10 text-xs text-zinc-500">
        Blank start • Completion tracking • On-time/Late • Hide completed • Delete per row • ICS reminders • Risk tints • Click-to-sort • Inline value edit • AI chips • Aging & stalled • Follow-up tracking • Local persistence
      </footer>

      {toast && <div className="fixed bottom-4 right-4 bg-zinc-900 border border-zinc-700 text-sm px-3 py-2 rounded-lg">{toast}</div>}
    </div>
  );
}

// =====================================
// Mount
// =====================================
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);
