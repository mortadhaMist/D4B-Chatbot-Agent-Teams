const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
for (let i=0;i<lines.length;i++){
  if (lines[i].includes('try {')){
    const start=i+1;
    let found=false;
    for (let j=i+1;j<Math.min(lines.length, i+400); j++){
      if (/\bcatch\b/.test(lines[j]) || /\bfinally\b/.test(lines[j])){ found=true; break; }
    }
    if(!found) console.log('try at line',i+1,'has no catch/finally within 400 lines');
  }
}
