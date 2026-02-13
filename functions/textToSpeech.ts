import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { text, voiceGender = 'NEUTRAL', languageCode = 'en-US' } = await req.json();

    if (!text) {
      return Response.json({ error: 'Text is required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('GOOGLE_CLOUD_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 500 });
    }

    // Call Google Cloud Text-to-Speech API
    const response = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode,
            ssmlGender: voiceGender,
          },
          audioConfig: {
            audioEncoding: 'MP3',
            pitch: 2.0,
            speakingRate: 0.95,
          },
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return Response.json({ error: `TTS API error: ${error}` }, { status: response.status });
    }

    const data = await response.json();

    // Return the base64 audio content
    return Response.json({
      audioContent: data.audioContent,
      contentType: 'audio/mpeg',
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});