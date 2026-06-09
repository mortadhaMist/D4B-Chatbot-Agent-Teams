const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
for (let i=0;i<lines.length;i++){
  const num = (i+1).toString().padStart(4,' ');
  console.log(num + ': ' + lines[i]);
}
