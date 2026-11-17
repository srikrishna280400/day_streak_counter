const fs = require('fs');
const src = fs.readFileSync('src/App.tsx','utf8');
let stack=[];
let inStr=null;
for (let i=0;i<src.length;i++){
  const c=src[i];
  if(inStr){ if(c===inStr && src[i-1]!=='\\\\') inStr=null; continue; }
  if(c==='"'||c==="'"||c==='`'){ inStr=c; continue; }
  if(c==='('||c==='['||c==='{'){ stack.push({c}); }
  if(c===')'||c===']'||c==='}'){
    const open=stack.pop();
    const pair = {')':'(',']':'[','}':'{'}[c];
    if(!open || open.c!==pair){ console.log('MISMATCH: got',c,'expected close for',open&&open.c); process.exit(1); }
  }
}
console.log('unclosed:', stack.length);
stack.slice(-5).forEach(s=>console.log('  unclosed',s.c));
if(stack.length===0) console.log('ALL BALANCED');
