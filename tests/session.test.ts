import { beforeEach, expect, it, vi } from "vitest";
import { CameraService, schemas } from "../src/main/service";
import { Diagnostics } from "../src/main/diagnostics";
import type { Camera } from "../src/shared/types";
import { abortable } from "../src/main/cancellation";

const mock = vi.hoisted(() => ({
  connections: [] as any[],
  rejected: new Set<string>(),
  gate: undefined as Promise<void> | undefined,
}));
vi.mock("../src/main/onvif", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/main/onvif")>()),
  CameraConnection: class {
    closed = false;
    writeAttempts = 0;
    reads = 0;
    withReadSignal(signal: AbortSignal, work: () => Promise<any>) {
      signal.throwIfAborted();
      return abortable(work(), signal);
    }
    constructor(
      public camera: Camera,
      public credentials: any,
    ) {
      mock.connections.push(this);
    }
    async connect() {
      await mock.gate;
      if (mock.rejected.has(this.camera.ip))
        throw Error(`401 Unauthorized ${this.credentials.password}`);
      if (this.closed) throw Error("Connexion interrompue");
      await this.identity();
    }
    async identity() {
      this.camera.status = "Connectée · lecture seule";
      return this.camera;
    }
    async detail() {
      this.reads++;
      return {
        camera: this.camera,
        network: { state: "available", data: [] },
        profiles: [],
      };
    }
    destroy() {
      this.closed = true;
      this.camera.status = "Connexion fermée";
    }
  },
}));
beforeEach(() => {
  mock.connections.length = 0;
  mock.rejected.clear();
  mock.gate = undefined;
});
const camera = (n: number): Camera => ({
  id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  ip: `192.0.2.${n + 10}`,
  port: 80,
  path: "/onvif/device_service",
  status: "Découverte",
  ambiguous: false,
});
function fixture(count = 5) {
  let suspend = () => {};
  const guard: any = {
    epoch: 0,
    state: { ready: true, overlaps: [] },
    assert: vi.fn(async () => ({ address: "192.0.2.2" })),
    refresh: async () => guard.state,
    ensureEpoch: (epoch: number) => {
      if (epoch !== guard.epoch) throw Error("Réseau modifié");
    },
    onSuspend: (fn: () => void) => {
      suspend = fn;
    },
  };
  const video = { stop: vi.fn(async () => {}), available: async () => true };
  const log = new Diagnostics();
  const service = new CameraService(
    guard,
    log,
    video as any,
    async () => true,
    async () => {},
    async () => "",
    { read: async () => null } as any,
  );
  service.cameras = Array.from({ length: count }, (_, i) => camera(i + 1));
  return {
    service,
    guard,
    video,
    log,
    suspend: () => {
      guard.epoch++;
      suspend();
    },
  };
}
const credentials = { username: "admin", password: "TEST_SECRET_SESSION" };

it("connecte cinq caméras avec une saisie et retrouve les paramètres sans se réauthentifier", async () => {
  const { service } = fixture();
  const result = await service.dispatch("connectSession", credentials);
  expect(result.connected).toBe(5);
  expect(mock.connections).toHaveLength(5);
  expect(
    mock.connections.every(
      (c) => c.credentials.password === credentials.password,
    ),
  ).toBe(true);
  const id = service.cameras[0].id;
  const first = await service.dispatch("selectCamera", { id });
  await service.dispatch("selectCamera", { id: service.cameras[1].id });
  expect(await service.dispatch("selectCamera", { id })).toBe(first);
  expect(mock.connections[0].reads).toBe(1);
  await service.dispatch("readCamera", { id });
  expect(mock.connections[0].reads).toBe(2);
  expect(mock.connections).toHaveLength(5);
  expect(
    JSON.stringify(await service.dispatch("state", undefined)),
  ).not.toContain(credentials.password);
});

it("remplace une lecture lente et ne remet jamais son résultat périmé dans le cache", async () => {
  const { service } = fixture(2);
  await service.dispatch("connectSession", credentials);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const first = mock.connections[0];
  const original = first.detail.bind(first);
  first.detail = vi.fn(async () => {
    await gate;
    return original();
  });
  const old = service.dispatch("selectCamera", { id: service.cameras[0].id });
  const rejected = expect(old).rejects.toThrow("Lecture remplacée");
  await vi.waitFor(() => expect(first.detail).toHaveBeenCalled());
  const newest = await service.dispatch("selectCamera", {
    id: service.cameras[1].id,
  });
  await rejected;
  expect(newest.camera.id).toBe(service.cameras[1].id);
  release();
  await new Promise((resolve) => setTimeout(resolve, 10));
  expect(service.details.has(service.cameras[0].id)).toBe(false);
  expect(service.session().connected).toBe(2);
});

it("isole un refus, masque le secret et ne répète pas automatiquement l’authentification rejetée", async () => {
  const { service, log } = fixture(2);
  mock.rejected.add("192.0.2.12");
  const result = await service.dispatch("connectSession", credentials);
  expect(result.connected).toBe(1);
  expect(result.failures).toHaveLength(1);
  expect(result.failures[0].message).toContain("[masqué]");
  expect(JSON.stringify(log.entries)).not.toContain(credentials.password);
  await service.dispatch("addCamera", { ip: "192.0.2.13", port: 80 });
  expect(mock.connections).toHaveLength(3);
  expect(service.session().connected).toBe(2);
  mock.rejected.clear();
  await service.dispatch("retryConnections", undefined);
  expect(mock.connections).toHaveLength(4);
  expect(service.session().connected).toBe(3);
  expect(service.session().failures).toEqual([]);
});

