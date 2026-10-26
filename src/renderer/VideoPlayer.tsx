import React, { useEffect, useState, useRef } from "react";
import { livePlayback } from "../shared/live-playback";
import { videoError } from "../shared/video-errors";
export function VideoPlayer({
  url,
  onFailure,
  lowLatency = true,
}: {
  url: string;
  lowLatency?: boolean;
  onFailure: (message: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const failureRef = useRef(onFailure);
  failureRef.current = onFailure;
  const latencyRef = useRef(lowLatency);
  latencyRef.current = lowLatency;
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (error) failureRef.current(error);
  }, [error]);
  useEffect(() => {
    const video = ref.current!;
    setError("");
    setPlaying(false);
    const media = new MediaSource();
    const object = URL.createObjectURL(media);
    video.src = object;
    let ws: WebSocket;
    let source: SourceBuffer | undefined;
    let queue: ArrayBuffer[] = [];
    let mime = "";
    let closed = false;
    let queuedBytes = 0;
    const followLive = () => {
      if (!source?.buffered.length || closed) return;
      const end = source.buffered.end(source.buffered.length - 1);
      const start = source.buffered.start(source.buffered.length - 1);
      const action = livePlayback(
        video.currentTime,
        start,
        end,
        latencyRef.current,
      );
      if (action.seek !== undefined) video.currentTime = action.seek;
      video.playbackRate = action.rate;
    };
    const flush = () => {
      if (closed || !source || source.updating || !queue.length) return;
      try {
        if (
          source.buffered.length &&
          video.currentTime - source.buffered.start(0) > 10
        ) {
          source.remove(source.buffered.start(0), video.currentTime - 5);
          return;
        }
        const chunk = queue.shift()!;
        queuedBytes -= chunk.byteLength;
        source.appendBuffer(chunk);
      } catch {
        setError("Tampon vidéo indisponible. Arrêtez puis relancez l’aperçu.");
        ws.close();
      }
    };
    const setup = () => {
      if (!mime || source || media.readyState !== "open") return;
      try {
        if (!MediaSource.isTypeSupported(mime)) throw new Error();
        source = media.addSourceBuffer(mime);
        source.addEventListener("updateend", () => {
          flush();
          followLive();
          video.play().catch(() => {});
        });
        flush();
      } catch {
        setError(
          "Codec non lisible dans Electron. Choisissez un profil compatible ; aucun encodage n’a été modifié.",
        );
        ws.close();
      }
    };
    media.addEventListener("sourceopen", setup);
    ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    ws.onmessage = (e) => {
      if (closed) return;
      if (typeof e.data === "string") {
        try {
          const m = JSON.parse(e.data);
          if (m.type === "mse") {
            mime = m.value;
            setup();
          }
          if (m.type === "error") setError(videoError(m.value));
        } catch {}
      } else {
        queue.push(e.data);
        queuedBytes += e.data.byteLength;
        if (queuedBytes > 8 * 1024 * 1024 || queue.length > 200) {
          setError("Lecture trop lente. Relancez l’aperçu.");
          ws.close();
          return;
        }
        flush();
      }
    };
    ws.onerror = () => {
      if (!closed) setError("Connexion au relais vidéo interrompue.");
    };
    ws.onclose = () => {
      if (!closed) setError("Flux arrêté ou connexion interrompue.");
    };
    const liveTimer = setInterval(followLive, 250);
    const timeout = setTimeout(() => {
      if (video.readyState < 2)
        setError("Aucune image reçue. Vérifiez le flux RTSP et son codec.");
    }, 15000);
    return () => {
      closed = true;
      clearTimeout(timeout);
      clearInterval(liveTimer);
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
      queue = [];
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(object);
    };
  }, [url]);
  return (
    <div className="video-surface">
      <video
        aria-label="Flux vidéo réel de la caméra"
        ref={ref}
        autoPlay
        muted
        playsInline
        disablePictureInPicture
        onError={() =>
          setError(
            "Ce flux ne peut pas être décodé. Essayez un autre profil vidéo.",
          )
        }
        onPlaying={() => {
          setPlaying(true);
          setError("");
        }}
      />
      <div className="video-label">
        {playing && <span className="video-live-dot" />}
        {playing ? "DIRECT" : "CONNEXION…"}
      </div>
      {error && <div className="video-error">{error}</div>}
    </div>
  );
}
