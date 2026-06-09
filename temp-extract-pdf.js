const fs = require('fs');
const pdf = require('pdf-parse');
const path = 'data/kb/Annexe 3 - Liste des typologies.pdf';
const dataBuffer = fs.readFileSync(path);
pdf(dataBuffer).then(data => {
  console.log(data.text);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
