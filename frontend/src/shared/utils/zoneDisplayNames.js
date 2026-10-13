// Reviewed against official_zones.csv. These titles do not imply surveyed entrances.
export const REVIEWED_ZONE_NAMES = Object.freeze({
  PAN_F_019: "Dattanagar Garden",
  SAT_F_014: "Gangapur Gaon Vegetable Market",
  NR_F_003: "Rukmini Nagar",
  NN_F_001: "Sumit Company / Nashik Castek, Ambad",
  NN_F_002: "Ambad Gaon Vegetable Market",
  NN_F_003: "Ganesh Temple, Pavan Nagar",
  NN_F_004: "Water Tank, Ambad Property-tax Office",
  NN_F_005: "Phalke Memorial Gate",
  NN_F_006: "Campus Company, MIDC Ambad",
  NN_F_007: "Coca-Cola Company, MIDC Ambad",
  NN_F_008: "Gabriel Company, MIDC Ambad",
  NN_F_009: "Glasgow Company, MIDC Ambad",
  NN_F_010: "Seva Auto Showroom",
  NN_F_011: "MSEB Power House / Garware Gate, Ambad",
  NN_F_012: "Mungi Brothers Company, MIDC Ambad",
  NN_F_013: "Balbharati Office, Lekha Nagar",
  NN_F_014: "Bajrang Chowk Police Chowki, Khutwad Nagar",
  NN_F_015: "NMC Stalls, Raje Sambhaji Stadium",
  NN_F_016: "Gat No. 65/A"
});

export function conciseZoneName(description, fields = {}) {
  const landmark = fields.landmark?.trim(), locality = fields.locality?.trim();
  if (landmark && locality) return landmark === locality ? landmark : `${landmark}, ${locality}`;
  if (landmark || locality) return landmark || locality;
  // Only remove common placement wording from a complete landmark description.
  // Routes, compound descriptions and ambiguous cases retain the full source title.
  return String(description || "").replace(/\s+/g, " ").trim()
    .replace(/^(?:Space near|Space beside|Near)\s+/i, "")
    .replace(/\.$/, "");
}
