import React from "react";
import {
  DiagnosticResults,
  EventLog,
} from "../src/renderer/design-system/camera";
import { report, state } from "./fixtures";
export default { title: "Diagnostics" };
export const Results = { render: () => <DiagnosticResults report={report} /> };
export const EmptyResults = { render: () => <DiagnosticResults /> };
export const Logs = { render: () => <EventLog entries={state.logs} /> };
export const EmptyLogs = { render: () => <EventLog entries={[]} /> };
