const fs = require('fs');
const readline = require('readline');

async function processLineByLine() {
  const fileStream = fs.createReadStream('C:\\Users\\John\\.gemini\\antigravity\\brain\\c37c5821-2459-419a-891b-09f204ecd348\\.system_generated\\logs\\transcript_full.jsonl');

  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  const outputs = [];

  for await (const line of rl) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'USER_INPUT') {
          outputs.push(obj.content);
      }
    } catch (e) {}
  }
  
  fs.writeFileSync('C:\\dev\\heckler\\backend\\prompts.txt', outputs.join('\n\n---\n\n'));
}

processLineByLine();
