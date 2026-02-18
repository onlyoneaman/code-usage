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
function providerFromModel(id){
  var s=String(id||'').toLowerCase();
  if(s.startsWith('gpt-'))return 'codex';
  if(s.startsWith('claude-')||s.indexOf('opus')!==-1||s.indexOf('sonnet')!==-1||s.indexOf('haiku')!==-1)return 'claude';
  return 'opencode';
}
function colorForModel(id){
  var mid=String(id||'').toLowerCase();
  if(mid.startsWith('gpt-'))return CODEX_COLOR;
  if(mid.indexOf('haiku')!==-1)return '#047857';
  if(mid.indexOf('sonnet')!==-1)return '#c47a5f';
  if(mid.startsWith('claude-')||mid.indexOf('opus')!==-1)return CLAUDE_COLOR;
  return OPENCODE_COLOR;
}
function rowAgentCosts(row){
  var claude=0,codex=0,opencode=0;
  var mc=row&&row.modelCosts?row.modelCosts:null;
  if(mc){
    for(var mid in mc){
      var p=providerFromModel(mid);
      if(p==='codex')codex+=(mc[mid]||0);
      else if(p==='opencode')opencode+=(mc[mid]||0);
      else claude+=(mc[mid]||0);
    }
  }
  return{claude:claude,codex:codex,opencode:opencode};
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

  var feedbackLine=el('p',{style:'margin-top:6px;'});
  feedbackLine.appendChild(document.createTextNode('If you liked it, '));
  feedbackLine.appendChild(el('a',{href:repoUrl,target:'_blank',rel:'noopener noreferrer'},'star on GitHub'));
  feedbackLine.appendChild(document.createTextNode(' · Feedback/bugs? '));
  feedbackLine.appendChild(el('a',{href:authorUrl,target:'_blank',rel:'noopener noreferrer'},'Contact '+authorName));
  footerMeta.parentNode.appendChild(feedbackLine);
}

var MODEL_ORDER=['opus-4-6','opus-4-5','opus-4-1','opus-4','sonnet-4-5','sonnet-4','sonnet-3-7','haiku-4-5','haiku-3-5','gpt-5.3','gpt-5.2','gpt-5.1','gpt-5-codex'];
function modelSortKey(id){for(var i=0;i<MODEL_ORDER.length;i++){if(id.includes(MODEL_ORDER[i]))return i;}return 99;}

function createModelTag(id){
  var isCodex=id.startsWith('gpt-');
  if(isCodex)return el('span',{class:'model-tag model-codex'},id);
  var isClaude=id.startsWith('claude-')||id.indexOf('opus')!==-1||id.indexOf('sonnet')!==-1||id.indexOf('haiku')!==-1;
  if(isClaude){
    var name=id.replace('claude-','').replace(/-\d{8}$/,'');var parts=name.split('-');
    var family=parts[0].charAt(0).toUpperCase()+parts[0].slice(1);var version=parts.slice(1).join('.');
    name=family+' '+version;
    var cls='model-tag model-sonnet';if(id.includes('opus'))cls='model-tag model-opus';else if(id.includes('haiku'))cls='model-tag model-haiku';
    return el('span',{class:cls},name);
  }
  return el('span',{class:'model-tag model-opencode'},id);
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
  var projects=(data.projects||[]).map(function(p){return{name:p.name,path:p.path,sessions:p.sessions,messages:p.messages,cost:p.cost,daily:p.daily,provider:data.provider};});

  return{
    accent:accent,displayCost:s.totalCost,daysActive:daysActive,totalSessions:s.totalSessions,
    costPerDay:costPerDay,costPerSession:costPerSession,streak:s.streak,
    userMessages:s.totalMessages,outputTokens:s.totalOutputTokens,totalTokens:s.totalTokens||0,tokenBreakdown:s.tokenBreakdown||null,firstDate:s.firstDate,
    allDays:allDays,maxMsg:maxMsg,rawModels:rawModels,
    modelUsage:modelUsage,showProviderBadge:false,
    weeklySorted:weeklySorted,weeklyMap:weeklyMap,
    dailyRows:dailyRows,extraCards:extraCards,badgeEls:badgeEls,pricingNote:data.pricingNote,
    projects:projects
  };
}

