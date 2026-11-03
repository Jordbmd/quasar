import React, { useEffect, useState } from "react";
import type { AutoLoginInput, AutoLoginStatus } from "../shared/auto-login";
import { Alert, Button, Field } from "./design-system/components";
export function AutoLoginSettings({
  status,
  busy,
  onSave,
  onDirty,
}: {
  status?: AutoLoginStatus;
  busy: boolean;
  onSave: (value: AutoLoginInput) => Promise<boolean>;
  onDirty?: () => void;
}) {
  const [enabled, setEnabled] = useState(status?.enabled ?? false);
  const [username, setUsername] = useState(status?.username ?? "admin");
  const [password, setPassword] = useState(status?.enabled ? "" : "123456");
  const [changedPassword, setChangedPassword] = useState(false);
  useEffect(() => {
    setEnabled(status?.enabled ?? false);
    setUsername(status?.username ?? "admin");
    setPassword(status?.enabled ? "" : "123456");
    setChangedPassword(false);
  }, [status]);
  return (
    <section className="auto-login-settings">
      <h3>Connexion aux caméras</h3>
      {status?.error && <Alert kind="warning">{status.error}</Alert>}
      {status && !status.available && (
        <Alert kind="warning">
          Le stockage sécurisé du système est indisponible. La connexion
          manuelle reste accessible.
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onSave(
            enabled
              ? {
                  enabled: true,
                  username,
                  ...(changedPassword || !status?.enabled ? { password } : {}),
                }
              : { enabled: false },
          ).then((saved) => {
            if (saved) {
              setPassword(enabled ? "" : "123456");
              setChangedPassword(false);
            }
          });
        }}
      >
        <label className="preference-row">
          <span>
            <strong>Connexion automatique</strong>
            <small>
              Se connecter au démarrage, dès que l’Ethernet est prêt.
            </small>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={
              busy ||
              !status ||
              (!status.available && !status.enabled && !status.error)
            }
            onChange={(e) => {
              onDirty?.();
              setEnabled(e.target.checked);
            }}
          />
        </label>
        {enabled && (
          <div className="auto-login-fields">
            <Field label="Identifiant des caméras">
              <input
                autoComplete="off"
                required
                maxLength={128}
                value={username}
                onChange={(e) => {
                  onDirty?.();
                  setUsername(e.target.value);
                }}
              />
            </Field>
            <Field label="Mot de passe des caméras">
              <input
                type="password"
                autoComplete="off"
                maxLength={256}
                placeholder={
                  status?.enabled
                    ? "Enregistré · laisser vide pour conserver"
                    : "Mot de passe"
                }
                value={password}
                onChange={(e) => {
                  onDirty?.();
                  setPassword(e.target.value);
                  setChangedPassword(true);
                }}
              />
            </Field>
            <p className="help-text">
              Valeurs par défaut : admin / 123456. Ces identifiants sont
              utilisés pour toutes les caméras ; chaque caméra doit accepter ce
              compte.
            </p>
          </div>
        )}
        <p className="help-text">
          Les identifiants sont protégés par le stockage sécurisé du système.
          Désactiver cette option supprime les identifiants enregistrés. Une
          déconnexion volontaire reste valable jusqu’au prochain démarrage.
        </p>
        <Button
          type="submit"
          disabled={busy || !status || (enabled && !status.available)}
          variant="primary"
        >
          Enregistrer la connexion
        </Button>
      </form>
    </section>
  );
}
