"""Procurement-backed reads (Phase 3).

When PROC_READS is on, the Purchasing page's vendor master and sourcing catalog
are SERVED from the shared onadapt-procurement service over its /v1 API (with
local fallback on any error). The replenishment planner then prices off the
service's catalog too. Writes (create PO, receive, vendor/catalog edits) still
go local in Phase 3 and reach the service via its shadow mirror; POs + settings
flip in Phase 3b.

Config (drones.env):
    PROC_BASE_URL   e.g. http://127.0.0.1:8799
    PROC_API_KEY    the manufacturing tenant's bearer key
    PROC_READS      "1" to serve reads from the service, anything else = local
"""
import json
import os
import urllib.error
import urllib.request

PROC_BASE_URL = os.environ.get("PROC_BASE_URL", "").rstrip("/")
PROC_API_KEY = os.environ.get("PROC_API_KEY", "")
PROC_READS = os.environ.get("PROC_READS", "0") == "1"


def enabled() -> bool:
    return PROC_READS and bool(PROC_BASE_URL) and bool(PROC_API_KEY)


def proc_get(path: str) -> dict:
    req = urllib.request.Request(
        PROC_BASE_URL + path, headers={"Authorization": f"Bearer {PROC_API_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=5) as resp:
        data = json.load(resp)
    if isinstance(data, dict) and data.get("error"):
        raise RuntimeError(data["error"])
    return data


def _vendor_map() -> dict:
    return {v["id"]: v for v in proc_get("/v1/vendors").get("vendors", [])}


def vendors() -> list:
    """Vendor master, shaped like the local fetch_purchasing vendors read:
    id, account_code, name, contact, terms, lead_time_days, po_count."""
    vs = proc_get("/v1/vendors").get("vendors", [])
    counts: dict = {}
    for po in proc_get("/v1/purchase-orders?company=1").get("purchaseOrders", []):
        counts[po["vendor_id"]] = counts.get(po["vendor_id"], 0) + 1
    return [{
        "id": v["id"], "account_code": v["account_code"], "name": v["name"],
        "contact": v["contact"], "terms": v["terms"], "lead_time_days": v["lead_time_days"],
        "po_count": counts.get(v["id"], 0),
    } for v in vs]


def catalog() -> list:
    """Sourcing catalog (staged for Phase 3b — not wired into fetch_purchasing
    yet, because the offer `id` it returns is the service's own, while the local
    "Prefer" write is keyed by the local offer id; the catalog read flips with
    its write path). Shaped like the local read: adds the vendor name,
    coalesces the offer's lead time to the vendor's, converts break keys to
    min_qty/unit_price, and keeps the part_number / preferred-first / price
    ordering the planner relies on."""
    vmap = _vendor_map()
    offers = proc_get("/v1/vendor-parts").get("vendorParts", [])
    out = []
    for o in offers:
        vendor = vmap.get(o["vendor_id"], {})
        lead = o["lead_time_days"] if o.get("lead_time_days") is not None else vendor.get("lead_time_days", 7)
        out.append({
            "id": o["id"], "vendor_id": o["vendor_id"], "vendor": vendor.get("name", ""),
            "part_number": o["part_number"], "vendor_model": o["vendor_model"],
            "description": o["description"], "unit_price": float(o["unit_price"]),
            "moq": o["moq"], "lead_time_days": lead,
            "availability": o["availability"], "preferred": o["preferred"],
            "breaks": [{"min_qty": b["minQty"], "unit_price": b["unitPrice"]}
                       for b in o.get("breaks", [])],
        })
    out.sort(key=lambda c: (c["part_number"], not c["preferred"], c["unit_price"]))
    return out
