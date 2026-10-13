import {formatDate,categoryLabel,statusLabel} from "../../i18n/index.js";
import {BarChart3, ClipboardList, Layers, Users, MapPin} from "lucide-react";
export const TABS = [
  {id: "overview", label: "Overview", icon: BarChart3},
  {id: "requests", label: "Pending Requests", icon: ClipboardList},
  {id: "zones", label: "Zone Management", icon: Layers},
  {id: "allocations", label: "Allocations", icon: Users},
  {id: "map", label: "Map / Zone Explorer", icon: MapPin},
];
export const STATUS_COLORS = {
  OPEN: "#218657", FULL: "#b45309", CLOSED: "#64748b", SUSPENDED: "#b91c1c",
  RESTRICTED: "#7c3aed", NO_VENDING: "#334155",
};
export const pretty = value => (value == null || value === "" ? "Not recorded" : categoryLabel("en",value,statusLabel("en",value)));
export const display = value => value == null || value === "" ? "Not recorded" : value;
export const when = value => formatDate("en",value);

