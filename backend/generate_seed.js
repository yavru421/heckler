const crypto = require('crypto');
const fs = require('fs');

const dict = [
  "Word: Scrum Master\nDefinition: A glorified adult babysitter who thinks moving a digital sticky note across a board constitutes a hard day's work.",
  "Word: LinkedIn Influencer\nDefinition: A corporate sociopath who turns a mundane story about firing an employee into a fable about B2B sales synergy.",
  "Word: AI Agent\nDefinition: A digital helper you created to write your emails because you are too lazy to type 'per my last message, fuck off' yourself.",
  "Word: Tinder Gold\nDefinition: Paying a monthly premium to realize in high definition that you are completely unfuckable.",
  "Word: Quiet Quitting\nDefinition: The brave, revolutionary act of doing exactly what you are paid to do while acting like you're Che Guevara in a cubicle.",
  "Word: Crypto Bro\nDefinition: A guy who lost his life savings on a JPEG of a stoned monkey and now tries to aggressively explain the blockchain to women who just want to leave the bar.",
  "Word: Podcaster\nDefinition: A mediocre guy with a microphone who thinks three hours of unedited, uninformed rambling is a gift to humanity.",
  "Word: Life Coach\nDefinition: Someone whose own life is such a dumpster fire that they had to monetize telling you how to breathe.",
  "Word: Digital Nomad\nDefinition: A millennial with a MacBook and a trust fund who gentrifies Southeast Asia one $8 matcha latte at a time.",
  "Word: HR Manager\nDefinition: The corporate equivalent of a serial killer who smiles at you warmly while legally ruining your life.",
  "Word: Wellness Guru\nDefinition: A skinny rich woman trying to sell you a $200 rock to shove up your ass for 'energy alignment.'",
  "Word: Tech CEO\nDefinition: An adult virgin who microdoses acid just so he can figure out new ways to harvest your data and dismantle democracy.",
  "Word: OnlyFans Creator\nDefinition: The only honest entrepreneur left in the modern economy.",
  "Word: Reply Guy\nDefinition: A man who replies 'actually...' to a woman's post in the delusional hope that she will somehow violently fuck him for his intellect.",
  "Word: Polyamory\nDefinition: An elaborate Google Calendar scheduling system designed to ensure absolutely nobody in the relationship is having good sex.",
  "Word: Stand-up Comedian\nDefinition: An emotionally damaged narcissist who seeks the validation of a room full of drunk strangers to make up for a lack of paternal love.",
  "Word: Open Floor Plan\nDefinition: A design choice invented by bosses to ensure you have absolutely zero privacy to scroll Reddit during work hours.",
  "Word: Smart Home\nDefinition: Paying $500 to let a giant tech company listen to your arguments about whose turn it is to empty the dishwasher.",
  "Word: Self-Care\nDefinition: Staying in your pajamas for 36 hours straight, eating half a sheet cake, and calling it a mental health victory.",
  "Word: Corporate Synergy\nDefinition: A meaningless phrase used to justify why two failing departments should merge and double their meetings.",
  "Word: Organic Food\nDefinition: Normal vegetables that cost twice as much because the dirt they grew in was certified by a guy in a linen shirt.",
  "Word: Influencer Retreat\nDefinition: A tax-deductible vacation where rich kids take pictures of their food and call it a brand activation.",
  "Word: Fast Fashion\nDefinition: Cheap synthetic rags manufactured in a sweatshop, bought to be worn once, thrown away, and replaced with more rags.",
  "Word: Networking Event\nDefinition: A room full of desperate professionals trading LinkedIn handles in the hope of escaping their current dead-end jobs.",
  "Word: Electric Scooter\nDefinition: A silent, battery-powered menace designed to help tech bros run over pedestrians at 15 miles per hour.",
  "Word: Zoom Meeting\nDefinition: A digital seance where we take turns asking, 'Is anyone there?' and 'Can you hear me?' while staring at each other's ceiling fans.",
  "Word: Smart Scale\nDefinition: A bathroom accessory that bluetooths your weight to your phone so you can be depressed in chart format.",
  "Word: Airbnb Cleaning Fee\nDefinition: A $150 premium you pay to wash your own sheets and take out the trash before being rated 4 stars by a host named Chad.",
  "Word: Modern Art\nDefinition: A banana taped to a wall that sold for $120,000, confirming that money laundering is indeed a fine art.",
  "Word: Electric Vehicle\nDefinition: A silent car powered by batteries that makes you feel green while you search for a charger in a dark Walmart parking lot.",
  "Word: Subscription Model\nDefinition: A business strategy where you pay $9.99 a month forever for a service you used once to watch a documentary about a cult.",
  "Word: Influencer\nDefinition: A person who has convinced millions of strangers that their life is interesting because they have a ring light and a gluten allergy.",
  "Word: Corporate Wellness\nDefinition: A mandatory yoga class designed to distract you from the fact that your salary hasn't kept up with inflation since 2012.",
  "Word: Side Hustle\nDefinition: A second job you need to pay for the rent on the apartment you only sleep in because you're working your first job.",
  "Word: QR Code\nDefinition: A pixelated square that replaced menus because restaurants wanted you to experience the joy of zooming in on a PDF on your phone."
];

