export type LockerAssignment = { id: string; locker: number };
export type AddressRow = {
  id: string;
  name: string;
  identity: string;
  from: string;
  to: string;
  locker?: number;
  state: "ready" | "unchanged" | "blocked" | "verified" | "failed" | "skipped";
  message: string;
  resolution?: "serial";
  temporaryIP?: string;
  lastVerifiedIP?: string;
};
export type AddressStep = {
  id: string;
  from: string;
  to: string;
  kind: "temporary" | "final" | "verify";
  state?: "verified" | "failed" | "skipped";
  message?: string;
};
export type AddressPlan = {
  kind?: "lockers" | "conflicts";
  id: string;
  createdAt: string;
  rows: AddressRow[];
  steps?: AddressStep[];
  warning?: string;
};

export type AddressProgress = {
  planId: string;
  camera: string;
  completed: number;
  total: number;
  stage: string;
};
