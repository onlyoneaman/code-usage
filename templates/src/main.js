/* ── Helpers ─────────────────────────────────────────────── */
function fmt(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
function fmtUSD(n) {
  return `$${n.toFixed(2)}`;
}
function pad2(n) {
  return n < 10 ? `0${n}` : String(n);
}
function localDateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function fullDateStr(ds) {
  var m = String(ds || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : String(ds || "");
}
function fullDateFromIso(iso) {
  if (!iso) return "-";
  var d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-${d.getFullYear()}`;
}
function modelUsageKey(id) {
  return String(id || "").replace(/-\d{8}$/, "");
}
function toFileUrl(pathLike) {
  var p = String(pathLike || "").replace(/\\/g, "/");
  if (!p) return "";
  if (p.indexOf("file://") === 0 || p.indexOf("http://") === 0 || p.indexOf("https://") === 0) return p;
  if (p.charAt(0) === "/") return `file://${p}`;
  return `file:///${p}`;
}

/* ── Provider Registry ───────────────────────────────────── */
var PROVIDERS = [
  { key: "claude", color: "#D37356", label: "Claude" },
  { key: "codex", color: "#7385FE", label: "Codex" },
  { key: "opencode", color: "#10b981", label: "OpenCode" },
  { key: "amp", color: "#E8430B", label: "Amp" },
  { key: "pi", color: "#6C5CE7", label: "Pi-Agent" },
];
var PROVIDER_MAP = {};
PROVIDERS.forEach((p) => {
  PROVIDER_MAP[p.key] = p;
});

function providerFromModel(id) {
  var s = String(id || "").toLowerCase();
  if (s.startsWith("gpt-")) return "codex";
  if (s.indexOf("[pi]") !== -1 || s.indexOf("pi-agent") !== -1) return "pi";
  if (s.indexOf("amp") !== -1) return "amp";
  if (s.startsWith("claude-") || s.indexOf("opus") !== -1 || s.indexOf("sonnet") !== -1 || s.indexOf("haiku") !== -1)
    return "claude";
  return "opencode";
}
function colorForModel(id) {
  var mid = String(id || "").toLowerCase();
  if (mid.indexOf("haiku") !== -1) return "#047857";
  if (mid.indexOf("sonnet") !== -1) return "#c47a5f";
  var p = providerFromModel(id);
  return PROVIDER_MAP[p] ? PROVIDER_MAP[p].color : "#10b981";
}
function rowAgentCosts(row) {
  var costs = {};
  PROVIDERS.forEach((p) => {
    costs[p.key] = 0;
  });
  var mc = row?.modelCosts ? row.modelCosts : null;
  if (mc) {
    for (var mid in mc) {
      var p = providerFromModel(mid);
      costs[p] = (costs[p] || 0) + (mc[mid] || 0);
    }
  }
  return PROVIDERS.map((p) => ({ key: p.key, label: p.label, color: p.color, cost: costs[p.key] || 0 })).filter(
    (a) => a.cost > 0,
  );
}
var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function el(tag, attrs, children) {
  var e = document.createElement(tag);
  if (attrs)
    for (var k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
  if (children) {
    if (typeof children === "string") e.textContent = children;
    else if (Array.isArray(children))
      children.forEach((c) => {
        if (c) e.appendChild(c);
      });
    else e.appendChild(children);
  }
  return e;
}
function createStatCard(label, value, cls, sub) {
  var card = el("div", { class: "stat-card" });
  card.appendChild(el("div", { class: "stat-label" }, label));
  card.appendChild(el("div", { class: `stat-value${cls ? ` ${cls}` : ""}` }, value));
  if (sub) card.appendChild(el("div", { class: "stat-sub" }, sub));
  return card;
}

function renderFooter() {
  var footerMeta = document.getElementById("footer-meta");
  if (!footerMeta) return;

  var meta = typeof DATA !== "undefined" && DATA && DATA.appMeta ? DATA.appMeta : {};
  var authorName = meta.authorName || "Aman";
  var authorUrl = meta.authorUrl || "https://x.com/onlyoneaman";
  var repoUrl = meta.repoUrl || "https://github.com/onlyoneaman/code-usage";
  var _packageUrl = meta.packageUrl || "https://www.npmjs.com/package/code-usage";
  var _appName = meta.name || "code-usage";
  var version = meta.version || "";

  footerMeta.textContent = "";
  footerMeta.appendChild(document.createTextNode("Made with \u2764\uFE0F by "));
  footerMeta.appendChild(el("a", { href: authorUrl, target: "_blank", rel: "noopener noreferrer" }, authorName));
  if (version) footerMeta.appendChild(document.createTextNode(` \u00B7 v${version}`));
  footerMeta.appendChild(document.createTextNode(" \u00B7 "));
  footerMeta.appendChild(el("a", { href: repoUrl, target: "_blank", rel: "noopener noreferrer" }, "GitHub"));
  if (typeof DATA !== "undefined" && DATA && DATA.metadata && DATA.metadata.jsonPath) {
    footerMeta.appendChild(document.createTextNode(" \u00B7 "));
    footerMeta.appendChild(
      el(
        "a",
        { href: toFileUrl(DATA.metadata.jsonPath), target: "_blank", rel: "noopener noreferrer" },
        "View raw data (JSON)",
      ),
    );
  }

  var feedbackLine = el("p", { style: "margin-top:6px;" });
  feedbackLine.appendChild(document.createTextNode("If you liked it, "));
  feedbackLine.appendChild(el("a", { href: repoUrl, target: "_blank", rel: "noopener noreferrer" }, "star on GitHub"));
  feedbackLine.appendChild(document.createTextNode(" \u00B7 Feedback/bugs? "));
  feedbackLine.appendChild(
    el("a", { href: authorUrl, target: "_blank", rel: "noopener noreferrer" }, `Contact ${authorName}`),
  );
  footerMeta.parentNode.appendChild(feedbackLine);
}

var MODEL_ORDER = [
  "opus-4-6",
  "opus-4-5",
  "opus-4-1",
  "opus-4",
  "sonnet-4-5",
  "sonnet-4",
  "sonnet-3-7",
  "haiku-4-5",
  "haiku-3-5",
  "gpt-5.3",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5-codex",
];
function modelSortKey(id) {
  for (var i = 0; i < MODEL_ORDER.length; i++) {
    if (id.includes(MODEL_ORDER[i])) return i;
  }
  return 99;
}

function createModelTag(id) {
  var isCodex = id.startsWith("gpt-");
  if (isCodex) return el("span", { class: "model-tag model-codex" }, id);
  var isClaude =
    id.startsWith("claude-") || id.indexOf("opus") !== -1 || id.indexOf("sonnet") !== -1 || id.indexOf("haiku") !== -1;
  if (isClaude) {
    var name = id.replace("claude-", "").replace(/-\d{8}$/, "");
    var parts = name.split("-");
    var family = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    var version = parts.slice(1).join(".");
    name = `${family} ${version}`;
    var cls = "model-tag model-sonnet";
    if (id.includes("opus")) cls = "model-tag model-opus";
    else if (id.includes("haiku")) cls = "model-tag model-haiku";
    return el("span", { class: cls }, name);
  }
  var low = id.toLowerCase();
  if (low.indexOf("[pi]") !== -1 || low.indexOf("pi-agent") !== -1)
    return el("span", { class: "model-tag model-pi" }, id);
  if (low.indexOf("amp") !== -1) return el("span", { class: "model-tag model-amp" }, id);
  return el("span", { class: "model-tag model-opencode" }, id);
}

function getWeekStart(ds) {
  var d = new Date(`${ds}T12:00:00`);
  var day = d.getDay();
  var diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return localDateStr(d);
}
function weekLabel(monStr) {
  var mon = new Date(`${monStr}T12:00:00`);
  var sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  if (mon.getMonth() === sun.getMonth()) return `${MONTHS[mon.getMonth()]} ${mon.getDate()}-${sun.getDate()}`;
  return `${MONTHS[mon.getMonth()]} ${mon.getDate()} - ${MONTHS[sun.getMonth()]} ${sun.getDate()}`;
}
function sumBy(list, key) {
  return list.reduce((acc, item) => acc + (item[key] || 0), 0);
}

/* ── Build view opts from pre-computed data ──────────────── */
function buildOpts(data) {
  var s = data.summary,
    accent = data.accent;
  var daysActive = data.daily.length;
  var costPerDay = daysActive > 0 ? s.totalCost / daysActive : 0;
  var costPerSession = s.totalSessions > 0 ? s.totalCost / s.totalSessions : 0;
  var firstD = s.firstDate ? new Date(s.firstDate) : new Date();
  var now = new Date(),
    todayStr = localDateStr(now);

  // Fill in gaps for daily chart
  var dailyByDate = {};
  data.daily.forEach((d) => {
    dailyByDate[d.date] = d;
  });
  var allDays = [],
    cursor = new Date(firstD);
  while (localDateStr(cursor) <= todayStr) {
    var ds = localDateStr(cursor);
    allDays.push(dailyByDate[ds] || { date: ds, cost: 0, sessions: 0, messages: 0, models: [] });
    cursor.setDate(cursor.getDate() + 1);
  }
  var maxMsg = 1;
  allDays.forEach((d) => {
    if (d.messages > maxMsg) maxMsg = d.messages;
  });

  // Weekly aggregation
  var weeklyMap = {};
  data.daily.forEach((d) => {
    var wk = getWeekStart(d.date);
    if (!weeklyMap[wk]) weeklyMap[wk] = { cost: 0, sessions: 0 };
    weeklyMap[wk].cost += d.cost;
    weeklyMap[wk].sessions += d.sessions;
  });
  var weeklySorted = Object.keys(weeklyMap).sort();

  // Daily table rows (newest first)
  var dailyRows = data.daily.slice().reverse();

  // Extra stat cards
  var extraCards = [];
  if (data.extra) {
    if (data.extra.linesAdded || data.extra.linesRemoved)
      extraCards.push(
        createStatCard("Lines", `+${fmt(data.extra.linesAdded || 0)} / -${fmt(data.extra.linesRemoved || 0)}`),
      );
    if (data.extra.filesModified) extraCards.push(createStatCard("Files Modified", fmt(data.extra.filesModified)));
  }

  // Badge
  var badgeEls = [];
  if (data.badge) {
    var b = el("span", { class: `sub-badge ${data.provider || "claude"}` });
    b.textContent = data.badge;
    badgeEls.push(el("span", { class: "date-info" }, [b]));
  }

  var rawModels = data.models.map((m) => ({ id: m.id, cost: m.cost, provider: data.provider }));
  var modelUsage = rawModels.slice().sort((a, b) => b.cost - a.cost);
  var projects = (data.projects || []).map((p) => ({
    name: p.name,
    path: p.path,
    sessions: p.sessions,
    messages: p.messages,
    cost: p.cost,
    daily: p.daily,
    provider: data.provider,
  }));

  return {
    accent: accent,
    provider: data.provider,
    displayCost: s.totalCost,
    daysActive: daysActive,
    totalSessions: s.totalSessions,
    costPerDay: costPerDay,
    costPerSession: costPerSession,
    streak: s.streak,
    userMessages: s.totalMessages,
    outputTokens: s.totalOutputTokens,
    totalTokens: s.totalTokens || 0,
    tokenBreakdown: s.tokenBreakdown || null,
    firstDate: s.firstDate,
    allDays: allDays,
    maxMsg: maxMsg,
    rawModels: rawModels,
    modelUsage: modelUsage,
    showProviderBadge: false,
    weeklySorted: weeklySorted,
    weeklyMap: weeklyMap,
    dailyRows: dailyRows,
    extraCards: extraCards,
    badgeEls: badgeEls,
    pricingNote: data.pricingNote,
    projects: projects,
  };
}

function mergeOpts(optsList) {
  // Merge N provider opts into combined "All" view
  var valid = optsList.filter((o) => !!o);
  if (valid.length === 0) return null;
  if (valid.length === 1) return adjustAccent(valid[0]);

  var displayCost = 0,
    totalSess = 0,
    userMsgs = 0,
    outTok = 0,
    allTok = 0;
  var mergedBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cached: 0, reasoning: 0 };
  valid.forEach((o) => {
    displayCost += o.displayCost;
    totalSess += o.totalSessions;
    userMsgs += o.userMessages;
    outTok += o.outputTokens;
    allTok += o.totalTokens || 0;
    var tb = o.tokenBreakdown || {};
    mergedBreakdown.input += tb.input || 0;
    mergedBreakdown.output += tb.output || 0;
    mergedBreakdown.cacheRead += tb.cacheRead || 0;
    mergedBreakdown.cacheWrite += tb.cacheWrite || 0;
    mergedBreakdown.cached += tb.cached || 0;
    mergedBreakdown.reasoning += tb.reasoning || 0;
  });

  // Build per-provider day lookups
  var provDayMaps = [];
  valid.forEach((o) => {
    var m = {};
    (o.allDays || []).forEach((d) => {
      m[d.date] = d;
    });
    provDayMaps.push(m);
  });

  // Merge daily
  var dayMap = {};
  valid.forEach((o) => {
    (o.allDays || []).forEach((d) => {
      if (!dayMap[d.date]) {
        var day = { date: d.date, cost: 0, sessions: 0, messages: 0 };
        PROVIDERS.forEach((p) => {
          day[p.key + "Cost"] = 0;
          day[p.key + "Sess"] = 0;
          day[p.key + "Msg"] = 0;
        });
        dayMap[d.date] = day;
      }
      dayMap[d.date].cost += d.cost;
      dayMap[d.date].sessions += d.sessions;
      dayMap[d.date].messages += d.messages;
    });
  });

  // Fill provider-specific fields
  valid.forEach((o) => {
    var pk = o.provider || "opencode";
    var dm = {};
    (o.allDays || []).forEach((d) => {
      dm[d.date] = d;
    });
    for (var date in dayMap) {
      var sd = dm[date];
      if (sd) {
        dayMap[date][`${pk}Cost`] += sd.cost || 0;
        dayMap[date][`${pk}Sess`] += sd.sessions || 0;
        dayMap[date][`${pk}Msg`] += sd.messages || 0;
      }
    }
  });

  var allDates = Object.keys(dayMap).sort();
  var firstDate = allDates.length ? `${allDates[0]}T00:00:00.000Z` : null;
  var now = new Date(),
    todayStr = localDateStr(now),
    allDays = [];
  if (allDates.length) {
    var cursor = new Date(`${allDates[0]}T12:00:00`);
    while (localDateStr(cursor) <= todayStr) {
      var ds = localDateStr(cursor);
      if (dayMap[ds]) {
        allDays.push(dayMap[ds]);
      } else {
        var emptyDay = { date: ds, cost: 0, sessions: 0, messages: 0 };
        PROVIDERS.forEach((p) => {
          emptyDay[p.key + "Cost"] = 0;
          emptyDay[p.key + "Sess"] = 0;
          emptyDay[p.key + "Msg"] = 0;
        });
        allDays.push(emptyDay);
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  var maxMsg = 1;
  allDays.forEach((d) => {
    if (d.messages > maxMsg) maxMsg = d.messages;
  });
  var daysActive = allDays.filter((d) => d.sessions > 0).length;

  // Streak
  var activeDatesSet = {};
  allDays.forEach((d) => {
    if (d.sessions > 0) activeDatesSet[d.date] = true;
  });
  var streak = 0,
    check = new Date(now);
  while (activeDatesSet[localDateStr(check)]) {
    streak++;
    check.setDate(check.getDate() - 1);
  }

  // Merge weekly
  var weeklyMap = {};
  valid.forEach((o) => {
    var pk = o.provider || "opencode";
    for (var wk in o.weeklyMap || {}) {
      if (!weeklyMap[wk]) {
        weeklyMap[wk] = { cost: 0, sessions: 0 };
        PROVIDERS.forEach((p) => {
          weeklyMap[wk][p.key + "Cost"] = 0;
        });
      }
      weeklyMap[wk].cost += o.weeklyMap[wk].cost || 0;
      weeklyMap[wk].sessions += o.weeklyMap[wk].sessions || 0;
      weeklyMap[wk][`${pk}Cost`] += o.weeklyMap[wk].cost || 0;
    }
  });
  var weeklySorted = Object.keys(weeklyMap).sort();

  // Merge daily rows
  var drMap = {};
  valid.forEach((o) => {
    (o.dailyRows || []).forEach((r) => {
      if (!drMap[r.date])
        drMap[r.date] = { date: r.date, cost: 0, sessions: 0, messages: 0, models: [], modelCosts: {} };
      drMap[r.date].cost += r.cost;
      drMap[r.date].sessions += r.sessions;
      drMap[r.date].messages += r.messages;
      if (r.modelCosts) {
        for (var mk in r.modelCosts) {
          drMap[r.date].modelCosts[mk] = (drMap[r.date].modelCosts[mk] || 0) + (r.modelCosts[mk] || 0);
        }
      }
      if (r.models)
        r.models.forEach((m) => {
          if (drMap[r.date].models.indexOf(m) === -1) drMap[r.date].models.push(m);
        });
    });
  });
  var dailyRows = Object.keys(drMap)
    .sort()
    .reverse()
    .map((d) => {
      var row = drMap[d];
      if (row.modelCosts) {
        row.models = Object.keys(row.modelCosts).sort((x, y) => {
          var cx = row.modelCosts[x] || 0,
            cy = row.modelCosts[y] || 0;
          if (cx !== cy) return cy - cx;
          return x.localeCompare(y);
        });
      }
      return row;
    });

  // Badges
  var badgeEls = [];
  function countBadge(label, count, cls) {
    var wrap = el("span", { class: "date-info" });
    var bg = el("span", { class: `sub-badge ${cls}` });
    bg.textContent = `${label} ${count}`;
    wrap.appendChild(bg);
    return wrap;
  }
  valid.forEach((o) => {
    var pk = o.provider || "opencode";
    var pm = PROVIDER_MAP[pk];
    var label = pm ? pm.label : pk;
    badgeEls.push(countBadge(label, o.totalSessions, pk));
  });

  // All models
  var allModels = [];
  valid.forEach((o) => {
    allModels = allModels.concat(o.rawModels || []);
  });
  allModels.sort((x, y) => y.cost - x.cost);

  // Merge projects
  var projMap = {};
  valid.forEach((o) => {
    var pk = o.provider || "opencode";
    (o.projects || []).forEach((p) => {
      if (!projMap[p.name]) {
        projMap[p.name] = {
          name: p.name,
          path: p.path,
          sessions: 0,
          messages: 0,
          cost: 0,
          daily: {},
        };
        PROVIDERS.forEach((pr) => {
          projMap[p.name][pr.key + "Cost"] = 0;
        });
      }
      projMap[p.name].sessions += p.sessions;
      projMap[p.name].messages += p.messages;
      projMap[p.name].cost += p.cost;
      projMap[p.name][`${pk}Cost`] += p.cost || 0;
      (p.daily || []).forEach((d) => {
        if (!projMap[p.name].daily[d.date]) {
          projMap[p.name].daily[d.date] = { sessions: 0, messages: 0, cost: 0 };
          PROVIDERS.forEach((pr) => {
            projMap[p.name].daily[d.date][pr.key + "Cost"] = 0;
          });
        }
        projMap[p.name].daily[d.date].sessions += d.sessions;
        projMap[p.name].daily[d.date].messages += d.messages;
        projMap[p.name].daily[d.date].cost += d.cost;
        projMap[p.name].daily[d.date][`${pk}Cost`] += d.cost || 0;
      });
    });
  });
  var mergedProjects = Object.keys(projMap)
    .map((k) => {
      var p = projMap[k];
      p.daily = Object.keys(p.daily)
        .sort()
        .map((date) => {
          var d = p.daily[date];
          var entry = { date: date, sessions: d.sessions, messages: d.messages, cost: d.cost };
          PROVIDERS.forEach((pr) => {
            entry[pr.key + "Cost"] = d[pr.key + "Cost"] || 0;
          });
          return entry;
        });
      return p;
    })
    .sort((x, y) => y.cost - x.cost);

  // Track which providers are present for stacked charts
  var activeProviders = [];
  valid.forEach((o) => {
    var pk = o.provider || "opencode";
    activeProviders.push(pk);
  });

  return {
    accent: "#3b82f6",
    displayCost: displayCost,
    daysActive: daysActive,
    totalSessions: totalSess,
    costPerDay: daysActive > 0 ? displayCost / daysActive : 0,
    costPerSession: totalSess > 0 ? displayCost / totalSess : 0,
    streak: streak,
    userMessages: userMsgs,
    outputTokens: outTok,
    totalTokens: allTok,
    tokenBreakdown: mergedBreakdown,
    firstDate: firstDate,
    allDays: allDays,
    maxMsg: maxMsg,
    stacked: true,
    activeProviders: activeProviders,
    modelUsage: allModels,
    showProviderBadge: true,
    weeklySorted: weeklySorted,
    weeklyMap: weeklyMap,
    dailyRows: dailyRows,
    extraCards: [],
    badgeEls: badgeEls,
    pricingNote: "Combined view across all agents. Models are sorted by estimated cost usage.",
    projects: mergedProjects,
  };
}

function adjustAccent(o) {
  var r = Object.assign({}, o);
  r.accent = "#3b82f6";
  return r;
}

var RANGE_OPTIONS = [
  { id: "this_week", label: "This Week" },
  { id: "this_month", label: "This Month" },
  { id: "this_year", label: "This Year" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "last_90_days", label: "Last 90 Days" },
  { id: "all_time", label: "All Time" },
];

function rangeStart(rangeId) {
  var now = new Date(),
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rangeId === "this_week") {
    var day = start.getDay();
    var diff = day === 0 ? 6 : day - 1; // Monday start
    start.setDate(start.getDate() - diff);
    return localDateStr(start);
  }
  if (rangeId === "this_month") {
    start.setDate(1);
    return localDateStr(start);
  }
  if (rangeId === "this_year") {
    start.setMonth(0, 1);
    return localDateStr(start);
  }
  if (rangeId === "last_30_days") {
    start.setDate(start.getDate() - 29);
    return localDateStr(start);
  }
  if (rangeId === "last_90_days") {
    start.setDate(start.getDate() - 89);
    return localDateStr(start);
  }
  return null;
}

function computeStreak(allDays) {
  var active = {};
  allDays.forEach((d) => {
    if (d.sessions > 0) active[d.date] = true;
  });
  var streak = 0,
    check = new Date();
  while (active[localDateStr(check)]) {
    streak++;
    check.setDate(check.getDate() - 1);
  }
  return streak;
}

function applyRange(opts, rangeId) {
  if (!opts) return opts;
  if (rangeId === "all_time") {
    var full = Object.assign({}, opts);
    full.rangeId = rangeId;
    full.projects = opts.projects || [];
    return full;
  }

  var start = rangeStart(rangeId);
  var allDays = (opts.allDays || []).filter((d) => d.date >= start);
  var dailyRows = (opts.dailyRows || []).filter((r) => r.date >= start);
  var displayCost = sumBy(allDays, "cost");
  var totalSessions = sumBy(allDays, "sessions");
  // Daily message counts can include non-user/internal events in some providers.
  // Keep message totals aligned to provider summary metric, then scale by selected range.
  var baseMessages = Math.max(0, opts.userMessages || 0);
  var baseDailyMessages = sumBy(opts.allDays || [], "messages");
  var rangeDailyMessages = sumBy(allDays, "messages");
  var userMessages = baseMessages;
  var msgRatio = 1;
  if (baseMessages > 0 && baseDailyMessages > 0) {
    msgRatio = rangeDailyMessages / baseDailyMessages;
    userMessages = Math.round(baseMessages * msgRatio);
  }
  var daysActive = allDays.filter((d) => d.sessions > 0).length;
  var firstActive = null;
  for (var i = 0; i < allDays.length; i++) {
    if (allDays[i].sessions > 0) {
      firstActive = `${allDays[i].date}T00:00:00.000Z`;
      break;
    }
  }
  var maxMsg = 1;
  allDays.forEach((d) => {
    if (d.messages > maxMsg) maxMsg = d.messages;
  });

  var weeklyMap = {};
  allDays.forEach((d) => {
    var wk = getWeekStart(d.date);
    if (!weeklyMap[wk]) {
      weeklyMap[wk] = { cost: 0, sessions: 0 };
      PROVIDERS.forEach((p) => {
        weeklyMap[wk][p.key + "Cost"] = 0;
      });
    }
    weeklyMap[wk].cost += d.cost || 0;
    weeklyMap[wk].sessions += d.sessions || 0;
    PROVIDERS.forEach((p) => {
      weeklyMap[wk][p.key + "Cost"] += d[p.key + "Cost"] || 0;
    });
  });
  var weeklySorted = Object.keys(weeklyMap).sort();
  var baseModels = opts.modelUsage?.length ? opts.modelUsage : opts.rawModels || [];
  var rangeRatio = (opts.displayCost || 0) > 0 ? displayCost / opts.displayCost : 0;
  var modelUsage = baseModels
    .map((m) => ({ id: m.id, cost: (m.cost || 0) * rangeRatio, provider: m.provider }))
    .filter((m) => m.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  // Scale tokens by range ratio
  var rangeOutputTokens = Math.round((opts.outputTokens || 0) * msgRatio);
  var rangeTotalTokens = Math.round((opts.totalTokens || 0) * msgRatio);
  var rangeBreakdown = null;
  if (opts.tokenBreakdown) {
    var ob = opts.tokenBreakdown;
    rangeBreakdown = {};
    for (var bk in ob) {
      if (ob[bk]) rangeBreakdown[bk] = Math.round(ob[bk] * msgRatio);
    }
  }

  var next = Object.assign({}, opts, {
    rangeId: rangeId,
    allDays: allDays,
    maxMsg: maxMsg,
    dailyRows: dailyRows,
    weeklyMap: weeklyMap,
    weeklySorted: weeklySorted,
    displayCost: displayCost,
    totalSessions: totalSessions,
    userMessages: userMessages,
    outputTokens: rangeOutputTokens,
    totalTokens: rangeTotalTokens,
    tokenBreakdown: rangeBreakdown,
    daysActive: daysActive,
    firstDate: firstActive,
    costPerDay: daysActive > 0 ? displayCost / daysActive : 0,
    costPerSession: totalSessions > 0 ? displayCost / totalSessions : 0,
    streak: computeStreak(allDays),
    modelUsage: modelUsage,
  });

  if (next.stacked) {
    var badgeEls = [];
    function countBadge(label, count, cls) {
      var wrap = el("span", { class: "date-info" });
      var bg = el("span", { class: `sub-badge ${cls}` });
      bg.textContent = `${label} ${count}`;
      wrap.appendChild(bg);
      return wrap;
    }
    PROVIDERS.forEach((p) => {
      var sess = sumBy(allDays, p.key + "Sess");
      if (sess > 0) badgeEls.push(countBadge(p.label, sess, p.key));
    });
    next.badgeEls = badgeEls;
  }

  // Filter projects by range
  var rangeProjects = (opts.projects || [])
    .map((p) => {
      var fd = (p.daily || []).filter((d) => d.date >= start);
      if (fd.length === 0) return null;
      var rp = {
        name: p.name,
        path: p.path,
        daily: fd,
        provider: p.provider,
        sessions: sumBy(fd, "sessions"),
        messages: sumBy(fd, "messages"),
        cost: sumBy(fd, "cost"),
      };
      PROVIDERS.forEach((pr) => {
        if (p[pr.key + "Cost"] !== undefined) {
          rp[pr.key + "Cost"] = sumBy(fd, pr.key + "Cost");
        }
      });
      return rp;
    })
    .filter((p) => p && p.sessions > 0)
    .sort((x, y) => y.cost - x.cost);
  next.projects = rangeProjects;

  next.pricingNote = "Models are sorted by estimated cost usage for this selected range.";
  return next;
}

/* ── Render functions ────────────────────────────────────── */

function makeLegend(activeProviders) {
  var lg = el("div", { class: "chart-legend" });
  PROVIDERS.forEach((p) => {
    if (activeProviders && activeProviders.indexOf(p.key) === -1) return;
    var c = el("span");
    c.appendChild(el("span", { class: "swatch", style: `background:${p.color}` }));
    c.appendChild(document.createTextNode(p.label));
    lg.appendChild(c);
  });
  return lg;
}

function stackedGradient(parts) {
  // parts: [{color,value},...] — build linear-gradient from bottom to top
  var total = 0;
  parts.forEach((p) => {
    total += p.value;
  });
  if (total <= 0) return "#e2e8f0";
  var stops = [],
    cum = 0;
  parts.forEach((p) => {
    if (p.value <= 0) return;
    var pct = (p.value / total) * 100;
    stops.push(`${p.color} ${cum.toFixed(2)}% ${(cum + pct).toFixed(2)}%`);
    cum += pct;
  });
  if (stops.length === 1) return parts.filter((p) => p.value > 0)[0].color;
  return `linear-gradient(to top, ${stops.join(", ")})`;
}

function renderHeatmap(container, allDays, accent) {
  var WEEKS = 52;
  var dayMap = {};
  allDays.forEach((d) => {
    dayMap[d.date] = d;
  });

  // Build calendar: last 52 weeks ending on today's week
  var today = new Date();
  today.setHours(0, 0, 0, 0);
  var dow = today.getDay(); // 0=Sun
  var endDate = new Date(today);
  endDate.setDate(endDate.getDate() + (6 - dow));
  var startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - WEEKS * 7 + 1);

  var cells = [];
  var costs = [];
  var d = new Date(startDate);
  while (d <= endDate) {
    var key = d.toISOString().slice(0, 10);
    var entry = dayMap[key] || null;
    var cost = entry ? entry.cost || 0 : 0;
    if (cost > 0) costs.push(cost);
    cells.push({ date: key, cost: cost, sessions: entry ? entry.sessions || 0 : 0 });
    d.setDate(d.getDate() + 1);
  }

  // Percentile thresholds from non-zero costs
  costs.sort((a, b) => a - b);
  var p25 = costs.length > 0 ? costs[Math.floor(costs.length * 0.25)] : 0;
  var p50 = costs.length > 0 ? costs[Math.floor(costs.length * 0.5)] : 0;
  var p75 = costs.length > 0 ? costs[Math.floor(costs.length * 0.75)] : 0;

  function cellColor(cost) {
    if (cost <= 0) return "var(--heatmap-empty, var(--border-main))";
    var opacity = cost < p25 ? 0.2 : cost < p50 ? 0.4 : cost < p75 ? 0.6 : 0.9;
    return hexToRgba(accent, opacity);
  }

  // Month labels — use percentage widths to match flexible grid
  var monthRow = el("div", { class: "heatmap-months" });
  var prevMonth = -1;
  var weekMonths = [];
  for (var w = 0; w < WEEKS; w++) {
    var weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + w * 7);
    var m = weekStart.getMonth();
    if (m !== prevMonth) {
      weekMonths.push({ week: w, label: weekStart.toLocaleString("en-US", { month: "short" }) });
      prevMonth = m;
    }
  }
  weekMonths.forEach((wm, i) => {
    var nextPos = i + 1 < weekMonths.length ? weekMonths[i + 1].week : WEEKS;
    var span = nextPos - wm.week;
    monthRow.appendChild(el("span", { class: "heatmap-month-label", style: "flex:" + span }, wm.label));
  });

  // Day labels
  var dayLabels = el("div", { class: "heatmap-days" });
  var DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (var i = 0; i < 7; i++) {
    var show = i === 1 || i === 3 || i === 5;
    dayLabels.appendChild(el("div", { class: "heatmap-day-label" }, show ? DAYS[i].slice(0, 3) : ""));
  }

  // Grid — 7 rows, 52 columns, auto-flow column, full width
  var todayStr = today.toISOString().slice(0, 10);
  var grid = el("div", { class: "heatmap-grid", style: "grid-template-columns:repeat(" + WEEKS + ",1fr)" });
  cells.forEach((c) => {
    var dateObj = new Date(c.date + "T00:00:00");
    var label = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    var tip = c.cost > 0 ? label + ": $" + c.cost.toFixed(2) + " (" + c.sessions + " sess)" : label + ": no activity";
    var cls = "heatmap-cell" + (c.date === todayStr ? " today" : "");
    grid.appendChild(el("div", { class: cls, style: "background:" + cellColor(c.cost), title: tip }));
  });

  // Legend
  var legend = el("div", { class: "heatmap-legend" });
  legend.appendChild(document.createTextNode("Less"));
  [0, 0.2, 0.4, 0.6, 0.9].forEach((op) => {
    var bg = op === 0 ? "var(--heatmap-empty, var(--border-main))" : hexToRgba(accent, op);
    legend.appendChild(el("div", { class: "heatmap-legend-cell", style: "background:" + bg }));
  });
  legend.appendChild(document.createTextNode("More"));

  monthRow.style.marginLeft = "30px"; // offset for day labels
  container.appendChild(monthRow);
  var row = el("div", { class: "heatmap-wrap" });
  row.appendChild(dayLabels);
  row.appendChild(grid);
  container.appendChild(row);
  return legend;
}

function hexToRgba(hex, alpha) {
  hex = hex.replace("#", "");
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  var r = parseInt(hex.substring(0, 2), 16);
  var g = parseInt(hex.substring(2, 4), 16);
  var b = parseInt(hex.substring(4, 6), 16);
  return "rgba(" + r + "," + g + "," + b + "," + alpha + ")";
}

function renderBarChart(container, allDays, maxMsg, accent, stacked) {
  container.textContent = "";
  allDays.forEach((d) => {
    var isEmpty = d.sessions === 0;
    var h = isEmpty ? 0 : Math.max(4, (d.messages / maxMsg) * 140);
    var group = el("div", { class: "bar-group" });
    var bg = accent;
    if (stacked && !isEmpty && d.cost > 0) {
      bg = stackedGradient(PROVIDERS.map((p) => ({ color: p.color, value: d[p.key + "Cost"] || 0 })));
    }
    var bar = el("div", {
      class: "bar",
      style: `height:${isEmpty ? "2" : h}px;background:${isEmpty ? "#e2e8f0" : bg};`,
    });
    var tip = `${fullDateStr(d.date)} | ${fmtUSD(d.cost)}`;
    if (stacked) {
      PROVIDERS.forEach((p) => {
        if (d[p.key + "Cost"]) tip += `\n${p.label} ${fmtUSD(d[p.key + "Cost"])}`;
      });
    } else {
      tip += `, ${d.sessions} sessions`;
    }
    bar.appendChild(el("div", { class: "tooltip" }, tip));
    group.appendChild(bar);
    group.appendChild(el("div", { class: "bar-label" }, d.date.slice(5)));
    container.appendChild(group);
  });
}

function renderWeeklyChart(container, weeklySorted, weeklyMap, accent, stacked) {
  container.textContent = "";
  var maxCost = 1;
  weeklySorted.forEach((wk) => {
    if (weeklyMap[wk].cost > maxCost) maxCost = weeklyMap[wk].cost;
  });
  weeklySorted.forEach((wk) => {
    var w = weeklyMap[wk];
    var h = Math.max(8, (w.cost / maxCost) * 130);
    var group = el("div", { class: "bar-group" });
    group.appendChild(el("div", { class: "bar-cost", style: `color:${accent}` }, fmtUSD(w.cost)));
    var bg = accent;
    if (stacked && w.cost > 0) {
      bg = stackedGradient(PROVIDERS.map((p) => ({ color: p.color, value: w[p.key + "Cost"] || 0 })));
    }
    var bar = el("div", { class: "bar", style: `height:${h}px;background:${bg};` });
    var tip = `${weekLabel(wk)} | ${fmtUSD(w.cost)}`;
    if (stacked) {
      PROVIDERS.forEach((p) => {
        if (w[p.key + "Cost"]) tip += `\n${p.label} ${fmtUSD(w[p.key + "Cost"])}`;
      });
    } else {
      tip += `, ${w.sessions} sessions`;
    }
    bar.appendChild(el("div", { class: "tooltip" }, tip));
    group.appendChild(bar);
    group.appendChild(el("div", { class: "bar-label" }, weekLabel(wk)));
    container.appendChild(group);
  });
}

var PROJ_COLORS = [
  "#D37356",
  "#7385FE",
  "#047857",
  "#e4a222",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f97316",
  "#6366f1",
  "#84cc16",
];
function renderProjects(container, projects, _accent, _stacked) {
  if (!projects || !projects.length) return;
  var sec = el("div", { class: "section" });
  var projHeader = el("div", { class: "section-header" });
  projHeader.appendChild(el("h2", null, "Projects"));
  sec.appendChild(projHeader);
  var wrap = el("div", { class: "proj-wrap" });

  // Build donut data: top 5 + "Other"
  var SHOW_LIMIT = 5;
  var totalCost = 0;
  projects.forEach((p) => {
    totalCost += p.cost;
  });
  var slices = [];
  var otherCost = 0,
    otherSess = 0;
  projects.forEach((p, i) => {
    if (i < SHOW_LIMIT)
      slices.push({ name: p.name, cost: p.cost, sessions: p.sessions, color: PROJ_COLORS[i % PROJ_COLORS.length] });
    else {
      otherCost += p.cost;
      otherSess += p.sessions;
    }
  });
  if (otherCost > 0)
    slices.push({
      name: `Other (${projects.length - SHOW_LIMIT})`,
      cost: otherCost,
      sessions: otherSess,
      color: "#cbd5e1",
    });

  // Build conic-gradient
  var gradParts = [],
    cumPct = 0;
  slices.forEach((s) => {
    var pct = totalCost > 0 ? (s.cost / totalCost) * 100 : 0;
    gradParts.push(`${s.color} ${cumPct.toFixed(2)}% ${(cumPct + pct).toFixed(2)}%`);
    cumPct += pct;
  });
  var donutOuter = el("div", { class: "proj-donut", style: `background:conic-gradient(${gradParts.join(",")});` });
  donutOuter.appendChild(el("div", { class: "proj-donut-hole" }));
  wrap.appendChild(donutOuter);

  // Legend list
  var legend = el("div", { class: "proj-legend" });
  slices.forEach((s) => {
    var row = el("div", { class: "proj-legend-row" });
    row.appendChild(el("span", { class: "proj-swatch", style: `background:${s.color}` }));
    row.appendChild(el("span", { class: "proj-legend-name" }, s.name));
    var meta = el("span", { class: "proj-legend-meta" });
    meta.appendChild(el("span", { class: "proj-cost" }, fmtUSD(s.cost)));
    meta.appendChild(el("span", { class: "proj-sessions" }, `${s.sessions} sess`));
    row.appendChild(meta);
    legend.appendChild(row);
  });

  // Show more: full list below
  if (projects.length > SHOW_LIMIT) {
    var moreWrap = el("div", { class: "proj-more-list" });
    projects.slice(SHOW_LIMIT).forEach((p, _i) => {
      var row = el("div", { class: "proj-more-row" });
      row.appendChild(el("span", { class: "proj-swatch", style: "background:#cbd5e1" }));
      row.appendChild(el("span", { class: "proj-legend-name" }, p.name));
      var meta = el("span", { class: "proj-legend-meta" });
      meta.appendChild(el("span", { class: "proj-cost" }, fmtUSD(p.cost)));
      meta.appendChild(el("span", { class: "proj-sessions" }, `${p.sessions} sess`));
      row.appendChild(meta);
      moreWrap.appendChild(row);
    });
    moreWrap.style.display = "none";
    var toggle = el("button", { class: "proj-toggle", type: "button" }, `Show ${projects.length - SHOW_LIMIT} more`);
    var expanded = false;
    toggle.addEventListener("click", () => {
      expanded = !expanded;
      moreWrap.style.display = expanded ? "block" : "none";
      toggle.textContent = expanded ? "Show less" : `Show ${projects.length - SHOW_LIMIT} more`;
    });
    legend.appendChild(toggle);
    legend.appendChild(moreWrap);
  }

  wrap.appendChild(legend);
  sec.appendChild(wrap);
  container.appendChild(sec);
}

function renderPanel(panelEl, opts) {
  var accent = opts.accent;
  panelEl.textContent = "";
  panelEl.style.setProperty("--accent", accent);

  // Banner
  var fb = el("div", { class: "freshness-banner" });
  var s1 = el("span", { class: "date-info" });
  s1.appendChild(document.createTextNode("Sessions: "));
  s1.appendChild(el("span", { class: "date-val" }, String(opts.totalSessions)));
  fb.appendChild(s1);
  var fbRight = el("div", { style: "display:flex;gap:6px;align-items:center;" });
  if (opts.badgeEls?.length) {
    opts.badgeEls.forEach((b) => {
      fbRight.appendChild(b);
    });
  }
  var moreToggle = el("button", { class: "more-stats-toggle", type: "button" });
  moreToggle.textContent = "More \u25BE";
  fbRight.appendChild(moreToggle);
  fb.appendChild(fbRight);
  panelEl.appendChild(fb);

  // Stat cards
  var firstD = opts.firstDate ? new Date(opts.firstDate) : new Date();
  var totalSpanDays = Math.ceil((Date.now() - firstD) / 86400000) + 1;
  var tb = opts.tokenBreakdown;

  // --- Top 8 cards ---
  var sg = el("div", { class: "stats-grid" });
  var cc = el("div", { class: "stat-card hero" });
  cc.appendChild(el("div", { class: "stat-label" }, "Total Est. Cost"));
  cc.appendChild(el("div", { class: "stat-value cost" }, fmtUSD(opts.displayCost)));
  cc.appendChild(el("div", { class: "stat-sub" }, `${fullDateFromIso(opts.firstDate)} - today`));
  cc.appendChild(el("div", { class: "stat-sub" }, `${totalSpanDays}d span, ${opts.daysActive} active`));
  sg.appendChild(cc);
  sg.appendChild(createStatCard("Cost / Day", fmtUSD(opts.costPerDay), "cost", `avg across ${opts.daysActive} days`));
  sg.appendChild(
    createStatCard("Cost / Session", fmtUSD(opts.costPerSession), "cost", `${opts.totalSessions} total sessions`),
  );
  sg.appendChild(createStatCard("Streak", `${opts.streak} days`));
  // Msgs / Session
  var msgsPerSess = opts.totalSessions > 0 ? opts.userMessages / opts.totalSessions : 0;
  sg.appendChild(createStatCard("Msgs / Session", msgsPerSess.toFixed(1)));
  // Tokens
  var tokCard = createStatCard("Tokens", fmt(opts.totalTokens || 0));
  if (tb) {
    tokCard.style.position = "relative";
    tokCard.classList.add("has-tooltip");
    var lbl = tokCard.querySelector(".stat-label");
    if (lbl) lbl.appendChild(el("span", { class: "info-icon" }, "i"));
    var lines = [];
    if (tb.input) lines.push(`Input: ${fmt(tb.input)}`);
    if (tb.output) lines.push(`Output: ${fmt(tb.output)}`);
    if (tb.cacheRead) lines.push(`Cache Read: ${fmt(tb.cacheRead)}`);
    if (tb.cacheWrite) lines.push(`Cache Write: ${fmt(tb.cacheWrite)}`);
    if (tb.cached) lines.push(`Cached: ${fmt(tb.cached)}`);
    if (tb.reasoning) lines.push(`Reasoning: ${fmt(tb.reasoning)}`);
    tokCard.appendChild(el("div", { class: "stat-tooltip" }, lines.join("\n")));
  }
  sg.appendChild(tokCard);
  // Output/$
  var outPerDollar = opts.displayCost > 0 ? opts.outputTokens / opts.displayCost : 0;
  var opdCard = createStatCard("Output / $", fmt(Math.round(outPerDollar)));
  opdCard.style.position = "relative";
  opdCard.classList.add("has-tooltip");
  var opdLbl = opdCard.querySelector(".stat-label");
  if (opdLbl) opdLbl.appendChild(el("span", { class: "info-icon" }, "i"));
  opdCard.appendChild(
    el(
      "div",
      { class: "stat-tooltip" },
      `Output tokens per dollar spent\n${fmt(opts.outputTokens)} output / ${fmtUSD(opts.displayCost)}`,
    ),
  );
  sg.appendChild(opdCard);
  // Cache Rate
  if (tb) {
    var cacheToks = (tb.cacheRead || 0) + (tb.cached || 0) + (tb.cacheWrite || 0);
    var cacheRate = opts.totalTokens > 0 ? (cacheToks / opts.totalTokens) * 100 : 0;
    var crCard = createStatCard("Cache Rate", `${cacheRate.toFixed(1)}%`);
    crCard.style.position = "relative";
    crCard.classList.add("has-tooltip");
    var crLbl = crCard.querySelector(".stat-label");
    if (crLbl) crLbl.appendChild(el("span", { class: "info-icon" }, "i"));
    var crLines = ["Cache tokens as % of all tokens"];
    if (tb.cacheRead) crLines.push(`Cache Read: ${fmt(tb.cacheRead)}`);
    if (tb.cached) crLines.push(`Cached: ${fmt(tb.cached)}`);
    if (tb.cacheWrite) crLines.push(`Cache Write: ${fmt(tb.cacheWrite)}`);
    crLines.push(`Total: ${fmt(cacheToks)} / ${fmt(opts.totalTokens)}`);
    crCard.appendChild(el("div", { class: "stat-tooltip" }, crLines.join("\n")));
    sg.appendChild(crCard);
  }
  panelEl.appendChild(sg);

  // --- More cards (hidden by default) ---
  var moreGrid = el("div", { class: "stats-grid stats-more" });
  moreGrid.style.display = "none";
  moreGrid.appendChild(createStatCard("Messages", opts.userMessages.toLocaleString()));
  // Output %
  var outPct = opts.totalTokens > 0 ? (opts.outputTokens / opts.totalTokens) * 100 : 0;
  var opCard = createStatCard("Output %", `${outPct.toFixed(1)}%`);
  opCard.style.position = "relative";
  opCard.classList.add("has-tooltip");
  var opLbl = opCard.querySelector(".stat-label");
  if (opLbl) opLbl.appendChild(el("span", { class: "info-icon" }, "i"));
  opCard.appendChild(
    el(
      "div",
      { class: "stat-tooltip" },
      `Output tokens as % of all tokens\n${fmt(opts.outputTokens)} / ${fmt(opts.totalTokens)}`,
    ),
  );
  moreGrid.appendChild(opCard);
  if (opts.extraCards)
    opts.extraCards.forEach((c) => {
      moreGrid.appendChild(c);
    });
  panelEl.appendChild(moreGrid);

  // Toggle more stats
  var moreExpanded = false;
  moreToggle.addEventListener("click", () => {
    moreExpanded = !moreExpanded;
    moreGrid.style.display = moreExpanded ? "" : "none";
    moreToggle.textContent = moreExpanded ? "Less \u25B4" : "More \u25BE";
  });

  // Heatmap
  if (opts.allDays && opts.allDays.length > 0) {
    var secHeat = el("div", { class: "section" });
    var heatHeader = el("div", { class: "section-header" });
    heatHeader.appendChild(el("h2", null, "Activity"));
    var heatLegend = renderHeatmap(secHeat, opts.allDays, accent);
    if (heatLegend) heatHeader.appendChild(heatLegend);
    secHeat.insertBefore(heatHeader, secHeat.firstChild);
    panelEl.appendChild(secHeat);
  }

  // Daily chart
  var sec1 = el("div", { class: "section" });
  var sec1Header = el("div", { class: "section-header" });
  sec1Header.appendChild(el("h2", null, "Daily Activity"));
  if (opts.stacked) sec1Header.appendChild(makeLegend(opts.activeProviders));
  sec1.appendChild(sec1Header);
  var cc1 = el("div", { class: "chart-container" });
  var bc = el("div", { class: "bar-chart" });
  renderBarChart(bc, opts.allDays, opts.maxMsg, accent, opts.stacked);
  cc1.appendChild(bc);
  sec1.appendChild(cc1);
  panelEl.appendChild(sec1);

  // Weekly chart
  if (opts.weeklySorted && opts.weeklySorted.length > 0) {
    var sec3 = el("div", { class: "section" });
    var sec3Header = el("div", { class: "section-header" });
    sec3Header.appendChild(el("h2", null, "Weekly Usage"));
    if (opts.stacked) sec3Header.appendChild(makeLegend(opts.activeProviders));
    sec3.appendChild(sec3Header);
    var cc3 = el("div", { class: "chart-container" });
    var wc = el("div", { class: "weekly-chart" });
    renderWeeklyChart(wc, opts.weeklySorted, opts.weeklyMap, accent, opts.stacked);
    cc3.appendChild(wc);
    sec3.appendChild(cc3);
    panelEl.appendChild(sec3);
  }

  // Projects
  if (opts.projects && opts.projects.length > 0) renderProjects(panelEl, opts.projects, accent, opts.stacked);

  // Model usage
  if (opts.modelUsage && opts.modelUsage.length > 0) {
    var sec2 = el("div", { class: "section" });
    var sec2Header = el("div", { class: "section-header" });
    sec2Header.appendChild(el("h2", null, "Usage by Model"));
    sec2.appendChild(sec2Header);
    var maxModelCost = opts.modelUsage[0].cost || 1;
    var showProviderBadge = !!opts.showProviderBadge;
    var muList = el("div", { class: "model-usage-list" });
    opts.modelUsage.forEach((m) => {
      var row = el("div", { class: "mu-row" });
      var left = el("div", { class: "mu-left" });
      left.appendChild(createModelTag(m.id));
      if (showProviderBadge) {
        var pm = PROVIDER_MAP[m.provider] || PROVIDER_MAP.claude;
        var provBadge = el("span", { class: `sub-badge ${pm.key}` });
        provBadge.textContent = pm.label;
        left.appendChild(provBadge);
      }
      row.appendChild(left);
      var right = el("div", { class: "mu-right" });
      var barW = Math.max(2, (m.cost / maxModelCost) * 100);
      var barColor = PROVIDER_MAP[m.provider] ? PROVIDER_MAP[m.provider].color : CLAUDE_COLOR;
      right.appendChild(el("div", { class: "mu-bar", style: `width:${barW}%;background:${barColor};` }));
      right.appendChild(el("span", { class: "mu-cost" }, fmtUSD(m.cost)));
      row.appendChild(right);
      muList.appendChild(row);
    });
    sec2.appendChild(muList);
    panelEl.appendChild(sec2);
  }

  // Daily table
  if (opts.dailyRows && opts.dailyRows.length > 0) {
    var sec4 = el("div", { class: "section" });
    var dailyCostView = opts.dailyCostView === "model" ? "model" : opts.stacked ? "agent" : "model";
    var head = el("div", { class: "section-header" });
    head.appendChild(el("h2", null, "Daily Cost"));
    if (opts.stacked && typeof opts.onDailyCostViewChange === "function") {
      var viewToggle = el("div", { class: "daily-view-toggle" });
      [
        { id: "agent", label: "Agent" },
        { id: "model", label: "Model" },
      ].forEach((v) => {
        var btn = el(
          "button",
          { class: `daily-view-btn${dailyCostView === v.id ? " active" : ""}`, "data-view": v.id, type: "button" },
          v.label,
        );
        btn.addEventListener("click", () => {
          if (dailyCostView !== v.id) opts.onDailyCostViewChange(v.id);
        });
        viewToggle.appendChild(btn);
      });
      head.appendChild(viewToggle);
    }
    sec4.appendChild(head);
    var tbl = el("table");
    var thead = el("thead");
    var htr = el("tr");
    htr.appendChild(el("th", null, "Date"));
    htr.appendChild(el("th", { class: "r" }, "Sessions"));
    htr.appendChild(el("th", null, dailyCostView === "agent" ? "Agents" : "Models"));
    htr.appendChild(el("th", { class: "r" }, "Est. Cost"));
    thead.appendChild(htr);
    tbl.appendChild(thead);
    var tbody = el("tbody");
    var modelCostById = {};
    var modelCostByKey = {};
    if (opts.modelUsage?.length) {
      opts.modelUsage.forEach((m) => {
        var id = m.id;
        var key = modelUsageKey(id);
        var cost = m.cost || 0;
        modelCostById[id] = Math.max(modelCostById[id] || 0, cost);
        modelCostByKey[key] = (modelCostByKey[key] || 0) + cost;
      });
    }
    function modelScore(id) {
      if (Object.hasOwn(modelCostById, id)) return modelCostById[id];
      var key = modelUsageKey(id);
      return modelCostByKey[key] || 0;
    }
    var TABLE_INITIAL = 7;
    var tableExpanded = false;
    function buildRow(row) {
      var tr = el("tr");
      tr.appendChild(el("td", null, fullDateStr(row.date)));
      tr.appendChild(el("td", { class: "num" }, String(row.sessions)));
      var tdM = el("td");
      var rowCostColor = accent;
      var dominantModelId = null;
      if (dailyCostView === "agent" && opts.stacked) {
        var agents = rowAgentCosts(row);
        agents.sort((a, b) => {
          if (a.cost !== b.cost) return b.cost - a.cost;
          return a.label.localeCompare(b.label);
        });
        if (agents.length) {
          agents.forEach((a) => {
            var badge = el("span", { class: `sub-badge ${a.key}`, style: "margin-left:0;margin-right:6px;" }, a.label);
            tdM.appendChild(badge);
          });
          rowCostColor = agents[0].color;
        } else {
          tdM.textContent = "-";
        }
      } else if (row.models?.length) {
        var sortedModels = row.models.slice().sort((a, b) => {
          var rowCosts = row.modelCosts || {};
          var saRow = rowCosts[a] || 0,
            sbRow = rowCosts[b] || 0;
          if (saRow !== sbRow) return sbRow - saRow;
          var sa = modelScore(a),
            sb = modelScore(b);
          if (sa !== sb) return sb - sa;
          var ka = modelSortKey(a),
            kb = modelSortKey(b);
          if (ka !== kb) return ka - kb;
          return a.localeCompare(b);
        });
        if (sortedModels.length) dominantModelId = sortedModels[0];
        sortedModels.forEach((m) => {
          tdM.appendChild(createModelTag(m));
          tdM.appendChild(document.createTextNode(" "));
        });
        if (dominantModelId) rowCostColor = colorForModel(dominantModelId);
      } else tdM.textContent = "-";
      tr.appendChild(tdM);
      tr.appendChild(el("td", { class: "cost-cell", style: `color:${rowCostColor}` }, fmtUSD(row.cost)));
      return tr;
    }
    opts.dailyRows.forEach((row, idx) => {
      var tr = buildRow(row);
      if (idx >= TABLE_INITIAL) tr.style.display = "none";
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    sec4.appendChild(tbl);
    if (opts.dailyRows.length > TABLE_INITIAL) {
      var remaining = opts.dailyRows.length - TABLE_INITIAL;
      var tblToggle = el("button", { class: "table-show-more", type: "button" }, `Show ${remaining} more days`);
      tblToggle.addEventListener("click", () => {
        tableExpanded = !tableExpanded;
        var rows = tbody.querySelectorAll("tr");
        for (var ri = TABLE_INITIAL; ri < rows.length; ri++) {
          rows[ri].style.display = tableExpanded ? "" : "none";
        }
        tblToggle.textContent = tableExpanded ? "Show less" : `Show ${remaining} more days`;
      });
      sec4.appendChild(tblToggle);
    }
    panelEl.appendChild(sec4);
  }

  // Pricing note
  if (opts.pricingNote) {
    var pn = el("div", { class: "pricing-note" });
    pn.textContent = opts.pricingNote;
    panelEl.appendChild(pn);
  }
}

/* ── Main ────────────────────────────────────────────────── */
function main() {
  var providerData = {};
  PROVIDERS.forEach((p) => {
    providerData[p.key] = DATA[p.key] != null ? DATA[p.key] : null;
  });
  var activeProvs = PROVIDERS.filter((p) => providerData[p.key] != null);
  var selectedRange = "this_month";
  var allDailyCostView = "agent";

  // Build base opts for each active provider
  var baseProv = {};
  activeProvs.forEach((p) => {
    baseProv[p.key] = buildOpts(providerData[p.key]);
  });
  var allBase = mergeOpts(activeProvs.map((p) => baseProv[p.key]));

  // Tabs
  var tabBar = document.getElementById("tab-bar");
  var defaultTab;
  if (activeProvs.length >= 2) {
    var allBtn = el("button", { class: "tab-btn", "data-tab": "all" }, [el("span", null, "All")]);
    allBtn.addEventListener("click", () => {
      switchTab("all");
    });
    tabBar.appendChild(allBtn);
    defaultTab = "all";
  } else {
    defaultTab = activeProvs.length === 1 ? activeProvs[0].key : null;
  }

  activeProvs.forEach((p) => {
    var tabMeta = typeof DATA !== "undefined" && DATA && DATA.appMeta ? DATA.appMeta : {};
    var iconBase = tabMeta.assetBase ? toFileUrl(tabMeta.assetBase) : "";
    var children = [];
    if (iconBase) {
      var img = el("img", { class: "tab-icon", src: `${iconBase}/${p.key}.webp`, alt: `${p.label} logo` });
      img.onerror = function () {
        this.style.display = "none";
      };
      children.push(img);
    }
    children.push(el("span", null, p.label));
    var btn = el("button", { class: "tab-btn", "data-tab": p.key }, children);
    btn.addEventListener("click", () => {
      switchTab(p.key);
    });
    tabBar.appendChild(btn);
  });

  // Date range controls
  var rangeSelect = document.getElementById("range-select");
  RANGE_OPTIONS.forEach((r) => {
    var option = el("option", { value: r.id }, r.label);
    rangeSelect.appendChild(option);
  });
  rangeSelect.addEventListener("change", () => {
    setRange(rangeSelect.value);
  });

  function renderPanels() {
    if (activeProvs.length >= 2) {
      var allOpts = applyRange(allBase, selectedRange);
      allOpts.dailyCostView = allDailyCostView;
      allOpts.onDailyCostViewChange = (nextView) => {
        allDailyCostView = nextView === "model" ? "model" : "agent";
        renderPanels();
      };
      renderPanel(document.getElementById("panel-all"), allOpts);
    }
    activeProvs.forEach((p) => {
      var provOpts = applyRange(baseProv[p.key], selectedRange);
      provOpts.dailyCostView = "model";
      renderPanel(document.getElementById("panel-" + p.key), provOpts);
    });
  }

  function setRange(id) {
    selectedRange = id;
    if (rangeSelect && rangeSelect.value !== id) rangeSelect.value = id;
    renderPanels();
  }

  function switchTab(id) {
    document.querySelectorAll(".tab-btn").forEach((b) => {
      b.classList.remove("active");
    });
    document.querySelectorAll(".tab-panel").forEach((p) => {
      p.classList.remove("active");
    });
    var tabBtn = document.querySelector(`[data-tab="${id}"]`);
    if (tabBtn) tabBtn.classList.add("active");
    var panel = document.getElementById(`panel-${id}`);
    if (panel) panel.classList.add("active");
    history.replaceState(null, "", `#${id}`);
  }
  setRange(selectedRange);
  var hash = location.hash.replace("#", "");
  var validTabs = activeProvs.map((p) => p.key);
  if (activeProvs.length >= 2) validTabs.unshift("all");
  var userDefault = DATA.defaultTab || null;
  if (validTabs.indexOf(hash) !== -1) switchTab(hash);
  else if (userDefault && validTabs.indexOf(userDefault) !== -1) switchTab(userDefault);
  else if (defaultTab) switchTab(defaultTab);
}

renderFooter();

// Theme toggle
(() => {
  var STORAGE_KEY = "code-usage-theme";
  var html = document.documentElement;
  var saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch (_e) {
    /* noop */
  }
  if (saved && ["system", "light", "dark"].indexOf(saved) !== -1) {
    html.setAttribute("data-theme", saved);
  }
  var toggle = document.getElementById("theme-toggle");
  if (!toggle) return;
  function setActive(theme) {
    toggle.querySelectorAll(".theme-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
    });
  }
  var current = html.getAttribute("data-theme") || "system";
  setActive(current);
  toggle.addEventListener("click", (e) => {
    var btn = e.target.closest(".theme-btn");
    if (!btn) return;
    var theme = btn.getAttribute("data-theme");
    if (!theme) return;
    html.setAttribute("data-theme", theme);
    setActive(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (_e) {
      /* noop */
    }
  });
})();

// Add relative time to gen-time
(() => {
  var gt = document.getElementById("gen-time");
  if (!gt || !DATA.metadata || !DATA.metadata.createdAt) return;
  var diff = Math.floor((Date.now() - new Date(DATA.metadata.createdAt).getTime()) / 1000);
  var ago;
  if (diff < 5) ago = "just now";
  else if (diff < 60) ago = `${diff}s ago`;
  else if (diff < 3600) ago = `${Math.floor(diff / 60)}m ago`;
  else if (diff < 86400) ago = `${Math.floor(diff / 3600)}h ago`;
  else ago = `${Math.floor(diff / 86400)}d ago`;
  gt.textContent = `${gt.textContent} (${ago})`;
})();
var hasAnyData = PROVIDERS.some((p) => DATA[p.key] != null);
if (hasAnyData) {
  main();
} else {
  var esDiv = el("div", { class: "empty-state" });
  esDiv.appendChild(el("h2", null, "Welcome to Code Usage"));
  esDiv.appendChild(el("p", null, "No usage data found. Start using a supported AI coding tool:"));
  var esUl = el("ul", { class: "provider-list" });
  esUl.appendChild(el("li", null, [el("a", { href: "https://claude.ai/code" }, "Claude Code")]));
  esUl.appendChild(el("li", null, [el("a", { href: "https://github.com/openai/codex" }, "Codex CLI")]));
  esUl.appendChild(el("li", null, [el("a", { href: "https://github.com/nicepkg/opencode" }, "OpenCode")]));
  esUl.appendChild(el("li", null, [el("a", { href: "https://ampcode.com" }, "Amp")]));
  esUl.appendChild(el("li", null, [el("a", { href: "https://github.com/anthropics/pi-agent" }, "Pi-Agent")]));
  esDiv.appendChild(esUl);
  var esHint = el("p");
  esHint.appendChild(document.createTextNode("Then run "));
  esHint.appendChild(el("code", null, "npx code-usage"));
  esHint.appendChild(document.createTextNode(" again."));
  esDiv.appendChild(esHint);
  document.querySelector(".container").insertAdjacentElement("afterbegin", esDiv);
}
