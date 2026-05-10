import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  text: string;
  cacheKey?: string; // when this changes, cached audio is invalidated
  size?: "sm" | "default";
};

// Module-level registry so only one PlayAudioButton plays at a time.
let activeStop: (() => void) | null = null;

export function PlayAudioButton({ text, cacheKey, size = "sm" }: Props) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  // Reset cached audio when text/cacheKey changes
  useEffect(() => {
    cleanup();
    setState("idle");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, text]);

  useEffect(() => () => cleanup(), []);

  function cleanup() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }

  async function play() {
    if (state === "playing") {
      audioRef.current?.pause();
      setState("paused");
      return;
    }
    if (state === "paused" && audioRef.current) {
      // Stop any other instance before resuming.
      if (activeStop && activeStop !== stopThis) activeStop();
      activeStop = stopThis;
      await audioRef.current.play();
      setState("playing");
      return;
    }
    // Stop any currently playing instance elsewhere.
    if (activeStop) activeStop();
    setState("loading");
    try {
      const lang = i18n.language?.startsWith("zh") ? "zh" : "en";
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error(t("voice.errTts"));
        setState("idle");
        return;
      }
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ text, language: lang }),
      });
      if (!res.ok) {
        toast.error(t("voice.errTts"));
        setState("idle");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      urlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setState("idle");
      audio.onpause = () => {
        if (!audio.ended) setState((s) => (s === "playing" ? "paused" : s));
      };
      await audio.play();
      activeStop = stopThis;
      setState("playing");
    } catch (err) {
      console.error(err);
      toast.error(t("voice.errTts"));
      setState("idle");
    }
  }

  function stopThis() {
    if (audioRef.current && !audioRef.current.paused) {
      audioRef.current.pause();
    }
  }

  useEffect(() => {
    return () => {
      if (activeStop === stopThis) activeStop = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      onClick={play}
      disabled={state === "loading" || !text.trim()}
      className="gap-1.5"
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "playing" ? (
        <Pause className="h-3.5 w-3.5" />
      ) : state === "paused" ? (
        <Play className="h-3.5 w-3.5" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {state === "loading"
        ? t("voice.loading")
        : state === "playing"
          ? t("voice.pause")
          : state === "paused"
            ? t("voice.resume")
            : t("voice.listen")}
    </Button>
  );
}
