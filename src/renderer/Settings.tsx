import { osdCorners, type WebOSD } from "../shared/web-osd";
import {
  Button,
  Panel,
  Alert,
  Loading,
  EmptyState,
  Modal,
  useConfirmation,
} from "./design-system/components";
import React, { useEffect, useState, useRef } from "react";
import {
  Network,
  SlidersHorizontal,
  Type,
  Check,
  X,
  Info,
  RotateCcw,
} from "lucide-react";
import type { Api, CameraDetail, WriteResult } from "../shared/types";
import { arr, tok, Field, Capability, type Run } from "./ui";
import { OSDFields, initialOSD } from "./OSDFields";
import type { OSDValues, OSDOptions } from "../shared/osd-options";
import { osdPositionLabels, osdTextLabels } from "../shared/osd-options";
import { networkValues, videoValues, options } from "./camera-form-values";
export function Settings({
  detail,
  unavailable = "Sélectionnez une caméra pour afficher ses paramètres.",
  busy,
  onDirty,
  run,
  onRefresh,
  onStop,
}: {
  detail?: CameraDetail;
  unavailable?: string;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  run: Run;
  onRefresh: () => Promise<CameraDetail>;
  onStop: () => Promise<void>;
}) {
  const [net, setNet] = useState(() => networkValues(detail));
  const [locker, setLocker] = useState("");
  const [encoder, setEncoder] = useState("");
  const entries = arr(detail?.video.data);
  const entry = entries.find((x) => x.profile === encoder) ?? entries[0];
  const [video, setVideo] = useState(() => videoValues(entry));
  const [disabledOSDs, setDisabledOSDs] = useState<string[]>([]);
  const [osdEdits, setOSDEdits] = useState<Record<string, OSDValues>>({});
  const [newOSD, setNewOSD] = useState<{ source: string } & OSDValues>();
  const [webOSD, setWebOSD] = useState<WebOSD | undefined>(
    detail?.osd.data?.web,
  );
  const previousWebOSD = useRef(detail?.osd.data?.web);
  const webDirty =
    JSON.stringify(webOSD) !== JSON.stringify(detail?.osd.data?.web) &&
    JSON.stringify(webOSD) !== JSON.stringify(previousWebOSD.current);
  const [restoreOSD, setRestoreOSD] = useState(false);
  const [results, setResults] = useState<
    { parameter: string; result: WriteResult }[]
  >([]);
  const baseNet = networkValues(detail);
  const baseVideo = videoValues(entry);
  const previousNetwork = useRef(baseNet);
  const previousVideo = useRef(baseVideo);
  const osds = arr(detail?.osd.data?.settings);
  // A fresh read arrives before the effects hydrate untouched drafts. During
  // that render, values matching the previous baseline are not user edits.
  const netDirty =
    JSON.stringify(net) !== JSON.stringify(baseNet) &&
    JSON.stringify(net) !== JSON.stringify(previousNetwork.current);
  const videoDirty =
    JSON.stringify(video) !== JSON.stringify(baseVideo) &&
    JSON.stringify(video) !== JSON.stringify(previousVideo.current);
  const osdOptions = arr(detail?.osd.data?.options);
  const canCreate = osdOptions.filter(
    (o) =>
      o.result?.state === "available" &&
      o.result.data?.types?.includes("Text") &&
      o.result.data.textTypes?.some((t: string) => t in osdTextLabels) &&
      o.result.data.positions?.length &&
      o.result.data.maximum?.Total >
        osds.filter((x) => x.source === o.source).length,
  );
  const textChanges = osds.filter(
    (o) =>
      !disabledOSDs.includes(o.token) &&
      Object.entries(osdEdits[o.token] ?? {}).some(
        ([key, value]) => value !== undefined && value !== o[key],
      ),
  );
  const beginOSD = () => {
    const source = canCreate[0];
    if (source)
      setNewOSD({ source: source.source, ...initialOSD(source.result.data) });
  };
  const dirty =
    !!detail &&
    (webDirty ||
      netDirty ||
      videoDirty ||
      disabledOSDs.length > 0 ||
      textChanges.length > 0 ||
      !!newOSD ||
      restoreOSD);
  const reset = () => {
    setNet(networkValues(detail));
    setVideo(videoValues(entry));
    setWebOSD(detail?.osd.data?.web);
    setDisabledOSDs([]);
    setOSDEdits({});
    setNewOSD(undefined);
    setRestoreOSD(false);
    setLocker("");
  };
  const networkSignature = JSON.stringify(baseNet);
  // Capability responses arriving later must not erase edits already typed.
  const videoSignature = JSON.stringify(
    entries.map((e) => ({ profile: e.profile, config: e.config })),
  );
  const osdSignature = JSON.stringify([
    detail?.osd,
    detail?.osdRestoreAvailable,
  ]);
  useEffect(() => {
    const next = networkValues(detail);
    const previous = previousNetwork.current;
    setNet((current) =>
      JSON.stringify(current) === JSON.stringify(previous) ? next : current,
    );
    previousNetwork.current = next;
  }, [networkSignature]);
  useEffect(() => {
    const selected =
      entries.find((item) => item.profile === encoder) ?? entries[0];
    const next = videoValues(selected);
    if (JSON.stringify(video) === JSON.stringify(previousVideo.current)) {
      setEncoder(selected?.profile ?? "");
      setVideo(next);
    }
    previousVideo.current = next;
  }, [videoSignature]);
  useEffect(() => {
    const hasLocalEdits =
      JSON.stringify(webOSD) !== JSON.stringify(previousWebOSD.current) ||
      disabledOSDs.length > 0 ||
      Object.keys(osdEdits).length > 0 ||
      !!newOSD ||
      restoreOSD;
    if (!hasLocalEdits) setWebOSD(detail?.osd.data?.web);
    previousWebOSD.current = detail?.osd.data?.web;
  }, [osdSignature]);
  useEffect(() => onDirty(dirty), [dirty]);
  const o = options(entry, video.codec);
  const editable = !!detail && !busy;
  const updateNet = (key: keyof typeof net, v: string | boolean) =>
    setNet((n) => ({ ...n, [key]: v }));
  const updateVideo = (key: keyof typeof video, v: string) =>
    setVideo((n) => ({ ...n, [key]: v }));
  const apply = () =>
    void run("Application des modifications", async () => {
      if (!detail) return;
      setResults([]);
      const outcome: { parameter: string; result: WriteResult }[] = [];
      const step = async (
        parameter: string,
        work: () => Promise<WriteResult>,
        onVerified?: () => void,
      ) => {
        let result: WriteResult;
        try {
          result = await work();
        } catch (e) {
          result = {
            sent: false,
            acknowledged: false,
            verified: false,
            message: e instanceof Error ? e.message : String(e),
          };
        }
        outcome.push({ parameter, result });
        setResults([...outcome]);
        if (result.verified) onVerified?.();
        return result.verified;
      };
      await onStop();
      const id = detail.camera.id;
      if (videoDirty) {
        const [width, height] = video.resolution.split("x").map(Number);
        const input: Api["setVideo"]["input"] = {
          id,
          token: tok(entry.config),
          width,
          height,
          fps: Number(video.fps),
        };
        if (video.codec !== baseVideo.codec) input.codec = video.codec;
        if (video.bitrate !== baseVideo.bitrate)
          input.bitrate = Number(video.bitrate);
        if (video.quality !== baseVideo.quality)
          input.quality = Number(video.quality);
        if (video.govLength !== baseVideo.govLength)
          input.govLength = Number(video.govLength);
        if (video.constantBitrate !== baseVideo.constantBitrate)
          input.constantBitrate = video.constantBitrate === "true";
        if (!(await step("Vidéo", () => window.sezaam.call("setVideo", input))))
          return;
      }
      if (
        webDirty &&
        webOSD &&
        !(await step("OSD", () =>
          window.sezaam.call("setWebOSD", { id, values: webOSD }),
        ))
      )
        return;
      for (const item of textChanges)
        if (
          !(await step(
            `Texte OSD ${item.token}`,
            () =>
              window.sezaam.call("setOSD", {
                id,
                token: item.token,
                ...Object.fromEntries(
                  Object.entries(osdEdits[item.token]).filter(
                    ([, value]) => value !== undefined,
                  ),
                ),
              }),
            () =>
              setOSDEdits((edits) =>
                Object.fromEntries(
                  Object.entries(edits).filter(([key]) => key !== item.token),
                ),
              ),
          ))
        )
          return;
      if (
        disabledOSDs.length &&
        !(await step(
          "Désactivation OSD",
          () => window.sezaam.call("disableOSD", { id, tokens: disabledOSDs }),
          () => setDisabledOSDs([]),
        ))
      )
        return;
      if (
        restoreOSD &&
        !(await step(
          "Activation OSD",
          () => window.sezaam.call("restoreOSD", { id }),
          () => setRestoreOSD(false),
        ))
      )
        return;
      if (
        newOSD &&
        !(await step(
          "Nouvelle incrustation OSD",
          () =>
            window.sezaam.call("createOSD", {
              id,
              ...Object.fromEntries(
                Object.entries(newOSD).filter(
                  ([, value]) => value !== undefined,
                ),
              ),
            } as Api["createOSD"]["input"]),
          () => setNewOSD(undefined),
        ))
      )
        return;
      if (netDirty) {
        const input: Api["setCameraNetwork"]["input"] = { id, isolated: false };
        if (
          net.dhcp !== baseNet.dhcp ||
          net.address !== baseNet.address ||
          net.mask !== baseNet.mask
        ) {
          input.dhcp = net.dhcp;
          if (!net.dhcp) {
            input.address = net.address.trim();
            input.mask = net.mask.trim();
          }
        }
        if (net.gateway !== baseNet.gateway) input.gateway = net.gateway.trim();
        if (net.dns !== baseNet.dns)
          input.dns = net.dns.split(/[,\s]+/).filter(Boolean);
        if (
          !(await step("Réseau", () =>
            window.sezaam.call("setCameraNetwork", input),
          ))
        )
          return;
      }
      await onRefresh();
    });
  if (!detail)
    return (
      <Panel className="settings-empty panel">
        <EmptyState icon={SlidersHorizontal} title="Paramètres de la caméra">
          {unavailable}
        </EmptyState>
      </Panel>
    );
  return (
    <>
      <div className="settings-grid">
        <Panel className="panel settings-panel">
          <h3>
            <Network size={22} />
            Configuration réseau
          </h3>
          <fieldset
            disabled={
              !editable ||
              detail?.network.state !== "available" ||
              [detail.gateway, detail.dns].some((f) => f.state === "loading")
            }
          >
            <legend className="sr-only">
              Configuration réseau de la caméra
            </legend>
            <Field label="Mode IP">
              <select
                value={net.dhcp ? "dhcp" : "static"}
                onChange={(e) => updateNet("dhcp", e.target.value === "dhcp")}
              >
                <option value="static">Statique</option>
                <option value="dhcp">DHCP</option>
              </select>
            </Field>
            <Field label="Adresse IP">
              <input
                className="mono"
                value={net.address}
                disabled={net.dhcp}
                placeholder="Non disponible"
                onChange={(e) => updateNet("address", e.target.value)}
              />
            </Field>
            <Field label="Masque de sous-réseau">
              <input
                className="mono"
                value={net.mask}
                disabled={net.dhcp}
                placeholder="Non disponible"
                onChange={(e) => updateNet("mask", e.target.value)}
              />
            </Field>
            <Field label="Passerelle">
              <input
                className="mono"
                disabled={detail?.gateway.state !== "available"}
                value={net.gateway}
                placeholder={
                  detail?.gateway.state === "available"
                    ? "Aucune"
                    : "Non disponible"
                }
                onChange={(e) => updateNet("gateway", e.target.value)}
              />
            </Field>
            <Field label="Serveurs DNS">
              <input
                className="mono"
                disabled={detail?.dns.state !== "available"}
                value={net.dns}
                placeholder={
                  detail?.dns.state === "available"
                    ? "Séparés par une virgule"
                    : "Non disponibles"
                }
                onChange={(e) => updateNet("dns", e.target.value)}
              />
            </Field>
            <div className="sub-panel">
              <strong>Aide à l’adressage par casier</strong>
              <Field label="Numéro de casier">
                <input
                  type="number"
                  min="1"
                  max="244"
                  value={locker}
                  placeholder="1 à 244"
                  disabled={net.dhcp}
                  onChange={(e) => {
                    setLocker(e.target.value);
                    const n = Number(e.target.value);
                    if (Number.isInteger(n) && n >= 1 && n <= 244) {
                      updateNet("address", `192.168.1.${n + 10}`);
                      updateNet("mask", "255.255.255.0");
                    }
                  }}
                />
              </Field>
              <small>192.168.1.(casier + 10)</small>
            </div>
            {netDirty && (
              <>
                <p className="help-text">
                  Le changement réseau peut couper l’accès. Une confirmation
                  sera demandée avant envoi.
                </p>
                {net.dhcp && (
                  <p className="help-text">
                    Un serveur DHCP est nécessaire. La nouvelle adresse sera
                    recherchée.
                  </p>
                )}
              </>
            )}
          </fieldset>
          {(!detail || detail.network.state !== "available") && (
            <Capability feature={detail?.network} />
          )}
        </Panel>
        <Panel className="panel settings-panel">
          <h3>
            <SlidersHorizontal size={22} />
            Paramètres vidéo
          </h3>
          <fieldset disabled={!editable || detail?.video.state !== "available"}>
            <legend className="sr-only">Encodage du flux sélectionné</legend>
            <Field label="Flux à configurer">
              <select
                value={encoder}
                disabled={videoDirty}
                onChange={(e) => {
                  setEncoder(e.target.value);
                  const next = videoValues(
                    entries.find((x) => x.profile === e.target.value),
                  );
                  previousVideo.current = next;
                  setVideo(next);
                }}
              >
                <option value="">Choisir un flux</option>
                {entries.map((x) => (
                  <option key={x.profile} value={x.profile}>
                    {x.name || x.profile}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Résolution">
              <select
                value={video.resolution}
                disabled={!o.resolutions.length}
                onChange={(e) => updateVideo("resolution", e.target.value)}
              >
                <option value={baseVideo.resolution}>
                  {baseVideo.resolution.replace("x", " × ") || "Non disponible"}
                </option>
                {o.resolutions
                  .filter(
                    (r) => `${r.width}x${r.height}` !== baseVideo.resolution,
                  )
                  .map((r) => (
                    <option
                      key={`${r.width}x${r.height}`}
                      value={`${r.width}x${r.height}`}
                    >
                      {r.width} × {r.height}
                    </option>
                  ))}
              </select>
            </Field>
            <Field label="FPS (images/s)">
              {o.fpsValues.length ? (
                <select
                  value={video.fps}
                  onChange={(e) => updateVideo("fps", e.target.value)}
                >
                  {!o.fpsValues.includes(Number(video.fps)) && (
                    <option value={video.fps}>{video.fps || "Choisir"}</option>
                  )}
                  {o.fpsValues.map((fps) => (
                    <option key={fps} value={fps}>
                      {fps}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  step="any"
                  min={o.fps?.min}
                  max={o.fps?.max}
                  value={video.fps}
                  disabled={!o.fps}
                  placeholder="Non disponible"
                  onChange={(e) => updateVideo("fps", e.target.value)}
                />
              )}
            </Field>
            <Field label="Codec vidéo">
              <select
                value={video.codec}
                disabled={!o.codecs.length}
                onChange={(e) => {
                  const codec = e.target.value,
                    opts = options(entry, codec),
                    r = opts.resolutions[0];
                  setVideo((v) => ({
                    ...v,
                    codec,
                    resolution: r ? `${r.width}x${r.height}` : "",
                    fps: String(opts.fps?.min ?? ""),
                  }));
                }}
              >
                <option value={baseVideo.codec}>
                  {baseVideo.codec || "Non disponible"}
                </option>
                {o.codecs
                  .filter((c) => c !== baseVideo.codec)
                  .map((c) => (
                    <option key={c}>{c}</option>
                  ))}
              </select>
            </Field>
            <Field label="Contrôle du débit">
              <select
                value={video.constantBitrate}
                disabled={!o.rateMode}
                onChange={(e) => updateVideo("constantBitrate", e.target.value)}
              >
                {!o.rateMode ? (
                  <option value={video.constantBitrate}>
                    Non configurable via ONVIF
                  </option>
                ) : (
                  <>
                    <option value="false">Variable (VBR)</option>
                    <option value="true">Constant (CBR)</option>
                  </>
                )}
              </select>
            </Field>
            <Field label="Débit cible (kb/s)">
              <input
                type="number"
                min={o.bitrate?.min}
                max={o.bitrate?.max}
                disabled={!o.bitrate}
                value={video.bitrate}
                placeholder="Non disponible"
                onChange={(e) => updateVideo("bitrate", e.target.value)}
              />
            </Field>
            <Field label="Qualité">
              <input
                type="number"
                step="any"
                min={o.quality?.min}
                max={o.quality?.max}
                disabled={!o.quality}
                value={video.quality}
                placeholder="Non disponible"
                onChange={(e) => updateVideo("quality", e.target.value)}
              />
            </Field>
            <Field label="Intervalle I-Frame">
              <input
                type="number"
                min={o.gov?.min}
                max={o.gov?.max}
                disabled={!o.gov}
                value={video.govLength}
                placeholder="Non disponible"
                onChange={(e) => updateVideo("govLength", e.target.value)}
              />
            </Field>
          </fieldset>
          <p className="help-text">
            <Info size={14} />
            Les choix proviennent des capacités ONVIF. Les profils partageant
            cet encodeur sont concernés.
          </p>
          {entry?.options?.state !== "available" && (
            <Capability feature={entry?.options ?? detail?.video} />
          )}
        </Panel>
        <Panel className="panel settings-panel osd-panel">
          <h3>
            <Type size={22} />
            Affichage à l’écran (OSD)
          </h3>
          {detail?.osd.state === "available" && webOSD ? (
            <fieldset disabled={busy}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={webOSD.enabled}
                  onChange={(e) =>
                    setWebOSD({ ...webOSD, enabled: e.target.checked })
                  }
                />
                Activer l’OSD
              </label>
              <Field label="Texte affiché">
                <input
                  value={webOSD.title}
                  maxLength={64}
                  onChange={(e) =>
                    setWebOSD({ ...webOSD, title: e.target.value })
                  }
                />
              </Field>
              {(
                [
                  ["titlePosition", "Position du texte"],
                  ["timePosition", "Date et heure"],
                ] as const
              ).map(([key, label]) => (
                <Field key={key} label={label}>
                  <select
                    aria-label={label}
                    value={webOSD[key]}
                    onChange={(e) =>
                      setWebOSD({ ...webOSD, [key]: e.target.value })
                    }
                  >
                    {Object.entries(osdCorners)
                      .filter(
                        ([k]) =>
                          k !== "custom" ||
                          detail.osd.data.web[key] === "custom",
                      )
                      .map(([key, label]) => (
                        <option key={key} value={key}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
              ))}
              <p className="help-text">
                Les changements sont envoyés avec « Appliquer », puis relus sur
                la caméra. La désactivation conserve le texte et ses positions.
              </p>
            </fieldset>
          ) : detail?.osd.state === "available" ? (
            <>
              <div className="osd-global">
                <strong>
                  {osds.length
                    ? `${osds.length} incrustation(s) active(s)`
                    : "OSD désactivé"}
                </strong>
                {osds.length > 0 ? (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      setDisabledOSDs(
                        disabledOSDs.length === osds.length
                          ? []
                          : osds.map((o) => o.token),
                      )
                    }
                  >
                    {disabledOSDs.length === osds.length
                      ? "Conserver l’OSD"
                      : "Désactiver l’OSD"}
                  </Button>
                ) : detail.osdRestoreAvailable ? (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      disabled={busy}
                      checked={restoreOSD}
                      onChange={(e) => setRestoreOSD(e.target.checked)}
                    />
                    Activer l’OSD sauvegardé
                  </label>
                ) : canCreate.length > 0 && !newOSD ? (
                  <Button disabled={busy} onClick={beginOSD}>
                    Activer l’OSD
                  </Button>
                ) : null}
              </div>
              <div className="osd-list">
                {osds.map((item) => {
                  const caps = osdOptions.find(
                    (o) => o.source === item.source,
                  )?.result;
                  const edits = osdEdits[item.token] ?? {};
                  return (
                    <div className="osd-item" key={item.token}>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          disabled={busy}
                          checked={!disabledOSDs.includes(item.token)}
                          onChange={(e) =>
                            setDisabledOSDs((old) =>
                              e.target.checked
                                ? old.filter((t) => t !== item.token)
                                : [...old, item.token],
                            )
                          }
                        />
                        <span>
                          {osdTextLabels[item.textType] ||
                            (item.text
                              ? "Afficher le texte"
                              : "Date / heure ou texte")}
                        </span>
                      </label>
                      <small>
                        {osdPositionLabels[item.position] || item.position}
                      </small>
                      <OSDFields
                        values={{ ...item, ...edits }}
                        options={
                          caps?.state === "available" ? caps.data : undefined
                        }
                        disabled={busy || disabledOSDs.includes(item.token)}
                        onChange={(patch) =>
                          setOSDEdits((old) => ({
                            ...old,
                            [item.token]: { ...old[item.token], ...patch },
                          }))
                        }
                      />
                      {caps?.state !== "available" && (
                        <p className="help-text">
                          Les options de position et de style ne sont pas
                          exposées par cette caméra.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
              {newOSD && (
                <div className="osd-create">
                  <h4>Nouvelle incrustation</h4>
                  {canCreate.length > 1 && (
                    <Field label="Source vidéo OSD">
                      <select
                        value={newOSD.source}
                        disabled={busy}
                        onChange={(e) => {
                          const o = canCreate.find(
                            (x) => x.source === e.target.value,
                          );
                          setNewOSD({
                            source: o.source,
                            ...initialOSD(o.result.data),
                          });
                        }}
                      >
                        {canCreate.map((o) => (
                          <option key={o.source}>{o.source}</option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <OSDFields
                    creating
                    values={newOSD}
                    options={
                      canCreate.find((o) => o.source === newOSD.source)?.result
                        .data
                    }
                    disabled={busy}
                    onChange={(patch) =>
                      setNewOSD((old) => (old ? { ...old, ...patch } : old))
                    }
                  />
                  <Button disabled={busy} onClick={() => setNewOSD(undefined)}>
                    Retirer cette incrustation
                  </Button>
                </div>
              )}
              {!newOSD &&
                canCreate.length > 0 &&
                (osds.length > 0 || detail.osdRestoreAvailable) && (
                  <Button disabled={busy} onClick={beginOSD}>
                    Ajouter une incrustation
                  </Button>
                )}
              {!osds.length &&
                !canCreate.length &&
                !detail.osdRestoreAvailable && (
                  <p className="help-text">
                    La caméra ne communique pas d’options de création OSD via
                    ONVIF. Les réglages propres au fabricant restent accessibles
                    dans son interface web.
                  </p>
                )}
              <p className="help-text">
                Les changements sont envoyés avec « Appliquer ». Les
                incrustations désactivées sont sauvegardées pour pouvoir les
                réactiver.
              </p>
              {disabledOSDs.length > 0 && (
                <div className="pending-note">
                  {disabledOSDs.length} incrustation(s) à supprimer. La
                  disparition sera vérifiée par relecture.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="osd-empty">
                <Type size={30} />
                <strong>
                  {detail
                    ? "Gestion OSD non disponible"
                    : "Incrustations de la caméra"}
                </strong>
              </div>
              <Capability feature={detail?.osd} />
              <p className="help-text">
                Si ONVIF ne permet pas cette opération, utilisez « Ouvrir
                l’interface web » sur la fiche caméra.
              </p>
            </>
          )}
        </Panel>
      </div>
      {results.length > 0 && (
        <Panel className="write-results panel" aria-live="polite">
          <h3>Résultat des modifications</h3>
          {results.map(({ parameter, result }, i) => (
            <div key={i}>
              <strong>
                {parameter} ·{" "}
                {result.verified
                  ? "Vérifié"
                  : result.sent
                    ? "Envoyé · non vérifié"
                    : "Non vérifié"}
              </strong>
              <p>{result.message}</p>
              {result.results?.map((r, j) => (
                <p key={j}>
                  {r.verified ? "✓" : "!"} {r.parameter} : {r.message}
                </p>
              ))}
            </div>
          ))}
        </Panel>
      )}
      <footer className={dirty ? "apply-bar has-changes" : "apply-bar"}>
        <span aria-live="polite">
          {dirty ? (
            <>
              <span className="unsaved-dot" />
              Modifications non enregistrées
            </>
          ) : detail ? (
            detail.loading ? (
              "Lecture des paramètres complémentaires…"
            ) : detail?.readState === "cached" ? (
              "Informations en mémoire · aucune modification locale"
            ) : (
              "Paramètres lus sur la caméra"
            )
          ) : (
            "Connectez une caméra pour modifier ses paramètres"
          )}
        </span>
        <Button className="secondary" disabled={!dirty || busy} onClick={reset}>
          <X size={16} />
          Annuler
        </Button>
        <Button className="primary" disabled={!dirty || busy} onClick={apply}>
          <Check size={18} />
          Appliquer
        </Button>
      </footer>
    </>
  );
}