function mergeOpts(optsList){
  // Merge N provider opts into combined "All" view
  var valid=optsList.filter(function(o){return !!o;});
  if(valid.length===0)return null;
  if(valid.length===1)return adjustAccent(valid[0]);

  var displayCost=0,totalSess=0,userMsgs=0,outTok=0,allTok=0;
  var mergedBreakdown={input:0,output:0,cacheRead:0,cacheWrite:0,cached:0,reasoning:0};
  valid.forEach(function(o){
    displayCost+=o.displayCost;totalSess+=o.totalSessions;userMsgs+=o.userMessages;outTok+=o.outputTokens;allTok+=(o.totalTokens||0);
    var tb=o.tokenBreakdown||{};
    mergedBreakdown.input+=(tb.input||0);mergedBreakdown.output+=(tb.output||0);
    mergedBreakdown.cacheRead+=(tb.cacheRead||0);mergedBreakdown.cacheWrite+=(tb.cacheWrite||0);
    mergedBreakdown.cached+=(tb.cached||0);mergedBreakdown.reasoning+=(tb.reasoning||0);
  });

  // Build per-provider day lookups
  var provDayMaps=[];
  valid.forEach(function(o){var m={};(o.allDays||[]).forEach(function(d){m[d.date]=d;});provDayMaps.push(m);});

  // Merge daily
  var dayMap={};
  valid.forEach(function(o){(o.allDays||[]).forEach(function(d){
    if(!dayMap[d.date])dayMap[d.date]={date:d.date,cost:0,sessions:0,messages:0,claudeCost:0,codexCost:0,opencodeCost:0,claudeSess:0,codexSess:0,opencodeSess:0,claudeMsg:0,codexMsg:0,opencodeMsg:0};
    dayMap[d.date].cost+=d.cost;dayMap[d.date].sessions+=d.sessions;dayMap[d.date].messages+=d.messages;
  });});

  // Fill provider-specific fields
  var PROV_KEYS=[{key:'claude',idx:null},{key:'codex',idx:null},{key:'opencode',idx:null}];
  valid.forEach(function(o,i){
    var pk=null;
    if(o.accent===CLAUDE_COLOR)pk='claude';else if(o.accent===CODEX_COLOR)pk='codex';else pk='opencode';
    var dm={};(o.allDays||[]).forEach(function(d){dm[d.date]=d;});
    for(var date in dayMap){
      var sd=dm[date];
      if(sd){dayMap[date][pk+'Cost']+=(sd.cost||0);dayMap[date][pk+'Sess']+=(sd.sessions||0);dayMap[date][pk+'Msg']+=(sd.messages||0);}
    }
  });

  var allDates=Object.keys(dayMap).sort();
  var firstDate=allDates.length?allDates[0]+'T00:00:00.000Z':null;
  var now=new Date(),todayStr=localDateStr(now),allDays=[];
  if(allDates.length){var cursor=new Date(allDates[0]+'T12:00:00');while(localDateStr(cursor)<=todayStr){var ds=localDateStr(cursor);allDays.push(dayMap[ds]||{date:ds,cost:0,sessions:0,messages:0,claudeCost:0,codexCost:0,opencodeCost:0,claudeSess:0,codexSess:0,opencodeSess:0});cursor.setDate(cursor.getDate()+1);}}
  var maxMsg=1;allDays.forEach(function(d){if(d.messages>maxMsg)maxMsg=d.messages;});
  var daysActive=allDays.filter(function(d){return d.sessions>0;}).length;

  // Streak
  var activeDatesSet={};allDays.forEach(function(d){if(d.sessions>0)activeDatesSet[d.date]=true;});
  var streak=0,check=new Date(now);while(activeDatesSet[localDateStr(check)]){streak++;check.setDate(check.getDate()-1);}

  // Merge weekly
  var weeklyMap={};
  valid.forEach(function(o){
    var pk=o.accent===CLAUDE_COLOR?'claude':(o.accent===CODEX_COLOR?'codex':'opencode');
    for(var wk in (o.weeklyMap||{})){
      if(!weeklyMap[wk])weeklyMap[wk]={cost:0,sessions:0,claudeCost:0,codexCost:0,opencodeCost:0};
      weeklyMap[wk].cost+=(o.weeklyMap[wk].cost||0);weeklyMap[wk].sessions+=(o.weeklyMap[wk].sessions||0);
      weeklyMap[wk][pk+'Cost']+=(o.weeklyMap[wk].cost||0);
    }
  });
  var weeklySorted=Object.keys(weeklyMap).sort();

  // Merge daily rows
  var drMap={};
  valid.forEach(function(o){
    (o.dailyRows||[]).forEach(function(r){
      if(!drMap[r.date])drMap[r.date]={date:r.date,cost:0,sessions:0,messages:0,models:[],modelCosts:{}};
      drMap[r.date].cost+=r.cost;drMap[r.date].sessions+=r.sessions;drMap[r.date].messages+=r.messages;
      if(r.modelCosts){for(var mk in r.modelCosts){drMap[r.date].modelCosts[mk]=(drMap[r.date].modelCosts[mk]||0)+(r.modelCosts[mk]||0);}}
      if(r.models)(r.models).forEach(function(m){if(drMap[r.date].models.indexOf(m)===-1)drMap[r.date].models.push(m);});
    });
  });
  var dailyRows=Object.keys(drMap).sort().reverse().map(function(d){
    var row=drMap[d];
    if(row.modelCosts){row.models=Object.keys(row.modelCosts).sort(function(x,y){var cx=row.modelCosts[x]||0,cy=row.modelCosts[y]||0;if(cx!==cy)return cy-cx;return x.localeCompare(y);});}
    return row;
  });

  // Badges
  var badgeEls=[];
  function countBadge(label,count,cls){var wrap=el('span',{class:'date-info'});var bg=el('span',{class:'sub-badge '+cls});bg.textContent=label+' '+count;wrap.appendChild(bg);return wrap;}
  valid.forEach(function(o){
    var pk=o.accent===CLAUDE_COLOR?'claude':(o.accent===CODEX_COLOR?'codex':'opencode');
    var label=pk.charAt(0).toUpperCase()+pk.slice(1);
    if(pk==='opencode')label='OpenCode';
    badgeEls.push(countBadge(label,o.totalSessions,pk));
  });

  // All models
  var allModels=[];
  valid.forEach(function(o){allModels=allModels.concat(o.rawModels||[]);});
  allModels.sort(function(x,y){return y.cost-x.cost;});

  // Merge projects
  var projMap={};
  valid.forEach(function(o){
    var pk=o.accent===CLAUDE_COLOR?'claude':(o.accent===CODEX_COLOR?'codex':'opencode');
    (o.projects||[]).forEach(function(p){
      if(!projMap[p.name])projMap[p.name]={name:p.name,path:p.path,sessions:0,messages:0,cost:0,claudeCost:0,codexCost:0,opencodeCost:0,daily:{}};
      projMap[p.name].sessions+=p.sessions;projMap[p.name].messages+=p.messages;projMap[p.name].cost+=p.cost;
      projMap[p.name][pk+'Cost']+=(p.cost||0);
      (p.daily||[]).forEach(function(d){
        if(!projMap[p.name].daily[d.date])projMap[p.name].daily[d.date]={sessions:0,messages:0,cost:0,claudeCost:0,codexCost:0,opencodeCost:0};
        projMap[p.name].daily[d.date].sessions+=d.sessions;projMap[p.name].daily[d.date].messages+=d.messages;projMap[p.name].daily[d.date].cost+=d.cost;
        projMap[p.name].daily[d.date][pk+'Cost']+=(d.cost||0);
      });
    });
  });
  var mergedProjects=Object.keys(projMap).map(function(k){
    var p=projMap[k];
    p.daily=Object.keys(p.daily).sort().map(function(date){var d=p.daily[date];return{date:date,sessions:d.sessions,messages:d.messages,cost:d.cost,claudeCost:d.claudeCost,codexCost:d.codexCost,opencodeCost:d.opencodeCost};});
    return p;
  }).sort(function(x,y){return y.cost-x.cost;});

  // Track which providers are present for stacked charts
  var activeProviders=[];
  valid.forEach(function(o){
    var pk=o.accent===CLAUDE_COLOR?'claude':(o.accent===CODEX_COLOR?'codex':'opencode');
    activeProviders.push(pk);
  });

  return{
    accent:'#3b82f6',displayCost:displayCost,daysActive:daysActive,totalSessions:totalSess,
    costPerDay:daysActive>0?displayCost/daysActive:0,costPerSession:totalSess>0?displayCost/totalSess:0,
    streak:streak,userMessages:userMsgs,outputTokens:outTok,totalTokens:allTok,tokenBreakdown:mergedBreakdown,firstDate:firstDate,
    allDays:allDays,maxMsg:maxMsg,stacked:true,activeProviders:activeProviders,
    modelUsage:allModels,
    showProviderBadge:true,
    weeklySorted:weeklySorted,weeklyMap:weeklyMap,dailyRows:dailyRows,
    extraCards:[],badgeEls:badgeEls,
    pricingNote:'Combined view across all agents. Models are sorted by estimated cost usage.',
    projects:mergedProjects
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
    full.projects=opts.projects||[];
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
  var msgRatio=1;
  if(baseMessages>0&&baseDailyMessages>0){
    msgRatio=rangeDailyMessages/baseDailyMessages;
    userMessages=Math.round(baseMessages*msgRatio);
  }
  var daysActive=allDays.filter(function(d){return d.sessions>0;}).length;
  var firstActive=null;
  for(var i=0;i<allDays.length;i++){if(allDays[i].sessions>0){firstActive=allDays[i].date+'T00:00:00.000Z';break;}}
  var maxMsg=1;allDays.forEach(function(d){if(d.messages>maxMsg)maxMsg=d.messages;});

  var weeklyMap={};
  allDays.forEach(function(d){
    var wk=getWeekStart(d.date);
    if(!weeklyMap[wk])weeklyMap[wk]={cost:0,sessions:0,claudeCost:0,codexCost:0,opencodeCost:0};
    weeklyMap[wk].cost+=d.cost||0;
    weeklyMap[wk].sessions+=d.sessions||0;
    weeklyMap[wk].claudeCost+=d.claudeCost||0;
    weeklyMap[wk].codexCost+=d.codexCost||0;
    weeklyMap[wk].opencodeCost+=d.opencodeCost||0;
  });
  var weeklySorted=Object.keys(weeklyMap).sort();
  var baseModels=(opts.modelUsage&&opts.modelUsage.length)?opts.modelUsage:(opts.rawModels||[]);
  var rangeRatio=(opts.displayCost||0)>0?displayCost/opts.displayCost:0;
  var modelUsage=baseModels.map(function(m){
    return {id:m.id,cost:(m.cost||0)*rangeRatio,provider:m.provider};
  }).filter(function(m){return m.cost>0;}).sort(function(a,b){return b.cost-a.cost;});

  // Scale tokens by range ratio
  var rangeOutputTokens=Math.round((opts.outputTokens||0)*msgRatio);
  var rangeTotalTokens=Math.round((opts.totalTokens||0)*msgRatio);
  var rangeBreakdown=null;
  if(opts.tokenBreakdown){
    var ob=opts.tokenBreakdown;
    rangeBreakdown={};
    for(var bk in ob){if(ob[bk])rangeBreakdown[bk]=Math.round(ob[bk]*msgRatio);}
  }

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
    outputTokens:rangeOutputTokens,
    totalTokens:rangeTotalTokens,
    tokenBreakdown:rangeBreakdown,
    daysActive:daysActive,
    firstDate:firstActive,
    costPerDay:daysActive>0?displayCost/daysActive:0,
    costPerSession:totalSessions>0?displayCost/totalSessions:0,
    streak:computeStreak(allDays),
    modelUsage:modelUsage
  });

  if(next.stacked){
    var badgeEls=[];
    function countBadge(label,count,cls){var wrap=el('span',{class:'date-info'});var bg=el('span',{class:'sub-badge '+cls});bg.textContent=label+' '+count;wrap.appendChild(bg);return wrap;}
    var claudeSessions=sumBy(allDays,'claudeSess');
    var codexSessions=sumBy(allDays,'codexSess');
    var opencodeSessions=sumBy(allDays,'opencodeSess');
    if(claudeSessions>0)badgeEls.push(countBadge('Claude',claudeSessions,'claude'));
    if(codexSessions>0)badgeEls.push(countBadge('Codex',codexSessions,'codex'));
    if(opencodeSessions>0)badgeEls.push(countBadge('OpenCode',opencodeSessions,'opencode'));
    next.badgeEls=badgeEls;
  }

  // Filter projects by range
  var rangeProjects=(opts.projects||[]).map(function(p){
    var fd=(p.daily||[]).filter(function(d){return d.date>=start;});
    if(fd.length===0)return null;
    var rp={name:p.name,path:p.path,daily:fd,provider:p.provider,
      sessions:sumBy(fd,'sessions'),messages:sumBy(fd,'messages'),cost:sumBy(fd,'cost')};
    if(p.claudeCost!==undefined){rp.claudeCost=sumBy(fd,'claudeCost');rp.codexCost=sumBy(fd,'codexCost');rp.opencodeCost=sumBy(fd,'opencodeCost');}
    return rp;
  }).filter(function(p){return p&&p.sessions>0;}).sort(function(x,y){return y.cost-x.cost;});
  next.projects=rangeProjects;

  next.pricingNote='Models are sorted by estimated cost usage for this selected range.';
  return next;
}

