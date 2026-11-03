import { t } from "../shared/i18n";
import React, { useState } from "react";
import { ShieldCheck, LogOut, RefreshCw } from "lucide-react";
import type { CameraSession } from "../shared/types";
import { Button, Modal } from "./design-system/components";
import { Field, Status } from "./ui";

export function SessionBar({
  session,
  busy,
  ready,
  beforeChange,
  onConnect,
  onDisconnect,
  onRetry,
}: {
  session?: CameraSession;
  busy: boolean;
  ready: boolean;
  beforeChange: () => Promise<boolean>;
  onConnect: (credentials: { username: string; password: string }) => void;
  onDisconnect: () => void;
  onRetry: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const close = () => {
    setOpen(false);
    setPassword("");
  };
  const partial = !!session?.active && session.connected < session.total;
  return (
    <>
      <Button
        className="session-trigger"
        aria-label={
          session?.active
            ? `${session.username || t("Session active")} ${t("{0} / {1} caméras connectées", session.connected, session.total)} · ${t("Gérer la connexion aux caméras")}`
            : `${t("Se connecter")} ${t("Connexion aux caméras")}`
        }
        title={
          session?.active
            ? t("Gérer la connexion aux caméras")
            : t("Se connecter")
        }
        disabled={busy}
        onClick={() => {
          setUsername(session?.username ?? "admin");
          setPassword("");
          setOpen(true);
        }}
      >
        <ShieldCheck size={21} />
        <span>
          <strong>
            {session?.active
              ? session.username || t("Session active")
              : t("Se connecter")}
          </strong>{" "}
          <small>
            {session?.active
              ? t(
                  "{0} / {1} caméras connectées",
                  session.connected,
                  session.total,
                )
              : t("Connexion aux caméras")}
          </small>
        </span>
      </Button>
      <Modal open={open} title={t("Connexion à l’application")} onClose={close}>
        {session?.active && (
          <div className="session-dialog-state">
            <Status kind={partial ? "warning" : "success"}>
              {session.connected} / {session.total} {t("caméras connectées ·")}{" "}
              {session.username}
            </Status>
            {partial && (
              <Button
                disabled={busy || !ready}
                onClick={async () => {
                  if (await beforeChange()) {
                    close();
                    onRetry();
                  }
                }}
              >
                <RefreshCw size={16} />
                {t("Réessayer les connexions")}
              </Button>
            )}
            <Button
              disabled={busy}
              onClick={async () => {
                if (await beforeChange()) {
                  close();
                  onDisconnect();
                }
              }}
            >
              <LogOut size={16} />
              {t("Déconnecter")}
            </Button>
          </div>
        )}
        <p className="session-help">
          {t(
            "Ces identifiants seront utilisés pour toutes les caméras détectées. Chaque caméra doit accepter ce compte.",
          )}
        </p>
        <form
          className="manual-form"
          onSubmit={(event) => {
            event.preventDefault();
            void (async () => {
              if (!(await beforeChange())) return;
              const credentials = { username, password };
              close();
              onConnect(credentials);
            })();
          }}
        >
          <Field label={t("Identifiant")}>
            <input
              autoFocus
              autoComplete="off"
              maxLength={128}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </Field>
          <Field label={t("Mot de passe")}>
            <input
              type="password"
              autoComplete="off"
              maxLength={256}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <small>
            {t(
              "Identifiants conservés uniquement pour cette session, sans enregistrement sur le disque.",
            )}
          </small>
          <Button className="primary" type="submit" disabled={busy || !ready}>
            {t("Connecter les caméras")}
          </Button>
        </form>
      </Modal>
    </>
  );
}
