import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { prepareTtsText } from "@/lib/tts-text";

const Body = z.object({
  text: z.string().min(1).max(5000),
  voiceId: z.string().min(1).max(64).optional(),
  language: z.enum(["en", "zh"]).optional(),
});

const DEFAULT_VOICE = "EXAVITQu4vr4xnSDxMaL"; // Sarah

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
        if (!ELEVENLABS_API_KEY) {
          return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const parsed = Body.safeParse(json);
        if (!parsed.success) {
          return Response.json({ error: "Invalid body" }, { status: 400 });
        }

        const { text, voiceId = DEFAULT_VOICE, language = "en" } = parsed.data;
        const cleaned = prepareTtsText(text, language).slice(0, 5000);
        if (!cleaned) {
          return Response.json({ error: "Empty text after cleanup" }, { status: 400 });
        }

        const res = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": ELEVENLABS_API_KEY,
              "Content-Type": "application/json",
              accept: "audio/mpeg",
            },
            body: JSON.stringify({
              text: cleaned,
              model_id: "eleven_multilingual_v2",
              voice_settings: {
                stability: 0.6,
                similarity_boost: 0.8,
                style: 0,
                use_speaker_boost: true,
              },
            }),
          },
        );

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "");
          console.error("ElevenLabs TTS error", res.status, errText);
          return Response.json({ error: "TTS failed" }, { status: 502 });
        }

        return new Response(res.body, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
