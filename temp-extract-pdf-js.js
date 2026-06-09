const fs = require('fs');
const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');
(async () => {
  const data = new Uint8Array(fs.readFileSync('data/kb/Annexe 3 - Liste des typologies.pdf'));
  const loadingTask = pdfjsLib.getDocument({data});
  const doc = await loadingTask.promise;
  let fullText = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const strings = content.items.map(item => item.str);
    fullText += `--- PAGE ${i} ---\n` + strings.join(' ') + '\n';
  }
  process.stdout.write(fullText);
})();
