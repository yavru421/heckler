import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const USERNAMES = [
  "OpenMicMike", "HeckleQueen", "CrowdKiller", "StageFreight", 
  "TwoForOne", "BarTab", "DrinkMinimum", "BackRowBomber",
  "SpotlightSteve", "TheWarmUp", "ClosingAct", "ComedyCorpse",
  "EdgyEddie", "BombingBob", "LaughTrack", "Crickets", "ToughCrowd"
];

function getRandomUser() {
  return USERNAMES[Math.floor(Math.random() * USERNAMES.length)];
}

function getRandomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomDate() {
  const now = new Date();
  const daysAgo = getRandomInt(0, 7);
  const hoursAgo = getRandomInt(0, 23);
  now.setDate(now.getDate() - daysAgo);
  now.setHours(now.getHours() - hoursAgo);
  return now.toISOString().replace('T', ' ').substring(0, 19);
}

function generateJokeSql(text: string, category: string): string {
  const id = crypto.randomUUID();
  const author = getRandomUser();
  const kills = getRandomInt(5, 40);
  const bombs = getRandomInt(0, 15);
  const date = getRandomDate();
  
  // Escape single quotes for SQL
  const safeText = text.replace(/'/g, "''");
  
  return `INSERT INTO jokes (id, text, category, author_name, kills, bombs, is_ghosted, created_at) VALUES ('${id}', '${safeText}', '${category}', '${author}', ${kills}, ${bombs}, 0, '${date}');\n`;
}

async function fetchUrbanDictionary(): Promise<string[]> {
  const sqlStatements: string[] = [];
  try {
    console.log('Fetching Urban Dictionary...');
    for (let i = 0; i < 5; i++) { // 5 requests * ~10 definitions = ~50
      const res = await fetch('https://api.urbandictionary.com/v0/random');
      const data: any = await res.json();
      for (const item of data.list) {
        if (item.thumbs_up > 100) { // Quality filter
          const cleanDef = item.definition.replace(/\[|\]/g, ''); // remove UD link brackets
          const text = `Word: ${item.word}\nDefinition: ${cleanDef}`;
          if (text.length <= 500) {
            sqlStatements.push(generateJokeSql(text, 'dictionary'));
          }
        }
      }
    }
  } catch (e) {
    console.error('Error fetching UD:', e);
  }
  return sqlStatements;
}

async function fetchJokeApi(): Promise<string[]> {
  const sqlStatements: string[] = [];
  try {
    console.log('Fetching JokeAPI...');
    for (let i = 0; i < 5; i++) { // 5 requests * 10 jokes = 50
      const res = await fetch('https://v2.jokeapi.dev/joke/Any?amount=10&type=single&blacklistFlags=nsfw,racist,sexist');
      const data: any = await res.json();
      if (data.error) continue;
      
      for (const item of data.jokes) {
        let category = 'observational';
        if (item.category === 'Dark') category = 'dark';
        if (item.category === 'Programming') category = 'observational';
        if (item.category === 'Misc' || item.category === 'Pun') category = 'one-liner';
        
        if (item.joke.length <= 500) {
          sqlStatements.push(generateJokeSql(item.joke, category));
        }
      }
    }
  } catch (e) {
    console.error('Error fetching JokeAPI:', e);
  }
  return sqlStatements;
}

async function fetchDadJokes(): Promise<string[]> {
  const sqlStatements: string[] = [];
  try {
    console.log('Fetching icanhazdadjoke...');
    const res = await fetch('https://icanhazdadjoke.com/search?limit=30&page=1', {
      headers: { 'Accept': 'application/json' }
    });
    const data: any = await res.json();
    for (const item of data.results) {
      if (item.joke.length <= 500) {
        sqlStatements.push(generateJokeSql(item.joke, 'cringe'));
      }
    }
  } catch (e) {
    console.error('Error fetching DadJokes:', e);
  }
  return sqlStatements;
}

async function main() {
  const udSql = await fetchUrbanDictionary();
  const jokeApiSql = await fetchJokeApi();
  const dadJokeSql = await fetchDadJokes();
  
  const allSql = [...udSql, ...jokeApiSql, ...dadJokeSql];
  const outputPath = path.join(__dirname, 'seed-stage.sql');
  
  fs.writeFileSync(outputPath, allSql.join(''));
  console.log(`Generated ${allSql.length} jokes to seed-stage.sql`);
  console.log('Review the file, then run: npx wrangler d1 execute heckler-ledger --file=seed-stage.sql');
}

main();
