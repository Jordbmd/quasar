import React, { useState } from "react";
import {
  RefreshCw,
  Network,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Monitor,
  Camera as CameraIcon,
} from "lucide-react";
import type { Camera } from "../shared/types";
import {
  boxAssignments,
  cameraKey,
  lockerAddress,
  lockerCamera,
  placeBoxLockers,
  type BoxDefinition,
  type BoxBindings,
  type BoxLocker,
} from "../shared/box";
import type { LockerAssignment } from "../shared/addressing";
import { Button, Panel, Alert, Field, Badge } from "./design-system/components";
import { compareCameraIPs } from "./preferences";
import "./box.css";
import { BoxImport } from "./BoxImport";
import { BoxEditor } from "./BoxEditor";
import { BoxInfo, SouthcoPorts } from "./BoxInfo";

export function BoxView({
  box,
  bindings,
  cameras,
  busy,
  ready,
  issues,
  onImport,
  onBind,
  onCamera,
  onDetect,
  onAddress,
  onResolveConflicts,
  onProfile,
}: {
  box?: BoxDefinition;
  bindings: BoxBindings;
  cameras: Camera[];
  busy: boolean;
  ready: boolean;
  issues: Record<string, string>;
  onImport: (box: BoxDefinition, editing?: boolean) => Promise<boolean>;
  onBind: (number: number, key: string) => void;
  onCamera: (camera?: Camera) => Promise<boolean>;
  onDetect: () => void;
  onAddress: (assignments: LockerAssignment[]) => void;
  onResolveConflicts?: () => void;
  onProfile: (ids: string[]) => void;
}) {
  const [selected, setSelected] = useState<number>();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState<"plan" | "associations">("plan");
  const disabled = busy;
  const resolve = (locker: BoxLocker) =>
    lockerCamera(locker, cameras, bindings);
  const status = (locker: BoxLocker) => {
    if (!locker.number) return { kind: "neutral", label: "IHM · sans caméra" };
    const camera = resolve(locker);
    if (!camera)
      return {
        kind: bindings[String(locker.number)] ? "danger" : "warning",
        label: bindings[String(locker.number)]
          ? "Caméra absente"
          : "À associer",
      };
    const duplicate = box!.lockers.some(
      (other) =>
        other.number !== locker.number && resolve(other)?.id === camera.id,
    );
    if (
      duplicate ||
      camera.ambiguous ||
      camera.connectionError ||
      issues[cameraKey(camera)]
    )
      return {
        kind: "danger",
        label: duplicate
          ? "Association en double"
          : camera.ambiguous
            ? "Conflit IP"
            : camera.connectionError || issues[cameraKey(camera)],
      };
    if (!ready || !camera.status.startsWith("Connectée"))
      return {
        kind: "warning",
        label: ready ? "À connecter" : "Ethernet indisponible",
      };
    if (camera.ip !== lockerAddress(locker.number))
      return { kind: "warning", label: "IP à attribuer" };
    return { kind: "success", label: "Connectée · IP conforme" };
  };
  const selectLocker = async (locker: BoxLocker) => {
    if (disabled || !locker.number) return;
    const candidate = resolve(locker);
    if (await onCamera(ready && !candidate?.ambiguous ? candidate : undefined))
      setSelected(locker.number);
  };
  const lock = box?.lockers.find((l) => l.number === selected);
  const camera = lock ? resolve(lock) : undefined;
  const layout = placeBoxLockers(box?.lockers ?? []);
  const targets = box?.lockers.filter((l) => l.number > 0) ?? [];
  const associations = () => {
    try {
      setError("");
      return boxAssignments(box!, cameras, bindings);
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    }
  };
  return (
    <section className="box-page" aria-label="Box">
      <div className="box-heading">
        <div>
          <h2>{box?.name || "Box"}</h2>
          <p>
            {box
              ? `${targets.length} casiers · IHM 0 sans caméra`
              : "Importez les casiers pour retrouver la disposition de votre Box."}
          </p>
        </div>
        <BoxImport
          disabled={disabled}
          label={box ? "Réimporter un fichier" : "Importer les casiers"}
          onImport={async (next) => {
            const saved = await onImport(next);
            if (saved) setSelected(undefined);
            return saved;
          }}
        />
        <Button disabled={disabled} onClick={() => setEditing(true)}>
          {box ? "Modifier la Box" : "Créer sans fichier"}
        </Button>
        <Button disabled={disabled || !ready} onClick={onDetect}>
          <RefreshCw size={16} />
          Détecter
        </Button>
      </div>
      {error && (
        <Alert kind="danger" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
      {editing && (
        <BoxEditor
          box={box}
          onClose={() => setEditing(false)}
          onSave={async (next) => {
            const saved = await onImport(next, true);
            if (saved) setSelected(undefined);
            return saved;
          }}
        />
      )}
      {box && <BoxInfo box={box} />}
      {!box ? (
        <Panel className="box-empty">
          <Monitor size={40} />
          <h3>La vue de votre Box, casier par casier</h3>
          <p>
            Importez le fichier de production complet pour récupérer les
            informations de la Box, ses options et ses serrures. Le format
            backoffice reste accepté : feuille <strong>Back office</strong>,
            colonnes <strong>Casier, N°, Colonne, Zone, Ports, IP</strong>.
          </p>
          <p>
            XLSX, XLS, ODS ou CSV · 5 Mo maximum. Les données restent sur cet
            ordinateur.
          </p>
          <p>
            Après l’import, vérifiez les associations, puis attribuez les IP à
            toute la Box : casier 1 → 192.168.1.11.
          </p>
        </Panel>
      ) : (
        <>
          <div className="box-actions">
            <div
              className="box-tabs"
              role="group"
              aria-label="Affichage de la Box"
            >
              <Button
                aria-pressed={tab === "plan"}
                onClick={() => setTab("plan")}
              >
                Vue de la Box
              </Button>
              <Button
                aria-pressed={tab === "associations"}
                onClick={() => setTab("associations")}
              >
                Associations
              </Button>
            </div>
            {onResolveConflicts &&
              cameras.some(
                (c) =>
                  c.ambiguous ||
                  cameras.some(
                    (other) => other.id !== c.id && other.ip === c.ip,
                  ),
              ) && (
                <Button
                  disabled={disabled || !ready}
                  onClick={onResolveConflicts}
                >
                  <Network size={16} />
                  Résoudre les conflits
                </Button>
              )}
            <Button
              disabled={disabled || !ready}
              onClick={() => {
                const items = associations();
                if (items) onAddress(items);
              }}
            >
              <Network size={16} />
              Attribuer les IP · toute la Box
            </Button>
            <Button
              disabled={disabled || !ready}
              onClick={() => {
                const items = associations();
                if (items) onProfile(items.map((a) => a.id));
              }}
            >
              <SlidersHorizontal size={16} />
              Profil Sezaam · toute la Box
            </Button>
          </div>
          <div className="box-overview">
            <Panel className="box-layout-card">
              <div className="box-layout-heading">
                <h3>Disposition des casiers</h3>
                <div className="box-legend">
                  <span>
                    <i className="success" />
                    Connectée, IP conforme
                  </span>
                  <span>
                    <i className="danger" />
                    Erreur
                  </span>
                  <span>
                    <i className="warning" />À vérifier
                  </span>
                </div>
              </div>
              {tab === "plan" ? (
                <div className="box-layout-scroll">
                  <div
                    className="box-grid"
                    style={{
                      gridTemplateColumns: `repeat(${layout.columns}, 32px)`,
                      gridTemplateRows: `repeat(${layout.rows}, 26px)`,
                    }}
                  >
                    {layout.placements.map(
                      ({
                        locker,
                        columnStart,
                        columnSpan,
                        rowStart,
                        rowSpan,
                      }) => {
                        const state = status(locker);
                        return (
                          <button
                            type="button"
                            key={locker.number}
                            disabled={disabled || locker.number === 0}
                            aria-label={
                              locker.number === 0
                                ? "IHM 0, sans caméra"
                                : `Casier ${locker.number} · ${locker.kind} · ${state.label}`
                            }
                            aria-pressed={selected === locker.number}
                            title={state.label}
                            onClick={() => void selectLocker(locker)}
                            className={`box-locker ${locker.kind === "P" ? "box-half" : ""} ${locker.number === 0 ? "box-ihm" : state.kind} ${selected === locker.number ? "box-locker-active" : ""}`}
                            style={{
                              gridColumn: `${columnStart} / span ${columnSpan}`,
                              gridRow: `${rowStart} / span ${rowSpan}`,
                            }}
                          >
                            {locker.number === 0 ? (
                              <span className="box-ihm-body">
                                <span className="box-ihm-screen" />
                                <span className="box-ihm-controls">
                                  <i />
                                  <b />
                                </span>
                              </span>
                            ) : (
                              <>
                                <span>
                                  {locker.kind}
                                  {locker.number}
                                </span>
                                {state.kind === "success" ? (
                                  <CheckCircle2 size={12} />
                                ) : state.kind === "danger" ? (
                                  <AlertCircle size={12} />
                                ) : null}
                              </>
                            )}
                          </button>
                        );
                      },
                    )}
                  </div>
                </div>
              ) : (
                <div className="box-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Casier</th>
                        <th>Position</th>
                        <th>Caméra associée</th>
                        <th>IP cible</th>
                        <th>État</th>
                      </tr>
                    </thead>
                    <tbody>
                      {targets.map((locker) => (
                        <tr key={locker.number}>
                          <td>
                            <Button onClick={() => void selectLocker(locker)}>
                              {locker.kind}
                              {locker.number}
                            </Button>
                          </td>
                          <td>
                            C{locker.column} · Z{locker.zone}
                          </td>
                          <td>{resolve(locker)?.ip || "Non associée"}</td>
                          <td>
                            <code>{lockerAddress(locker.number)}</code>
                          </td>
                          <td>
                            <Badge kind={status(locker).kind}>
                              {status(locker).label}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="help-text">
                {targets.filter((l) => status(l).kind === "success").length} /{" "}
                {targets.length} caméras connectées avec l’IP attendue. La
                conformité du profil se vérifie séparément.
              </p>
            </Panel>
            <Panel className="box-locker-detail">
              {lock && lock.number > 0 ? (
                <>
                  <div className="section-title">
                    <h3>Casier {lock.number}</h3>
                    <Badge kind={status(lock).kind}>{status(lock).label}</Badge>
                  </div>
                  <dl>
                    <dt>Format</dt>
                    <dd>{lock.kind}</dd>
                    <dt>Position</dt>
                    <dd>
                      Colonne {lock.column} · Zone {lock.zone}
                    </dd>
                    <dt>Ports Southco</dt>
                    <dd>
                      <SouthcoPorts value={lock.ports} />
                    </dd>
                    <dt>IP attendue</dt>
                    <dd>
                      <code>{lockerAddress(lock.number)}</code>
                    </dd>
                    <dt>IP de la fiche</dt>
                    <dd>
                      <code>{lock.ip || "Non renseignée"}</code>
                    </dd>
                  </dl>
                  <Field
                    label="Caméra de ce casier"
                    hint="Vérifiez le retour vidéo pour confirmer l’emplacement physique."
                  >
                    <select
                      disabled={disabled}
                      value={camera?.id || ""}
                      onChange={(e) => {
                        const next = cameras.find(
                          (c) => c.id === e.target.value,
                        );
                        onBind(
                          lock.number,
                          next ? cameraKey(next) : "unassigned",
                        );
                      }}
                    >
                      <option value="">Aucune caméra associée</option>
                      {[...cameras]
                        .sort((a, b) => compareCameraIPs(a.ip, b.ip))
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.ip} · {c.mac || c.serial || c.endpoint || c.id}
                          </option>
                        ))}
                    </select>
                  </Field>
                  {!bindings[String(lock.number)] && camera && (
                    <p className="help-text">
                      {camera.ip === lockerAddress(lock.number)
                        ? "Association automatique · IP du casier conforme."
                        : "Association automatique depuis l’IP de la fiche."}
                    </p>
                  )}
                  <Button
                    variant="primary"
                    disabled={disabled || !camera || !ready || camera.ambiguous}
                    onClick={() => void selectLocker(lock)}
                  >
                    <CameraIcon size={16} />
                    Lire et configurer la caméra
                  </Button>
                  <Button
                    disabled={disabled || !camera || !ready}
                    onClick={() => camera && onProfile([camera.id])}
                  >
                    Appliquer le profil à ce casier
                  </Button>
                </>
              ) : (
                <div className="box-detail-empty">
                  <CameraIcon size={28} />
                  <h3>Sélectionnez un casier</h3>
                  <p>
                    Retrouvez sa position, associez sa caméra et ouvrez son
                    retour vidéo.
                  </p>
                  <p>L’IHM 0 n’a jamais de caméra.</p>
                </div>
              )}
            </Panel>
          </div>
        </>
      )}
    </section>
  );
}
