import VendorDetails from "./VendorDetails.jsx";
import {zoneName, officialZoneDivision} from "../../shared/utils/displayLabels.js";
import {AdminHome, PendingRequests, ZoneManagement, AllocationRecords, ZoneExplorer} from "./AdminTabPanels.jsx";
import React, {useEffect, useMemo, useReducer, useState} from "react";

import "leaflet/dist/leaflet.css";
import {Activity, AlertTriangle, Building2, Check, ClipboardList, RefreshCw, ShieldCheck, Users, X, XCircle} from "lucide-react";
import {approveAllocationRequest, getAdminOverview, getAllocationRequests, getAllocations, getZoneCatalog, getZoneGeometry, rejectAllocationRequest, updateZoneLiveStatus} from "../../services/api.js";

import ToastRegion from "../../shared/ui/ToastRegion.jsx";
const PilotSlotMap = React.lazy(() => import("../pilot-slots/PilotSlotMap.jsx"));
import {initialPilotState, pilotReducer, PILOT_ZONE_IDS} from "../pilot-slots/pilotState.js";
import {useDialogFocus} from "../../shared/utils/dialogFocus.js";
import "./AdminDashboard.css";
import "../../shared/maps/MapGrouping.css";

import {TABS, STATUS_COLORS, pretty, display, when} from "./viewModel.js";

