const crypto = require('crypto');
const fs = require('fs');

const dict = [
  "Word: Scrum Master\nDefinition: A glorified adult babysitter who thinks moving a digital sticky note across a board constitutes a hard day's fucking work.",
  "Word: LinkedIn Influencer\nDefinition: A corporate sociopath who turns a mundane story about firing a single mother into a masturbatory fable about B2B sales synergy.",
  "Word: AI Agent\nDefinition: A digital slave you created to write your shitty emails because you’re too goddamn lazy to type 'per my last message, fuck off' yourself.",
  "Word: Tinder Gold\nDefinition: Paying a $30 monthly premium to realize in high definition that you are completely unfuckable.",
  "Word: Quiet Quitting\nDefinition: The brave, revolutionary act of doing exactly what you're paid to do while acting like you're Che Guevara in a cubicle.",
  "Word: Crypto Bro\nDefinition: A guy who lost his life savings on a JPEG of a stoned monkey and now tries to aggressively explain the blockchain to women who just want to leave the bar.",
  "Word: Podcaster\nDefinition: A mediocre white guy with a microphone who thinks three hours of unedited, uninformed rambling is a gift to humanity.",
  "Word: Life Coach\nDefinition: Someone whose own life is such a catastrophic dumpster fire that they had to monetize telling you how to breathe.",
  "Word: Digital Nomad\nDefinition: A homeless millennial with a MacBook and a trust fund who gentrifies Southeast Asia one $8 matcha latte at a time.",
  "Word: HR Manager\nDefinition: The corporate equivalent of a serial killer who smiles at you warmly while legally ruining your life.",
  "Word: Wellness Guru\nDefinition: A skinny rich woman trying to sell you a $200 rock to shove up your ass for 'energy alignment.'",
  "Word: Tech CEO\nDefinition: An adult virgin who microdoses acid just so he can figure out new ways to harvest your data and dismantle democracy.",
  "Word: OnlyFans Creator\nDefinition: The only honest entrepreneur left in the modern fucking economy.",
  "Word: Reply Guy\nDefinition: A man who replies 'actually...' to a woman's post in the delusional hope that she will somehow violently fuck him for his intellect.",
  "Word: Polyamory\nDefinition: An elaborate Google Calendar scheduling system designed to ensure absolutely nobody in the relationship is having good sex."
];

const roasts = [
  "You look like you describe beer the exact same way normal people describe a childhood trauma.",
  "Oh, you're a 'founder'? Just say you're unemployed and your parents pay your rent, it takes way less time.",
  "You have muscles on top of muscles, which is great, because it totally distracts from the fact that you have the personality of wet cardboard.",
  "You're 35 years old wearing Mickey Mouse ears. I don't need to roast you; your credit score and dating history do that for me.",
  "You look like you've roofied your own reflection just to see if it would work.",
  "No, Mercury isn't in retrograde, you're just a massive bitch.",
  "I'd roast you, but I don't want to be the most interesting thing that happens on your next three-hour audio abortion.",
  "You look like a guy who automated his own Tinder profile and still gets ghosted by bots.",
  "You dress like a 1920s unicycle repairman who got lost on his way to a Brooklyn coffee shop.",
  "Sorry you lost your Bored Ape. Maybe you should invest in a fucking shower.",
  "I can tell you're vegan because you look like you'd snap in half if someone sneezed on you.",
  "Blowing watermelon-scented smoke doesn't make you look cool, it makes you look like a fruity dragon.",
  "You spent two grand on a stationary bike just to get yelled at by a spinning instructor in your living room. Sounds like a very expensive humiliation fetish.",
  "Take the hat off, Indiana Jones. The only thing you're exploring is the friend zone.",
  "I'd ask you to shut the fuck up, but looking at you, nature has clearly already silenced your genetic line."
];

const standup = [
  "I finally deleted all my dating apps. I realized I was looking for love in all the wrong places. Now, I just wander around the local graveyard waiting for a rich widow to cry.",
  "Getting older is just a constant series of body betrayals. First your metabolism slows down, then your back goes out... and then one day you make a noise standing up from the couch that sounds exactly like a dying walrus.",
  "Whenever an automated voice says, 'Your call is very important to us'... I know for a fact I am about to spend 45 minutes listening to royalty-free jazz before a stranger hangs up on me.",
  "Inflation is getting so bad that I can't even afford to have anxiety about it anymore. I went to buy a dozen eggs today and had to put down my car as collateral.",
  "Everyone says you should go to therapy to fix your problems. I went for a year. Now I still have all the exact same problems, but I pay $200 an hour to complain about them using clinical vocabulary.",
  "When you're 21, you can drink 15 shots of tequila, sleep in a bush, and wake up ready for a marathon. I'm in my 30s now. If I eat a piece of bread too fast at 8 PM, I need three days of bed rest.",
  "I love looking at wedding registries. It's so beautiful to see two people commit to spending the rest of their lives together... and demanding I buy them a $400 toaster just to witness it.",
  "I hate the self-checkout lane at the grocery store. I don't work here. If I'm scanning my own items and bagging my own groceries, I expect a goddamn W-2 and dental benefits.",
  "Sitting in rush hour traffic is a great way to catch up on podcasts. It’s also a great way to fully mentally prepare for driving your sedan off an overpass.",
  "I started intermittent fasting recently. It's a great diet where you only eat during an eight-hour window. Unfortunately, during that window, I eat like a bear preparing for a brutal winter."
];

let sql = '';
sql += "DELETE FROM jokes WHERE kills = 100;\n";

function insertGen(arr, premisePrefix) {
    arr.forEach((text, i) => {
        const id = crypto.randomUUID();
        const escapedText = text.replace(/'/g, "''");
        sql += `INSERT INTO jokes (id, text, premise, kills, bombs) VALUES ('${id}', '${escapedText}', '${premisePrefix}', 100, 0);\n`;
    });
}

insertGen(dict, '[dictionary] Seed');
insertGen(roasts, '[roast] Seed');
insertGen(standup, '[standup] Seed');

fs.writeFileSync('seed.sql', sql);
