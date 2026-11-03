import React, { useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { BoxDefinition } from "../shared/box";
import { Alert } from "./design-system/components";
export function BoxImport({
  disabled,
  label = "Importer les casiers",
  onImport,
}: {
  disabled: boolean;
  label?: string;
  onImport: (box: BoxDefinition) => Promise<boolean>;
}) {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const worker = useRef<Worker | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      worker.current?.terminate();
      clearTimeout(timer.current);
    };
  }, []);
  const importFile = async (file?: File) => {
    if (!file) return;
    setError("");
    if (file.size > 5 * 1024 * 1024) {
      setError("Fichier trop volumineux (5 Mo maximum).");
      return;
    }
    setLoading(true);
    const dispose = () => {
      worker.current?.terminate();
      worker.current = null;
      clearTimeout(timer.current);
    };
    const finish = () => {
      dispose();
      if (mounted.current) setLoading(false);
    };
    try {
      const bytes = await file.arrayBuffer();
      if (!mounted.current) return;
      const reader = new Worker(
        new URL("./box-import.worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = reader;
      timer.current = setTimeout(() => {
        finish();
        setError("Lecture trop longue. Vérifiez le fichier de casiers.");
      }, 15000);
      reader.onerror = () => {
        finish();
        setError("Impossible de lire ce fichier.");
      };
      reader.onmessage = async (
        event: MessageEvent<{ box?: BoxDefinition; error?: string }>,
      ) => {
        dispose();
        try {
          if (event.data.error) throw Error(event.data.error);
          if (event.data.box) await onImport(event.data.box);
        } catch (e) {
          if (mounted.current) setError((e as Error).message);
        } finally {
          if (mounted.current) setLoading(false);
        }
      };
      reader.postMessage({ bytes, filename: file.name }, [bytes]);
    } catch (e) {
      finish();
      setError((e as Error).message);
    }
  };
  return (
    <div className="box-import">
      <label className="box-upload">
        <Upload size={16} />
        {loading ? "Lecture du fichier…" : label}
        <input
          aria-label="Importer les casiers"
          type="file"
          accept=".xlsx,.xls,.ods,.csv"
          disabled={disabled || loading}
          onChange={(e) => {
            void importFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {error && (
        <Alert kind="danger" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
    </div>
  );
}
