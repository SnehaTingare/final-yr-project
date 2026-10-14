import {zoneName, officialZoneDivision} from "../../shared/utils/displayLabels.js";
import React, {useEffect, useMemo, useState} from "react";
import {CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap} from "react-leaflet";
import {MapPin} from "lucide-react";
import {getZoneDisplayGeometry} from "../../services/api.js";
import {buildVendorExplorerMapModel} from "../../shared/utils/mapGrouping.js";
import {useI18n} from "../../i18n/react.jsx";
import {statusLabel} from "../../i18n/index.js";
import {score} from "./viewModel.js";

function DetailMapFocus({group}) {
  const map = useMap();
  useEffect(() => {
    if (!group) return;
    map.invalidateSize({pan: false});
    map.setView(group.position, 15, {animate: false});
    const timer = setTimeout(() => map.invalidateSize({pan: false}), 0);
    return () => clearTimeout(timer);
  }, [map, group]);
  return null;
}

export default function RecommendationDetailMap({zone, recommendations, context}) {
  const {language, t} = useI18n();
  const [geometry, setGeometry] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    getZoneDisplayGeometry().then(setGeometry).catch(err => setError(err.message));
  }, []);
  const model = useMemo(() => geometry ? buildVendorExplorerMapModel(recommendations, context?.zones || [], geometry) : null, [geometry, recommendations, context]);
  const group = model?.groups.find(item => item.zones.some(member => member.zone_id === zone.zone_id));

  if (error || (geometry && !group)) return <div className="recommendation-detail-map-unavailable"><MapPin size={24}/><strong>{t("recommend.mapUnavailable")}</strong><span>{error ? t("recommend.mapCouldNotLoad") : t("map.displayUnavailable")}</span></div>;
  if (!geometry || !group) return <div className="recommendation-detail-map-unavailable" role="status"><span>{t("common.loading")}</span></div>;

  return <MapContainer center={group.position} zoom={15} scrollWheelZoom={false} className="recommendation-detail-map">
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
    <DetailMapFocus group={group}/>
    <CircleMarker center={group.position} radius={14} pathOptions={{color: "#fff", weight: 3, fillColor: "#174b77", fillOpacity: 1}}>
      <Tooltip permanent direction="center" className="rank-tooltip">{group.zones.length > 1 ? group.zones.length : zone.rank}</Tooltip>
      <Popup className="shared-reference-popup" minWidth={240}>
        <strong>{group.shared ? t("recommend.shared") : t("recommend.rankReference", {rank: zone.rank})}</strong>
        <div className="shared-zone-list">{group.zones.map(member => <div className="detail-map-member" key={member.zone_id}><b>{member.is_recommendation ? `#${member.rank}` : "•"}</b><span>{zoneName(member)} - {officialZoneDivision(member)}</span><em>{member.is_recommendation ? score(member.score) : statusLabel(language, member.live_status)}</em></div>)}</div>
        <p>{t("map.manualNotice")}</p>
        {group.shared && <p>{t("recommend.sharedNotice")}</p>}
      </Popup>
    </CircleMarker>
  </MapContainer>;
}
