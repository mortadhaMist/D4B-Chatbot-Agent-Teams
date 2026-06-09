const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
const start = parseInt(process.argv[2]||'1',10);
const end = parseInt(process.argv[3]||String(lines.length),10);
for (let i=start-1;i<end && i<lines.length;i++){
  const num = (i+1).toString().padStart(4,' ');
  console.log(num + ': ' + lines[i]);
}
