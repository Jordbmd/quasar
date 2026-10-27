import { ProfileJournal } from "./profile-journal";
import { auditFields, fieldSupport } from "../shared/default-support";
import { issueCode, type ProfileRun } from "../shared/profile-journal";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  defaultFields,
  initialDefaults,
  validateDefaults,
  defaultValueLabel,
  type DefaultsProfile,
  type DefaultsPlan,
  type DefaultsCameraPlan,
  type DefaultsProgress,
  type DefaultRow,
} from "../shared/defaults";
import type { Api, Camera, CameraDetail, WriteResult } from "../shared/types";
import { videoCapabilities } from "../shared/video-options";
import { array, token, validateVideo, inRange } from "./onvif";
import { identityMatches } from "./discovery";
import {
  buildVendorChange,
  integratedVendorFields,
  vendorGroupFor,
  vendorValue,
  validateVendorField,
  resolveVendorResolution,
  type VendorSnapshot,
} from "./vendor-profile";
import { vendorGroups, type VendorGroup } from "../shared/vendor-profile";

type Action = {
  method:
    | "setVideo"
    | "setImage"
    | "disableOSD"
    | "restoreOSD"
    | "syncCameraTime"
    | "setVendorDefaults"
    | "setDayMode";
  input: any;
  fields: string[];
};
type Prepared = DefaultsCameraPlan & { actions: Action[]; fingerprint: string };
export class DefaultsStore {
  private memory: DefaultsProfile;
  constructor(
    private file?: string,
    seed: unknown = initialDefaults(),
  ) {
    this.memory = validateDefaults(seed);
  }
  async read(): Promise<DefaultsProfile> {
    if (!this.file) return structuredClone(this.memory);
    try {
      const saved = JSON.parse(await readFile(this.file, "utf8"));
      // Retire only known obsolete fields; preserve all other user choices.
      for (const id of [
        "factoryReset",
        "drc",
        "aiDetection",
        "videoLostAlarm",
        "nightShutterMode",
        "nightShutterSpeed",
      ])
        delete saved?.fields?.[id];
      if (saved?.fields?.ircutMode)
        saved.fields.ircutMode.value = "Manual → Day Model";
      const profile = validateDefaults(saved);
      // Migrate only the former generated label, preserving custom names and values.
      if (/^Sezaam · référence MCA35$/.test(profile.name))
        profile.name = "Sezaam";
      return profile;
    } catch (e: any) {
      if (e.code === "ENOENT") return structuredClone(this.memory);
      throw Error(
        "Le profil enregistré est illisible. Il n’a pas été remplacé.",
      );
    }
  }
  async save(input: DefaultsProfile) {
    const p = validateDefaults(input),
      current = await this.read();
    if (p.revision !== current.revision)
      throw Error(
        "Le profil a été modifié ailleurs. Rechargez la page avant d’enregistrer.",
      );
    p.revision++;
    if (this.file) {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      const tmp = this.file + "." + randomUUID() + ".tmp";
      await writeFile(tmp, JSON.stringify(p, null, 2), { mode: 0o600 });
      await rename(tmp, this.file);
    }
    this.memory = structuredClone(p);
    return p;
  }
}
export function prepareDefaults(
  profile: DefaultsProfile,
  detail: CameraDetail,
): Prepared {
  const rows: DefaultRow[] = defaultFields
    .filter((f) => profile.fields[f.id].included)
    .map((f) => ({
      id: f.id,
      label: f.label,
      value: profile.fields[f.id].value,
      state: "manual",
      code: (
        {
          implemented: "CAPABILITY_UNAVAILABLE",
          standard: "NOT_IMPLEMENTED",
          mapping: "MAPPING_REQUIRED",
          vendor: "VENDOR_REQUIRED",
          manual: "MANUAL_STEP",
        } as const
      )[fieldSupport(f.id).kind],
      message: f.automatic
        ? "Capacité non vérifiée."
        : fieldSupport(f.id).reason,
    }));
  const actions: Action[] = [];
  const row = (id: string) => rows.find((r) => r.id === id);
  const value = (id: string) => profile.fields[id].value;
  const mark = (
    id: string,
    before: unknown,
    desired: unknown,
    message: string,
  ) => {
    const r = row(id);
    if (r) {
      r.before = before == null ? "Non lu" : defaultValueLabel(before as any);
      r.state = String(before) === String(desired) ? "same" : "ready";
      r.code = r.state === "same" ? "ALREADY_MATCHES" : undefined;
      r.message = message;
    }
  };
  const block = (ids: string[], message: string) =>
    ids.forEach((id) => {
      const r = row(id);
      if (r) {
        r.state = "blocked";
        r.code = issueCode(
          message,
          /hors des capacités|non proposé|non annoncé|ne confirme|résolution non/.test(
            message,
          )
            ? "VALUE_NOT_SUPPORTED"
            : "CAPABILITY_UNAVAILABLE",
        );
        r.message = message;
      }
    });
  const imageIds = [
    "brightness",
    "colorSaturation",
    "contrast",
    "sharpness",
  ].filter((id) => row(id));
  const imageValues: Record<string, number> = {};
  for (const id of imageIds) {
    try {
      if (detail.image.state !== "available")
        throw Error(detail.image.message || "Capacités d’image indisponibles.");
      inRange(
        Number(value(id)),
        detail.image.data.options?.[id],
        row(id)!.label,
      );
      mark(
        id,
        detail.image.data.settings?.[id],
        value(id),
        "Valeur brute, sans changement d’échelle.",
      );
      if (row(id)?.state === "ready") imageValues[id] = Number(value(id));
    } catch (e) {
      block([id], String((e as Error).message));
    }
  }
  if (Object.keys(imageValues).length)
    actions.push({
      method: "setImage",
      input: { id: detail.camera.id, values: imageValues },
      fields: Object.keys(imageValues),
    });
  const videoIds = [
    "codec",
    "resolution",
    "fps",
    "bitrate",
    "govLength",
    "bitrateControl",
    "h264Profile",
  ].filter((id) => row(id));
  if (videoIds.length) {
    try {
      if (detail.video.state !== "available")
        throw Error("Lecture des paramètres vidéo indisponible.");
      const entries = array(detail.video.data);
      const unique = [
        ...new Map(entries.map((e) => [token(e.config), e])).values(),
      ];
      const main = entries.filter((e) =>
        /^(main[\s_-]*stream|main|principal|flux principal)$/i.test(
          e.name || "",
        ),
      );
      const candidates = [
        ...new Map(main.map((e) => [token(e.config), e])).values(),
      ];
      const entry =
        candidates.length === 1
          ? candidates[0]
          : unique.length === 1
            ? unique[0]
            : undefined;
      if (!entry || !token(entry.config))
        throw Error(
          "Flux principal ambigu : aucun encodeur unique nommé MainStream / principal. Aucun flux choisi automatiquement.",
        );
      const c = entry.config,
        codec = row("codec") ? String(value("codec")) : c.encoding;
      const caps = videoCapabilities(entry, codec);
      let resolution = c.resolution;
      if (row("resolution")) {
        const wanted = String(value("resolution"));
        const available = caps.resolutions.filter((r: any) =>
          wanted === "Résolution maximale"
            ? Number.isSafeInteger(r.width) &&
              Number.isSafeInteger(r.height) &&
              r.width > 0 &&
              r.height > 0
            : wanted === "3MP"
              ? r.width * r.height >= 2700000 && r.width * r.height <= 3400000
              : `${r.width} × ${r.height}` === wanted,
        );
        const distinct = [
          ...new Map(
            available.map((r: any) => [`${r.width}x${r.height}`, r]),
          ).values(),
        ];
        const maxPixels = Math.max(
          ...distinct.map((r: any) => r.width * r.height),
        );
        const choices =
          wanted === "Résolution maximale"
            ? distinct
                .filter((r: any) => r.width * r.height === maxPixels)
                .sort((a: any, b: any) => b.width - a.width)
            : distinct;
        resolution =
          choices.find(
            (r: any) =>
              r.width === c.resolution?.width &&
              r.height === c.resolution?.height,
          ) ??
          (choices.length === 1 || wanted === "Résolution maximale"
            ? choices[0]
            : undefined);
        if (!resolution)
          throw Error(
            wanted +
              " : résolution non proposée ou plusieurs définitions possibles. Choisissez une définition précise dans le profil.",
          );
      }
      const input: Api["setVideo"]["input"] = {
        id: detail.camera.id,
        token: token(c),
        width: resolution?.width,
        height: resolution?.height,
        fps: row("fps") ? Number(value("fps")) : c.rateControl?.frameRateLimit,
        ...(row("codec") ? { codec } : {}),
      };
      // Validate the codec/resolution/frame-rate combination before adding optional controls.
      validateVideo(entry, input);
      mark(
        "codec",
        c.encoding,
        codec,
        `Encodeur ${entry.name || token(c)}. Les profils qui le partagent seront concernés.`,
      );
      mark(
        "resolution",
        `${c.resolution?.width} × ${c.resolution?.height}`,
        `${input.width} × ${input.height}`,
        `Définition retenue : ${input.width} × ${input.height}.`,
      );
      if (row("resolution"))
        row("resolution")!.value = `${input.width} × ${input.height}`;
      mark(
        "fps",
        c.rateControl?.frameRateLimit,
        input.fps,
        "Cadence annoncée par la caméra.",
      );
      for (const [id, key, before, desired] of [
        [
          "bitrate",
          "bitrate",
          c.rateControl?.bitrateLimit,
          Number(value("bitrate")),
        ],
        [
          "govLength",
          "govLength",
          c[c.encoding]?.govLength ?? c.$?.GovLength,
          Number(value("govLength")),
        ],
        [
          "bitrateControl",
          "constantBitrate",
          c.rateControl?.$?.ConstantBitRate,
          value("bitrateControl") === "CBR",
        ],
        [
          "h264Profile",
          "h264Profile",
          c.H264?.H264Profile ?? c.$?.Profile,
          value("h264Profile"),
        ],
      ] as const)
        if (row(id)) {
          try {
            validateVideo(entry, { ...input, [key]: desired });
            Object.assign(input, { [key]: desired });
            mark(id, before, desired, "Option annoncée par la caméra.");
          } catch (e) {
            block([id], (e as Error).message);
          }
        }
      const changed = videoIds.filter((id) => row(id)?.state === "ready");
      if (changed.length)
        actions.push({ method: "setVideo", input, fields: changed });
    } catch (e) {
      block(videoIds, (e as Error).message);
    }
  }
  if (row("osd")) {
    if (detail.osd.state !== "available")
      block(["osd"], "Lecture OSD indisponible.");
    else {
      const objects = array(detail.osd.data?.settings);
      const enabled = Boolean(value("osd"));
      mark(
        "osd",
        objects.length > 0,
        enabled,
        enabled
          ? "Restaurer les objets OSD sauvegardés."
          : "Sauvegarder les objets OSD puis les supprimer et vérifier leur absence.",
      );
      if (row("osd")!.state === "ready") {
        if (enabled && !detail.osdRestoreAvailable)
          block(
            ["osd"],
            "Aucune sauvegarde OSD à restaurer. Créez un OSD depuis la page de la caméra.",
          );
        else
          actions.push({
            method: enabled ? "restoreOSD" : "disableOSD",
            input: { id: detail.camera.id },
            fields: ["osd"],
          });
      }
    }
  }
  if (row("syncTime") && value("syncTime") === true) {
    if (detail.clock?.state !== "available")
      block(
        ["syncTime", "clockTimezone"],
        detail.clock?.message || "Date UTC de la caméra non vérifiable.",
      );
    else if (!row("clockTimezone"))
      block(
        ["syncTime"],
        "Incluez le fuseau horaire pour synchroniser la caméra.",
      );
    else {
      for (const id of ["syncTime", "clockTimezone"]) {
        const r = row(id)!;
        r.state = "ready";
        r.before =
          id === "syncTime"
            ? new Date(detail.clock.data.at).toISOString()
            : detail.clock.data.timezone;
        r.message = `Heure actuelle du Mac à l’application · ${value("clockTimezone")} · relecture UTC et fuseau.`;
      }
      actions.push({
        method: "syncCameraTime",
        input: { id: detail.camera.id, timezone: value("clockTimezone") },
        fields: ["syncTime", "clockTimezone"],
      });
    }
  } else {
    for (const id of ["syncTime", "clockTimezone"])
      if (row(id)) {
        row(id)!.state = "manual";
        row(id)!.message =
          "Synchronisation exclue : date, heure et fuseau conservés.";
      }
  }
  if (row("ircutMode")) {
    if (detail.daylight?.state !== "available")
      block(
        ["ircutMode"],
        detail.daylight?.message || "État jour/nuit non vérifiable.",
      );
    else {
      mark(
        "ircutMode",
        detail.daylight.data.day
          ? value("ircutMode")
          : "Mode nuit ou automatique",
        value("ircutMode"),
        "Mode manuel et filtre jour relus sur la caméra.",
      );
      if (row("ircutMode")?.state === "ready")
        actions.push({
          method: "setDayMode",
          input: { id: detail.camera.id },
          fields: ["ircutMode"],
        });
    }
  }
  if (detail.vendor?.state === "available") {
    const snapshot = detail.vendor.data as VendorSnapshot;
    for (const group of Object.keys(vendorGroups) as VendorGroup[]) {
      const ids = integratedVendorFields.filter(
        (id) => row(id) && vendorGroupFor(id) === group,
      );
      const feature = snapshot.groups[group];
      const values: Record<string, any> = {};
      for (const id of ids) {
        try {
          if (feature?.state !== "available")
            throw Error(
              feature?.message || "Lecture constructeur indisponible.",
            );
          const before = vendorValue(feature.data, id);
          // Check field presence/representation before preferring this adapter.
          if (id === "privacyMask" && value(id) === "Conserver") continue;
          const desired =
            id === "resolution"
              ? resolveVendorResolution(
                  snapshot,
                  String(value(id)),
                  row("codec") ? String(value("codec")) : undefined,
                )
              : value(id);
          validateVendorField(feature.data, id, desired);
          values[id] = desired;
          mark(
            id,
            before,
            desired,
            `API web · ${vendorGroups[group].write} · relecture obligatoire.`,
          );
          if (id === "resolution") {
            row(id)!.value = desired;
            row(id)!.message =
              `Profil ${value(id)} → définition annoncée ${desired}. Relecture obligatoire.`;
          }
        } catch (e) {
          if (!["ready", "same"].includes(row(id)!.state))
            block([id], String((e as Error).message));
        }
      }
      const used = Object.keys(values);
      if (!used.length) continue;
      // The web adapter owns these fields; do not send a duplicate ONVIF write.
      for (const a of actions) {
        const overlap = a.fields.some((id) => used.includes(id));
        a.fields = a.fields.filter((id) => !used.includes(id));
        if (overlap && a.method === "setImage")
          a.input.values = Object.fromEntries(
            Object.entries(a.input.values).filter(([id]) =>
              a.fields.includes(id),
            ),
          );
        if (overlap && a.method === "setVideo") {
          block(
            a.fields,
            "Encodeur partiellement lu : relisez ses capacités avant une modification ONVIF.",
          );
          a.fields = [];
        }
      }
      try {
        const change = buildVendorChange(snapshot, group, values);
        const changed = used.filter((id) => row(id)!.state === "ready");
        if (changed.length)
          actions.push({
            method: "setVendorDefaults",
            input: {
              id: detail.camera.id,
              group,
              values: Object.fromEntries(changed.map((id) => [id, values[id]])),
              fingerprint: change.fingerprint,
            },
            fields: changed,
          });
      } catch (e) {
        block(used, String((e as Error).message));
      }
    }
  } else if (detail.vendor) {
    for (const id of integratedVendorFields) {
      const r = row(id);
      // Preserve confirmed ONVIF results. A failed protocol read must not turn
      // an integrated web field into an apparently unimplemented feature.
      if (!r || ["ready", "same"].includes(r.state)) continue;
      block(
        [id],
        detail.vendor.message || "Lecture de l’API web indisponible.",
      );
      if (detail.vendor.state === "unsupported") r.code = "ACTION_UNSUPPORTED";
    }
  }
  // Apply day mode after capture writes so its configuration fingerprint stays valid.
  actions.sort(
    (a, b) =>
      Number(a.method === "setDayMode") - Number(b.method === "setDayMode"),
  );
  for (let i = actions.length - 1; i >= 0; i--)
    if (!actions[i].fields.length) actions.splice(i, 1);
  for (const action of actions)
    for (const id of action.fields) {
      const r = row(id)!;
      r.method =
        action.method === "setVendorDefaults"
          ? "API web · " + vendorGroups[action.input.group as VendorGroup].write
          : action.method;
      r.code = undefined;
    }
  return {
    camera: { ...detail.camera },
    rows,
    actions,
    fingerprint: JSON.stringify({
      video: detail.video.data,
      image: detail.image.data,
      osd: detail.osd.data,
      restore: detail.osdRestoreAvailable,
      vendor: detail.vendor?.data,
    }),
  };
}
type Hooks = {
  epoch: () => number;
  camera: (id: string) => Camera;
  read: (id: string) => Promise<CameraDetail>;
  check: (camera: Camera) => Promise<void>;
  write: (action: Action) => Promise<WriteResult>;
  progress: (p: DefaultsProgress) => void;
  safe: (e: unknown) => string;
};
export class DefaultsManager {
  private plans = new Map<
    string,
    {
      view: DefaultsPlan;
      prepared: Prepared[];
      epoch: number;
      profile: DefaultsProfile;
      expires: number;
    }
  >();
  constructor(
    public store: DefaultsStore,
    private hooks: Hooks,
    public journal = new ProfileJournal(),
  ) {}
  async audit(ids: string[]) {
    const profile = await this.store.read(),
      epoch = this.hooks.epoch();
    const allFields = structuredClone(profile);
    for (const f of Object.values(allFields.fields)) f.included = true;
    const now = new Date().toISOString();
    const report: ProfileRun = {
      id: randomUUID(),
      name: profile.name,
      revision: profile.revision,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      kind: "audit",
      status: "running",
      cameras: [],
      audit: [],
    };
    const targets = ids
      .map((id) => ({ ...this.hooks.camera(id) }))
      .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
    await this.journal.save(report);
    try {
      for (const camera of targets) {
        this.hooks.progress({
          camera: camera.ip,
          completed: report.cameras.length,
          total: targets.length,
          stage: "Audit en lecture seule",
        });
        try {
          if (epoch !== this.hooks.epoch())
            throw Error("Réseau modifié pendant l’audit.");
          const d = await this.hooks.read(camera.id);
          if (epoch !== this.hooks.epoch())
            throw Error("Réseau modifié pendant l’audit.");
          if (!identityMatches(d.camera, d.camera))
            throw Error("Identité de caméra non vérifiable.");
          if (
            (camera.mac && !d.camera.mac) ||
            (camera.serial && !d.camera.serial)
          )
            throw Error(
              "Identité de caméra non vérifiable : informations incomplètes à la relecture.",
            );
          if (
            identityMatches(camera, camera) &&
            !identityMatches(camera, d.camera)
          )
            throw Error("Identité de caméra modifiée.");
          const prepared = prepareDefaults(allFields, d);
          report.cameras.push({ camera: d.camera, rows: prepared.rows });
          report.audit!.push({
            cameraId: camera.id,
            fields: auditFields(d).map((f) => {
              const r = prepared.rows.find((r) => r.id === f.id);
              return {
                ...f,
                observation:
                  f.kind === "implemented"
                    ? `${r?.state === "ready" || r?.state === "same" ? "Compatible en lecture, écriture non testée." : "Non confirmé pour la valeur demandée."} ${r?.message || ""}`
                    : f.observation,
              };
            }),
          });
        } catch (e) {
          const message = this.hooks.safe(e);
          report.cameras.push({
            camera,
            rows: defaultFields.map((f) => ({
              id: f.id,
              label: f.label,
              value: profile.fields[f.id].value,
              state: "blocked",
              code: issueCode(message, "CAPABILITY_UNAVAILABLE"),
              message,
            })),
            error: message,
          });
          report.audit!.push({ cameraId: camera.id, fields: auditFields() });
        }
        report.updatedAt = new Date().toISOString();
        await this.journal.save(report);
      }
      report.status = "complete";
    } catch (e) {
      report.status = "interrupted";
      report.journalWarning = this.hooks.safe(e);
    }
    report.updatedAt = new Date().toISOString();
    await this.journal.save(report);
    await this.journal.prune();
    return report;
  }
  async preview(ids: string[]) {
    const profile = await this.store.read(),
      epoch = this.hooks.epoch(),
      prepared: Prepared[] = [];
    // Capture all targets before any slow read; no undiscovered target may be injected.
    const targets = ids
      .map((id) => ({ ...this.hooks.camera(id) }))
      .sort((a, b) => a.ip.localeCompare(b.ip, undefined, { numeric: true }));
    for (const camera of targets) {
      this.hooks.progress({
        camera: camera.ip,
        completed: prepared.length,
        total: targets.length,
        stage: "Lecture des capacités",
      });
      try {
        await this.hooks.check(camera);
        const detail = await this.hooks.read(camera.id);
        if (!identityMatches(camera, detail.camera))
          throw Error("L’identité de la caméra a changé.");
        prepared.push(prepareDefaults(profile, detail));
      } catch (e) {
        prepared.push({
          camera,
          rows: defaultFields
            .filter((f) => profile.fields[f.id].included)
            .map((f) => ({
              id: f.id,
              label: f.label,
              value: profile.fields[f.id].value,
              state: "blocked",
              code: issueCode(this.hooks.safe(e), "CAPABILITY_UNAVAILABLE"),
              message: this.hooks.safe(e),
            })),
          error: this.hooks.safe(e),
          actions: [],
          fingerprint: "",
        });
      }
      if (epoch !== this.hooks.epoch())
        throw Error(
          "Le réseau a changé pendant la préparation. Recommencez la vérification.",
        );
    }
    const view: DefaultsPlan = {
      id: randomUUID(),
      name: profile.name,
      revision: profile.revision,
      createdAt: new Date().toISOString(),
      cameras: prepared.map(({ camera, rows, error }) => ({
        camera,
        rows,
        error,
      })),
    };
    this.plans.clear();
    this.plans.set(view.id, {
      view: structuredClone(view),
      prepared,
      epoch,
      profile,
      expires: Date.now() + 600000,
    });
    return view;
  }
  async apply(planId: string) {
    const plan = this.plans.get(planId);
    this.plans.delete(planId);
    if (!plan || Date.now() > plan.expires)
      throw Error(
        "Vérification expirée. Préparez à nouveau l’application du profil.",
      );
    if (
      plan.epoch !== this.hooks.epoch() ||
      (await this.store.read()).revision !== plan.profile.revision
    )
      throw Error(
        "Le réseau ou le profil a changé. Vérifiez à nouveau les cibles.",
      );
    const now = new Date().toISOString();
    const report: ProfileRun = {
      ...structuredClone(plan.view),
      kind: "apply",
      status: "running",
      startedAt: now,
      updatedAt: now,
    };
    // Persist the intent before the first write. A failed checkpoint stops the batch.
    await this.journal.save(report);
    let journalFailed = false;
    const checkpoint = async () => {
      report.updatedAt = new Date().toISOString();
      try {
        await this.journal.save(report);
      } catch (e) {
        journalFailed = true;
        report.journalWarning =
          "Journal non enregistré : " + this.hooks.safe(e);
        throw Error(report.journalWarning);
      }
    };
    for (let i = 0; i < plan.prepared.length; i++) {
      const p = plan.prepared[i],
        result = report.cameras[i];
      if (!p.actions.length) continue;
      try {
        if (journalFailed)
          throw Error("Application arrêtée : journal indisponible.");
        if (plan.epoch !== this.hooks.epoch())
          throw Error("Réseau modifié : application interrompue.");
        this.hooks.progress({
          camera: p.camera.ip,
          completed: i,
          total: plan.prepared.length,
          stage: "Contrôle avant application",
        });
        await this.hooks.check(p.camera);
        const fresh = prepareDefaults(
          plan.profile,
          await this.hooks.read(p.camera.id),
        );
        if (
          fresh.fingerprint !== p.fingerprint ||
          JSON.stringify(fresh.actions) !== JSON.stringify(p.actions)
        )
          throw Error(
            "Les paramètres ou capacités ont changé depuis la vérification. Aucune nouvelle écriture sur cette caméra.",
          );
        for (const action of p.actions) {
          if (plan.epoch !== this.hooks.epoch())
            throw Error("Réseau modifié : application interrompue.");
          this.hooks.progress({
            camera: p.camera.ip,
            completed: i,
            total: plan.prepared.length,
            stage:
              action.method === "setVideo"
                ? "Encodage vidéo"
                : action.method === "setImage"
                  ? "Image"
                  : action.method === "setVendorDefaults"
                    ? "API web · " + action.input.group
                    : action.method === "syncCameraTime"
                      ? "Date et heure"
                      : "OSD",
          });
          for (const id of action.fields) {
            const r = result.rows.find((r) => r.id === id)!;
            r.startedAt = new Date().toISOString();
            r.method =
              action.method === "setVendorDefaults"
                ? "API web · " +
                  vendorGroups[action.input.group as VendorGroup].write
                : action.method;
          }
          await checkpoint();
          let response: WriteResult;
          try {
            response = await this.hooks.write(action);
          } catch (e) {
            response = {
              sent: false,
              acknowledged: false,
              verified: false,
              message: this.hooks.safe(e),
              issues: [
                {
                  stage: "send",
                  code: issueCode(this.hooks.safe(e)),
                  message: this.hooks.safe(e),
                },
              ],
            };
          }
          for (const id of action.fields) {
            const r = result.rows.find((r) => r.id === id)!;
            const field = response.fields?.[id];
            const verified = field?.verified ?? response.verified;
            r.state = verified ? "verified" : "failed";
            r.code = verified
              ? "VERIFIED"
              : (field?.issues?.at(-1)?.code ??
                response.issues?.at(-1)?.code ??
                (field ? "READBACK_MISMATCH" : "WRITE_FAILED"));
            r.message = verified
              ? "Valeur relue et vérifiée."
              : (field?.issues?.at(-1)?.message ?? response.message);
            r.sent = response.sent;
            r.acknowledged = response.acknowledged;
            r.finishedAt = new Date().toISOString();
            r.observed = field?.observed;
            r.issues = [
              ...(response.issues || []),
              ...(field?.issues || []),
            ].map((issue) => ({
              ...issue,
              message: this.hooks.safe(issue.message),
            }));
            r.message = this.hooks.safe(r.message);
            if (
              field &&
              !field.verified &&
              field.observed !== undefined &&
              !field.issues?.length &&
              response.acknowledged
            ) {
              r.code = "READBACK_MISMATCH";
              r.message =
                "La valeur relue ne correspond pas à la valeur demandée.";
            }
          }
          await checkpoint();
          if (!response.verified)
            throw Error(
              "Résultat non confirmé : les étapes suivantes de cette caméra ont été arrêtées.",
            );
        }
      } catch (e) {
        result.error = this.hooks.safe(e);
      }
      for (const r of result.rows)
        if (r.state === "ready") {
          r.state = "skipped";
          r.code = issueCode(result.error || "", "SKIPPED_AFTER_FAILURE");
          r.message = result.error || "Non exécuté.";
        }
    }
    report.status = journalFailed ? "interrupted" : "complete";
    report.updatedAt = new Date().toISOString();
    try {
      await this.journal.save(report);
      await this.journal.prune();
    } catch (e) {
      report.journalWarning =
        "Le bilan reste affiché mais sa sauvegarde a échoué : " +
        this.hooks.safe(e);
    }
    this.hooks.progress({
      camera: "",
      completed: plan.prepared.length,
      total: plan.prepared.length,
      stage: "Terminé",
    });
    return report;
  }
}