it("ne transmet pas le compte aux IP ambiguës ou routées hors Ethernet", async () => {
  const { service, guard } = fixture(3);
  service.cameras[0].ambiguous = true;
  guard.assert.mockImplementation(async (ip?: string) => {
    if (ip === "192.0.2.12") throw Error("Route hors Ethernet");
    return { address: "192.0.2.2" };
  });
  const result = await service.dispatch("connectSession", credentials);
  expect(result.connected).toBe(1);
  expect(mock.connections).toHaveLength(1);
  expect(mock.connections[0].camera.ip).toBe("192.0.2.13");
});

it("ferme toute la session et la vidéo sans effacer les caméras découvertes", async () => {
  const { service, video } = fixture();
  await service.dispatch("connectSession", credentials);
  await service.dispatch("selectCamera", { id: service.cameras[0].id });
  await service.dispatch("disconnectSession", undefined);
  expect(service.session().active).toBe(false);
  expect(service.connections.size).toBe(0);
  expect(service.details.size).toBe(0);
  expect(service.cameras).toHaveLength(5);
  expect(mock.connections.every((c) => c.closed)).toBe(true);
  expect(video.stop).toHaveBeenCalled();
  await expect(
    service.dispatch("selectCamera", { id: service.cameras[0].id }),
  ).rejects.toThrow();
  expect(mock.connections).toHaveLength(5);
});

it("abandonne une connexion en cours après débranchement sans réinjecter de résultat périmé", async () => {
  const f = fixture(1);
  let release!: () => void;
  mock.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = f.service.dispatch("connectSession", credentials);
  const rejected = expect(work).rejects.toThrow("Réseau modifié");
  await vi.waitFor(() => expect(mock.connections).toHaveLength(1));
  f.suspend();
  release();
  await rejected;
  expect(f.service.cameras).toEqual([]);
  expect(f.service.connections.size).toBe(0);
  expect(f.service.details.size).toBe(0);
});

it("remplace les identifiants pour toute la session et garde un contrat IPC strict", async () => {
  const { service } = fixture(2);
  await service.dispatch("connectSession", credentials);
  const old = [...mock.connections];
  await service.dispatch("connectSession", {
    username: "test",
    password: "SECOND_TEST_SECRET",
  });
  expect(old.every((c) => c.closed)).toBe(true);
  expect(service.session().username).toBe("test");
  expect(service.session().connected).toBe(2);
  expect(
    schemas.connectSession.safeParse({ ...credentials, id: camera(1).id })
      .success,
  ).toBe(false);
  expect("connectCamera" in schemas).toBe(false);
});

it("ne recrée pas une connexion après la fermeture de la session pendant une authentification", async () => {
  const f = fixture(1);
  let release!: () => void;
  mock.gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const work = f.service.dispatch("connectSession", credentials);
  const rejected = expect(work).rejects.toThrow("Session fermée");
  await vi.waitFor(() => expect(mock.connections).toHaveLength(1));
  await f.service.dispatch("disconnectSession", undefined);
  release();
  await rejected;
  expect(f.service.session().active).toBe(false);
  expect(f.service.session().failures).toEqual([]);
  expect(f.service.connections.size).toBe(0);
  expect(f.log.secrets.size).toBe(0);
  expect(mock.connections[0].credentials.password).toBe("");
});

it("conserve les blocs déjà lus lors d’un changement de caméra et écarte les mises à jour annulées", async () => {
  const { service } = fixture(2);
  await service.dispatch("connectSession", credentials);
  const first = mock.connections[0];
  const id = first.camera.id;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const partial = {
    camera: first.camera,
    network: { state: "available", data: [] },
    osd: { state: "loading" },
    profiles: [],
    loading: true,
  };
  first.detail = vi.fn(async (publish: any, cached: any) => {
    if (cached)
      return {
        ...cached,
        loading: false,
        osd: { state: "available", data: [] },
      };
    publish(partial);
    await gate;
    publish({ ...partial, network: { state: "error" } });
    return partial;
  });
  service.onCameraDetail = vi.fn();
  const pending = service.dispatch("selectCamera", { id, requestId: "old" });
  const rejected = expect(pending).rejects.toThrow("Lecture remplacée");
  await vi.waitFor(() => expect(service.onCameraDetail).toHaveBeenCalledOnce());
  await service.dispatch("selectCamera", { id: service.cameras[1].id });
  await rejected;
  release();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(service.details.get(id)?.network.state).toBe("available");
  expect(service.onCameraDetail).toHaveBeenCalledOnce();
  const resumed = await service.dispatch("selectCamera", {
    id,
    requestId: "new",
  });
  expect(first.detail.mock.calls[1][1]).toMatchObject(partial);
  expect(resumed.osd.state).toBe("available");
});

it("Réessayer reconnecte aussi une caméra dont une écriture est restée incertaine", async () => {
  const { service } = fixture(1);
  await service.dispatch("connectSession", credentials);
  const id = service.cameras[0].id;
  const first = service.connections.get(id)!;
  first.writeAttempts = 1;
  service.uncertain.add(id);
  await service.dispatch("retryConnections", undefined);
  expect(first.closed).toBe(true);
  expect(service.connections.get(id)).not.toBe(first);
  await service.dispatch("readCamera", { id });
  expect(service.uncertain.has(id)).toBe(false);
});
