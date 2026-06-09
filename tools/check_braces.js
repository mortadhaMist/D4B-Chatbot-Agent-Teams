const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(p, 'utf8');
const lines = s.split(/\r?\n/);
let count = 0;
for (let i=0;i<lines.length;i++){
  const line = lines[i];
  for (let ch of line) {
    if (ch === '{') count++;
    if (ch === '}') count--;
  }
  if (count < 0) {
    console.log('Brace underflow at line', i+1);
    break;
  }
}
console.log('Final brace balance:', count);
