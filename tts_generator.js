import { ttsSave } from 'file:///C:/Users/John/AppData/Roaming/npm/node_modules/edge-tts/out/index.js';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.log("Usage: node tts_generator.js <text> <output_file> [voice]");
  process.exit(1);
}

const text = args[0];
const outputFile = args[1];
const voice = args[2] || 'en-US-GuyNeural';

console.log(`Generating TTS using voice ${voice}...`);
ttsSave(text, outputFile, { voice })
  .then(() => {
    console.log(`Audio successfully saved to ${outputFile}`);
  })
  .catch((err) => {
    console.error("Error generating audio:", err);
  });
