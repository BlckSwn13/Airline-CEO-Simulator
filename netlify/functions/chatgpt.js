const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

/**
 * Netlify serverless function zum Aufruf der OpenAI Chat Completion API.
 *
 * Für die Nutzung ist ein OpenAI API‑Key erforderlich, der als Umgebungsvariable
 * OPENAI_API_KEY in den Netlify‑Einstellungen hinterlegt werden muss. Der
 * Frontend‑Code kann diese Funktion mittels POST an /.netlify/functions/chatgpt
 * aufrufen und Messages übergeben. Die Antwort enthält den generierten Text.
 */
exports.handler = async function (event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }
  const { messages, model = 'gpt-4', temperature = 0.7, max_tokens = 500 } = JSON.parse(event.body || '{}');
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'OPENAI_API_KEY not configured' }),
    };
  }
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens,
      }),
    });
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ content }),
    };
  } catch (err) {
    console.error(err);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
