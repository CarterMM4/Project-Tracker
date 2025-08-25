// Southwood Project Tracker — Priority AI (no build tools)
// Runs with React/ReactDOM + Babel + Tailwind via CDN (see index.html)

// ------------------------------
// Helpers & Constants (plain JS)
// ------------------------------
const PHASES = [
  "Design",
  "Estimating",
  "Permitting",
  "Surveying",
  "Manufacturing",
  "Installing",
];

const MONTHS = [
  "january","february","march","april","may","june",
  "july","august","september","october","november","december"
];

const phaseColor = {
  Design: "bg-sky-600",
  Estimating: "bg-indigo-600",
  Permitting: "bg-amber-600",
  Surveying: "bg-teal-600",
  Manufacturing: "bg-fuchsia-600",
  Installing: "bg-emerald-600",
};

const currency = (n) =>
  Number(n).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });

function todayStart() {
  const t = new Date();
  t.setHours(0,0,0,0);
  return t;
}
function addDaysISO(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0,10);
}
function addDaysDate(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  d.setHours(0,0,0,0);
  return d;
}
function includesWord(haystack, needle) {
  const s = ` ${String(haystack).toLowerCase()} `;
  const n = ` ${String(needle).toLowerCase()} `;
  return s.includes(n);
}
function readAmountAfter(text, keyword) {
  const lower = String(text).toLowerCase();
  const idx = lower.indexOf(String(keyword).toLowerCase());
  if (idx === -1) return null;
  const slice = text.slice(idx + keyword.length);
  const digits = [];
  for (const ch of slice) {
    if ((ch >= "0" && ch <= "9") || ch === ",") digits.push(ch);
    else if (ch === " " || ch === "$") continue;
    else break;
  }
  const raw = digits.join("").replace(/,/g, "");
  const num = Number(raw);
  return Number.isFinite(num) && raw.length > 0 ? num : null;
}
function tryParseDate(text) {
  const d = new Date(text);
  return isNaN(d.getTime()) ? null : d;
}

function getOverallDue(milestones) {
  const dates = PHASES.map((p) => milestones[p]).filter(Boolean);
  if (!dates.length) return null;
  return dates.sort(
    (a,b) => new Date(b).getTime() - new Date(a).getTime()
  )[0];
}
function getNextUpcoming(project) {
  const t0 = todayStart().getTime();
  const future = [];
  for (const ph of PHASES) {
    const d = project.milestones[ph];
    if (d) {
      const t = new Date(d).setHours(0,0,0,0);
      if (t >= t0) future.push({ phase: ph, date: d });
    }
  }
  if (!future.length) return null;
  future.sort((a,b) => new Date(a.date) - new Date(b.date));
  return future[0];
}
function overduePhases(project) {
  const t0 = todayStart().getTime();
  return PHASES.filter((ph) => {
    const d = project.milestones[ph];
    return d ? new Date(d).setHours(0,0,0,0) < t0 : false;
  });
}
function hasOverdue(project) {
  return overduePhases(project).length > 0;
}
function daysUntil(dateISO) {
  const t0 = todayStart().getTime();
  const t1 = new Date(dateISO).setHours(0,0,0,0);
  return Math.round((t1 - t0) / (1000*60*60*24));
}
function relLabel(dateISO) {
  const d = daysUntil(dateISO);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  if (d < 0) return `${Math.abs(d)}d overdue`;
  return `in ${d}d`;
}
function priorityScore(p) {
  const overdue = overduePhases(p);
  if (overdue.length) {
    const worst = Math.min(...overdue.map((ph) => daysUntil(p.milestones[ph])));
    return 100000 + Math.abs(worst)*100 + p.value/1000;
  }
  const next = getNextUpcoming(p);
  const d = next ? daysUntil(next.date) : 9999;
  return (60 - Math.min(d, 60))*100 + p.value/1000;
}
function groupTotalsByClient(projects) {
  const map = new Map();
  for (const p of projects) {
    const v = map.get(p.client) || { total:0, count:0 };
    v.total += p.value; v.count += 1;
    map.set(p.client, v);
  }
  return [...map.entries()]
    .map(([client, v]) => ({ client, ...v }))
    .sort((a,b) => b.total - a.total);
}

