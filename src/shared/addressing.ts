export type AddressRow = {
  id: string;
  name: string;
  identity: string;
  from: string;
  to: string;
  locker: number;
  state: "ready" | "unchanged" | "blocked" | "verified" | "failed" | "skipped";
  message: string;
};
export type AddressPlan = { id: string; createdAt: string; rows: AddressRow[] };