/* ── Render functions ────────────────────────────────────── */
var CLAUDE_COLOR='#D37356',CODEX_COLOR='#7385FE',OPENCODE_COLOR='#10b981';

function makeLegend(activeProviders){
  var lg=el('div',{class:'chart-legend'});
  var provs=[{key:'claude',color:CLAUDE_COLOR,label:'Claude'},{key:'codex',color:CODEX_COLOR,label:'Codex'},{key:'opencode',color:OPENCODE_COLOR,label:'OpenCode'}];
  provs.forEach(function(p){
    if(activeProviders&&activeProviders.indexOf(p.key)===-1)return;
    var c=el('span');c.appendChild(el('span',{class:'swatch',style:'background:'+p.color}));c.appendChild(document.createTextNode(p.label));lg.appendChild(c);
  });
  return lg;
}

function stackedGradient(parts){
  // parts: [{color,value},...] — build linear-gradient from bottom to top
  var total=0;parts.forEach(function(p){total+=p.value;});
  if(total<=0)return'#e2e8f0';
  var stops=[],cum=0;
  parts.forEach(function(p){
    if(p.value<=0)return;
    var pct=p.value/total*100;
    stops.push(p.color+' '+cum.toFixed(2)+'% '+(cum+pct).toFixed(2)+'%');
    cum+=pct;
  });
  if(stops.length===1)return parts.filter(function(p){return p.value>0;})[0].color;
  return'linear-gradient(to top, '+stops.join(', ')+')';
}

