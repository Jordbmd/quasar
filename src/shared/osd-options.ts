export type OSDValues = {
  text?: string;
  textType?: "Plain" | "Date" | "Time" | "DateAndTime";
  position?: string;
  fontSize?: number;
  dateFormat?: string;
  timeFormat?: string;
  x?: number;
  y?: number;
};
export type OSDOptions = {
  types: string[];
  positions: string[];
  textTypes: string[];
  dateFormats: string[];
  timeFormats: string[];
  fontSize?: { min: number; max: number };
  maximum: Record<string, number>;
};
export const osdTextLabels: Record<string, string> = {
  Plain: "Texte",
  Date: "Date",
  Time: "Heure",
  DateAndTime: "Date et heure",
};
export const osdPositionLabels: Record<string, string> = {
  UpperLeft: "En haut à gauche",
  UpperRight: "En haut à droite",
  LowerLeft: "En bas à gauche",
  LowerRight: "En bas à droite",
  Custom: "Position personnalisée",
};