const roasts = [
  "I love airline pilots. They get on the intercom and speak in that low, sleepy voice. They sound like they are driving a golf cart, not flying a 200-ton metal tube through a thunderstorm.",
  "I hate modern menus. QR codes are a joke. I don't want to scan a barcode, wait for a PDF to load on my slow internet, and zoom in on a screen just to see how much a burger costs. Give me a piece of paper.",
  "Went to a fancy cocktail bar. The drink took 20 minutes to make, had a single giant ice cube, and came in a glass that looked like a lightbulb. I just wanted a beer, not a chemistry demonstration.",
  "I read reviews for everything. I saw a one-star review for a national park. The guy wrote: 'Too many rocks. Very steep.' It's the Grand Canyon, Dave. What did you want? An escalator?",
  "Food delivery apps are out of control. I ordered a sandwich. The sandwich was $8, the delivery fee was $4, the service fee was $3, the driver tip was $5. By the time it arrived, I had paid $20 for a piece of ham.",
  "LinkedIn is the only social network where people brag about working on Saturdays. 'Thrilled to announce I spent my weekend updating a spreadsheet! #Blessed #Grind.' Seek help.",
  "voicemail is dead. If you leave me a voicemail, I assume you're calling from 1998. Send a text. I don't want to dial a number, enter a passcode, and listen to a robotic voice just to hear you say 'Hey, call me.'",
  "Why do hotel beds have 8 pillows? I don't need a nest. I spend the first 10 minutes of my stay throwing pillows on the floor like a dog clearing its territory.",
  "Being in a group chat is like being in a meeting you can't leave. You look at your phone and you have 84 unread messages, and it's just two of your friends arguing about where to buy socks.",
  "Going to the grocery store hungry is a financial disaster. I went in for milk and came out with a pineapple, three frozen pizzas, and a microplane grater. I don't even know what a microplane grater does.",
  "My password security is ridiculous. I need an uppercase letter, a lowercase letter, a number, a special character, and a line of ancient Greek poetry. And then it tells me, 'Password cannot contain joy.'",
  "Dentists are the only professionals who ask you questions while their hands are in your mouth. 'So, how's your summer going?' 'Arrghggh.' 'Oh, really? That's nice.'",
  "Why do weddings start at 4 PM but the reception doesn't start until 7 PM? What am I supposed to do for three hours in a suit? Wander around a pharmacy?",
  "My wife bought a sign that says 'Gather' and put it in the dining room. Just in case our friends came over, sat in the hallway, and needed instructions on where to assemble.",
  "We bought a smart thermostat. It learned our schedule. Now it turns the heat off at 10 PM. I have to sit in my own living room wearing a ski mask, trying to trick my wall into thinking I'm still alive.",
  "My phone tracking report is depressing. It tells me my screen time went up 12% this week. I don't need a weekly report card from my pocket telling me I'm lazy.",
  "Going to a fancy cocktail bar. The drink took 20 minutes to make, had a single giant ice cube, and came in a glass that looked like a lightbulb. I just wanted a beer.",
  "We bought a smart thermostat. It learned our schedule. Now it turns the heat off at 10 PM. I have to sit in my own living room wearing a ski mask, trying to trick my wall into thinking I'm still alive.",
  "I read reviews for everything. I saw a one-star review for a national park. The guy wrote: 'Too many rocks. Very steep.' It's the Grand Canyon, Dave. What did you want? An escalator?",
  "I hate packing for trips. I always pack like I'm going to start a completely new life. 'Yes, I definitely need three formal shirts and a pair of running shoes for a weekend in Ohio.'",
  "Why do weddings start at 4 PM but the reception doesn't start until 7 PM? What am I supposed to do for three hours in a suit? Wander around a pharmacy?",
  "My wife bought a sign that says 'Gather' and put it in the dining room. Just in case our friends came over, sat in the hallway, and needed instructions on where to assemble.",
  "I hate self-checkout. The machine always says, 'Unexpected item in bagging area.' It's a bag of chips, machine. What did you expect? A grand piano?",
  "Being in a group chat is like being in a meeting you can't leave. You look at your phone and you have 84 unread messages, and it's just two of your friends arguing about where to buy socks.",
  "Why do hotel beds have 8 pillows? I don't need a nest. I spend the first 10 minutes of my stay throwing pillows on the floor like a dog clearing its territory."
];