function renderBarChart(container,allDays,maxMsg,accent,stacked){
  container.textContent='';
  allDays.forEach(function(d){
    var isEmpty=d.sessions===0;var h=isEmpty?0:Math.max(4,(d.messages/maxMsg)*140);
    var group=el('div',{class:'bar-group'});
    var bg=accent;
    if(stacked&&!isEmpty&&d.cost>0){
      bg=stackedGradient([{color:CLAUDE_COLOR,value:d.claudeCost||0},{color:CODEX_COLOR,value:d.codexCost||0},{color:OPENCODE_COLOR,value:d.opencodeCost||0}]);
    }
    var bar=el('div',{class:'bar',style:'height:'+(isEmpty?'2':h)+'px;background:'+(isEmpty?'#e2e8f0':bg)+';'});
    var tip=fullDateStr(d.date)+' | '+fmtUSD(d.cost);
    if(stacked){
      if(d.claudeCost)tip+='\nClaude '+fmtUSD(d.claudeCost);
      if(d.codexCost)tip+='\nCodex '+fmtUSD(d.codexCost);
      if(d.opencodeCost)tip+='\nOpenCode '+fmtUSD(d.opencodeCost);
    }
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
      bg=stackedGradient([{color:CLAUDE_COLOR,value:w.claudeCost||0},{color:CODEX_COLOR,value:w.codexCost||0},{color:OPENCODE_COLOR,value:w.opencodeCost||0}]);
    }
    var bar=el('div',{class:'bar',style:'height:'+h+'px;background:'+bg+';'});
    var tip=weekLabel(wk)+' | '+fmtUSD(w.cost);
    if(stacked){
      if(w.claudeCost)tip+='\nClaude '+fmtUSD(w.claudeCost);
      if(w.codexCost)tip+='\nCodex '+fmtUSD(w.codexCost);
      if(w.opencodeCost)tip+='\nOpenCode '+fmtUSD(w.opencodeCost);
    }
    else{tip+=', '+w.sessions+' sessions';}
    bar.appendChild(el('div',{class:'tooltip'},tip));
    group.appendChild(bar);group.appendChild(el('div',{class:'bar-label'},weekLabel(wk)));container.appendChild(group);
  });
}