// Natural date window parsing for queries
function extractDateRange(q) {
  const lower = String(q).toLowerCase();
  const now = todayStart();

  if (includesWord(lower, "today"))    return { start: now, end: addDaysDate(now, 1) };
  if (includesWord(lower, "tomorrow")) return { start: addDaysDate(now, 1), end: addDaysDate(now, 2) };
  if (includesWord(lower, "next 7 days") || includesWord(lower, "next seven days"))
    return { start: now, end: addDaysDate(now, 7) };
  if (includesWord(lower, "next 30 days"))
    return { start: now, end: addDaysDate(now, 30) };

  if (includesWord(lower, "this week")) {
    const d = new Date(now);
    const day = d.getDay();
    const monday = addDaysDate(d, -((day + 6) % 7));
    const sunday = addDaysDate(monday, 7);
    return { start: monday, end: sunday };
  }
  if (includesWord(lower, "next week")) {
    const d = new Date(now);
    const day = d.getDay();
    const monday = addDaysDate(d, 7 - ((day + 6) % 7));
    const sunday = addDaysDate(monday, 7);
    return { start: monday, end: sunday };
  }
  if (includesWord(lower, "this month")) {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth()+1, 1);
    return { start, end };
  }
  if (includesWord(lower, "next month")) {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth()+1, 1);
    const end   = new Date(d.getFullYear(), d.getMonth()+2, 1);
    return { start, end };
  }

  if (lower.includes("due before ") || lower.includes("due by ")) {
    const key = lower.includes("due before ") ? "due before " : "due by ";
    const part = q.slice(lower.indexOf(key) + key.length).trim();
    const d = tryParseDate(part);
    if (d) return { end: d };
  }
  if (lower.includes("due after ")) {
    const part = q.slice(lower.indexOf("due after ") + 10).trim();
    const d = tryParseDate(part);
    if (d) return { start: d };
  }
  if (lower.includes("between ") && lower.includes(" and ")) {
    const startIdx = lower.indexOf("between ") + 8;
    const andIdx = lower.indexOf(" and ", startIdx);
    if (andIdx > -1) {
      const a = q.slice(startIdx, andIdx).trim();
      const b = q.slice(andIdx + 5).trim();
      const da = tryParseDate(a);
      const db = tryParseDate(b);
      if (da && db) return { start: da, end: db };
    }
  }

  for (let i=0; i<MONTHS.length; i++) {
    if (includesWord(lower, MONTHS[i])) {
      const d = new Date(now.getFullYear(), i, 1);
      const end = new Date(now.getFullYear(), i+1, 1);
      return { start: d, end };
    }
  }

  const m = String(q).match(/\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2}(?:,\s*\d{4})?/);
  if (m) {
    const d = tryParseDate(m[0]);
    if (d) return { start: d, end: addDaysDate(d, 1) };
  }
  return null;
}

// ------------------------------
// Demo Data
// ------------------------------
const PROJECTS = [
  {
    id: "SW-2401",
    name: "Atrium Health – Parking Garages",
    client: "Atrium Health",
    location: "Charlotte, NC",
    value: 185000,
    marginPct: 0.34,
    phase: "Manufacturing",
    milestones: {
      Design: "2025-08-22",
      Estimating: "2025-08-25",
      Permitting: "2025-09-01",
      Surveying: "2025-09-05",
      Manufacturing: "2025-09-18",
      Installing: "2025-09-20",
    },
    owner: "Carter Munson",
    tags: ["Exterior", "Wayfinding"],
  },
  {
    id: "SW-2402",
    name: "JLL Uptown Tower – Interior Package",
    client: "JLL",
    location: "Charlotte, NC",
    value: 92000,
    marginPct: 0.29,
    phase: "Surveying",
    milestones: {
      Design: "2025-08-26",
      Estimating: "2025-08-28",
      Permitting: "2025-09-10",
      Surveying: "2025-09-12",
      Manufacturing: "2025-09-25",
      Installing: "2025-10-05",
    },
    owner: "Carter Munson",
    tags: ["Interior", "Code"],
  },
  {
    id: "SW-2403",
    name: "CLT Airport – Concourse F Refresh",
    client: "CLT Airport",
    location: "Charlotte, NC",
    value: 410000,
    marginPct: 0.31,
    phase: "Permitting",
    milestones: {
      Design: "2025-08-24",
      Estimating: "2025-08-27",
      Permitting: "2025-09-02",
      Surveying: "2025-09-06",
      Manufacturing: "2025-09-20",
      Installing: "2025-10-01",
    },
    owner: "Southwood Team",
    tags: ["Aviation", "Permitting"],
  },
  {
    id: "SW-2404",
    name: "Rock Hill Sports Center – Naming",
    client: "City of Rock Hill",
    location: "Rock Hill, SC",
    value: 145000,
    marginPct: 0.27,
    phase: "Estimating",
    milestones: {
      Design: "2025-08-25",
      Estimating: "2025-09-03",
      Permitting: "2025-09-10",
      Surveying: "2025-09-14",
      Manufacturing: "2025-09-28",
      Installing: "2025-10-03",
    },
    owner: "C. Munson",
    tags: ["Exterior", "Channel Letters"],
  },
  {
    id: "SW-2405",
    name: "Novant Ballantyne – Monument Sign",
    client: "Novant Health",
    location: "Charlotte, NC",
    value: 56000,
    marginPct: 0.25,
    phase: "Design",
    milestones: {
      Design: "2025-09-01",
      Estimating: "2025-09-05",
      Permitting: "2025-09-12",
      Surveying: "2025-09-16",
      Manufacturing: "2025-09-30",
      Installing: "2025-10-04",
    },
    owner: "J. Smith",
    tags: ["Monument", "Lighting"],
  },
  {
    id: "SW-2406",
    name: "Ally Corporate – Garage Directionals",
    client: "Ally",
    location: "Charlotte, NC",
    value: 78000,
    marginPct: 0.32,
    phase: "Installing",
    milestones: {
      Design: "2025-07-28",
      Estimating: "2025-07-31",
      Permitting: "2025-08-02",
      Surveying: "2025-08-05",
      Manufacturing: "2025-08-07",
      Installing: "2025-08-08",
    },
    owner: "Install Crew A",
    tags: ["Wayfinding"],
  },
];

