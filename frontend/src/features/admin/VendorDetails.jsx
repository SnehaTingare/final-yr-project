import React, {useEffect, useState} from "react";
import {X} from "lucide-react";
import {getAdminVendorDetails} from "../../services/api.js";
import {zoneName} from "../../shared/utils/displayLabels.js";
import {useDialogFocus} from "../../shared/utils/dialogFocus.js";
import {StatusBadge} from "./AdminPrimitives.jsx";
import {pretty, display, when} from "./viewModel.js";

export default function VendorDetails({vendorId, requestId, onClose, onViewSlot, onDecision}) {
  const [data, setData] = useState(null), [error, setError] = useState("");
  useDialogFocus(Boolean(vendorId), ".vendor-management-details");
  useEffect(() => {
    const controller = new AbortController(); setData(null); setError("");
    getAdminVendorDetails(vendorId, controller.signal).then(result => {if (!controller.signal.aborted) setData(result);}).catch(err => {if (!controller.signal.aborted) setError(err.message);});
    return () => controller.abort();
  }, [vendorId]);
  useEffect(() => {
    const close = event => {if (event.key === "Escape") onClose();};
    document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close);
  }, [onClose]);
  const relevant = data?.requests.find(request => request.request_id === requestId);
  const account = {PHONE_VERIFIED: "Phone verified", UNCLAIMED: "Not yet claimed", NO_LINKED_IDENTITY: "No linked login identity"};
  return <div className="admin-drawer-backdrop" onClick={onClose}><aside className="admin-drawer vendor-management-details" role="dialog" aria-modal="true" aria-labelledby="management-vendor-title" onClick={event => event.stopPropagation()}><button className="drawer-close" aria-label="Close vendor details" onClick={onClose}><X size={18}/></button><span className="admin-eyebrow">VENDOR DETAILS</span><h2 id="management-vendor-title">{data?.profile.full_name || data?.profile.business_name || "Vendor details"}</h2>{error && <p role="alert">{error}</p>}{!data && !error && <p role="status">Loading vendor relationships...</p>}{data && <>
    <div className="drawer-grid">{[["Vendor reference", data.profile.application_vendor_id || vendorId], ["Business name", display(data.profile.business_name)], ["Business category", pretty(data.profile.business_category)], ["Record source", data.record_source === "HISTORICAL" ? "Historical record" : "Registered vendor"], ["Registration", data.registration_status === "PROFILE_REGISTERED" ? "Profile registered" : "Historical record only"], ["Account", account[data.account_status]], ["Source division", display(data.source_division)]].map(([label,value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    {data.record_source === "HISTORICAL" && <p className="drawer-description">Historical zone association: {data.historical_proposed_zone_id ? zoneName(data.historical_proposed_zone_id) : "Not recorded"}. This is source evidence, not an approved current allocation.</p>}
    <h3>Current approved allocation</h3>{data.active_allocation ? <><strong>{zoneName(data.active_allocation.zone_id)}</strong><p><StatusBadge status={data.active_allocation.status}/> {when(data.active_allocation.allocated_at)}</p></> : <p>No current approved allocation recorded.</p>}
    <h3>Assigned geographic slot</h3>{data.assigned_slot ? <><p><strong>{data.assigned_slot.slot_id}</strong> - {zoneName(data.assigned_slot.zone_id)} <StatusBadge status={data.assigned_slot.status}/></p><p>{data.assigned_slot.width_m} m x {data.assigned_slot.depth_m} m</p><button className="admin-approve" onClick={() => onViewSlot(data.assigned_slot)}>View Assigned Slot on Map</button></> : <p>No geographic slot assignment recorded.</p>}
    {relevant && <section><h3>Selected application</h3><p>{relevant.request_id} <StatusBadge status={relevant.status}/></p><p>{pretty(relevant.request_type)} - {zoneName(relevant.zone_id)}</p>{relevant.status === "PENDING" && onDecision && <div className="drawer-actions"><button className="admin-approve" onClick={() => onDecision("approve", relevant)}>Approve request</button><button className="admin-reject" onClick={() => onDecision("reject", relevant)}>Reject request</button></div>}</section>}
    <h3>Application history</h3>{data.requests.length ? data.requests.map(request => <article className="drawer-description" key={request.request_id}><strong>{zoneName(request.zone_id)}</strong><p>{pretty(request.request_type)} <StatusBadge status={request.status}/></p><small>{request.request_id} - {when(request.created_at)}</small>{request.rejection_reason && <p>Reason: {request.rejection_reason}</p>}</article>) : <p>No applications recorded.</p>}
    <h3>Allocation history</h3>{data.allocations.length ? data.allocations.map(allocation => <article className="drawer-description" key={allocation.allocation_id}><strong>{zoneName(allocation.zone_id)}</strong><p><StatusBadge status={allocation.status}/> Allocated: {when(allocation.allocated_at)}</p>{allocation.released_at && <p>Released: {when(allocation.released_at)}</p>}</article>) : <p>No allocation history recorded.</p>}
  </>}</aside></div>;
}
