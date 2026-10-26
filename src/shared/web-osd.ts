export const osdCorners = {
  topLeft: "Haut gauche",
  topRight: "Haut droite",
  bottomLeft: "Bas gauche",
  bottomRight: "Bas droite",
  hidden: "Masqué",
  custom: "Position personnalisée conservée",
};
export type WebOSD = {
  enabled: boolean;
  title: string;
  titlePosition: keyof typeof osdCorners;
  timePosition: keyof typeof osdCorners;
};
