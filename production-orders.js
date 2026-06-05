const orderForm = document.querySelector("#orderForm");
const orderMessage = document.querySelector("#orderMessage");
const orderNoInput = document.querySelector("#orderNo");
const quantityInput = document.querySelector("#quantity");
const startDateInput = document.querySelector("#startDate");
const dueDateInput = document.querySelector("#dueDate");
const sqlPreview = document.querySelector("#sqlPreview");
const activeOrder = document.querySelector("#activeOrder");
const orderStatus = document.querySelector("#orderStatus");
const buildQty = document.querySelector("#buildQty");
const currentBalance = document.querySelector("#currentBalance");
const timeUtilization = document.querySelector("#timeUtilization");
const balancesBody = document.querySelector("#balancesBody");
const materialsBody = document.querySelector("#materialsBody");
const activityList = document.querySelector("#activityList");
const ledgerBody = document.querySelector("#ledgerBody");
const historyBody = document.querySelector("#historyBody");
let selectedOrderNo = null;

const balanceNotes = {
  "Receiving": "Testing start point: initial order balance can sit here before Kitting release.",
  "Drone Component Kitting": "Production order starts here and waits for material issue.",
  "Workstation 1: Airframe + Motors": "Receives WIP after kitted material is released to assembly.",
  "Workstation 2: Electronics + Power": "Receives WIP after airframe completion and electrical kit issue.",
  "Workstation 3: Firmware + Calibration": "Receives WIP after electronics integration passes gate.",
  "Workstation 4: Motor/ESC Test + Props": "Receives WIP after firmware and calibration are recorded.",
  "Workstation 5: Final QA + Flight Test": "Receives WIP after motor test and prop install pass.",
  "Finished Goods: Packaged Drones": "Receives accepted unit from QA for carton, label, and documents.",
  "FG Inventory": "Completed quantity increases when packaged unit is scanned into stock."
};