const QUOTES = [
  { id: "Q-901", client: "Atrium Health", projectName: "Parking Garages", amount: 185000, probability: 0.8, status: "Sent", created: "2025-08-08" },
  { id: "Q-902", client: "JLL", projectName: "Uptown Tower – Interior", amount: 92000, probability: 0.6, status: "Negotiating", created: "2025-08-12" },
  { id: "Q-903", client: "CLT Airport", projectName: "Concourse F Refresh", amount: 410000, probability: 0.5, status: "Sent", created: "2025-08-15" },
  { id: "Q-904", client: "City of Rock Hill", projectName: "Sports Center Naming", amount: 145000, probability: 0.4, status: "Draft", created: "2025-08-19" },
  { id: "Q-905", client: "Novant Health", projectName: "Ballantyne Monument", amount: 56000, probability: 0.3, status: "Draft", created: "2025-08-02" },
];

// ------------------------------
// “AI” filtering & summarizing
// ------------------------------
function applyAIQuery(projects, query) {
  if (!String(query).trim()) return projects;
  let filtered = [...projects];
  const lower = String(query).toLowerCase();

  // Numeric ranges
  const over = readAmountAfter(query, "over");
  if (over !== null) filtered = filtered.filter((p) => p.value > over);
  const under = readAmountAfter(query, "under");
  if (under !== null) filtered = filtered.filter((p) => p.value < under);

  // Phase hints
  const mentionedPhases = PHASES.filter((ph) => includesWord(lower, ph.toLowerCase()));
  if (mentionedPhases.length) {
    filtered = filtered.filter((p) => mentionedPhases.some((ph) => p.milestones[ph] || p.phase === ph));
  }

  // Overdue keyword (optionally scoped by mentioned phases)
  if (includesWord(lower, "overdue")) {
    filtered = filtered.filter((p) => {
      if (!mentionedPhases.length) return hasOverdue(p);
      return mentionedPhases.some((ph) => {
        const d = p.milestones[ph];
        return d ? new Date(d).setHours(0,0,0,0) < todayStart().getTime() : false;
      });
    });
  }

  // Date window
  const range = extractDateRange(lower);
  if (range) {
    const start = range.start ? range.start.getTime() : -Infinity;
    const end   = range.end   ? range.end.getTime()   : Infinity;
    filtered = filtered.filter((p) => {
      const phases = mentionedPhases.length ? mentionedPhases : PHASES;
      return phases.some((ph) => {
        const d = p.milestones[ph];
        if (!d) return false;
        const t = new Date(d).setHours(0,0,0,0);
        return t >= start && t <= end;
      });
    });
  }

  // client: XYZ
  const clientIdx = lower.indexOf("client:");
  if (clientIdx !== -1) {
    const after = lower.slice(clientIdx + 7).trim();
    const name = after.split(" ").slice(0, 5).join(" ");
    filtered = filtered.filter((p) => p.client.toLowerCase().includes(name));
  }

  // Focus intent
  if (
    includesWord(lower, "focus") ||
    includesWord(lower, "right away") ||
    includesWord(lower, "urgent")
  ) {
    const soon = addDaysDate(todayStart(), 7).getTime();
    filtered = filtered.filter((p) => {
      if (hasOverdue(p)) return true;
      const next = getNextUpcoming(p);
      if (!next) return false;
      return new Date(next.date).setHours(0,0,0,0) <= soon;
    });
    filtered.sort((a,b) => priorityScore(b) - priorityScore(a));
  }

  return filtered;
}