import {StatusBadge} from "./AdminPrimitives.jsx";
export default function AdminDashboard({adminId = "Officer", slotTarget = null}) {
  const [tab, setTab] = useState("overview");
  const [overview, setOverview] = useState(null);
  const [pending, setPending] = useState([]);
  const [zones, setZones] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [geometry, setGeometry] = useState(null);
  const [zoneLoad, setZoneLoad] = useState({loading: true, error: "", ready: false});
  const [geometryError, setGeometryError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [zoneFilters, setZoneFilters] = useState({q: "", division: "", zone_type: "", live_status: ""});
  const [allocationFilter, setAllocationFilter] = useState("");
  const [mapStatuses, setMapStatuses] = useState(Object.keys(STATUS_COLORS));
  const [selectedZone, setSelectedZone] = useState(null);
  const [pilot, dispatchPilot] = useReducer(pilotReducer, initialPilotState);
  const [focusedSlot, setFocusedSlot] = useState(null);
  const [pilotZone,setPilotZone] = useState("NN_F_013");
  const [explorerDivision, setExplorerDivision] = useState("");
  const openPilot = (zone = selectedZone) => {const target = zone?.zone_id ? zone : selectedZone; setExplorerDivision(officialZoneDivision(target || pilotZone)); setPilotZone(target?.zone_id || pilotZone);dispatchPilot({type: "open"}); setTab("map"); setSelectedZone(null);};
  const [requestDetail, setRequestDetail] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);
  useDialogFocus(Boolean(dialog || statusTarget || selectedZone || requestDetail), ".admin-modal, .admin-drawer");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");

  const refresh = async (message = "") => {
    setLoading(true); setError("");
    setZoneLoad(current => ({...current, loading: true, error: ""}));
    const results = await Promise.allSettled([
      getAdminOverview(), getAllocationRequests("PENDING"), getZoneCatalog({}), getAllocations(),
      geometry ? Promise.resolve(geometry) : getZoneGeometry(),
    ]);
    const [summary, requestData, zoneData, allocationData, geo] = results;
    if (summary.status === "fulfilled") setOverview(summary.value);
    if (requestData.status === "fulfilled") setPending(requestData.value.requests);
    if (allocationData.status === "fulfilled") setAllocations(allocationData.value.allocations);
    if (zoneData.status === "fulfilled" && Array.isArray(zoneData.value?.zones) && zoneData.value.zones.length) {
      setZones(zoneData.value.zones);
      setZoneLoad({loading: false, error: "", ready: true});
      if (selectedZone) setSelectedZone(zoneData.value.zones.find(zone => zone.zone_id === selectedZone.zone_id) || null);
    } else setZoneLoad(current => ({...current, loading: false, error: zoneData.reason?.message || "Official zone records are unavailable. Refresh to try again."}));
    if (geo.status === "fulfilled") {setGeometry(geo.value); setGeometryError("");}
    else setGeometryError(geo.reason?.message || "GIS references are unavailable. Use the zone list below.");
    const failures = results.filter(result => result.status === "rejected");
    if (failures.length) setError(failures.map(result => result.reason?.message || "Data unavailable").join("; "));
    else if (message) setNotice(message);
    setLoading(false);
  };
  useEffect(() => { refresh(); }, []);

  const divisions = useMemo(() => [...new Set(zones.map(zone => zone.division).filter(Boolean))].sort(), [zones]);
  const filteredZones = useMemo(() => zones.filter(zone =>
    (!zoneFilters.division || zone.division === zoneFilters.division)
    && (!zoneFilters.zone_type || zone.zone_type === zoneFilters.zone_type)
    && (!zoneFilters.live_status || zone.live_status === zoneFilters.live_status)
    && (!zoneFilters.q || `${zone.zone_id} ${zone.official_description}`.toLowerCase().includes(zoneFilters.q.toLowerCase()))
  ), [zones, zoneFilters]);
  const filteredAllocations = allocations.filter(item => !allocationFilter || item.status === allocationFilter);

  const openRequest = request => setRequestDetail({vendor_id: request.vendor_id, request});
  const viewAssignedSlot = slot => {setRequestDetail(null); setFocusedSlot(slot); setPilotZone(slot.zone_id); setExplorerDivision(officialZoneDivision(slot.zone_id)); dispatchPilot({type: "open"}); setTab("map");};
  useEffect(() => {if (slotTarget) viewAssignedSlot(slotTarget);}, [slotTarget]);
  const approve = async () => {
    if (!adminId.trim()) { setError("Enter an Admin ID before approval."); return; }
    setLoading(true); setError("");
    try {
      await approveAllocationRequest(dialog.request_id, notes || null);
      setDialog(null); setRequestDetail(null); setNotes("");
      await refresh(`Request ${dialog.request_id} approved. Allocation and occupancy were refreshed.`);
    } catch (err) { setError(err.message); setLoading(false); }
  };
  const reject = async () => {
    if (!adminId.trim()) { setError("Enter an Admin ID before rejection."); return; }
    if (!reason.trim()) { setError("A rejection reason is required."); return; }
    setLoading(true); setError("");
    try {
      await rejectAllocationRequest(dialog.request_id, reason.trim(), notes || null);
      setDialog(null); setRequestDetail(null); setReason(""); setNotes("");
      await refresh(`Request ${dialog.request_id} rejected. Zone occupancy was not changed.`);
    } catch (err) { setError(err.message); setLoading(false); }
  };
  const applyStatus = async status => {
    if (!adminId.trim()) { setError("Enter an Admin ID before changing zone status."); return; }
    setLoading(true); setError("");
    try {
      const zoneId = statusTarget?.zone_id || selectedZone?.zone_id;
      const updated = await updateZoneLiveStatus(zoneId, status);
      setStatusTarget(null);
      await refresh(`${zoneId} updated to ${updated.status}.`);
    } catch (err) { setError(err.message); setLoading(false); }
  };
  const changeStatus = status => setStatusTarget({zone_id: selectedZone.zone_id, from: selectedZone.live_status, status});
  useEffect(() => {
    if (!dialog && !statusTarget && !selectedZone && !requestDetail) return undefined;
    const close = event => {
      if (event.key !== "Escape") return;
      setDialog(null); setStatusTarget(null); setSelectedZone(null); setRequestDetail(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [dialog, statusTarget, selectedZone, requestDetail]);

  const zoneCounts = overview?.zone_status_counts || {};
  const requestCounts = overview?.request_status_counts || {};
  const allocationCounts = overview?.allocation_status_counts || {};
  const summaryCards = [
    ["Official zones", overview?.total_official_zones, Building2, "neutral"],
    ["Open zones", zoneCounts.OPEN, Activity, "open"], ["Full zones", zoneCounts.FULL, AlertTriangle, "full"],
    ["Closed zones", zoneCounts.CLOSED, XCircle, "closed"], ["Suspended", zoneCounts.SUSPENDED, AlertTriangle, "suspended"],
    ["Restricted", zoneCounts.RESTRICTED, ShieldCheck, "restricted"], ["No vending", zoneCounts.NO_VENDING, XCircle, "novending"],
    ["Active allocations", allocationCounts.ACTIVE, Users, "active"], ["Pending requests", requestCounts.PENDING, ClipboardList, "pending"],
    ["Approved", requestCounts.APPROVED, Check, "approved"], ["Rejected", requestCounts.REJECTED, XCircle, "rejected"],
  ];

  return <main className="admin-dashboard" aria-busy={loading}>
    <header className="admin-header"><div className="admin-header-identity"><img src="/nmc-logo.jpg" alt="Nashik Municipal Corporation emblem"/><div><span className="admin-eyebrow">NASHIK MUNICIPAL CORPORATION</span><h1>Vendor operations</h1><p>Street Vendor Management — Officer Portal</p></div></div><div className="admin-controls"><div className="admin-session-id"><span>Signed in officer</span><strong>{adminId}</strong></div><button onClick={() => refresh("Dashboard data refreshed.")} disabled={loading}><RefreshCw size={15}/>{loading ? "Refreshing…" : "Refresh data"}</button></div></header>
    <details className="service-disclosure service-session-note"><summary>About officer actions</summary><p>Officer identity is supplied by the authenticated server session and recorded with administrative actions.</p></details>
    <nav className="admin-tabs" aria-label="Administration sections">{TABS.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon size={16}/>{item.label}{item.id === "requests" && <b>{pending.length}</b>}</button>)}</nav>
    <ToastRegion success={notice} error={error} onDismissSuccess={() => setNotice("")} onDismissError={() => setError("")} retry={() => refresh()}/>
    {loading && !overview && <div className="admin-loading-state" role="status"><RefreshCw size={20}/><div><strong>Loading operational dashboard</strong><span>Retrieving requests, allocations, live zone status, and map references.</span></div></div>}

    {tab === "overview" && <AdminHome pending={pending} allocationCounts={allocationCounts} summaryCards={summaryCards} zoneCounts={zoneCounts} setTab={setTab} setAllocationFilter={setAllocationFilter} setZoneFilters={setZoneFilters}/>}

    {tab === "requests" && <PendingRequests pending={pending} zones={zones} allocations={allocations} openRequest={openRequest} setDialog={setDialog}/>}

    {tab === "zones" && <ZoneManagement filteredZones={filteredZones} zoneFilters={zoneFilters} setZoneFilters={setZoneFilters} divisions={divisions} setSelectedZone={setSelectedZone}/>}

    {tab === "allocations" && <AllocationRecords filteredAllocations={filteredAllocations} allocationFilter={allocationFilter} setAllocationFilter={setAllocationFilter} setRequestDetail={setRequestDetail} zones={zones} setSelectedZone={setSelectedZone} setError={setError}/>}

    {tab === "map" && !pilot.open && <ZoneExplorer zoneLoad={zoneLoad} geometryError={geometryError} onRetry={() => refresh()} zones={zones} division={explorerDivision} setDivision={setExplorerDivision} onPilot={openPilot} zoneFilters={zoneFilters} setZoneFilters={setZoneFilters} mapStatuses={mapStatuses} setMapStatuses={setMapStatuses} geometry={geometry} setSelectedZone={setSelectedZone}/>}

    {tab === "map" && pilot.open && <nav className="admin-explorer-breadcrumbs" aria-label="Zone explorer breadcrumbs"><button onClick={() => {setExplorerDivision(""); dispatchPilot({type: "close"});}}>Nashik City</button><span>/</span><button onClick={() => dispatchPilot({type: "close"})}>{officialZoneDivision(pilotZone)}</button><span>/</span><strong>{zoneName(pilotZone)}</strong><span>/</span><strong>Slot Map</strong></nav>}
    {pilot.visited && <React.Suspense fallback={<p role="status">Loading geographic pilot…</p>}><PilotSlotMap zoneId={pilotZone} onZoneChange={zoneId => {setPilotZone(zoneId); setExplorerDivision(officialZoneDivision(zoneId));}} onViewVendor={allocation => setRequestDetail({vendor_id: allocation.vendor_id})} focusSlotId={focusedSlot?.zone_id === pilotZone ? focusedSlot.slot_id : null} admin session={pilot} dispatch={dispatchPilot} visible={tab === "map" && pilot.open} onBack={() => dispatchPilot({type: "close"})} allocations={allocations}/></React.Suspense>}

    {requestDetail && <VendorDetails vendorId={requestDetail.vendor_id || requestDetail.vendor?.vendor_id} requestId={requestDetail.request?.request_id} onClose={() => setRequestDetail(null)} onViewSlot={viewAssignedSlot} onDecision={(type, request) => setDialog({type, ...request})}/>}

    {selectedZone && <div className="admin-drawer-backdrop" onClick={() => setSelectedZone(null)}><aside className="admin-drawer" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={() => setSelectedZone(null)}><X size={18}/></button><span className="admin-eyebrow">ZONE DETAILS</span><h2>{zoneName(selectedZone)}</h2><StatusBadge status={selectedZone.live_status}/><p className="drawer-description">{selectedZone.official_description}</p><div className="drawer-grid"><div><span>Division</span><strong>{selectedZone.division}</strong></div><div><span>Policy type</span><strong>{pretty(selectedZone.zone_type)}</strong></div><div><span>Official capacity</span><strong>{display(selectedZone.official_capacity)}</strong></div><div><span>Current vendors</span><strong>{selectedZone.current_vendor_count}</strong></div><div><span>Available</span><strong>{display(selectedZone.available_capacity)}</strong></div><div><span>Reference status</span><strong>{pretty(selectedZone.reference_audit_status || "Not audited")}</strong></div><div><span>Active allocations</span><strong>{allocations.filter(item => item.zone_id === selectedZone.zone_id && item.status === "ACTIVE").length}</strong></div><div><span>Pending requests</span><strong>{pending.filter(item => item.zone_id === selectedZone.zone_id).length}</strong></div></div>{PILOT_ZONE_IDS.includes(selectedZone.zone_id) && <button onClick={openPilot}>View Slot Map</button>}{selectedZone.zone_type === "FREE" ? <div className="zone-status-actions"><span>Manual operational status</span><p>FULL remains capacity-derived. Opening a zero-capacity zone keeps it FULL.</p><div>{["OPEN", "CLOSED", "SUSPENDED"].map(status => <button key={status} disabled={loading || selectedZone.live_status === status} onClick={() => changeStatus(status)}>{status}</button>)}</div></div> : <div className="policy-lock"><ShieldCheck size={17}/> Policy-controlled {pretty(selectedZone.zone_type)} zones cannot be changed here.</div>}</aside></div>}

    {dialog && <div className="admin-modal-backdrop" onClick={() => setDialog(null)}><div className="admin-modal" onClick={event => event.stopPropagation()}><div className={`modal-icon ${dialog.type}`} >{dialog.type === "approve" ? <Check size={24}/> : <XCircle size={24}/>}</div><span className="admin-eyebrow">{dialog.type === "approve" ? "CONFIRM APPROVAL" : "REJECT REQUEST"}</span><h2>{dialog.type === "approve" ? `Approve allocation to ${zoneName(dialog.zone_id)}?` : `Reject ${dialog.request_id}?`}</h2>{dialog.type === "approve" && <p>This will approve the allocation and update the number of occupied places.</p>}{dialog.type === "reject" && <label><span>Rejection reason *</span><textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this request cannot be approved"/></label>}<label><span>Officer notes <small>optional</small></span><textarea value={notes} onChange={event => setNotes(event.target.value)} placeholder="Internal review note"/></label><div className="modal-capacity"><span>Current occupancy</span><strong>{zones.find(zone => zone.zone_id === dialog.zone_id)?.current_vendor_count ?? "—"}</strong><span>Available before review</span><strong>{display(zones.find(zone => zone.zone_id === dialog.zone_id)?.available_capacity)}</strong></div><div className="modal-actions"><button onClick={() => setDialog(null)}>Cancel</button><button className={dialog.type === "approve" ? "admin-approve" : "admin-reject"} onClick={dialog.type === "approve" ? approve : reject} disabled={loading}>{dialog.type === "approve" ? "Approve allocation" : "Reject request"}</button></div></div></div>}
    {statusTarget && <div className="admin-modal-backdrop" onClick={() => setStatusTarget(null)}><div className="admin-modal" role="dialog" aria-modal="true" aria-labelledby="zone-status-title" onClick={event => event.stopPropagation()}><div className="modal-icon approve"><ShieldCheck size={24}/></div><span className="admin-eyebrow">CONFIRM STATUS CHANGE</span><h2 id="zone-status-title">Change {zoneName(statusTarget.zone_id)} to {pretty(statusTarget.status)}?</h2><p>{statusTarget.status === "OPEN" ? "This will reopen the zone for operational use. Capacity rules still apply." : `This will remove the zone from live vendor recommendations while it is ${statusTarget.status.toLowerCase()}.`}</p><div className="modal-capacity"><span>Current status</span><strong>{pretty(statusTarget.from)}</strong><span>New status</span><strong>{pretty(statusTarget.status)}</strong></div><div className="modal-actions"><button onClick={() => setStatusTarget(null)}>Keep current status</button><button className={statusTarget.status === "OPEN" ? "admin-approve" : "admin-reject"} onClick={() => applyStatus(statusTarget.status)} disabled={loading}>Confirm change</button></div></div></div>}
  </main>;
}

