const fs=require('fs'),http=require('http'),vm=require('vm');
const sheets={};
function Sheet(name){ this.name=name; this.data=[]; }
Sheet.prototype.getLastRow=function(){return this.data.length};
Sheet.prototype.setFrozenRows=function(){};
Sheet.prototype.getRange=function(r,c,nr=1,nc=1){ const sh=this; const rg={
  setValues(v){ for(let i=0;i<nr;i++){ sh.data[r-1+i]=sh.data[r-1+i]||[]; for(let j=0;j<nc;j++) sh.data[r-1+i][c-1+j]=v[i][j]; } return rg;},
  setValue(x){ sh.data[r-1]=sh.data[r-1]||[]; sh.data[r-1][c-1]=x; return rg;},
  getDisplayValues(){ const out=[]; for(let i=0;i<nr;i++){ const row=[]; for(let j=0;j<nc;j++){ const x=(sh.data[r-1+i]||[])[c-1+j]; row.push(x===undefined||x===null?"":String(x)); } out.push(row);} return out;},
  setNumberFormat(){return rg}, setFontWeight(){return rg}, setBackground(){return rg}, setFontColor(){return rg},
  sort(col){ const part=sh.data.slice(r-1,r-1+nr); part.sort((a,b)=>String(a[col-1]).localeCompare(String(b[col-1]))); sh.data.splice(r-1,nr,...part); return rg;}
 }; return rg; };
const ctx={ SpreadsheetApp:{ getActiveSpreadsheet:()=>({ getSheetByName:n=>sheets[n]||null, insertSheet:n=>(sheets[n]=new Sheet(n)) }) },
  ContentService:{ createTextOutput:t=>({t,setMimeType(){return this}}), MimeType:{JSON:1} },
  LockService:{ getScriptLock:()=>({waitLock(){},releaseLock(){}}) }, Logger:{log:console.log}, JSON, Number, String, Object, Date, Math };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname,'..','google-apps-script.gs'),'utf8').replace('"change-moi"','"test123"'),ctx);
http.createServer((req,res)=>{
  const h={'Access-Control-Allow-Origin':'*','Content-Type':'application/json'};
  if(req.url==='/dump'){res.writeHead(200,h);res.end(JSON.stringify(Object.fromEntries(Object.entries(sheets).map(([k,s])=>[k,s.data]))));return}
  if(req.method==='OPTIONS'){res.writeHead(204,{...h,'Access-Control-Allow-Headers':'*'});res.end();return}
  let b='';req.on('data',d=>b+=d);req.on('end',()=>{ const out=ctx.doPost({postData:{contents:b}}); res.writeHead(200,h); res.end(out.t); });
}).listen(8765,()=>console.log('mock up'));