function summarizeQuery(projects, query) {
  const list = applyAIQuery(projects, query);
  const count = list.length;
  const total = list.reduce((s,p) => s + p.value, 0);
  const lower = String(query).toLowerCase();

  const wantsList = lower.includes("which") || lower.includes("list") || lower.includes("show");

  if (lower.includes("focus") || lower.includes("right away") || lower.includes("urgent")) {
    const lines = list.slice(0, 10).map((p) => {
      const overdue = overduePhases(p);
      const next = getNextUpcoming(p);
      const badge = overdue.length
        ? `OVERDUE: ${overdue.join(" / ")}`
        : next
        ? `${next.phase} ${new Date(next.date).toLocaleDateString()} (${relLabel(next.date)})`
        : "No upcoming";
      return `• ${p.id} — ${p.name} (${p.client}) — ${currency(p.value)} — ${badge}`;
    }).join("\n");
    return `Focus Now (${count}):\n${lines}`;
  }

  if (
    lower.includes("highest value") || lower.includes("top value") ||
    lower.includes("largest") || lower.includes("biggest") ||
    lower.includes("highest total value")
  ) {
    if (lower.includes("client") || lower.includes("clients") || lower.includes("by client")) {
      const groups = groupTotalsByClient(list);
      const top5 = groups.slice(0, 5)
        .map((g, i) => `${i + 1}. ${g.client} — ${currency(g.total)} (${g.count} project${g.count === 1 ? "" : "s"})`)
        .join("\n");
      const leader = groups[0] ? `${groups[0].client} at ${currency(groups[0].total)}` : "(none)";
      return `Top clients by total value (${groups.length}):\n${top5}\nLeader: ${leader}`;
    }
    const top = [...list].sort((a,b) => b.value - a.value).slice(0, 5);
    const lines = top.map((p,i) => `${i+1}. ${p.id} — ${p.name} (${p.client}) — ${currency(p.value)}`).join("\n");
    const maxLine = top[0] ? `Highest: ${top[0].id} — ${currency(top[0].value)}` : "Highest: (none)";
    return `Top value projects (${count} total, ${currency(total)} combined):\n${lines}\n${maxLine}`;
  }

  if (lower.includes("phase breakdown") || lower.includes("by phase")) {
    const counts = PHASES.map((ph) => ({
      ph, n: list.filter((p) => p.phase === ph).length
    }));
    const line = counts.map((c) => `${c.ph}: ${c.n}`).join(" • ");
    return `Phase breakdown (${count} projects): ${line}`;
  }

  if (lower.includes("overdue") && wantsList) {
    const lines = list.map((p) =>
      `• ${p.id} — ${p.name} — OVERDUE: ${overduePhases(p).join(", ")}`
    ).join("\n");
    return `${count} overdue:\n${lines}`;
  }

  if (extractDateRange(lower)) {
    const lines = list.slice(0, 15).map((p) => {
      const next = getNextUpcoming(p);
      const badge = next
        ? `${next.phase} ${new Date(next.date).toLocaleDateString()} (${relLabel(next.date)})`
        : "No upcoming";
      return `• ${p.id} — ${p.name} — ${badge}`;
    }).join("\n");
    return `${count} match in that window • Total ${currency(total)}\n${lines}`;
  }

  if (lower.includes("how many")) return `${count} project${count === 1 ? "" : "s"} match.`;
  if (lower.includes("total value") || lower.includes("total amount") || lower.includes("pipeline"))
    return `Total value for those: ${currency(total)}.`;

  const nextThree = list
    .map((p) => ({ p, next: getNextUpcoming(p) }))
    .filter((x) => x.next)
    .sort((a,b) => new Date(a.next.date) - new Date(b.next.date))
    .slice(0, 3)
    .map(({ p, next }) => `${p.id} ${next.phase} (${new Date(next.date).toLocaleDateString()})`);

  return `${count} match • Total ${currency(total)} • Next due: ${nextThree.join(", ") || "(none)"}`;
}

