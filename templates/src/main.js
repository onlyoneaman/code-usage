/* ── Helpers ─────────────────────────────────────────────── */
function fmt(n){if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return String(n);}
function fmtUSD(n){return '$'+n.toFixed(2);}
function pad2(n){return n<10?'0'+n:String(n);}
function localDateStr(d){return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());}
function fullDateStr(ds){
  var m=String(ds||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m?(m[2]+'-'+m[3]+'-'+m[1]):String(ds||'');
}
function fullDateFromIso(iso){
  if(!iso)return '-';
  var d=new Date(iso);
  if(Number.isNaN(d.getTime()))return String(iso);
  return pad2(d.getMonth()+1)+'-'+pad2(d.getDate())+'-'+d.getFullYear();
}
function modelUsageKey(id){return String(id||'').replace(/-\d{8}$/,'');}
function toFileUrl(pathLike){
  var p=String(pathLike||'').replace(/\\/g,'/');
  if(!p)return '';
  if(p.indexOf('file://')===0||p.indexOf('http://')===0||p.indexOf('https://')===0)return p;
  if(p.charAt(0)==='/')return 'file://'+p;
  return 'file:///'+p;
}
function providerFromModel(id){return String(id||'').startsWith('gpt-')?'codex':'claude';}
function colorForModel(id){
  var mid=String(id||'').toLowerCase();
  if(mid.startsWith('gpt-'))return CODEX_COLOR;
  if(mid.indexOf('haiku')!==-1)return '#047857';
  if(mid.indexOf('sonnet')!==-1)return '#c47a5f';
  return CLAUDE_COLOR;
}
function rowAgentCosts(row){
  var claude=0,codex=0;
  var mc=row&&row.modelCosts?row.modelCosts:null;
  if(mc){
    for(var mid in mc){
      if(providerFromModel(mid)==='codex')codex+=(mc[mid]||0);
      else claude+=(mc[mid]||0);
    }
  }
  return{claude:claude,codex:codex};
}
var MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function el(tag,attrs,children){
  var e=document.createElement(tag);
  if(attrs)for(var k in attrs){if(k==='class')e.className=attrs[k];else if(k==='style')e.style.cssText=attrs[k];else e.setAttribute(k,attrs[k]);}
  if(children){if(typeof children==='string')e.textContent=children;else if(Array.isArray(children))children.forEach(function(c){if(c)e.appendChild(c);});else e.appendChild(children);}
  return e;
}
function createStatCard(label,value,cls,sub){
  var card=el('div',{class:'stat-card'});card.appendChild(el('div',{class:'stat-label'},label));card.appendChild(el('div',{class:'stat-value'+(cls?' '+cls:'')},value));if(sub)card.appendChild(el('div',{class:'stat-sub'},sub));return card;
}

function renderFooter(){
  var footerMeta=document.getElementById('footer-meta');
  if(!footerMeta)return;

  var meta=(typeof DATA!=='undefined'&&DATA&&DATA.appMeta)?DATA.appMeta:{};
  var authorName=meta.authorName||'Aman';
  var authorUrl=meta.authorUrl||'https://x.com/onlyoneaman';
  var repoUrl=meta.repoUrl||'https://github.com/onlyoneaman/code-usage';
  var packageUrl=meta.packageUrl||'https://www.npmjs.com/package/code-usage';
  var appName=meta.name||'code-usage';
  var version=meta.version||'';

  footerMeta.textContent='';
  footerMeta.appendChild(document.createTextNode('Made with ❤️ by '));
  footerMeta.appendChild(el('a',{href:authorUrl,target:'_blank',rel:'noopener noreferrer'},authorName));
  if(version)footerMeta.appendChild(document.createTextNode(' · v'+version));
  footerMeta.appendChild(document.createTextNode(' · '));
  footerMeta.appendChild(el('a',{href:repoUrl,target:'_blank',rel:'noopener noreferrer'},'GitHub'));
  footerMeta.appendChild(document.createTextNode(' · '));
  footerMeta.appendChild(el('a',{href:packageUrl,target:'_blank',rel:'noopener noreferrer'},appName));
}

var MODEL_ORDER=['opus-4-6','opus-4-5','opus-4-1','opus-4','sonnet-4-5','sonnet-4','sonnet-3-7','haiku-4-5','haiku-3-5','gpt-5.3','gpt-5.2','gpt-5.1','gpt-5-codex'];
function modelSortKey(id){for(var i=0;i<MODEL_ORDER.length;i++){if(id.includes(MODEL_ORDER[i]))return i;}return 99;}

function createModelTag(id){
  var isCodex=id.startsWith('gpt-');
  if(isCodex)return el('span',{class:'model-tag model-codex'},id);
  var name=id.replace('claude-','').replace(/-\d{8}$/,'');var parts=name.split('-');
  var family=parts[0].charAt(0).toUpperCase()+parts[0].slice(1);var version=parts.slice(1).join('.');
  name=family+' '+version;
  var cls='model-tag model-sonnet';if(id.includes('opus'))cls='model-tag model-opus';else if(id.includes('haiku'))cls='model-tag model-haiku';
  return el('span',{class:cls},name);
}

function getWeekStart(ds){var d=new Date(ds+'T12:00:00');var day=d.getDay();var diff=day===0?6:day-1;d.setDate(d.getDate()-diff);return localDateStr(d);}
function weekLabel(monStr){var mon=new Date(monStr+'T12:00:00');var sun=new Date(mon);sun.setDate(sun.getDate()+6);if(mon.getMonth()===sun.getMonth())return MONTHS[mon.getMonth()]+' '+mon.getDate()+'-'+sun.getDate();return MONTHS[mon.getMonth()]+' '+mon.getDate()+' - '+MONTHS[sun.getMonth()]+' '+sun.getDate();}
function sumBy(list,key){return list.reduce(function(acc,item){return acc+(item[key]||0);},0);}

/* ── Build view opts from pre-computed data ──────────────── */
function buildOpts(data){
  var s=data.summary, accent=data.accent;
  var daysActive=data.daily.length;
  var costPerDay=daysActive>0?s.totalCost/daysActive:0;
  var costPerSession=s.totalSessions>0?s.totalCost/s.totalSessions:0;
  var firstD=s.firstDate?new Date(s.firstDate):new Date();
  var now=new Date(),todayStr=localDateStr(now);

  // Fill in gaps for daily chart
  var dailyByDate={};
  data.daily.forEach(function(d){dailyByDate[d.date]=d;});
  var allDays=[],cursor=new Date(firstD);
  while(localDateStr(cursor)<=todayStr){var ds=localDateStr(cursor);allDays.push(dailyByDate[ds]||{date:ds,cost:0,sessions:0,messages:0,models:[]});cursor.setDate(cursor.getDate()+1);}
  var maxMsg=1;allDays.forEach(function(d){if(d.messages>maxMsg)maxMsg=d.messages;});

  // Weekly aggregation
  var weeklyMap={};
  data.daily.forEach(function(d){var wk=getWeekStart(d.date);if(!weeklyMap[wk])weeklyMap[wk]={cost:0,sessions:0};weeklyMap[wk].cost+=d.cost;weeklyMap[wk].sessions+=d.sessions;});
  var weeklySorted=Object.keys(weeklyMap).sort();

  // Daily table rows (newest first)
  var dailyRows=data.daily.slice().reverse();

  // Extra stat cards
  var extraCards=[];
  if(data.extra){
    if(data.extra.linesAdded||data.extra.linesRemoved)extraCards.push(createStatCard('Lines','+'+fmt(data.extra.linesAdded||0)+' / -'+fmt(data.extra.linesRemoved||0)));
    if(data.extra.filesModified)extraCards.push(createStatCard('Files Modified',fmt(data.extra.filesModified)));
  }

  // Badge
  var badgeEls=[];
  if(data.badge){var b=el('span',{class:'sub-badge '+(data.provider==='claude'?'claude':'codex')});b.textContent=data.badge;badgeEls.push(el('span',{class:'date-info'},[b]));}

  var rawModels=data.models.map(function(m){return{id:m.id,cost:m.cost,provider:data.provider};});
  var modelUsage=rawModels.slice().sort(function(a,b){return b.cost-a.cost;});

  return{
    accent:accent,displayCost:s.totalCost,daysActive:daysActive,totalSessions:s.totalSessions,
    costPerDay:costPerDay,costPerSession:costPerSession,streak:s.streak,
    userMessages:s.totalMessages,outputTokens:s.totalOutputTokens,firstDate:s.firstDate,
    allDays:allDays,maxMsg:maxMsg,rawModels:rawModels,
    modelUsage:modelUsage,showProviderBadge:false,
    weeklySorted:weeklySorted,weeklyMap:weeklyMap,
    dailyRows:dailyRows,extraCards:extraCards,badgeEls:badgeEls,pricingNote:data.pricingNote
  };
}

function mergeOpts(a,b){
  // Merge two provider opts into combined "All" view
  if(!a)return adjustAccent(b);if(!b)return adjustAccent(a);
  var displayCost=a.displayCost+b.displayCost,totalSess=a.totalSessions+b.totalSessions;
  var userMsgs=a.userMessages+b.userMessages,outTok=a.outputTokens+b.outputTokens;

  // Build per-provider day lookups
  var aDayMap={},bDayMap={};
  a.allDays.forEach(function(d){aDayMap[d.date]=d;});
  b.allDays.forEach(function(d){bDayMap[d.date]=d;});

  // Merge daily with per-provider breakdown
  var dayMap={};
  function addDays(days){days.forEach(function(d){if(!dayMap[d.date])dayMap[d.date]={date:d.date,cost:0,sessions:0,messages:0};dayMap[d.date].cost+=d.cost;dayMap[d.date].sessions+=d.sessions;dayMap[d.date].messages+=d.messages;});}
  addDays(a.allDays);addDays(b.allDays);
  var allDates=Object.keys(dayMap).sort();
  var firstDate=allDates.length?allDates[0]+'T00:00:00.000Z':null;
  var now=new Date(),todayStr=localDateStr(now),allDays=[];
  var EMPTY={cost:0,sessions:0,messages:0};
  if(allDates.length){var cursor=new Date(allDates[0]+'T12:00:00');while(localDateStr(cursor)<=todayStr){var ds=localDateStr(cursor);var merged=dayMap[ds]||{date:ds,cost:0,sessions:0,messages:0};var ad=aDayMap[ds]||EMPTY,bd=bDayMap[ds]||EMPTY;merged.claudeCost=ad.cost||0;merged.codexCost=bd.cost||0;merged.claudeMsg=ad.messages||0;merged.codexMsg=bd.messages||0;merged.claudeSess=ad.sessions||0;merged.codexSess=bd.sessions||0;allDays.push(merged);cursor.setDate(cursor.getDate()+1);}}
  var maxMsg=1;allDays.forEach(function(d){if(d.messages>maxMsg)maxMsg=d.messages;});
  var daysActive=allDays.filter(function(d){return d.sessions>0;}).length;

  // Streak
  var activeDates={};allDays.forEach(function(d){if(d.sessions>0)activeDates[d.date]=true;});
  var streak=0,check=new Date(now);while(activeDates[localDateStr(check)]){streak++;check.setDate(check.getDate()-1);}

  // Merge weekly with per-provider breakdown
  var aWeekly=a.weeklyMap||{},bWeekly=b.weeklyMap||{};
  var weeklyMap={};
  function addW(wm){for(var wk in wm){if(!weeklyMap[wk])weeklyMap[wk]={cost:0,sessions:0,claudeCost:0,codexCost:0};weeklyMap[wk].cost+=wm[wk].cost;weeklyMap[wk].sessions+=wm[wk].sessions;}}
  addW(a.weeklyMap);addW(b.weeklyMap);
  // Add per-provider costs to weekly
  for(var wk in aWeekly){if(weeklyMap[wk])weeklyMap[wk].claudeCost+=aWeekly[wk].cost;}
  for(var wk2 in bWeekly){if(weeklyMap[wk2])weeklyMap[wk2].codexCost+=bWeekly[wk2].cost;}
  var weeklySorted=Object.keys(weeklyMap).sort();

  // Merge daily rows
  var drMap={};
  function addDR(rows){
    rows.forEach(function(r){
      if(!drMap[r.date])drMap[r.date]={date:r.date,cost:0,sessions:0,messages:0,models:[],modelCosts:{}};
      drMap[r.date].cost+=r.cost;
      drMap[r.date].sessions+=r.sessions;
      drMap[r.date].messages+=r.messages;
      if(r.modelCosts){
        for(var mk in r.modelCosts){
          drMap[r.date].modelCosts[mk]=(drMap[r.date].modelCosts[mk]||0)+(r.modelCosts[mk]||0);
        }
      }
      if(r.models)(r.models).forEach(function(m){if(drMap[r.date].models.indexOf(m)===-1)drMap[r.date].models.push(m);});
    });
  }
  addDR(a.dailyRows);addDR(b.dailyRows);
  var dailyRows=Object.keys(drMap).sort().reverse().map(function(d){
    var row=drMap[d];
    if(row.modelCosts){
      row.models=Object.keys(row.modelCosts).sort(function(x,y){
        var cx=row.modelCosts[x]||0,cy=row.modelCosts[y]||0;
        if(cx!==cy)return cy-cx;
        return x.localeCompare(y);
      });
    }
    return row;
  });

  // Badges with counts
  var badgeEls=[];
  function countBadge(label,count,cls){var wrap=el('span',{class:'date-info'});var bg=el('span',{class:'sub-badge '+cls});bg.textContent=label+' '+count;wrap.appendChild(bg);return wrap;}
  badgeEls.push(countBadge('Claude',a.totalSessions,'claude'));
  badgeEls.push(countBadge('Codex',b.totalSessions,'codex'));

  // Per-model usage sorted by cost desc
  var allModels=[].concat(a.rawModels||[]).concat(b.rawModels||[]);
  allModels.sort(function(x,y){return y.cost-x.cost;});

  return{
    accent:'#3b82f6',displayCost:displayCost,daysActive:daysActive,totalSessions:totalSess,
    costPerDay:daysActive>0?displayCost/daysActive:0,costPerSession:totalSess>0?displayCost/totalSess:0,
    streak:streak,userMessages:userMsgs,outputTokens:outTok,firstDate:firstDate,
    allDays:allDays,maxMsg:maxMsg,stacked:true,
    modelUsage:allModels,
    showProviderBadge:true,
    weeklySorted:weeklySorted,weeklyMap:weeklyMap,dailyRows:dailyRows,
    extraCards:[],badgeEls:badgeEls,
    pricingNote:'Combined view across Claude and Codex. Models are sorted by estimated cost usage.'
  };
}

function adjustAccent(o){var r=Object.assign({},o);r.accent='#3b82f6';return r;}

var RANGE_OPTIONS=[
  {id:'this_week',label:'This Week'},
  {id:'this_month',label:'This Month'},
  {id:'this_year',label:'This Year'},
  {id:'last_30_days',label:'Last 30 Days'},
  {id:'last_90_days',label:'Last 90 Days'},
  {id:'all_time',label:'All Time'}
];

function rangeStart(rangeId){
  var now=new Date(),start=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  if(rangeId==='this_week'){
    var day=start.getDay();
    var diff=day===0?6:day-1; // Monday start
    start.setDate(start.getDate()-diff);
    return localDateStr(start);
  }
  if(rangeId==='this_month'){start.setDate(1);return localDateStr(start);}
  if(rangeId==='this_year'){start.setMonth(0,1);return localDateStr(start);}
  if(rangeId==='last_30_days'){start.setDate(start.getDate()-29);return localDateStr(start);}
  if(rangeId==='last_90_days'){start.setDate(start.getDate()-89);return localDateStr(start);}
  return null;
}

function computeStreak(allDays){
  var active={};allDays.forEach(function(d){if(d.sessions>0)active[d.date]=true;});
  var streak=0,check=new Date();
  while(active[localDateStr(check)]){streak++;check.setDate(check.getDate()-1);}
  return streak;
}

function applyRange(opts,rangeId){
  if(!opts)return opts;
  if(rangeId==='all_time'){
    var full=Object.assign({},opts);
    full.rangeId=rangeId;
    return full;
  }

  var start=rangeStart(rangeId);
  var allDays=(opts.allDays||[]).filter(function(d){return d.date>=start;});
  var dailyRows=(opts.dailyRows||[]).filter(function(r){return r.date>=start;});
  var displayCost=sumBy(allDays,'cost');
  var totalSessions=sumBy(allDays,'sessions');
  // Daily message counts can include non-user/internal events in some providers.
  // Keep message totals aligned to provider summary metric, then scale by selected range.
  var baseMessages=Math.max(0,opts.userMessages||0);
  var baseDailyMessages=sumBy(opts.allDays||[],'messages');
  var rangeDailyMessages=sumBy(allDays,'messages');
  var userMessages=baseMessages;
  if(baseMessages>0&&baseDailyMessages>0){
    userMessages=Math.round(baseMessages*(rangeDailyMessages/baseDailyMessages));
  }
  var daysActive=allDays.filter(function(d){return d.sessions>0;}).length;
  var firstActive=null;
  for(var i=0;i<allDays.length;i++){if(allDays[i].sessions>0){firstActive=allDays[i].date+'T00:00:00.000Z';break;}}
  var maxMsg=1;allDays.forEach(function(d){if(d.messages>maxMsg)maxMsg=d.messages;});

  var weeklyMap={};
  allDays.forEach(function(d){
    var wk=getWeekStart(d.date);
    if(!weeklyMap[wk])weeklyMap[wk]={cost:0,sessions:0,claudeCost:0,codexCost:0};
    weeklyMap[wk].cost+=d.cost||0;
    weeklyMap[wk].sessions+=d.sessions||0;
    weeklyMap[wk].claudeCost+=d.claudeCost||0;
    weeklyMap[wk].codexCost+=d.codexCost||0;
  });
  var weeklySorted=Object.keys(weeklyMap).sort();
  var baseModels=(opts.modelUsage&&opts.modelUsage.length)?opts.modelUsage:(opts.rawModels||[]);
  var rangeRatio=(opts.displayCost||0)>0?displayCost/opts.displayCost:0;
  var modelUsage=baseModels.map(function(m){
    return {id:m.id,cost:(m.cost||0)*rangeRatio,provider:m.provider};
  }).filter(function(m){return m.cost>0;}).sort(function(a,b){return b.cost-a.cost;});

  var next=Object.assign({},opts,{
    rangeId:rangeId,
    allDays:allDays,
    maxMsg:maxMsg,
    dailyRows:dailyRows,
    weeklyMap:weeklyMap,
    weeklySorted:weeklySorted,
    displayCost:displayCost,
    totalSessions:totalSessions,
    userMessages:userMessages,
    daysActive:daysActive,
    firstDate:firstActive,
    costPerDay:daysActive>0?displayCost/daysActive:0,
    costPerSession:totalSessions>0?displayCost/totalSessions:0,
    streak:computeStreak(allDays),
    modelUsage:modelUsage
  });

  if(next.stacked){
    var claudeSessions=sumBy(allDays,'claudeSess');
    var codexSessions=sumBy(allDays,'codexSess');
    var badgeEls=[];
    function countBadge(label,count,cls){var wrap=el('span',{class:'date-info'});var bg=el('span',{class:'sub-badge '+cls});bg.textContent=label+' '+count;wrap.appendChild(bg);return wrap;}
    badgeEls.push(countBadge('Claude',claudeSessions,'claude'));
    badgeEls.push(countBadge('Codex',codexSessions,'codex'));
    next.badgeEls=badgeEls;
  }

  next.pricingNote='Models are sorted by estimated cost usage for this selected range.';
  return next;
}

/* ── Render functions ────────────────────────────────────── */
var CLAUDE_COLOR='#D37356',CODEX_COLOR='#7385FE';

function makeLegend(){
  var lg=el('div',{class:'chart-legend'});
  var c1=el('span');c1.appendChild(el('span',{class:'swatch',style:'background:'+CLAUDE_COLOR}));c1.appendChild(document.createTextNode('Claude'));lg.appendChild(c1);
  var c2=el('span');c2.appendChild(el('span',{class:'swatch',style:'background:'+CODEX_COLOR}));c2.appendChild(document.createTextNode('Codex'));lg.appendChild(c2);
  return lg;
}

function renderBarChart(container,allDays,maxMsg,accent,stacked){
  container.textContent='';
  allDays.forEach(function(d){
    var isEmpty=d.sessions===0;var h=isEmpty?0:Math.max(4,(d.messages/maxMsg)*140);
    var group=el('div',{class:'bar-group'});
    var bg=accent;
    if(stacked&&!isEmpty&&d.cost>0){
      var claudePct=d.claudeCost/d.cost*100;
      bg='linear-gradient(to top, '+CLAUDE_COLOR+' '+claudePct+'%, '+CODEX_COLOR+' '+claudePct+'%)';
    }
    var bar=el('div',{class:'bar',style:'height:'+(isEmpty?'2':h)+'px;background:'+(isEmpty?'#e2e8f0':bg)+';'});
    var tip=fullDateStr(d.date)+' | '+fmtUSD(d.cost);
    if(stacked){tip+='\nClaude '+fmtUSD(d.claudeCost||0)+'\nCodex '+fmtUSD(d.codexCost||0);}
    else{tip+=', '+d.sessions+' sessions';}
    bar.appendChild(el('div',{class:'tooltip'},tip));
    group.appendChild(bar);group.appendChild(el('div',{class:'bar-label'},d.date.slice(5)));container.appendChild(group);
  });
}

function renderWeeklyChart(container,weeklySorted,weeklyMap,accent,stacked){
  container.textContent='';var maxCost=1;weeklySorted.forEach(function(wk){if(weeklyMap[wk].cost>maxCost)maxCost=weeklyMap[wk].cost;});
  weeklySorted.forEach(function(wk){var w=weeklyMap[wk];var h=Math.max(8,(w.cost/maxCost)*130);
    var group=el('div',{class:'bar-group'});
    group.appendChild(el('div',{class:'bar-cost',style:'color:'+accent},fmtUSD(w.cost)));
    var bg=accent;
    if(stacked&&w.cost>0){
      var claudePct=w.claudeCost/w.cost*100;
      bg='linear-gradient(to top, '+CLAUDE_COLOR+' '+claudePct+'%, '+CODEX_COLOR+' '+claudePct+'%)';
    }
    var bar=el('div',{class:'bar',style:'height:'+h+'px;background:'+bg+';'});
    var tip=weekLabel(wk)+' | '+fmtUSD(w.cost);
    if(stacked){tip+='\nClaude '+fmtUSD(w.claudeCost||0)+'\nCodex '+fmtUSD(w.codexCost||0);}
    else{tip+=', '+w.sessions+' sessions';}
    bar.appendChild(el('div',{class:'tooltip'},tip));
    group.appendChild(bar);group.appendChild(el('div',{class:'bar-label'},weekLabel(wk)));container.appendChild(group);
  });
}

function renderPanel(panelEl,opts){
  var accent=opts.accent;
  panelEl.textContent='';panelEl.style.setProperty('--accent',accent);

  // Banner
  var fb=el('div',{class:'freshness-banner'});
  var s1=el('span',{class:'date-info'});s1.appendChild(document.createTextNode('Sessions: '));s1.appendChild(el('span',{class:'date-val'},String(opts.totalSessions)));fb.appendChild(s1);
  if(opts.badgeEls&&opts.badgeEls.length){var bwrap=el('div',{style:'display:flex;gap:6px;align-items:center;'});opts.badgeEls.forEach(function(b){bwrap.appendChild(b);});fb.appendChild(bwrap);}
  panelEl.appendChild(fb);

  // Stat cards
  var firstD=opts.firstDate?new Date(opts.firstDate):new Date();
  var totalSpanDays=Math.ceil((new Date()-firstD)/86400000)+1;
  var sg=el('div',{class:'stats-grid'});
  var cc=el('div',{class:'stat-card'});cc.appendChild(el('div',{class:'stat-label'},'Total Est. Cost'));cc.appendChild(el('div',{class:'stat-value cost'},fmtUSD(opts.displayCost)));
  cc.appendChild(el('div',{class:'stat-sub'},fullDateFromIso(opts.firstDate)+' - today'));
  cc.appendChild(el('div',{class:'stat-sub'},totalSpanDays+'d span, '+opts.daysActive+' active'));sg.appendChild(cc);
  sg.appendChild(createStatCard('Cost / Day',fmtUSD(opts.costPerDay),'cost','avg across '+opts.daysActive+' days'));
  sg.appendChild(createStatCard('Cost / Session',fmtUSD(opts.costPerSession),'cost',opts.totalSessions+' total sessions'));
  sg.appendChild(createStatCard('Streak',opts.streak+' days'));
  sg.appendChild(createStatCard('Messages',opts.userMessages.toLocaleString()));
  sg.appendChild(createStatCard('Output Tokens',fmt(opts.outputTokens)));
  if(opts.extraCards)opts.extraCards.forEach(function(c){sg.appendChild(c);});
  panelEl.appendChild(sg);

  // Daily chart
  var sec1=el('div',{class:'section'});sec1.appendChild(el('h2',null,'Daily Activity'));
  var cc1=el('div',{class:'chart-container'});
  if(opts.stacked){cc1.appendChild(makeLegend());}
  var bc=el('div',{class:'bar-chart'});
  renderBarChart(bc,opts.allDays,opts.maxMsg,accent,opts.stacked);cc1.appendChild(bc);sec1.appendChild(cc1);panelEl.appendChild(sec1);

  // Weekly chart
  if(opts.weeklySorted&&opts.weeklySorted.length>0){var sec3=el('div',{class:'section'});sec3.appendChild(el('h2',null,'Weekly Usage'));var cc3=el('div',{class:'chart-container'});if(opts.stacked){cc3.appendChild(makeLegend());}var wc=el('div',{class:'weekly-chart'});renderWeeklyChart(wc,opts.weeklySorted,opts.weeklyMap,accent,opts.stacked);cc3.appendChild(wc);sec3.appendChild(cc3);panelEl.appendChild(sec3);}

  // Model usage
  if(opts.modelUsage&&opts.modelUsage.length>0){
    var sec2=el('div',{class:'section'});sec2.appendChild(el('h2',null,'Usage by Model'));
    var maxModelCost=opts.modelUsage[0].cost||1;
    var showProviderBadge=!!opts.showProviderBadge;
    var muList=el('div',{class:'model-usage-list'});
    opts.modelUsage.forEach(function(m){
      var row=el('div',{class:'mu-row'});
      var left=el('div',{class:'mu-left'});
      left.appendChild(createModelTag(m.id));
      if(showProviderBadge){
        var provCls=m.provider==='claude'?'claude':'codex';
        var provBadge=el('span',{class:'sub-badge '+provCls});provBadge.textContent=m.provider==='claude'?'Claude':'Codex';
        left.appendChild(provBadge);
      }
      row.appendChild(left);
      var right=el('div',{class:'mu-right'});
      var barW=Math.max(2,(m.cost/maxModelCost)*100);
      var barColor=m.provider==='claude'?CLAUDE_COLOR:CODEX_COLOR;
      right.appendChild(el('div',{class:'mu-bar',style:'width:'+barW+'%;background:'+barColor+';'}));
      right.appendChild(el('span',{class:'mu-cost'},fmtUSD(m.cost)));
      row.appendChild(right);
      muList.appendChild(row);
    });
    sec2.appendChild(muList);panelEl.appendChild(sec2);
  }

  // Daily table
  if(opts.dailyRows&&opts.dailyRows.length>0){
    var sec4=el('div',{class:'section'});
    var dailyCostView=opts.dailyCostView==='model'?'model':(opts.stacked?'agent':'model');
    var head=el('div',{style:'display:flex;justify-content:space-between;align-items:center;gap:10px;'});
    head.appendChild(el('h2',null,'Daily Cost'));
    if(opts.stacked&&typeof opts.onDailyCostViewChange==='function'){
      var viewToggle=el('div',{class:'daily-view-toggle'});
      [{id:'agent',label:'Agent'},{id:'model',label:'Model'}].forEach(function(v){
        var btn=el('button',{class:'daily-view-btn'+(dailyCostView===v.id?' active':''),'data-view':v.id,type:'button'},v.label);
        btn.addEventListener('click',function(){
          if(dailyCostView!==v.id)opts.onDailyCostViewChange(v.id);
        });
        viewToggle.appendChild(btn);
      });
      head.appendChild(viewToggle);
    }
    sec4.appendChild(head);
    var tbl=el('table');var thead=el('thead');var htr=el('tr');
    htr.appendChild(el('th',null,'Date'));htr.appendChild(el('th',{class:'r'},'Sessions'));htr.appendChild(el('th',null,dailyCostView==='agent'?'Agents':'Models'));htr.appendChild(el('th',{class:'r'},'Est. Cost'));
    thead.appendChild(htr);tbl.appendChild(thead);
    var tbody=el('tbody');
    var modelCostById={};
    var modelCostByKey={};
    if(opts.modelUsage&&opts.modelUsage.length){
      opts.modelUsage.forEach(function(m){
        var id=m.id;
        var key=modelUsageKey(id);
        var cost=m.cost||0;
        modelCostById[id]=Math.max(modelCostById[id]||0,cost);
        modelCostByKey[key]=(modelCostByKey[key]||0)+cost;
      });
    }
    function modelScore(id){
      if(Object.prototype.hasOwnProperty.call(modelCostById,id))return modelCostById[id];
      var key=modelUsageKey(id);
      return modelCostByKey[key]||0;
    }
    opts.dailyRows.forEach(function(row){
      var tr=el('tr');tr.appendChild(el('td',null,fullDateStr(row.date)));tr.appendChild(el('td',{class:'num'},String(row.sessions)));
      var tdM=el('td');
      var rowCostColor=accent;
      var dominantModelId=null;
      if(dailyCostView==='agent'&&opts.stacked){
        var ac=rowAgentCosts(row);
        var agents=[];
        if(ac.claude>0)agents.push({label:'Claude',cls:'claude',cost:ac.claude});
        if(ac.codex>0)agents.push({label:'Codex',cls:'codex',cost:ac.codex});
        agents.sort(function(a,b){if(a.cost!==b.cost)return b.cost-a.cost;return a.label.localeCompare(b.label);});
        if(agents.length){
          agents.forEach(function(a){
            var badge=el('span',{class:'sub-badge '+a.cls,style:'margin-left:0;margin-right:6px;'},a.label);
            tdM.appendChild(badge);
          });
          rowCostColor=ac.codex>ac.claude?CODEX_COLOR:CLAUDE_COLOR;
        }else{
          tdM.textContent='-';
        }
      }else if(row.models&&row.models.length){
        var sortedModels=row.models.slice().sort(function(a,b){
          var rowCosts=row.modelCosts||{};
          var saRow=rowCosts[a]||0,sbRow=rowCosts[b]||0;
          if(saRow!==sbRow)return sbRow-saRow;
          var sa=modelScore(a),sb=modelScore(b);
          if(sa!==sb)return sb-sa;
          var ka=modelSortKey(a),kb=modelSortKey(b);
          if(ka!==kb)return ka-kb;
          return a.localeCompare(b);
        });
        if(sortedModels.length)dominantModelId=sortedModels[0];
        sortedModels.forEach(function(m){tdM.appendChild(createModelTag(m));tdM.appendChild(document.createTextNode(' '));});
        if(dominantModelId)rowCostColor=colorForModel(dominantModelId);
      }else tdM.textContent='-';
      tr.appendChild(tdM);tr.appendChild(el('td',{class:'cost-cell',style:'color:'+rowCostColor},fmtUSD(row.cost)));tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);sec4.appendChild(tbl);panelEl.appendChild(sec4);
  }

  // Pricing note
  if(opts.pricingNote){var pn=el('div',{class:'pricing-note'});pn.textContent=opts.pricingNote;panelEl.appendChild(pn);}
}

function renderNoData(panelEl,toolName,installUrl){
  panelEl.textContent='';var nd=el('div',{class:'no-data'});nd.appendChild(el('h3',null,'No '+toolName+' usage data found'));
  var p=el('p');p.appendChild(document.createTextNode('Install '));p.appendChild(el('a',{href:installUrl},toolName));p.appendChild(document.createTextNode(' and use it to start tracking.'));
  nd.appendChild(p);panelEl.appendChild(nd);
}

/* ── Main ────────────────────────────────────────────────── */
function main(){
  var CLAUDE=DATA.claude,CODEX=DATA.codex;
  var hasClaude=CLAUDE!==null,hasCodex=CODEX!==null;
  var defaultTab=DATA.defaultTab||'all';
  var selectedRange='this_month';
  var allDailyCostView='agent';

  var claudeBase=hasClaude?buildOpts(CLAUDE):null;
  var codexBase=hasCodex?buildOpts(CODEX):null;
  var allBase=mergeOpts(claudeBase,codexBase);

  // Tabs
  var tabBar=document.getElementById('tab-bar');
  [
    {id:'all',label:'All'},
    {id:'claude',label:'Claude',icon:'claude.webp'},
    {id:'codex',label:'Codex',icon:'codex.webp'}
  ].forEach(function(t){
    var tabMeta=(typeof DATA!=='undefined'&&DATA&&DATA.appMeta)?DATA.appMeta:{};
    var iconBase=tabMeta.assetBase?toFileUrl(tabMeta.assetBase):'';
    var children=[];
    if(t.icon&&iconBase)children.push(el('img',{class:'tab-icon',src:iconBase+'/'+t.icon,alt:t.label+' logo'}));
    children.push(el('span',null,t.label));
    var btn=el('button',{class:'tab-btn','data-tab':t.id},children);btn.addEventListener('click',function(){switchTab(t.id);});tabBar.appendChild(btn);
  });

  // Date range controls
  var rangeSelect=document.getElementById('range-select');
  RANGE_OPTIONS.forEach(function(r){
    var option=el('option',{value:r.id},r.label);
    rangeSelect.appendChild(option);
  });
  rangeSelect.addEventListener('change',function(){setRange(rangeSelect.value);});

  function renderPanels(){
    var allOpts=applyRange(allBase,selectedRange);
    allOpts.dailyCostView=allDailyCostView;
    allOpts.onDailyCostViewChange=function(nextView){
      allDailyCostView=nextView==='model'?'model':'agent';
      renderPanels();
    };
    renderPanel(document.getElementById('panel-all'),allOpts);
    if(hasClaude){
      var claudeOpts=applyRange(claudeBase,selectedRange);
      claudeOpts.dailyCostView='model';
      renderPanel(document.getElementById('panel-claude'),claudeOpts);
    }else renderNoData(document.getElementById('panel-claude'),'Claude Code','https://code.claude.com/docs/en/overview');
    if(hasCodex){
      var codexOpts=applyRange(codexBase,selectedRange);
      codexOpts.dailyCostView='model';
      renderPanel(document.getElementById('panel-codex'),codexOpts);
    }else renderNoData(document.getElementById('panel-codex'),'Codex CLI','https://developers.openai.com/codex/cli/');
  }

  function setRange(id){
    selectedRange=id;
    if(rangeSelect&&rangeSelect.value!==id)rangeSelect.value=id;
    renderPanels();
  }

  function switchTab(id){document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});document.querySelector('[data-tab="'+id+'"]').classList.add('active');document.getElementById('panel-'+id).classList.add('active');history.replaceState(null,'','#'+id);}
  setRange(selectedRange);
  var hash=location.hash.replace('#','');if(['all','claude','codex'].indexOf(hash)!==-1)switchTab(hash);else switchTab(defaultTab);
}

renderFooter();
if(DATA.claude!==null||DATA.codex!==null){main();}
else{document.querySelector('.container').insertAdjacentElement('afterbegin',el('div',{class:'no-data'},'No data. Run code-usage to generate.'));}
