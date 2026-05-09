import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/transcribe-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
        if (!ELEVENLABS_API_KEY) {
          return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Invalid multipart body" }, { status: 400 });
        }

        const audio = form.get("audio");
        if (!(audio instanceof File) && !(audio instanceof Blob)) {
          return Response.json({ error: "Missing 'audio' file" }, { status: 400 });
        }
        if ((audio as File).size > 25 * 1024 * 1024) {
          return Response.json({ error: "Audio too large (max 25MB)" }, { status: 413 });
        }

        const language = (form.get("language") || "").toString();

        const upstream = new FormData();
        upstream.append("file", audio, (audio as File).name || "audio.webm");
        upstream.append("model_id", "scribe_v2");
        upstream.append("tag_audio_events", "false");
        upstream.append("diarize", "false");
        if (language) upstream.append("language_code", language);

        const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
          method: "POST",
          headers: { "xi-api-key": ELEVENLABS_API_KEY },
          body: upstream,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => "");
          console.error("ElevenLabs STT error", res.status, errText);
          return Response.json({ error: "Transcription failed" }, { status: 502 });
        }

        const data = (await res.json()) as { text?: string };
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});
