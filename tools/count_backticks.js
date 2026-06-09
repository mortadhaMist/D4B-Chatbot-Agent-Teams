const fs = require('fs');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const s = fs.readFileSync(p, 'utf8');
const matches = s.match(/`/g) || [];
console.log('backticks count', matches.length);