// ------------------------------
// Tiny card primitives (no libs)
// ------------------------------
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl border border-zinc-800 bg-[#0f172a] ${className}`}>{children}</div>;
}
function CardHeader({ children, className = "" }) {
  return <div className={`px-5 pt-5 ${className}`}>{children}</div>;
}
function CardTitle({ children, className = "" }) {
  return <h2 className={`text-xl font-semibold text-zinc-100 ${className}`}>{children}</h2>;
}
function CardContent({ children, className = "" }) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

// ------------------------------
// Main App
// ------------------------------
function App() {
  const [projects, setProjects] = React.useState(() => {
    try {
      const raw = localStorage.getItem("southwood_projects_v2");
      return raw ? JSON.parse(raw) : PROJECTS;
    } catch { return PROJECTS; }
  });
  const [quotes] = React.useState(QUOTES);

  React.useEffect(() => {
    try {
      localStorage.setItem("southwood_projects_v2", JSON.stringify(projects));
    } catch {}
  }, [projects]);

  const [tab, setTab] = React.useState("projects"); // "projects" | "quotes" | "calendar"

  // Filters
  const [search, setSearch] = React.useState("");
  const [phasesFilter, setPhasesFilter] = React.useState([...PHASES]);
  const [minVal, setMinVal] = React.useState("");
  const [maxVal, setMaxVal] = React.useState("");
  const [sortBy, setSortBy] = React.useState("priority"); // "priority" | "next" | "value"

  // AI query
  const [aiQuery, setAiQuery] = React.useState("");
  const [aiAnswer, setAiAnswer] = React.useState("");

  // Quick Add
  const [qaName, setQaName] = React.useState("");
  const [qaClient, setQaClient] = React.useState("");
  const [qaLocation, setQaLocation] = React.useState("Rock Hill, SC");
  const [qaValue, setQaValue] = React.useState("");
  const [qaPhase, setQaPhase] = React.useState("Design");
  const [qaMsg, setQaMsg] = React.useState(null);

  // Inline edit
  const [editId, setEditId] = React.useState(null);
  const [editPhase, setEditPhase] = React.useState("Design");
  const [editMilestones, setEditMilestones] = React.useState({});

  const filtered = React.useMemo(() => {
    let list = projects.filter((p) => phasesFilter.includes(p.phase));

    if (minVal) list = list.filter((p) => p.value >= Number(minVal));
    if (maxVal) list = list.filter((p) => p.value <= Number(maxVal));

    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((p) =>
        [p.id, p.name, p.client, p.location].some((x) => x.toLowerCase().includes(s))
      );
    }

    if (aiQuery.trim()) list = applyAIQuery(list, aiQuery);

    if (sortBy === "priority") {
      list.sort((a,b) => priorityScore(b) - priorityScore(a));
    } else if (sortBy === "next") {
      list.sort((a,b) => {
        const na = (getNextUpcoming(a)?.date || getOverallDue(a.milestones) || "9999-12-31");
        const nb = (getNextUpcoming(b)?.date || getOverallDue(b.milestones) || "9999-12-31");
        return new Date(na) - new Date(nb);
      });
    } else if (sortBy === "value") {
      list.sort((a,b) => b.value - a.value);
    }

    return list;
  }, [projects, phasesFilter, minVal, maxVal, search, aiQuery, sortBy]);

  const kpi = React.useMemo(() => {
    const now = todayStart().getTime();
    const in30 = addDaysDate(todayStart(), 30).getTime();
    const dueSoon = projects.filter((p) =>
      PHASES.some((ph) => {
        const d = p.milestones[ph];
        if (!d) return false;
        const t = new Date(d).getTime();
        return t >= now && t <= in30;
      })
    ).length;

    const atRisk = projects.filter((p) => hasOverdue(p)).length;
    const totalValue = projects.reduce((s,p) => s + p.value, 0);
    const pipeline = quotes.reduce((acc, q) => acc + q.amount * q.probability, 0);
    return { active: projects.length, pipeline, dueSoon, atRisk, totalValue };
  }, [projects, quotes]);

  function togglePhaseFilter(ph) {
    setPhasesFilter((prev) =>
      prev.includes(ph) ? prev.filter((x) => x !== ph) : [...prev, ph]
    );
  }

  function addProject() {
    const valueNum = Number(String(qaValue).replace(/,/g, ""));
    if (!qaName || !qaClient || Number.isNaN(valueNum)) {
      setQaMsg("Please fill Project Name, Client, and a numeric Value.");
      return;
    }
    const base = todayStart();
    const m = {
      Design: addDaysISO(base, 7),
      Estimating: addDaysISO(base, 14),
      Permitting: addDaysISO(base, 28),
      Surveying: addDaysISO(base, 35),
      Manufacturing: addDaysISO(base, 60),
      Installing: addDaysISO(base, 75),
    };
    const nums = projects
      .map((p) => parseInt(p.id.replace(/[^0-9]/g, ""), 10))
      .filter((n) => !Number.isNaN(n));
    const max = nums.length ? Math.max(...nums) : 2400;
    const newP = {
      id: `SW-${max + 1}`,
      name: qaName.trim(),
      client: qaClient.trim(),
      location: qaLocation.trim() || "Rock Hill, SC",
      value: valueNum,
      phase: qaPhase,
      milestones: m,
      owner: "You",
      tags: [],
    };
    setProjects((prev) => [newP, ...prev]);
    setQaName(""); setQaClient(""); setQaLocation("Rock Hill, SC");
    setQaValue(""); setQaPhase("Design");
    setQaMsg(`Added ${newP.id}`);
    setTimeout(() => setQaMsg(null), 2500);
  }

  function startEdit(p) {
    setEditId(p.id);
    setEditPhase(p.phase);
    setEditMilestones({ ...p.milestones });
  }
  function saveEdit() {
    if (!editId) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === editId ? { ...p, phase: editPhase, milestones: { ...editMilestones } } : p
      )
    );
    setEditId(null);
  }

  function runAI() {
    if (!aiQuery.trim()) {
      setAiAnswer("Type a question or pick a chip.");
      return;
    }
    setAiAnswer(summarizeQuery(projects, aiQuery));
  }

  const chips = [
    "what should I focus on",
    "which projects are overdue",
    "due next 7 days",
    "highest value projects",
    "top clients by highest total value",
  ];

  return (
    <div className="min-h-screen">
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
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by ID, client, location…"
              className="w-72 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-zinc-600"
            />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
            >
              <option value="priority">Sort: Priority</option>
              <option value="next">Sort: Next Due</option>
              <option value="value">Sort: Value</option>
            </select>
            <button
              onClick={() => {
                setPhasesFilter([...PHASES]);
                setMinVal(""); setMaxVal("");
                setAiQuery(""); setAiAnswer("");
                setSearch(""); setSortBy("priority");
              }}
              className="px-3 py-2 rounded-lg bg-zinc-800 text-zinc-100 text-sm hover:bg-zinc-700"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="max-w-7xl mx-auto px-4 py-6 grid lg:grid-cols-3 gap-6">
        {/* Left: KPIs + Projects/Quotes/Calendar */}
        <section className="lg:col-span-2 space-y-6">
          {/* KPIs */}
          <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-xs uppercase tracking-widest text-zinc-400">Projects</p>
              <p className="text-3xl mt-2 font-semibold">{kpi.active}</p>
              <p className="text-xs text-zinc-400 mt-1">Total value {currency(kpi.totalValue)}</p>
            </CardContent></Card>

            <Card><CardContent className="p-5">
              <p className="text-xs uppercase tracking-widest text-zinc-400">Pipeline (Weighted)</p>
              <p className="text-3xl mt-2 font-semibold">{currency(kpi.pipeline)}</p>
              <p className="text-xs text-zinc-400 mt-1">Quotes × probability</p>
            </CardContent></Card>

            <Card><CardContent className="p-5">
              <p className="text-xs uppercase tracking-widest text-zinc-400">Milestones due ≤30d</p>
              <p className="text-3xl mt-2 font-semibold">{kpi.dueSoon}</p>
              <p className="text-xs text-zinc-400 mt-1">Across all phases</p>
            </CardContent></Card>

            <Card><CardContent className="p-5">
              <p className="text-xs uppercase tracking-widest text-zinc-400">Overdue</p>
              <p className="text-3xl mt-2 font-semibold">{kpi.atRisk}</p>
              <p className="text-xs text-zinc-400 mt-1">Projects with any overdue phase</p>
            </CardContent></Card>
          </div>

          {/* Tabs */}
          <Card>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <div className="flex items-center gap-2 text-sm">
                <button onClick={() => setTab("projects")} className={`px-3 py-1.5 rounded-lg border ${tab==="projects" ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900 border-zinc-800"}`}>List</button>
                <button onClick={() => setTab("quotes")}   className={`px-3 py-1.5 rounded-lg border ${tab==="quotes"   ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900 border-zinc-800"}`}>Quotes</button>
                <button onClick={() => setTab("calendar")} className={`px-3 py-1.5 rounded-lg border ${tab==="calendar" ? "bg-zinc-800 border-zinc-600" : "bg-zinc-900 border-zinc-800"}`}>Calendar</button>
              </div>
            </CardHeader>
            <CardContent>
              {tab === "projects" && (
                <div className="space-y-4">
                  {/* Filters row */}
                  <div className="flex flex-wrap items-end gap-3 text-sm">
                    <div className="flex flex-wrap gap-2">
                      {PHASES.map((s) => (
                        <label key={s} className="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg">
                          <input type="checkbox" checked={phasesFilter.includes(s)} onChange={() => togglePhaseFilter(s)} />
                          <span>{s}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 ml-auto">
                      <input value={minVal} onChange={(e)=>setMinVal(e.target.value)} placeholder="Min $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5" />
                      <input value={maxVal} onChange={(e)=>setMaxVal(e.target.value)} placeholder="Max $" className="w-28 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-1.5" />
                    </div>
                  </div>

                  {/* AI Query */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        value={aiQuery}
                        onChange={(e)=>setAiQuery(e.target.value)}
                        onKeyDown={(e)=>{ if (e.key === "Enter") runAI(); }}
                        placeholder="Try: 'what should I focus on', 'which projects are overdue', 'due next 7 days', 'highest value projects', 'top clients by highest total value'"
                        className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                      />
                      <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
                      <button onClick={()=>{ setAiQuery(""); setAiAnswer(""); }} className="px-3 py-2 rounded-lg bg-zinc-800 text-sm">Clear</button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {chips.map((c) => (
                        <button key={c} onClick={()=>{ setAiQuery(c); setTimeout(runAI, 0); }} className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>

                  {aiAnswer && (
                    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap text-zinc-200">{aiAnswer}</div>
                  )}

                  {/* Projects table */}
                  <div className="overflow-auto border border-zinc-800 rounded-xl">
                    <table className="min-w-full text-sm">
                      <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                        <tr>
                          <th className="text-left py-3 px-3">Project</th>
                          <th className="text-left py-3 px-3">Client</th>
                          <th className="text-left py-3 px-3">Location</th>
                          <th className="text-left py-3 px-3">Value</th>
                          <th className="text-left py-3 px-3">Phase</th>
                          <th className="text-left py-3 px-3">Next Due (soonest)</th>
                          <th className="text-right py-3 px-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((p) => {
                          const next = getNextUpcoming(p);
                          const overdue = overduePhases(p);
                          return (
                            <React.Fragment key={p.id}>
                              <tr className="border-t border-zinc-800 text-zinc-200 align-top">
                                <td className="py-3 px-3 font-medium whitespace-nowrap">
                                  <span className="inline-flex items-center gap-2">
                                    <span className="bg-zinc-800 text-[11px] px-2 py-0.5 rounded-full">{p.id}</span>
                                    {p.name}
                                  </span>
                                </td>
                                <td className="py-3 px-3">{p.client}</td>
                                <td className="py-3 px-3">{p.location}</td>
                                <td className="py-3 px-3 font-semibold">{currency(p.value)}</td>
                                <td className="py-3 px-3">
                                  <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-white text-xs ${phaseColor[p.phase]}`}>{p.phase}</span>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {next ? (
                                    <span>
                                      {next.phase} • {new Date(next.date).toLocaleDateString()} (<span className="text-zinc-400">{relLabel(next.date)}</span>)
                                    </span>
                                  ) : (
                                    <span className="text-zinc-400">No upcoming</span>
                                  )}
                                  {overdue.length > 0 && (
                                    <span className="block text-xs text-rose-400">Overdue: {overdue.join(", ")}</span>
                                  )}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <button onClick={()=>startEdit(p)} className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-sm">Edit</button>
                                </td>
                              </tr>
                              {editId === p.id && (
                                <tr className="bg-zinc-950/60 border-t border-zinc-900">
                                  <td colSpan={7} className="px-4 py-4">
                                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                      <div className="space-y-2">
                                        <label className="text-xs text-zinc-400">Current Phase</label>
                                        <select value={editPhase} onChange={(e)=>setEditPhase(e.target.value)} className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm">
                                          {PHASES.map((ph)=> <option key={ph} value={ph}>{ph}</option>)}
                                        </select>
                                      </div>
                                      {PHASES.map((ph) => (
                                        <div key={ph} className="space-y-2">
                                          <label className="text-xs text-zinc-400">{ph} Due Date</label>
                                          <input
                                            type="date"
                                            value={editMilestones[ph] || ""}
                                            onChange={(e)=>setEditMilestones((m)=>({ ...m, [ph]: e.target.value }))}
                                            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm"
                                          />
                                        </div>
                                      ))}
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
                        {filtered.length === 0 && (
                          <tr><td colSpan={7} className="py-6 text-center text-zinc-400">No projects match current filters.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {tab === "quotes" && (
                <div className="overflow-auto border border-zinc-800 rounded-xl">
                  <table className="min-w-full text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-xs">
                      <tr>
                        <th className="text-left py-3 px-3">Quote</th>
                        <th className="text-left py-3 px-3">Client</th>
                        <th className="text-left py-3 px-3">Project</th>
                        <th className="text-left py-3 px-3">Amount</th>
                        <th className="text-left py-3 px-3">Probability</th>
                        <th className="text-left py-3 px-3">Status</th>
                        <th className="text-left py-3 px-3">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {QUOTES.map((q) => (
                        <tr key={q.id} className="border-t border-zinc-800 text-zinc-200">
                          <td className="py-3 px-3 font-medium">{q.id}</td>
                          <td className="py-3 px-3">{q.client}</td>
                          <td className="py-3 px-3">{q.projectName}</td>
                          <td className="py-3 px-3 font-semibold">{currency(q.amount)}</td>
                          <td className="py-3 px-3">{Math.round(q.probability * 100)}%</td>
                          <td className="py-3 px-3">{q.status}</td>
                          <td className="py-3 px-3">{new Date(q.created).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "calendar" && (
                <div className="rounded-xl border border-zinc-800 p-6 text-zinc-300">
                  <p className="mb-2 font-medium text-zinc-200">Install & Phase Dates (mock)</p>
                  <p className="text-sm">A compact calendar/Gantt view would live here so you can scan deadlines for each phase at a glance. Use the Edit button in the List to set exact due dates per phase.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Right: AI Panel + Quick Add */}
        <aside className="space-y-6">
          <Card>
            <CardHeader><CardTitle>AI Assistant</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="text-sm text-zinc-300">
                Ask anything — the table will filter too:
                <ul className="list-disc pl-5 mt-2 space-y-1">
                  <li>what should I focus on</li>
                  <li>which projects are overdue</li>
                  <li>due next 7 days</li>
                  <li>highest value projects</li>
                  <li>top clients by highest total value</li>
                </ul>
              </div>
              <div className="flex gap-2">
                <input value={aiQuery} onChange={(e)=>setAiQuery(e.target.value)} onKeyDown={(e)=>{ if (e.key==="Enter") runAI(); }} placeholder="Type a question or pick a chip…" className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm" />
                <button onClick={runAI} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm">Ask</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((c)=>(
                  <button key={c} onClick={()=>{ setAiQuery(c); setTimeout(runAI, 0); }} className="px-2.5 py-1.5 text-xs rounded-full border border-zinc-800 bg-zinc-900 hover:bg-zinc-800">
                    {c}
                  </button>
                ))}
              </div>
              {aiAnswer && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 text-sm whitespace-pre-wrap text-zinc-200">{aiAnswer}</div>
              )}
            </CardContent>
          </Card>

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
                  {PHASES.map((s)=> <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={addProject} className="w-full bg-emerald-600 hover:bg-emerald-500 px-3 py-2 rounded-lg text-sm font-medium">Add Project</button>
              {qaMsg && <p className="text-xs text-emerald-400">{qaMsg}</p>}
              <p className="text-xs text-zinc-400">New projects get an auto-seeded timeline (you can refine dates via <b>Edit</b> on the list).</p>
            </CardContent>
          </Card>
        </aside>
      </main>

      <footer className="max-w-7xl mx-auto px-4 pb-10 text-xs text-zinc-500">
        Priority sorting • Overdue awareness • Date windows • Value rollups • Local persistence
      </footer>
    </div>
  );
}

// ------------------------------
// Mount the app
// ------------------------------
const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

