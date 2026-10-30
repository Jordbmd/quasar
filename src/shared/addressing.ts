export type AddressRow = {
  id: string;
  name: string;
  identity: string;
  from: string;
  to: string;
  locker: number;
  state: "ready" | "unchanged" | "blocked" | "verified" | "failed" | "skipped";
  message: string;
  resolution?: "serial";
};
export type AddressPlan = { id: string; createdAt: string; rows: AddressRow[] };

export type AddressProgress = {
  planId: string;
  camera: string;
  completed: number;
  total: number;
  stage: string;
};
