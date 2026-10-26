import React from "react";
import dark from "../assets/brand/horizontal-dark.svg";
import light from "../assets/brand/horizontal-light.svg";
export function Brand() {
  return (
    <span className="quasar-brand" role="img" aria-label="Quasar">
      <img className="brand-dark" src={dark} alt="" />
      <img className="brand-light" src={light} alt="" />
    </span>
  );
}
