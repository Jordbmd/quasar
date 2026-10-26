import { ProfileInsights } from "./ProfileInsights";
import { fieldSupport, supportLabels } from "../shared/default-support";
import { DefaultsResults } from "./DefaultsResults";
import { type ProfileRun } from "../shared/profile-journal";
import React, { useEffect, useState } from "react";
import {
  Save,
  SlidersHorizontal,
  Search,
  Check,
  RefreshCw,
} from "lucide-react";
import { Button, Panel, Alert, Modal } from "./design-system/components";
import {
  defaultFields,
  defaultGroups,
  initialDefaults,
  type DefaultsProfile,
  type DefaultsPlan,
  type DefaultsProgress,
} from "../shared/defaults";
import type { Camera } from "../shared/types";
import type { Run } from "./ui";

export function DefaultsPage({
  busy,
  run,
  onDirty,
  onApply,
  cameras,
  selected,
}: {
  busy: boolean;
  run: Run;
  onDirty: (dirty: boolean) => void;
  onApply: (ids: string[]) => void;
  cameras: Camera[];
  selected: string;
}) {
  const [view, setView] = useState<"profile" | "compatibility" | "journal">(
    "profile",
  );
  const [profile, setProfile] = useState<DefaultsProfile>();
  const [saved, setSaved] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState(defaultGroups[0]);
  const [savedNotice, setSavedNotice] = useState(false);
  const dirty = !!profile && JSON.stringify(profile) !== saved;
  useEffect(() => {
    let active = true;
    window.sezaam
      .call("getDefaults", undefined)
      .then((p) => {
        if (active) {
          setProfile(p);
          setSaved(JSON.stringify(p));
        }
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    onDirty(dirty);
  }, [dirty, onDirty]);
  const change = (
    id: string,
    patch: Partial<DefaultsProfile["fields"][string]>,
  ) => {
    setSavedNotice(false);
    setProfile(
      (p) =>
        p && {
          ...p,
          fields: { ...p.fields, [id]: { ...p.fields[id], ...patch } },
        },
    );
  };
  const save = () =>
    void run("Enregistrement du profil", async () => {
      if (!profile) return;
      const p = await window.sezaam.call("saveDefaults", profile);
      setProfile(p);
      setSaved(JSON.stringify(p));
      setSavedNotice(true);
    });
  const shown = defaultFields.filter((f) =>
    search
      ? `${f.label} ${f.group} ${f.id}`
          .toLowerCase()
          .includes(search.toLowerCase())
      : f.group === group,
  );
  return (
    <div className="defaults-page">
      <header className="defaults-heading">
        <div>
          <span className="eyebrow">PROFIL SEZAAM</span>
          <h2>Paramètres par défaut</h2>
          <p>
            Définissez le profil, puis vérifiez les réglages compatibles avant
            de les appliquer.
          </p>
        </div>
        <Button className="primary" disabled={busy || !dirty} onClick={save}>
          <Save size={16} />
          Enregistrer le profil
        </Button>
      </header>
      <nav className="profile-tabs" aria-label="Sections du profil">
        <Button
          aria-pressed={view === "profile"}
          onClick={() => setView("profile")}
        >
          Paramètres
        </Button>
        <Button
          aria-pressed={view === "compatibility"}
          onClick={() => setView("compatibility")}
        >
          Compatibilité
        </Button>
        <Button
          aria-pressed={view === "journal"}
          onClick={() => setView("journal")}
        >
          Journal et erreurs
        </Button>
      </nav>
      {view !== "profile" && (
        <ProfileInsights
          view={view}
          cameras={cameras}
          selected={selected}
          busy={busy}
          dirty={dirty}
          run={run}
        />
      )}
      {error && <Alert kind="danger">{error}</Alert>}
      {savedNotice && view === "profile" && (
        <p role="status" className="defaults-saved">
          <Check size={16} /> Profil enregistré sur ce Mac. Aucune caméra
          modifiée.
        </p>
      )}
      {profile && view === "profile" && (
        <>
          <Panel className="defaults-summary panel">
            <label>
              Nom du profil
              <input
                maxLength={100}
                value={profile.name}
                disabled={busy}
                onChange={(e) => {
                  setSavedNotice(false);
                  setProfile({ ...profile, name: e.target.value });
                }}
              />
            </label>
            <span>
              {Object.values(profile.fields).filter((f) => f.included).length}{" "}
              réglages inclus
              <br />
              <small>
                {dirty
                  ? "Modifications à enregistrer"
                  : "Version enregistrée · " + profile.revision}
              </small>
            </span>
            <div className="defaults-actions">
              <Button
                disabled={busy || dirty || !selected}
                onClick={() => onApply([selected])}
              >
                Appliquer à la caméra sélectionnée
              </Button>
              <Button
                disabled={busy || dirty || !cameras.length}
                onClick={() => onApply(cameras.map((c) => c.id))}
              >
                Appliquer à toutes ({cameras.length})
              </Button>
            </div>
          </Panel>
          <div className="defaults-explainer">
            <SlidersHorizontal size={19} />
            <p>
              <strong>Un profil commun, une vérification par caméra.</strong>{" "}
              Les champs « Écriture intégrée » sont appliqués si leurs capacités
              sont confirmées. L’onglet Compatibilité distingue les fonctions
              intégrées, les standards à intégrer et les commandes constructeur.
              Le reset usine reste une étape séparée.
            </p>
          </div>
          <div className="defaults-editor">
            <aside
              className="defaults-categories"
              aria-label="Catégories des paramètres"
            >
              <label className="defaults-search">
                <Search size={16} />
                <input
                  aria-label="Rechercher un réglage"
                  placeholder="Rechercher un réglage…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              {defaultGroups.map((g) => (
                <Button
                  key={g}
                  className={group === g && !search ? "active" : ""}
                  aria-pressed={group === g && !search}
                  onClick={() => {
                    setGroup(g);
                    setSearch("");
                  }}
                >
                  {g}
                  <span>
                    {defaultFields.filter((f) => f.group === g).length}
                  </span>
                </Button>
              ))}
            </aside>
            <Panel className="defaults-fields panel">
              <div className="defaults-section-heading">
                <div>
                  <h3>{search ? "Résultats de recherche" : group}</h3>
                  <p>Cochez les réglages à inclure dans le profil.</p>
                </div>
                <Button
                  disabled={busy}
                  title="Rétablir les valeurs Sezaam pour les champs affichés ; enregistrement nécessaire"
                  onClick={() => {
                    const reference = initialDefaults();
                    setProfile({
                      ...profile,
                      fields: {
                        ...profile.fields,
                        ...Object.fromEntries(
                          shown.map((f) => [f.id, reference.fields[f.id]]),
                        ),
                      },
                    });
                    setSavedNotice(false);
                  }}
                >
                  <RefreshCw size={15} />
                  Valeurs Sezaam
                </Button>
              </div>
              {!shown.length && <p>Aucun réglage trouvé.</p>}
              {shown.map((f) => (
                <div
                  className={
                    "default-field " +
                    (!profile.fields[f.id].included ? "excluded" : "")
                  }
                  key={f.id}
                >
                  <input
                    type="checkbox"
                    aria-label={`Inclure ${f.label}`}
                    checked={profile.fields[f.id].included}
                    disabled={busy}
                    onChange={(e) =>
                      change(f.id, { included: e.target.checked })
                    }
                  />
                  <div className="default-field-copy">
                    <label htmlFor={"default-" + f.id}>{f.label}</label>
                    <small
                      className={
                        f.automatic
                          ? "default-support automatic"
                          : "default-support"
                      }
                    >
                      {supportLabels[fieldSupport(f.id).kind]}
                    </small>
                    {f.note && <p>{f.note}</p>}
                  </div>
                  <div className="default-value">
                    {typeof f.value === "boolean" ? (
                      <select
                        id={"default-" + f.id}
                        disabled={busy}
                        value={String(profile.fields[f.id].value)}
                        onChange={(e) =>
                          change(f.id, { value: e.target.value === "true" })
                        }
                      >
                        <option value="true">Activé</option>
                        <option value="false">Désactivé</option>
                      </select>
                    ) : f.options ? (
                      <select
                        id={"default-" + f.id}
                        disabled={busy}
                        value={String(profile.fields[f.id].value)}
                        onChange={(e) =>
                          change(f.id, { value: e.target.value })
                        }
                      >
                        {f.options.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={"default-" + f.id}
                        disabled={busy}
                        type={typeof f.value === "number" ? "number" : "text"}
                        step="any"
                        min={0}
                        max={f.id === "lightBrightness" ? 100 : 1000000}
                        value={String(profile.fields[f.id].value)}
                        onChange={(e) =>
                          change(f.id, {
                            value:
                              typeof f.value === "number"
                                ? e.target.value === ""
                                  ? NaN
                                  : Number(e.target.value)
                                : e.target.value,
                          })
                        }
                      />
                    )}
                    {f.unit && <small>{f.unit}</small>}
                  </div>
                </div>
              ))}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
export function DefaultsApply({
  targets,
  busy,
  run,
  onClose,
  onApplied,
}: {
  targets: string[] | null;
  busy: boolean;
  run: Run;
  onClose: () => void;
  onApplied: () => Promise<unknown>;
}) {
  const [plan, setPlan] = useState<DefaultsPlan>();
  const [report, setReport] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<DefaultsProgress>();
  useEffect(() => window.sezaam.onDefaultsProgress?.(setProgress), []);
  useEffect(() => {
    if (!targets) return;
    setPlan(undefined);
    setReport(false);
    setError("");
    setProgress(undefined);
    void run("Vérification du profil et des caméras", async () => {
      try {
        setPlan(await window.sezaam.call("previewDefaults", { ids: targets }));
      } catch (e) {
        setError((e as Error).message);
      }
    });
  }, [targets]);
  const rows = plan?.cameras.flatMap((c) => c.rows) ?? [];
  const ready = rows.filter((r) => r.state === "ready").length;
  const apply = async () => {
    await run("Application du profil Sezaam", async () => {
      try {
        const result = await window.sezaam.call("applyDefaults", {
          planId: plan!.id,
        });
        setPlan(result);
        setReport(true);
      } catch (e) {
        setError((e as Error).message);
        setPlan(undefined);
      }
    });
    await onApplied();
  };
  return (
    <Modal
      open={!!targets}
      title={
        report
          ? "Bilan d’application du profil"
          : "Appliquer les paramètres par défaut"
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      footer={
        <>
          <Button disabled={busy} onClick={onClose}>
            {report ? "Fermer" : "Annuler"}
          </Button>
          {!report && (
            <Button
              className="primary"
              disabled={busy || !ready || !!error}
              onClick={() => void apply()}
            >
              Appliquer les réglages compatibles
            </Button>
          )}
        </>
      }
    >
      <div className="defaults-review">
        {error && <Alert kind="danger">{error}</Alert>}
        {(plan as ProfileRun)?.journalWarning && (
          <Alert kind="warning">{(plan as ProfileRun).journalWarning}</Alert>
        )}
        {report && (
          <p>
            Rapport enregistré dans Profil Sezaam → Journal et erreurs, sauf
            avertissement de sauvegarde ci-dessus.
          </p>
        )}
        {busy && (
          <div className="defaults-progress" role="status">
            <progress
              max={progress?.total || 1}
              value={progress?.completed || 0}
            />
            <span>
              {progress
                ? `${progress.stage} · ${progress.camera} · ${progress.completed}/${progress.total}`
                : "Préparation…"}
            </span>
          </div>
        )}
        {plan && (
          <>
            <p>
              <strong>{plan.name}</strong> · version {plan.revision} ·{" "}
              {plan.cameras.length} caméra(s)
            </p>
            <DefaultsResults
              key={`${plan.id}-${report}`}
              plan={plan}
              report={report}
              busy={busy}
              run={run}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