var PROJ_COLORS=['#D37356','#7385FE','#047857','#e4a222','#8b5cf6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16'];
function renderProjects(container,projects,accent,stacked){
  if(!projects||!projects.length)return;
  var sec=el('div',{class:'section'});sec.appendChild(el('h2',null,'Projects'));
  var wrap=el('div',{class:'proj-wrap'});

  // Build donut data: top 5 + "Other"
  var SHOW_LIMIT=5;
  var totalCost=0;projects.forEach(function(p){totalCost+=p.cost;});
  var slices=[];var otherCost=0,otherSess=0;
  projects.forEach(function(p,i){
    if(i<SHOW_LIMIT)slices.push({name:p.name,cost:p.cost,sessions:p.sessions,color:PROJ_COLORS[i%PROJ_COLORS.length]});
    else{otherCost+=p.cost;otherSess+=p.sessions;}
  });
  if(otherCost>0)slices.push({name:'Other ('+(projects.length-SHOW_LIMIT)+')',cost:otherCost,sessions:otherSess,color:'#cbd5e1'});

  // Build conic-gradient
  var gradParts=[],cumPct=0;
  slices.forEach(function(s){
    var pct=totalCost>0?(s.cost/totalCost)*100:0;
    gradParts.push(s.color+' '+cumPct.toFixed(2)+'% '+(cumPct+pct).toFixed(2)+'%');
    cumPct+=pct;
  });
  var donutOuter=el('div',{class:'proj-donut',style:'background:conic-gradient('+gradParts.join(',')+');'});
  donutOuter.appendChild(el('div',{class:'proj-donut-hole'}));
  wrap.appendChild(donutOuter);

  // Legend list
  var legend=el('div',{class:'proj-legend'});
  slices.forEach(function(s){
    var row=el('div',{class:'proj-legend-row'});
    row.appendChild(el('span',{class:'proj-swatch',style:'background:'+s.color}));
    row.appendChild(el('span',{class:'proj-legend-name'},s.name));
    var meta=el('span',{class:'proj-legend-meta'});
    meta.appendChild(el('span',{class:'proj-cost'},fmtUSD(s.cost)));
    meta.appendChild(el('span',{class:'proj-sessions'},s.sessions+' sess'));
    row.appendChild(meta);
    legend.appendChild(row);
  });

  // Show more: full list below
  if(projects.length>SHOW_LIMIT){
    var moreWrap=el('div',{class:'proj-more-list'});
    projects.slice(SHOW_LIMIT).forEach(function(p,i){
      var row=el('div',{class:'proj-more-row'});
      row.appendChild(el('span',{class:'proj-swatch',style:'background:#cbd5e1'}));
      row.appendChild(el('span',{class:'proj-legend-name'},p.name));
      var meta=el('span',{class:'proj-legend-meta'});
      meta.appendChild(el('span',{class:'proj-cost'},fmtUSD(p.cost)));
      meta.appendChild(el('span',{class:'proj-sessions'},p.sessions+' sess'));
      row.appendChild(meta);
      moreWrap.appendChild(row);
    });
    moreWrap.style.display='none';
    var toggle=el('button',{class:'proj-toggle',type:'button'},'Show '+(projects.length-SHOW_LIMIT)+' more');
    var expanded=false;
    toggle.addEventListener('click',function(){
      expanded=!expanded;
      moreWrap.style.display=expanded?'block':'none';
      toggle.textContent=expanded?'Show less':'Show '+(projects.length-SHOW_LIMIT)+' more';
    });
    legend.appendChild(toggle);
    legend.appendChild(moreWrap);
  }

  wrap.appendChild(legend);
  sec.appendChild(wrap);container.appendChild(sec);
}

