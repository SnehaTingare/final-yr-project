import React, {useEffect, useState} from "react";
import {Bell, FileText, MapPin, RefreshCw} from "lucide-react";
import {getVendorActivity} from "../../services/api.js";
import {useI18n} from "../../i18n/react.jsx";
import {formatDate, statusLabel} from "../../i18n/index.js";
import {zoneName} from "../../shared/utils/displayLabels.js";
export default function VendorActivity({onApplication, onSlot, compact = false}) {
  const {language, t} = useI18n();
  const [data, setData] = useState(null), [error, setError] = useState(""), [loading, setLoading] = useState(true), [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    getVendorActivity(controller.signal).then(result => {if (!controller.signal.aborted) {if (!Array.isArray(result.events)) throw new Error("Invalid activity response"); setData(result);}}).catch(err => {if (!controller.signal.aborted) setError(err.code === "NETWORK_UNAVAILABLE" ? "network" : err.status === 401 ? "session" : err.status === 403 ? "permission" : err.status === 404 ? "endpoint" : "server");}).finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [reload]);
  return <section className={`vendor-support-workspace ${compact ? "vendor-activity-compact" : ""}`}><header className="vendor-support-heading"><Bell size={24}/><div>{compact ? <h2 id="vendor-notification-title">{t("activity.title")}</h2> : <h1>{t("activity.title")}</h1>}<p>{t("activity.historyNotice")}</p></div><button className="vendor-secondary" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={16}/>{t("common.refresh")}</button></header>{loading && <p role="status">{t("common.loading")}</p>}{error && <p role="alert" className="vendor-action-notice">{t(`activity.error.${error}`)}</p>}{!loading && !error && data && <div className="vendor-activity-list">{!data.events.length && <p className="vendor-panel">{t("activity.empty")}</p>}{data.events.map(event => <article className="vendor-panel vendor-activity-event" key={event.id}><div className="vendor-activity-icon">{event.kind === "SLOT_ASSIGNED" || event.kind === "RELOCATED" ? <MapPin size={19}/> : <FileText size={19}/>}</div><div><h2>{t(`activity.${event.kind}`)}</h2><p>{zoneName(event.zone_id)}{event.slot_id ? ` - ${event.slot_id}` : ""}</p><small>{formatDate(language,event.timestamp)} - {statusLabel(language,event.status)}</small>{event.request_id && <small className="vendor-activity-reference">{event.request_id}</small>}{event.previous_zone_id && <p>{t("requests.previousZone")}: {zoneName(event.previous_zone_id)}</p>}{event.reason && <p>{t("common.reason")}: {event.reason}</p>}<div className="profile-actions">{event.request_id && <button className="vendor-secondary" onClick={() => onApplication(event.request_id)}>{t("activity.viewApplication")}</button>}{event.can_view_slot && <button className="vendor-secondary" onClick={onSlot}>{t("display.viewSlot")}</button>}</div></div></article>)}</div>}</section>;
}
