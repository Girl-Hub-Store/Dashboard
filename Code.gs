const BRANCHES=["City Star","Point 90","District 5","Mall Of Arabia"];
const LOCK_DAYS=30;
const LOCK_SHEET="RatingLocks";
const DASHBOARD_PASSWORD="Pepla@Dashboard30";

function setupPeplaSheets(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  BRANCHES.forEach(b=>header_(getOrCreate_(ss,b),["Timestamp","Customer Name","Phone","Sales Person(s)","Sales Rating(s)","Branch Rating","Note"]));
  header_(getOrCreate_(ss,"Notes"),["Timestamp","Customer Name","Phone","Product Name","Note / Recommendation"]);
  header_(getOrCreate_(ss,LOCK_SHEET),["Browser ID","Last Rating Timestamp"]);
}

function doGet(e){
  const params=e&&e.parameter||{};
  if(params.action==="checkRating"){
    const result=checkRatingLock_(params.browserId||"");
    return output_(result,params.callback);
  }
  if(params.action==="dashboardData"){
    if(String(params.password||"")!==DASHBOARD_PASSWORD)return output_({ok:false,error:"UNAUTHORIZED"},params.callback);
    return output_(getDashboardData_(),params.callback);
  }
  return output_({ok:true,service:"Pepla Feedback"});
}

function doPost(e){
  try{
    const d=JSON.parse(e.postData.contents||"{}"),ss=SpreadsheetApp.getActiveSpreadsheet();
    if(d.type==="rating"){
      if(!BRANCHES.includes(d.branch))throw new Error("Unknown branch: "+d.branch);
      const browserId=String(d.browserId||"").trim();
      if(!browserId)throw new Error("Browser ID is required.");
      const lock=LockService.getScriptLock();
      lock.waitLock(10000);
      try{
        const status=checkRatingLock_(browserId);
        if(status.locked)throw new Error("RATING_LOCKED");
        const s=getOrCreate_(ss,d.branch);
        header_(s,["Timestamp","Customer Name","Phone","Sales Person(s)","Sales Rating(s)","Branch Rating","Note"]);
        const sales=Array.isArray(d.sales)?d.sales:[];
        s.appendRow([new Date(),d.customerName||"",d.phone||"",sales.map(x=>x.name||"").filter(Boolean).join(" | "),sales.map(x=>x.rating||"").join(" | "),d.branchRating||"",d.note||""]);
        recordRatingLock_(browserId,new Date());
      } finally { lock.releaseLock(); }
    }else if(d.type==="note"){
      const s=getOrCreate_(ss,"Notes");
      header_(s,["Timestamp","Customer Name","Phone","Product Name","Note / Recommendation"]);
      s.appendRow([new Date(),d.customerName||"",d.phone||"",d.productName||"",d.recommendation||""]);
    }else throw new Error("Unknown submission type.");
    return output_({ok:true});
  }catch(err){
    return output_({ok:false,error:String(err)});
  }
}

function checkRatingLock_(browserId){
  if(!browserId)return {ok:true,locked:false};
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=getOrCreate_(ss,LOCK_SHEET);
  header_(sheet,["Browser ID","Last Rating Timestamp"]);
  const values=sheet.getDataRange().getValues();
  const now=new Date();
  for(let i=1;i<values.length;i++){
    if(String(values[i][0])===browserId && values[i][1]){
      const last=new Date(values[i][1]);
      const diff=now.getTime()-last.getTime();
      const remaining=Math.max(0,LOCK_DAYS*24*60*60*1000-diff);
      if(remaining>0)return {ok:true,locked:true,remainingMs:remaining,remainingDays:Math.ceil(remaining/(24*60*60*1000))};
      return {ok:true,locked:false};
    }
  }
  return {ok:true,locked:false};
}

function recordRatingLock_(browserId,date){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const sheet=getOrCreate_(ss,LOCK_SHEET);
  header_(sheet,["Browser ID","Last Rating Timestamp"]);
  const values=sheet.getDataRange().getValues();
  for(let i=1;i<values.length;i++){
    if(String(values[i][0])===browserId){sheet.getRange(i+1,2).setValue(date);return;}
  }
  sheet.appendRow([browserId,date]);
}

function output_(obj,callback){
  const json=JSON.stringify(obj);
  if(callback && /^[A-Za-z_$][\w$]*$/.test(callback))return ContentService.createTextOutput(callback+"("+json+");").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
function getOrCreate_(ss,name){return ss.getSheetByName(name)||ss.insertSheet(name);}
function header_(sheet,headers){if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}}

function getDashboardData_(){
  const ss=SpreadsheetApp.getActiveSpreadsheet();
  const ratings=[]; const notes=[]; const branchStats={}; const salesStats={};
  BRANCHES.forEach(b=>{branchStats[b]={name:b,count:0,sum:0}});
  BRANCHES.forEach(b=>{const sh=ss.getSheetByName(b); if(!sh||sh.getLastRow()<2)return; const v=sh.getDataRange().getValues(); for(let i=1;i<v.length;i++){
    const salesNames=String(v[i][3]||'').split(' | ').filter(Boolean); const salesRatings=String(v[i][4]||'').split(' | ');
    const br=Number(v[i][5]||0); if(br){branchStats[b].count++;branchStats[b].sum+=br;}
    salesNames.forEach((name,j)=>{if(!salesStats[name])salesStats[name]={name:name,count:0,sum:0}; const sr=Number(salesRatings[j]||0); if(sr){salesStats[name].count++;salesStats[name].sum+=sr;}});
    ratings.push({date:formatDashDate_(v[i][0]),branch:b,customer:String(v[i][1]||''),sales:salesNames.join(' | '),salesRating:salesRatings.filter(Boolean).join(' | '),branchRating:br||'',note:String(v[i][6]||'')});
  }});
  const ns=ss.getSheetByName('Notes'); if(ns&&ns.getLastRow()>=2){const v=ns.getDataRange().getValues();for(let i=1;i<v.length;i++)notes.push({date:formatDashDate_(v[i][0]),customer:String(v[i][1]||''),phone:String(v[i][2]||''),product:String(v[i][3]||''),note:String(v[i][4]||'')});}
  const lockSheet=ss.getSheetByName(LOCK_SHEET); let activeLocks=0; if(lockSheet&&lockSheet.getLastRow()>=2){const v=lockSheet.getDataRange().getValues(),now=Date.now();for(let i=1;i<v.length;i++){if(v[i][0]&&v[i][1]&&(now-new Date(v[i][1]).getTime())<LOCK_DAYS*86400000)activeLocks++;}}
  const total=Object.values(branchStats).reduce((a,x)=>a+x.count,0),sum=Object.values(branchStats).reduce((a,x)=>a+x.sum,0);
  return {ok:true,ratings:ratings.reverse(),notes:notes.reverse(),summary:{totalRatings:total,avgBranchRating:total?(sum/total).toFixed(1):'',totalNotes:notes.length,activeLocks:activeLocks,branches:BRANCHES.map(b=>({name:b,count:branchStats[b].count,avg:branchStats[b].count?(branchStats[b].sum/branchStats[b].count).toFixed(1):''})),sales:Object.values(salesStats).map(x=>({name:x.name,count:x.count,avg:x.count?(x.sum/x.count).toFixed(1):''})).sort((a,b)=>b.count-a.count)}};
}
function formatDashDate_(d){const x=new Date(d);return isNaN(x)?String(d||''):Utilities.formatDate(x,Session.getScriptTimeZone(),'yyyy-MM-dd HH:mm');}
