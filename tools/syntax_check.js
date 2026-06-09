const fs = require('fs');
const vm = require('vm');
const path = require('path');
const p = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(p, 'utf8');
try {
  new vm.Script(src, { filename: p });
  console.log('No syntax errors detected');
} catch (e) {
  console.error('Syntax error:', e && e.message);
  console.error(e.stack);
  process.exit(2);
}