function renderPanel(panelEl,opts){
  var accent=opts.accent;
  panelEl.textContent='';panelEl.style.setProperty('--accent',accent);

  // Banner
  var fb=el('div',{class:'freshness-banner'});
  var s1=el('span',{class:'date-info'});s1.appendChild(document.createTextNode('Sessions: '));s1.appendChild(el('span',{class:'date-val'},String(opts.totalSessions)));fb.appendChild(s1);
  var fbRight=el('div',{style:'display:flex;gap:6px;align-items:center;'});
  if(opts.badgeEls&&opts.badgeEls.length){opts.badgeEls.forEach(function(b){fbRight.appendChild(b);});}
  var moreToggle=el('button',{class:'more-stats-toggle',type:'button'});moreToggle.textContent='More \u25BE';
  fbRight.appendChild(moreToggle);
  fb.appendChild(fbRight);
  panelEl.appendChild(fb);

  // Stat cards
  var firstD=opts.firstDate?new Date(opts.firstDate):new Date();
  var totalSpanDays=Math.ceil((new Date()-firstD)/86400000)+1;
  var tb=opts.tokenBreakdown;

  // --- Top 8 cards ---
  var sg=el('div',{class:'stats-grid'});
  var cc=el('div',{class:'stat-card'});cc.appendChild(el('div',{class:'stat-label'},'Total Est. Cost'));cc.appendChild(el('div',{class:'stat-value cost'},fmtUSD(opts.displayCost)));
  cc.appendChild(el('div',{class:'stat-sub'},fullDateFromIso(opts.firstDate)+' - today'));
  cc.appendChild(el('div',{class:'stat-sub'},totalSpanDays+'d span, '+opts.daysActive+' active'));sg.appendChild(cc);
  sg.appendChild(createStatCard('Cost / Day',fmtUSD(opts.costPerDay),'cost','avg across '+opts.daysActive+' days'));
  sg.appendChild(createStatCard('Cost / Session',fmtUSD(opts.costPerSession),'cost',opts.totalSessions+' total sessions'));
  sg.appendChild(createStatCard('Streak',opts.streak+' days'));
  // Msgs / Session
  var msgsPerSess=opts.totalSessions>0?(opts.userMessages/opts.totalSessions):0;
  sg.appendChild(createStatCard('Msgs / Session',msgsPerSess.toFixed(1)));
  // Tokens
  var tokCard=createStatCard('Tokens',fmt(opts.totalTokens||0));
  if(tb){
    tokCard.style.position='relative';tokCard.classList.add('has-tooltip');
    var lbl=tokCard.querySelector('.stat-label');
    if(lbl)lbl.appendChild(el('span',{class:'info-icon'},'i'));
    var lines=[];
    if(tb.input)lines.push('Input: '+fmt(tb.input));
    if(tb.output)lines.push('Output: '+fmt(tb.output));
    if(tb.cacheRead)lines.push('Cache Read: '+fmt(tb.cacheRead));
    if(tb.cacheWrite)lines.push('Cache Write: '+fmt(tb.cacheWrite));
    if(tb.cached)lines.push('Cached: '+fmt(tb.cached));
    if(tb.reasoning)lines.push('Reasoning: '+fmt(tb.reasoning));
    tokCard.appendChild(el('div',{class:'stat-tooltip'},lines.join('\n')));
  }
  sg.appendChild(tokCard);
  // Output/$
  var outPerDollar=(opts.displayCost>0)?(opts.outputTokens/opts.displayCost):0;
  var opdCard=createStatCard('Output / $',fmt(Math.round(outPerDollar)));
  opdCard.style.position='relative';opdCard.classList.add('has-tooltip');
  var opdLbl=opdCard.querySelector('.stat-label');if(opdLbl)opdLbl.appendChild(el('span',{class:'info-icon'},'i'));
  opdCard.appendChild(el('div',{class:'stat-tooltip'},'Output tokens per dollar spent\n'+fmt(opts.outputTokens)+' output / '+fmtUSD(opts.displayCost)));
  sg.appendChild(opdCard);
  // Cache Rate
  if(tb){
    var cacheToks=(tb.cacheRead||0)+(tb.cached||0)+(tb.cacheWrite||0);
    var cacheRate=(opts.totalTokens>0)?(cacheToks/opts.totalTokens*100):0;
    var crCard=createStatCard('Cache Rate',cacheRate.toFixed(1)+'%');
    crCard.style.position='relative';crCard.classList.add('has-tooltip');
    var crLbl=crCard.querySelector('.stat-label');if(crLbl)crLbl.appendChild(el('span',{class:'info-icon'},'i'));
    var crLines=['Cache tokens as % of all tokens'];
    if(tb.cacheRead)crLines.push('Cache Read: '+fmt(tb.cacheRead));
    if(tb.cached)crLines.push('Cached: '+fmt(tb.cached));
    if(tb.cacheWrite)crLines.push('Cache Write: '+fmt(tb.cacheWrite));
    crLines.push('Total: '+fmt(cacheToks)+' / '+fmt(opts.totalTokens));
    crCard.appendChild(el('div',{class:'stat-tooltip'},crLines.join('\n')));
    sg.appendChild(crCard);
  }
  panelEl.appendChild(sg);

  // --- More cards (hidden by default) ---
  var moreGrid=el('div',{class:'stats-grid stats-more'});
  moreGrid.style.display='none';
  moreGrid.appendChild(createStatCard('Messages',opts.userMessages.toLocaleString()));
  // Output %
  var outPct=(opts.totalTokens>0)?((opts.outputTokens/opts.totalTokens)*100):0;
  var opCard=createStatCard('Output %',outPct.toFixed(1)+'%');
  opCard.style.position='relative';opCard.classList.add('has-tooltip');
  var opLbl=opCard.querySelector('.stat-label');if(opLbl)opLbl.appendChild(el('span',{class:'info-icon'},'i'));
  opCard.appendChild(el('div',{class:'stat-tooltip'},'Output tokens as % of all tokens\n'+fmt(opts.outputTokens)+' / '+fmt(opts.totalTokens)));
  moreGrid.appendChild(opCard);
  if(opts.extraCards)opts.extraCards.forEach(function(c){moreGrid.appendChild(c);});
  panelEl.appendChild(moreGrid);

  // Toggle more stats
  var moreExpanded=false;
  moreToggle.addEventListener('click',function(){
    moreExpanded=!moreExpanded;
    moreGrid.style.display=moreExpanded?'':'none';
    moreToggle.textContent=moreExpanded?'Less \u25B4':'More \u25BE';
  });

  // Daily chart
  var sec1=el('div',{class:'section'});sec1.appendChild(el('h2',null,'Daily Activity'));
  var cc1=el('div',{class:'chart-container'});
  if(opts.stacked){cc1.appendChild(makeLegend(opts.activeProviders));}
  var bc=el('div',{class:'bar-chart'});
  renderBarChart(bc,opts.allDays,opts.maxMsg,accent,opts.stacked);cc1.appendChild(bc);sec1.appendChild(cc1);panelEl.appendChild(sec1);

  // Weekly chart
  if(opts.weeklySorted&&opts.weeklySorted.length>0){var sec3=el('div',{class:'section'});sec3.appendChild(el('h2',null,'Weekly Usage'));var cc3=el('div',{class:'chart-container'});if(opts.stacked){cc3.appendChild(makeLegend(opts.activeProviders));}var wc=el('div',{class:'weekly-chart'});renderWeeklyChart(wc,opts.weeklySorted,opts.weeklyMap,accent,opts.stacked);cc3.appendChild(wc);sec3.appendChild(cc3);panelEl.appendChild(sec3);}

  // Projects
  if(opts.projects&&opts.projects.length>0)renderProjects(panelEl,opts.projects,accent,opts.stacked);

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
        var provCls=m.provider==='codex'?'codex':(m.provider==='opencode'?'opencode':'claude');
        var provLabel=m.provider==='codex'?'Codex':(m.provider==='opencode'?'OpenCode':'Claude');
        var provBadge=el('span',{class:'sub-badge '+provCls});provBadge.textContent=provLabel;
        left.appendChild(provBadge);
      }
      row.appendChild(left);
      var right=el('div',{class:'mu-right'});
      var barW=Math.max(2,(m.cost/maxModelCost)*100);
      var barColor=m.provider==='codex'?CODEX_COLOR:(m.provider==='opencode'?OPENCODE_COLOR:CLAUDE_COLOR);
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
        if(ac.claude>0)agents.push({label:'Claude',cls:'claude',cost:ac.claude,color:CLAUDE_COLOR});
        if(ac.codex>0)agents.push({label:'Codex',cls:'codex',cost:ac.codex,color:CODEX_COLOR});
        if(ac.opencode>0)agents.push({label:'OpenCode',cls:'opencode',cost:ac.opencode,color:OPENCODE_COLOR});
        agents.sort(function(a,b){if(a.cost!==b.cost)return b.cost-a.cost;return a.label.localeCompare(b.label);});
        if(agents.length){
          agents.forEach(function(a){
            var badge=el('span',{class:'sub-badge '+a.cls,style:'margin-left:0;margin-right:6px;'},a.label);
            tdM.appendChild(badge);
          });
          rowCostColor=agents[0].color;
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
  var CLAUDE=DATA.claude,CODEX=DATA.codex,OPENCODE=DATA.opencode;
  var hasClaude=CLAUDE!==null,hasCodex=CODEX!==null,hasOpencode=OPENCODE!==null;
  var defaultTab=DATA.defaultTab||'all';
  var selectedRange='this_month';
  var allDailyCostView='agent';

  var claudeBase=hasClaude?buildOpts(CLAUDE):null;
  var codexBase=hasCodex?buildOpts(CODEX):null;
  var opencodeBase=hasOpencode?buildOpts(OPENCODE):null;
  var allBase=mergeOpts([claudeBase,codexBase,opencodeBase]);

  // Tabs
  var tabBar=document.getElementById('tab-bar');
  var tabs=[
    {id:'all',label:'All'},
    {id:'claude',label:'Claude',icon:'claude.webp'},
    {id:'codex',label:'Codex',icon:'codex.webp'},
    {id:'opencode',label:'OpenCode',icon:'opencode.webp'}
  ];
  tabs.forEach(function(t){
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
    if(hasOpencode){
      var opencodeOpts=applyRange(opencodeBase,selectedRange);
      opencodeOpts.dailyCostView='model';
      renderPanel(document.getElementById('panel-opencode'),opencodeOpts);
    }else renderNoData(document.getElementById('panel-opencode'),'OpenCode','https://opencode.ai');
  }

  function setRange(id){
    selectedRange=id;
    if(rangeSelect&&rangeSelect.value!==id)rangeSelect.value=id;
    renderPanels();
  }

  function switchTab(id){document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('active');});document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});document.querySelector('[data-tab="'+id+'"]').classList.add('active');document.getElementById('panel-'+id).classList.add('active');history.replaceState(null,'','#'+id);}
  setRange(selectedRange);
  var hash=location.hash.replace('#','');if(['all','claude','codex','opencode'].indexOf(hash)!==-1)switchTab(hash);else switchTab(defaultTab);
}

renderFooter();
// Add relative time to gen-time
(function(){
  var gt=document.getElementById('gen-time');
  if(!gt||!DATA.metadata||!DATA.metadata.createdAt)return;
  var diff=Math.floor((Date.now()-new Date(DATA.metadata.createdAt).getTime())/1000);
  var ago;
  if(diff<5)ago='just now';
  else if(diff<60)ago=diff+'s ago';
  else if(diff<3600)ago=Math.floor(diff/60)+'m ago';
  else if(diff<86400)ago=Math.floor(diff/3600)+'h ago';
  else ago=Math.floor(diff/86400)+'d ago';
  gt.textContent=gt.textContent+' ('+ago+')';
})();
if(DATA.claude!==null||DATA.codex!==null||DATA.opencode!==null){main();}
else{document.querySelector('.container').insertAdjacentElement('afterbegin',el('div',{class:'no-data'},'No data. Run code-usage to generate.'));}