function titleCase(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function setMessage(text, isError = false) {
  orderMessage.textContent = text;
  orderMessage.classList.toggle("error", isError);
}

function updateSqlPreview() {
  sqlPreview.textContent =
    `SELECT create_production_order('${orderNoInput.value}', ${quantityInput.value}, ` +
    `'${dueDateInput.value}', '${startDateInput.value}');`;
}

function renderSnapshot(snapshot) {
  if (!snapshot.order) {
    setMessage("No production orders found. Create the first order.");
    return;
  }

  const order = snapshot.order;
  selectedOrderNo = order.order_no;
  activeOrder.textContent = order.order_no;
  orderStatus.textContent = `${titleCase(order.production_status ?? order.status)} - ${order.percent_complete ?? 0}%`;
  buildQty.textContent = `${order.quantity} each`;
  currentBalance.textContent =
    `${order.current_zone} (${order.station_elapsed_minutes ?? 0}/${order.station_test_minutes ?? 0} test min; ` +
    `${order.station_recorded_minutes ?? 0} recorded min)`;
  timeUtilization.textContent =
    `${order.actual_time_utilization_percent ?? 0}% actual (${order.elapsed_minutes ?? 0}/${order.recorded_minutes ?? 0} min)`;

  balancesBody.innerHTML = snapshot.balances
    .map(
      (row) => `
        <tr>
          <td>${row.sequence_number}</td>
          <td>${row.station}</td>
          <td>${row.wip_quantity}</td>
          <td>${row.completed_quantity}</td>
          <td>${row.hold_quantity}</td>
          <td>${titleCase(row.operation_status)}</td>
          <td>${balanceNotes[row.station] ?? "Tracks WIP, completed, and hold balances for this order."}</td>
        </tr>
      `
    )
    .join("");

  materialsBody.innerHTML = snapshot.materials
    .map(
      (row) => `
        <tr>
          <td>${row.part_number}</td>
          <td>${row.description}</td>
          <td>${Number(row.required_quantity)} ${row.unit}</td>
          <td>${Number(row.issued_quantity)} ${row.unit}</td>
          <td>${Number(row.consumed_quantity)} ${row.unit}</td>
          <td>${titleCase(row.status)}</td>
        </tr>
      `
    )
    .join("");

  activityList.innerHTML = snapshot.activity
    .map(
      (row) => `
        <article>
          <span>${titleCase(row.activity_type)}</span>
          <strong>${row.quantity} each</strong>
          <p>${row.notes}</p>
        </article>
      `
    )
    .join("");

  ledgerBody.innerHTML = snapshot.ledger
    .map(
      (row) => `
        <tr>
          <td>${new Date(row.transaction_at).toLocaleTimeString()}</td>
          <td>${row.station}</td>
          <td>${titleCase(row.transaction_type)}</td>
          <td>${Number(row.quantity_in)}</td>
          <td>${Number(row.quantity_out)}</td>
          <td>${Number(row.adjustment_quantity)}</td>
          <td>${Number(row.balance_after)}</td>
          <td>${row.accounting_event}</td>
          <td>${row.reference}</td>
          <td>${row.notes}</td>
        </tr>
      `
    )
    .join("");
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString() : "";
}

function renderHistory(history) {
  historyBody.innerHTML = history.orders
    .map(
      (order) => `
        <tr class="${order.order_no === selectedOrderNo ? "selected" : ""}" data-order-no="${order.order_no}">
          <td><button type="button" class="order-history-link" data-order-no="${order.order_no}">${order.order_no}</button></td>
          <td>${titleCase(order.production_status ?? order.status)}</td>
          <td>${order.current_zone}</td>
          <td>${order.percent_complete ?? 0}%</td>
          <td>${order.quantity} each</td>
          <td>${formatDateTime(order.created_at)}</td>
          <td>${order.due_date}</td>
        </tr>
      `
    )
    .join("");
}

async function loadOrderSnapshot(orderNo = null) {
  const url = orderNo
    ? `/api/production-orders/latest?orderNo=${encodeURIComponent(orderNo)}`
    : "/api/production-orders/latest";
  const response = await fetch(url);
  const snapshot = await response.json();
  if (!response.ok) {
    throw new Error(snapshot.error ?? "Unable to load production orders.");
  }
  renderSnapshot(snapshot);
}

async function loadOrderHistory() {
  const response = await fetch("/api/production-orders/history");
  const history = await response.json();
  if (!response.ok) {
    throw new Error(history.error ?? "Unable to load production order history.");
  }
  renderHistory(history);
  return history;
}

async function loadLatestOrder() {
  if (window.location.protocol === "file:") {
    setMessage("Open this page through the local server link so Create Order can reach PostgreSQL.", true);
    return;
  }

  const [nextResponse] = await Promise.all([
    fetch("/api/production-orders/next-number")
  ]);
  const next = await nextResponse.json();
  if (!nextResponse.ok) {
    throw new Error(next.error ?? "Unable to load next production order number.");
  }
  orderNoInput.value = next.orderNo;
  updateSqlPreview();
  const history = await loadOrderHistory();
  if (!selectedOrderNo && history.orders.length) {
    selectedOrderNo = history.orders[0].order_no;
  }
  await loadOrderSnapshot(selectedOrderNo);
  await loadOrderHistory();
}

async function createOrder(event) {
  event.preventDefault();
  setMessage("Creating production order...");

  const payload = {
    orderNo: orderNoInput.value,
    quantity: Number(quantityInput.value),
    startDate: startDateInput.value,
    dueDate: dueDateInput.value
  };

  const response = await fetch("/api/production-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const snapshot = await response.json();
  if (!response.ok) {
    setMessage(snapshot.error ?? "Unable to create production order.", true);
    return;
  }

  renderSnapshot(snapshot);
  setMessage(`Created ${payload.orderNo} and initialized balances.`);
  await refreshNextOrderNo();
  await loadOrderHistory();
}

async function refreshNextOrderNo() {
  const response = await fetch("/api/production-orders/next-number");
  const next = await response.json();
  if (!response.ok) {
    setMessage(next.error ?? "Unable to refresh next order number.", true);
    return;
  }
  orderNoInput.value = next.orderNo;
  updateSqlPreview();
}

[quantityInput, startDateInput, dueDateInput].forEach((input) => {
  input.addEventListener("input", updateSqlPreview);
});

orderForm.addEventListener("submit", createOrder);
historyBody.addEventListener("click", (event) => {
  const button = event.target.closest("[data-order-no]");
  if (!button) {
    return;
  }
  loadOrderSnapshot(button.dataset.orderNo)
    .then(loadOrderHistory)
    .catch((error) => setMessage(error.message, true));
});
updateSqlPreview();
loadLatestOrder().catch((error) => setMessage(error.message, true));
setInterval(() => {
  loadLatestOrder().catch((error) => setMessage(error.message, true));
}, 15000);
