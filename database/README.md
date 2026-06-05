# Manufacturing Floor Database

This folder contains the PostgreSQL schema, seed data, and setup script for the drone manufacturing floor map prototype.

## Files

- `schema.sql` defines the tables.
- `seed.sql` inserts the drone floor plan, process flow, BOM, inventory, and work orders.
- `setup_postgres.py` creates the schema, seeds PostgreSQL, and verifies row counts.
- `create_production_order.py` calls PostgreSQL to create a production order from the database function.

## Setup

Set `DATABASE_URL` to the PostgreSQL database you want to use, then run the setup script.

Example connection string:

```text
postgresql://postgres:your_pgadmin_password@localhost:5432/manufacturing_floor
```

Example command:

```powershell
$env:DATABASE_URL = "postgresql://postgres:your_pgadmin_password@localhost:5432/manufacturing_floor"
python database/setup_postgres.py
```

## Main Tables

- `facilities`: the drone manufacturing floor.
- `zones`: receiving, kitting, airframe, electronics, firmware, test, QA, packaged goods, and finished goods inventory.
- `materials`: drone kit, WIP, QA accepted, and finished drone records.
- `process_steps`: drone movement sequence through build, test, QA, packaging, and rework.
- `inventory_balances`: aggregate current quantity by material and zone.
- `inventory_items`: detailed parts, production WIP, rework hold, and finished goods inventory with on-hand, allocated, available, min/max, and status.
- `work_orders`: sample work orders tied to the process map.
- `bom_items`: bill of materials lines for one packaged drone.
- `production_orders`: production order header from raw material release to finished goods.
- `production_order_materials`: BOM requirements, issue quantities, consumption quantities, and shortage status by production order.
- `production_order_operations`: station routing, labor minutes, quantity in/out, scrap, and operation status.
- `workstation_balances`: WIP, completed, and hold balances by workstation for each production order.
- `production_order_activity`: activity ledger for created, released, issued, started, moved, completed, held, and reworked events.
- `inventory_transactions`: inventory movement ledger tied to production orders and inventory items.
- `production_workstation_ledger`: accounting-facing transaction ledger by workstation with quantity in, quantity out, adjustments, balance after, event code, reference, and notes.

## Create Production Order

Order numbers are unique in PostgreSQL and indexed by `idx_production_orders_order_no_unique`.
Use this helper to see the next available number:

```sql
SELECT next_production_order_no();
```

The schema includes a PostgreSQL function that creates a production order and initializes the material demand, routing operations, workstation balances, and opening ledger records:

```sql
SELECT create_production_order('DRN-PO-1002', 1, '2026-06-14', '2026-06-04');
```

Arguments are `order_no`, `quantity`, `due_date`, and optional `start_date`.

You can also create one from PowerShell after `DATABASE_URL` is set:

```powershell
python database/create_production_order.py DRN-PO-1002 1 2026-06-14 --start-date 2026-06-04
```

## Timing Test Logic

For dashboard testing, a production order defaults to a 5-minute end-to-end test cycle. Set `TEST_TOTAL_MINUTES` before starting `server.py` to tune the full test duration. For example, `TEST_TOTAL_MINUTES=10` makes the simulated production route complete in 10 minutes. If `TEST_TOTAL_MINUTES` is not set to a positive value, the server falls back to `TEST_TIME_FACTOR`. The UI also computes actual-time utilization as:

```text
actual elapsed minutes / recorded route minutes * 100
```

This lets the dashboard move quickly for testing while still showing how much of the full recorded production time has actually been used.

## Inventory Check

After running the setup script, this query should return the same inventory rows shown in the prototype inventory page:

```sql
SELECT
  area,
  z.name AS location,
  item_name,
  part_number,
  quantity_on_hand AS on_hand,
  quantity_allocated AS allocated,
  quantity_available AS available,
  min_quantity AS min,
  max_quantity AS max,
  status
FROM inventory_items i
JOIN zones z ON z.id = i.location_zone_id
ORDER BY
  CASE area
    WHEN 'Parts' THEN 1
    WHEN 'Production' THEN 2
    WHEN 'Finished Goods' THEN 3
  END,
  i.id;
```