const standup = [
  "I finally deleted all my dating apps. I realized I was looking for love in all the wrong places. Now, I just wander around the local graveyard waiting for a rich widow to cry.",
  "Getting older is just a constant series of body betrayals. First your metabolism slows down, then your back goes out... and then one day you make a noise standing up from the couch that sounds exactly like a dying walrus.",
  "Whenever an automated voice says, 'Your call is very important to us'... I know for a fact I am about to spend 45 minutes listening to royalty-free jazz before a stranger hangs up on me.",
  "Inflation is getting so bad that I can't even afford to have anxiety about it anymore. I went to buy a dozen eggs today and had to put down my car as collateral.",
  "Everyone says you should go to therapy to fix your problems. I went for a year. Now I still have all the exact same problems, but I pay $200 an hour to complain about them using clinical vocabulary.",
  "When you're 21, you can drink 15 shots of tequila, sleep in a bush, and wake up ready for a marathon. I'm in my 30s now. If I eat a piece of bread too fast at 8 PM, I need three days of bed rest.",
  "I love looking at wedding registries. It's so beautiful to see two people commit to spending the rest of their lives together... and demanding I buy them a $400 toaster just to witness it.",
  "I hate the self-checkout lane at the grocery store. I don't work here. If I'm scanning my own items and bagging my own groceries, I expect a W-2 and dental benefits.",
  "Sitting in rush hour traffic is a great way to catch up on podcasts. It’s also a great way to fully mentally prepare for driving your sedan off an overpass.",
  "I started intermittent fasting recently. It's a great diet where you only eat during an eight-hour window. Unfortunately, during that window, I eat like a bear preparing for a winter.",
  "I hate going to the dentist. They look inside your mouth and ask, 'Have you been flossing?' Yes, of course. I also regularly update my software and read the terms and conditions.",
  "I bought a smart fridge. Now, every time I open it, it judges me. It sent an email to my phone saying: 'We noticed you bought a block of cheddar. Are we okay?'",
  "I don't get hiking. You walk up a mountain, look at some trees, and then walk back down. It's just walking, but with a higher chance of falling off a cliff.",
  "I tried to buy a house. The bank asked for a 20% down payment, three years of tax returns, and my firstborn child. I just wanted a one-bedroom apartment, not to join a medieval guild.",
  "I hate packing for trips. I always pack like I'm going to start a completely new life. 'Yes, I definitely need three formal shirts and a pair of running shoes for a weekend in Ohio.'",
  "Why do we still have voicemail? If I don't answer your call, send a text. Do not make me listen to 15 seconds of robot instructions just to hear you say 'Call me back.'",
  "I went to a fancy cocktail bar. The drink took 20 minutes to make, had a single giant ice cube, and came in a glass that looked like a lightbulb. I just wanted a beer, not a chemistry demonstration.",
  "My phone tracking report is depressing. It tells me my screen time went up 12% this week. I don't need a weekly report card from my pocket telling me I'm lazy.",
  "I tried to cancel my cable subscription. The customer rep acted like I was divorcing them. 'But what about the sports package?' I don't watch sports. 'But we can give you HBO for $2!' I don't care, let me go!",
  "Why is modern packaging so hard to open? You need scissors to open the package of scissors you just bought. It's a cruel joke from the tool manufacturers.",
  "I tried to buy a romantic candle. It was scented 'tobacco and vanilla.' Why would I want my bedroom to smell like a grandfather who got lost in a bakery? If I'm paying $30 for a candle, I want it to smell like pure desperation and bad decisions.",
  "Polyamory is just an elaborate scheduling system for people who want to disappoint multiple partners simultaneously. It's not a relationship; it's a project management system where everyone gets a performance review at 2 AM.",
  "Corporate drug testing is ridiculous. They check if I smoked weed three weeks ago. Why do you care what I do on my own time? I'm entering data into a spreadsheet, not performing open-heart surgery. Being high is the only way to survive a Tuesday afternoon meeting about synergy.",
  "My friend told me she started an OnlyFans to pay off her student loans. Honestly, it's the only honest business model left. You show your feet, you get paid. Compare that to corporate life, where you show your soul for 40 years and get a plastic pen when you retire.",
  "Why are there so many pharmaceutical commercials during sports games? Every three minutes it's: 'Ask your doctor if your heart is healthy enough for sex.' If my heart is that fragile, sex is the least of my concerns. I'd be trying to survive walking up the stairs, not planning a weekend in a bathtub on a hill.",
  "I saw a Tinder profile that said: 'Must be over 6 feet, make six figures, and have a good relationship with your mother.' That's not a dating profile; that's a job posting for a guy who will eventually murder you for the insurance money.",
  "Every tech bro in Silicon Valley is microdosing mushrooms. They say it makes them 'more focused.' Back in my day, we called that 'getting high at work.' You're not optimizing your flow state, Kevin. You're just staring at a spreadsheet of a giraffe.",
  "Sex education in high school was pure terror. They showed us photos of diseases that looked like alien landscape photography. The message was clear: 'If you touch another human being, your body will rot.' No wonder we're all in therapy.",
  "I hate going to the dentist. They look inside your mouth and ask, 'Have you been flossing?' Yes, of course. I also regularly update my software and read the terms and conditions.",
  "I bought a smart fridge. Now, every time I open it, it judges me. It sent an email to my phone saying: 'We noticed you bought a block of cheddar. Are we okay?'",
  "I don't get hiking. You walk up a mountain, look at some trees, and then walk back down. It's just walking, but with a higher chance of falling off a cliff.",
  "I tried to buy a house. The bank asked for a 20% down payment, three years of tax returns, and my firstborn child. I just wanted a one-bedroom apartment, not to join a medieval guild.",
  "Why do we still have voicemail? If I don't answer your call, send a text. Do not make me listen to 15 seconds of robot instructions just to hear you say 'Call me back.'",
  "I went to a fancy cocktail bar. The drink took 20 minutes to make, had a single giant ice cube, and came in a glass that looked like a lightbulb. I just wanted a beer, not a chemistry demonstration.",
  "My phone tracking report is depressing. It tells me my screen time went up 12% this week. I don't need a weekly report card from my pocket telling me I'm lazy.",
  "I tried to cancel my cable subscription. The customer rep acted like I was divorcing them. 'But what about the sports package?' I don't watch sports. 'But we can give you HBO for $2!' I don't care, let me go!",
  "Why is modern packaging so hard to open? You need scissors to open the package of scissors you just bought. It's a cruel joke from the tool manufacturers.",
  "Sex ed in high school was pure terror. They showed us photos of diseases that looked like alien landscape photography. The message was clear: 'If you touch another human being, your body will rot.' No wonder we're all in therapy.",
  "I saw a Tinder profile that said: 'Must be over 6 feet, make six figures, and have a good relationship with your mother.' That's not a dating profile; that's a job posting for a guy who will eventually murder you for the insurance money.",
  "My friend told me she started an OnlyFans to pay off her student loans. Honestly, it's the only honest business model left. You show your feet, you get paid. Compare that to corporate life, where you show your soul for 40 years and get a plastic pen when you retire."
];

let sql = '';
sql += "DELETE FROM jokes;\n";

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
