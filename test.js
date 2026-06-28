const key = 'REMOVED';
fetch('https://api.groq.com/openai/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${key}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'llama3-70b-8192',
    messages: [{ role: 'user', content: 'hi' }]
  })
}).then(r => r.json()).then(console.log).catch(console.error);
