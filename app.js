let dashboardConfig = null;

const publicGoogleSheetCsvUrl =
  "https://docs.google.com/spreadsheets/d/1SiPaJEatVuSnI0IBzmagaERb6Lyf1HRnUKDynGQU-uk/export?format=csv&gid=1398563362";

const sampleRows = [
  {
    location: "Trinity Cleveland",
    month: "2026-01-01",
    revenue: 105776.3,
    costOfService: 39882.66,
    totalExpense: 64511.78,
    supplies: 11808.38,
    labFee: 0,
    utilities: 1247.69,
    rent: 7467,
    employeePayroll: 23750.42,
    doctorPayroll: 28074.28,
    staffHeadCount: null,
    bankDeposits: 105776.3,
    bankDebits: 95801.98,
  },
  {
    location: "Trinity Conroe",
    month: "2026-01-01",
    revenue: 142213.1,
    costOfService: 72156.6,
    totalExpense: 41757.97,
    supplies: 21875.09,
    labFee: 0,
    utilities: 823.4,
    rent: 7961.5,
    employeePayroll: 27943.68,
    doctorPayroll: 50281.51,
    staffHeadCount: null,
    bankDeposits: 145542.03,
    bankDebits: 137014.3,
  },
  {
    location: "Trinity Crosby",
    month: "2026-01-01",
    revenue: 134522.37,
    costOfService: 38258.71,
    totalExpense: 89445.7,
    supplies: 4634.21,
    labFee: 0,
    utilities: 1176.99,
    rent: 5200,
    employeePayroll: 32097.66,
    doctorPayroll: 33624.5,
    staffHeadCount: null,
    bankDeposits: 135207.09,
    bankDebits: 127708.85,
  },
  {
    location: "Trinity Humble",
    month: "2026-01-01",
    revenue: 131715.21,
    costOfService: 35210.88,
    totalExpense: 89335.56,
    supplies: 274,
    labFee: 0,
    utilities: 995.85,
    rent: 8817.43,
    employeePayroll: 37477.53,
    doctorPayroll: 34936.88,
    staffHeadCount: null,
    bankDeposits: 133626.24,
    bankDebits: 130092.96,
  },
];

const chartColors = {
  revenue: "#047857",
  grossProfit: "#2563eb",
  netProfit: "#f59e0b",
  expense: "#ea580c",
  debits: "#dc2626",
  payroll: "#7c3aed",
  rent: "#0891b2",
  supplies: "#64748b",
  costOfService: "#0f766e",
  employeePayroll: "#16a34a",
  doctorPayroll: "#2563eb",
  utilities: "#d97706",
  labFee: "#e11d48",
  bankDeposits: "#10b981",
  muted: "#5f746f",
  grid: "#dcece6",
  text: "#10231f",
};

const state = {
  view: "overview",
  period: "all",
  location: "all",
  detailLocation: "Trinity Cleveland",
  search: "",
  lastSync: new Date(),
  syncLog: [],
  dataMode: "sample",
  loadError: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const htmlEntities = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => htmlEntities[character]);
}

function enrich(row) {
  const grossProfit = row.revenue - row.costOfService;
  const netProfit = grossProfit - row.totalExpense;
  const payrollTotal = row.employeePayroll + row.doctorPayroll;
  const bankVariance = row.bankDeposits - row.revenue;
  return {
    ...row,
    grossProfit,
    netProfit,
    payrollTotal,
    bankVariance,
    grossProfitPct: row.revenue ? grossProfit / row.revenue : 0,
    netProfitPct: row.revenue ? netProfit / row.revenue : 0,
    expensePct: row.revenue ? row.totalExpense / row.revenue : 0,
    cosPct: row.revenue ? row.costOfService / row.revenue : 0,
  };
}

let rows = sampleRows.map(enrich);

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function formatPercent(value) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatCompactCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value || 0);
}

function formatMonth(value) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function filteredRows() {
  return rows.filter((row) => {
    const periodMatch = state.period === "all" || row.month === state.period;
    const locationMatch = state.location === "all" || row.location === state.location;
    return periodMatch && locationMatch;
  });
}

function sum(list, key) {
  return list.reduce((total, row) => total + (row[key] || 0), 0);
}

function aggregateRows(list) {
  const revenue = sum(list, "revenue");
  const costOfService = sum(list, "costOfService");
  const totalExpense = sum(list, "totalExpense");
  const supplies = sum(list, "supplies");
  const labFee = sum(list, "labFee");
  const utilities = sum(list, "utilities");
  const rent = sum(list, "rent");
  const employeePayroll = sum(list, "employeePayroll");
  const doctorPayroll = sum(list, "doctorPayroll");
  const bankDeposits = sum(list, "bankDeposits");
  const bankDebits = sum(list, "bankDebits");
  return enrich({
    location: list[0]?.location || "",
    month: list[0]?.month || "",
    revenue,
    costOfService,
    totalExpense,
    supplies,
    labFee,
    utilities,
    rent,
    employeePayroll,
    doctorPayroll,
    staffHeadCount: null,
    bankDeposits,
    bankDebits,
  });
}

function groupedBy(list, key) {
  return list.reduce((groups, item) => {
    const value = item[key];
    groups[value] ||= [];
    groups[value].push(item);
    return groups;
  }, {});
}

function drawChart(canvasId, draw) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return false;
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 20 || rect.height === 0) return false;

  if (!canvas.dataset.baseHeight) {
    canvas.dataset.baseHeight = String(Number(canvas.getAttribute("height")) || 280);
  }

  const scale = window.devicePixelRatio || 1;
  const cssWidth = Math.max(300, rect.width);
  const cssHeight = Number(canvas.dataset.chartHeight || canvas.dataset.baseHeight || 280);
  canvas.style.width = "100%";
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * scale);
  canvas.height = Math.round(cssHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  draw(ctx, cssWidth, cssHeight);
  return true;
}

function drawGrid(ctx, width, height, padding) {
  ctx.strokeStyle = chartColors.grid;
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, sans-serif";
  ctx.fillStyle = chartColors.muted;
  for (let i = 0; i <= 4; i += 1) {
    const y = padding.top + ((height - padding.top - padding.bottom) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }
}

function drawEmptyState(ctx, width, height, message = "No data for this selection") {
  ctx.fillStyle = "#effbf6";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = chartColors.muted;
  ctx.font = "600 13px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(message, width / 2, height / 2);
}

function roundedRect(ctx, x, y, width, height, radius = 4) {
  const r = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawLineChart(canvasId, data) {
  drawChart(canvasId, (ctx, width, height) => {
    const padding = { top: 28, right: 22, bottom: 42, left: 64 };
    const months = Object.entries(groupedBy(data, "month"))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, values]) => ({
        label: formatMonth(month),
        revenue: sum(values, "revenue"),
        grossProfit: sum(values, "grossProfit"),
        netProfit: sum(values, "netProfit"),
      }));

    if (!months.length) {
      drawEmptyState(ctx, width, height);
      return;
    }

    const maxValue = Math.max(...months.flatMap((m) => [m.revenue, m.grossProfit, m.netProfit]), 1);
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    drawGrid(ctx, width, height, padding);

    ctx.fillStyle = chartColors.muted;
    ctx.textAlign = "right";
    ctx.font = "11px Inter, sans-serif";
    for (let i = 0; i <= 4; i += 1) {
      const value = maxValue - (maxValue / 4) * i;
      const y = padding.top + (chartHeight / 4) * i + 4;
      ctx.fillText(formatCompactCurrency(value), padding.left - 10, y);
    }

    if (months.length === 1) {
      const barGroups = [
        ["Revenue", months[0].revenue, chartColors.revenue],
        ["Gross", months[0].grossProfit, chartColors.grossProfit],
        ["Net", months[0].netProfit, chartColors.netProfit],
      ];
      const barWidth = Math.min(58, chartWidth / 6);
      const gap = 12;
      const groupWidth = barGroups.length * barWidth + (barGroups.length - 1) * gap;
      const startX = padding.left + (chartWidth - groupWidth) / 2;
      const yBase = padding.top + chartHeight;

      barGroups.forEach(([label, value, color], index) => {
        const x = startX + index * (barWidth + gap);
        const barHeight = Math.max(2, (value / maxValue) * chartHeight);
        ctx.fillStyle = color;
        roundedRect(ctx, x, yBase - barHeight, barWidth, barHeight, 5);
        ctx.fill();
        ctx.fillStyle = chartColors.text;
        ctx.textAlign = "center";
        ctx.font = "11px Inter, sans-serif";
        ctx.fillText(label, x + barWidth / 2, height - 17);
      });
      drawInlineLegend(ctx, padding.left, 15, [
        ["Revenue", chartColors.revenue],
        ["Gross Profit", chartColors.grossProfit],
        ["Net Profit", chartColors.netProfit],
      ]);
      return;
    }

    function point(value, index) {
      const x = padding.left + (months.length === 1 ? chartWidth / 2 : (chartWidth / (months.length - 1)) * index);
      const y = padding.top + chartHeight - (value / maxValue) * chartHeight;
      return { x, y };
    }

    function drawSeries(key, color) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      months.forEach((month, index) => {
        const p = point(month[key], index);
        if (index === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      months.forEach((month, index) => {
        const p = point(month[key], index);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    drawSeries("revenue", chartColors.revenue);
    drawSeries("grossProfit", chartColors.grossProfit);
    drawSeries("netProfit", chartColors.netProfit);

    ctx.fillStyle = chartColors.muted;
    ctx.textAlign = "center";
    months.forEach((month, index) => {
      const p = point(0, index);
      ctx.fillText(month.label, p.x, height - 16);
    });

    drawInlineLegend(ctx, padding.left, 14, [
      ["Revenue", chartColors.revenue],
      ["Gross Profit", chartColors.grossProfit],
      ["Net Profit", chartColors.netProfit],
    ]);
  });
}

function drawBarChart(canvasId, data, options = {}) {
  drawChart(canvasId, (ctx, width, height) => {
    if (!data.length) {
      drawEmptyState(ctx, width, height);
      return;
    }

    const padding = { top: 18, right: 96, bottom: 24, left: Math.min(178, Math.max(126, width * 0.34)) };
    const chartWidth = width - padding.left - padding.right;
    const rowHeight = Math.max(44, (height - padding.top - padding.bottom) / Math.max(data.length, 1));
    const maxValue = Math.max(...data.map((item) => Math.abs(item.value)), 1);
    ctx.font = "12px Inter, sans-serif";

    data.forEach((item, index) => {
      const y = padding.top + index * rowHeight + 10;
      const barWidth = (Math.abs(item.value) / maxValue) * chartWidth;

      if (index % 2 === 0) {
        ctx.fillStyle = "#f3fbf7";
        roundedRect(ctx, 0, padding.top + index * rowHeight + 3, width, rowHeight - 6, 8);
        ctx.fill();
      }

      ctx.fillStyle = chartColors.text;
      ctx.textAlign = "left";
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(shortLabel(item.label, width < 520 ? 17 : 24), 10, y + 15);
      ctx.fillStyle = "#e7f3ee";
      roundedRect(ctx, padding.left, y, chartWidth, 18, 4);
      ctx.fill();
      ctx.fillStyle = item.color || (item.value >= 0 ? options.color || chartColors.grossProfit : chartColors.debits);
      roundedRect(ctx, padding.left, y, Math.max(2, barWidth), 18, 4);
      ctx.fill();
      ctx.fillStyle = chartColors.text;
      ctx.textAlign = "right";
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(options.percent ? formatPercent(item.value) : formatCompactCurrency(item.value), width - 8, y + 15);
    });
  });
}

function drawGroupedBankChart(canvasId, data) {
  drawChart(canvasId, (ctx, width, height) => {
    if (!data.length) {
      drawEmptyState(ctx, width, height);
      return;
    }

    const padding = {
      top: 42,
      right: Math.min(132, Math.max(96, width * 0.18)),
      bottom: 24,
      left: Math.min(210, Math.max(136, width * 0.34)),
    };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    const maxValue = Math.max(...data.flatMap((item) => [item.deposits, item.debits]), 1);
    const rowHeight = chartHeight / Math.max(data.length, 1);
    const barHeight = Math.max(10, Math.min(14, rowHeight * 0.27));
    const barGap = Math.max(5, Math.min(8, rowHeight * 0.15));

    data.forEach((item, index) => {
      const groupY = padding.top + index * rowHeight + rowHeight / 2;
      const depositY = groupY - barHeight - barGap / 2;
      const debitY = groupY + barGap / 2;
      const depositsWidth = (item.deposits / maxValue) * chartWidth;
      const debitsWidth = (item.debits / maxValue) * chartWidth;

      if (index % 2 === 0) {
        ctx.fillStyle = "#f3fbf7";
        roundedRect(ctx, 0, padding.top + index * rowHeight + 2, width, Math.max(24, rowHeight - 4), 8);
        ctx.fill();
      }

      ctx.fillStyle = chartColors.muted;
      ctx.textAlign = "left";
      ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText(shortLabel(item.label.replace("Trinity ", ""), width < 560 ? 16 : 24), 12, groupY + 4);

      ctx.fillStyle = "#e7f3ee";
      roundedRect(ctx, padding.left, depositY, chartWidth, barHeight, 5);
      ctx.fill();
      roundedRect(ctx, padding.left, debitY, chartWidth, barHeight, 5);
      ctx.fill();

      ctx.fillStyle = chartColors.bankDeposits;
      roundedRect(ctx, padding.left, depositY, Math.max(3, depositsWidth), barHeight, 5);
      ctx.fill();
      ctx.fillStyle = chartColors.debits;
      roundedRect(ctx, padding.left, debitY, Math.max(3, debitsWidth), barHeight, 5);
      ctx.fill();

      ctx.textAlign = "right";
      ctx.font = "600 11px Inter, sans-serif";
      ctx.fillStyle = chartColors.text;
      ctx.fillText(formatCompactCurrency(item.deposits), width - 8, depositY + barHeight - 2);
      ctx.fillStyle = chartColors.muted;
      ctx.fillText(formatCompactCurrency(item.debits), width - 8, debitY + barHeight - 2);
    });

    drawInlineLegend(ctx, padding.left, 14, [
      ["Deposits", chartColors.bankDeposits],
      ["Debits", chartColors.debits],
    ]);
  });
}

function drawDonutChart(canvasId, entries) {
  drawChart(canvasId, (ctx, width, height) => {
    if (!entries.length) {
      drawEmptyState(ctx, width, height);
      return;
    }

    const total = entries.reduce((acc, item) => acc + item.value, 0) || 1;
    const radius = Math.min(width, height) * 0.32;
    const centerX = width / 2;
    const centerY = height / 2;
    let start = -Math.PI / 2;

    entries.forEach((item) => {
      const angle = (item.value / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, start, start + angle);
      ctx.closePath();
      ctx.fillStyle = item.color;
      ctx.fill();
      start += angle;
    });

    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.58, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.fillStyle = chartColors.text;
    ctx.font = "700 18px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(formatCurrency(total), centerX, centerY + 5);
    ctx.fillStyle = chartColors.muted;
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText("tracked cost", centerX, centerY + 23);
  });
}

function drawInlineLegend(ctx, x, y, entries) {
  let cursor = x;
  ctx.font = "12px Inter, sans-serif";
  entries.forEach(([label, color]) => {
    ctx.fillStyle = color;
    ctx.fillRect(cursor, y - 9, 10, 10);
    ctx.fillStyle = chartColors.muted;
    ctx.textAlign = "left";
    ctx.fillText(label, cursor + 15, y);
    cursor += ctx.measureText(label).width + 42;
  });
}

function shortLabel(value, maxLength) {
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, Math.max(1, maxLength - 1))}...` : text;
}

function renderFilters() {
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const locations = [...new Set(rows.map((row) => row.location))].sort();

  if (state.period !== "all" && !months.includes(state.period)) {
    state.period = "all";
  }

  if (state.location !== "all" && !locations.includes(state.location)) {
    state.location = "all";
  }

  const periodOptions = `<option value="all">All months</option>${months
    .map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(formatMonth(month))}</option>`)
    .join("")}`;
  if ($("#period-filter").innerHTML !== periodOptions) {
    $("#period-filter").innerHTML = periodOptions;
  }

  const locationOptions = `<option value="all">All locations</option>${locations
    .map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`)
    .join("")}`;
  if ($("#location-filter").innerHTML !== locationOptions) {
    $("#location-filter").innerHTML = locationOptions;
  }

  const detailOptions = locations
    .map((location) => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`)
    .join("");
  if ($("#location-detail-filter").innerHTML !== detailOptions) {
    $("#location-detail-filter").innerHTML = detailOptions;
  }

  if (!locations.includes(state.detailLocation)) {
    state.detailLocation = locations[0] || "";
  }

  $("#period-filter").value = state.period;
  $("#location-filter").value = state.location;
  $("#location-detail-filter").value = state.detailLocation;
}

function renderKpis(data) {
  const revenue = sum(data, "revenue");
  const grossProfit = sum(data, "grossProfit");
  const netProfit = sum(data, "netProfit");
  const totalExpense = sum(data, "totalExpense");
  const costOfService = sum(data, "costOfService");
  const payrollTotal = sum(data, "payrollTotal");
  const bankVariance = sum(data, "bankVariance");
  const grossMargin = revenue ? grossProfit / revenue : 0;
  const netMargin = revenue ? netProfit / revenue : 0;

  const kpis = [
    ["Revenue", formatCurrency(revenue), `${data.length} source rows`],
    ["Gross Profit", formatCurrency(grossProfit), formatPercent(grossMargin)],
    ["Net Profit", formatCurrency(netProfit), formatPercent(netMargin)],
    ["Total Expense", formatCurrency(totalExpense), `${formatPercent(revenue ? totalExpense / revenue : 0)} of revenue`],
    ["Cost Of Service", formatCurrency(costOfService), `${formatPercent(revenue ? costOfService / revenue : 0)} of revenue`],
    ["Payroll Total", formatCurrency(payrollTotal), "Employee + doctor payroll"],
    ["Bank Variance", formatCurrency(bankVariance), "Deposits less revenue"],
    ["Locations", String(new Set(data.map((row) => row.location)).size), "Active in selection"],
  ];

  $("#kpi-grid").innerHTML = kpis
    .map(
      ([label, value, note]) => `
        <article class="kpi">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(note)}</small>
        </article>
      `,
    )
    .join("");
}

function renderOverview() {
  const data = filteredRows();
  const periodText = state.period === "all" ? "all available months" : formatMonth(state.period);
  const locationText = state.location === "all" ? "All locations" : state.location;
  $("#overview-subtitle").textContent = `${locationText}, ${periodText}`;
  $(".data-source").textContent =
    state.dataMode === "live"
      ? "Source: Supabase live data"
      : state.dataMode === "sheet"
        ? "Source: Google Sheet live"
        : state.loadError
          ? "Source: sample data, live load failed"
          : "Source: Google Sheet sample";

  renderKpis(data);
  drawLineChart("trend-chart", data);

  const expenseEntries = [
    ["Cost of Service", sum(data, "costOfService"), chartColors.costOfService],
    ["Employee Payroll", sum(data, "employeePayroll"), chartColors.employeePayroll],
    ["Doctor Payroll", sum(data, "doctorPayroll"), chartColors.doctorPayroll],
    ["Rent", sum(data, "rent"), chartColors.rent],
    ["Supplies", sum(data, "supplies"), chartColors.supplies],
    ["Utilities", sum(data, "utilities"), chartColors.utilities],
    ["Lab Fee", sum(data, "labFee"), chartColors.labFee],
  ].filter((entry) => entry[1] > 0);

  drawDonutChart(
    "expense-chart",
    expenseEntries.map(([label, value, color]) => ({ label, value, color })),
  );
  $("#expense-legend").innerHTML = expenseEntries
    .map(
      ([label, , color]) => `
        <span class="legend-item">
          <span class="legend-swatch" style="background:${color}"></span>${label}
        </span>
      `,
    )
    .join("");

  const byLocation = Object.entries(groupedBy(data, "location"))
    .map(([location, items]) => ({ label: location, value: sum(items, "netProfit") }))
    .sort((a, b) => b.value - a.value);
  $("#location-profit-chart").dataset.chartHeight = String(Math.max(360, byLocation.length * 48 + 54));
  drawBarChart("location-profit-chart", byLocation, { color: chartColors.netProfit });

  const bankData = Object.entries(groupedBy(data, "location")).map(([location, items]) => ({
    label: location,
    deposits: sum(items, "bankDeposits"),
    debits: sum(items, "bankDebits"),
  }));
  $("#bank-chart").dataset.chartHeight = String(Math.max(420, bankData.length * 48 + 66));
  drawGroupedBankChart("bank-chart", bankData);
}

function renderLocationDetail() {
  const selected = rows.filter(
    (row) => row.location === state.detailLocation && (state.period === "all" || row.month === state.period),
  );
  const fallback = rows.filter((row) => row.location === state.detailLocation);
  const current = selected.length ? aggregateRows(selected) : fallback.length ? aggregateRows(fallback) : rows[0];
  if (!current) return;
  $("#detail-location-name").textContent = current.location;
  $("#detail-location-month").textContent =
    state.period === "all" ? `${selected.length || fallback.length} period${(selected.length || fallback.length) === 1 ? "" : "s"}` : formatMonth(state.period);

  const metrics = [
    ["Revenue", formatCurrency(current.revenue)],
    ["Gross Profit", formatCurrency(current.grossProfit)],
    ["Net Profit", formatCurrency(current.netProfit)],
    ["Gross Margin", formatPercent(current.grossProfitPct)],
    ["Net Margin", formatPercent(current.netProfitPct)],
    ["Expense %", formatPercent(current.expensePct)],
    ["COS %", formatPercent(current.cosPct)],
    ["Bank Variance", formatCurrency(current.bankVariance)],
  ];

  $("#detail-metrics").innerHTML = metrics
    .map(([label, value]) => `<div class="metric-row"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`)
    .join("");

  $("#cost-chart").dataset.chartHeight = "390";
  drawBarChart(
    "cost-chart",
    [
      { label: "Cost of Service", value: current.costOfService, color: chartColors.costOfService },
      { label: "Employee Payroll", value: current.employeePayroll, color: chartColors.employeePayroll },
      { label: "Doctor Payroll", value: current.doctorPayroll, color: chartColors.doctorPayroll },
      { label: "Rent", value: current.rent, color: chartColors.rent },
      { label: "Supplies", value: current.supplies, color: chartColors.supplies },
      { label: "Utilities", value: current.utilities, color: chartColors.utilities },
      { label: "Lab Fee", value: current.labFee, color: chartColors.labFee },
    ],
    { color: chartColors.expense },
  );
}

function renderTable() {
  const search = state.search.trim().toLowerCase();
  const data = filteredRows().filter((row) => row.location.toLowerCase().includes(search));
  $("#financial-table").innerHTML = data.length
    ? data
      .map(
        (row) => `
        <tr>
          <td data-label="Location">${escapeHtml(row.location)}</td>
          <td data-label="Month">${escapeHtml(formatMonth(row.month))}</td>
          <td data-label="Revenue">${escapeHtml(formatCurrency(row.revenue))}</td>
          <td data-label="Gross Profit">${escapeHtml(formatCurrency(row.grossProfit))}</td>
          <td data-label="Net Profit" class="${row.netProfit >= 0 ? "positive" : "negative"}">${escapeHtml(formatCurrency(row.netProfit))}</td>
          <td data-label="GP %">${escapeHtml(formatPercent(row.grossProfitPct))}</td>
          <td data-label="NP %">${escapeHtml(formatPercent(row.netProfitPct))}</td>
          <td data-label="Deposits">${escapeHtml(formatCurrency(row.bankDeposits))}</td>
          <td data-label="Debits">${escapeHtml(formatCurrency(row.bankDebits))}</td>
        </tr>
      `,
      )
      .join("")
    : `<tr><td colspan="9">No financial rows match the current filters.</td></tr>`;
}

function renderSync() {
  const isHealthy = !state.loadError;
  const lastSyncText = state.lastSync.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  $("#rail-sync-status").textContent = isHealthy ? "Healthy" : "Needs attention";
  $("#sync-status-label").textContent = isHealthy ? "Healthy" : "Load issue";
  $(".status-dot").classList.toggle("warning", !isHealthy);
  $("#rail-sync-time").textContent = `Last sync ${lastSyncText}`;
  $("#last-sync").textContent = lastSyncText;
  $("#rows-read").textContent = rows.length;
  $("#rows-changed").textContent = state.syncLog[0]?.changed ?? rows.length;
  $("#rows-skipped").textContent = "0";
  $("#sync-log").innerHTML = state.syncLog.length
    ? state.syncLog
    .map(
      (entry) => `
        <div class="sync-entry">
          <div>
            <strong>${escapeHtml(entry.time)}</strong>
            <span>${escapeHtml(entry.note)}</span>
          </div>
          <span>${escapeHtml(entry.changed)} changed</span>
          <span class="pill ${isHealthy ? "success" : "warning"}">${isHealthy ? "Success" : "Review"}</span>
        </div>
      `,
    )
    .join("")
    : `<div class="sync-entry sync-entry-empty"><div><strong>No refreshes yet</strong><span>Use Refresh data to load the latest sheet rows.</span></div></div>`;
}

function render() {
  renderFilters();
  renderOverview();
  renderLocationDetail();
  renderTable();
  renderSync();
}

async function runSyncSimulation() {
  const scrollX = window.scrollX;
  const scrollY = window.scrollY < 140 ? 0 : window.scrollY;
  const restoreScroll = () => window.scrollTo(scrollX, scrollY);
  const now = new Date();
  state.lastSync = now;
  restoreScroll();
  await loadLiveData();
  state.syncLog = [{
    time: now.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
    changed: rows.length,
    note:
      state.dataMode === "live"
        ? "Dashboard refreshed from Supabase reporting view."
        : state.dataMode === "sheet"
          ? "Dashboard refreshed from the public Google Sheet export."
          : "Sample workbook rows loaded as a fallback.",
  }];
  render();
  restoreScroll();
  requestAnimationFrame(() => {
    restoreScroll();
    requestAnimationFrame(restoreScroll);
  });
  setTimeout(restoreScroll, 100);
  setTimeout(restoreScroll, 400);
}

function bindEvents() {
  $$(".nav-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.view = tab.dataset.view;
      $$(".nav-tab").forEach((item) => item.classList.toggle("active", item === tab));
      $$(".view").forEach((view) => view.classList.remove("active"));
      $(`#${state.view}-view`).classList.add("active");
      render();
    });
  });

  $("#period-filter").addEventListener("change", (event) => {
    state.period = event.target.value;
    render();
  });

  $("#location-filter").addEventListener("change", (event) => {
    state.location = event.target.value;
    render();
  });

  $("#location-detail-filter").addEventListener("change", (event) => {
    state.detailLocation = event.target.value;
    renderLocationDetail();
  });

  $("#table-search").addEventListener("input", (event) => {
    state.search = event.target.value;
    renderTable();
  });

  $("#manual-sync").addEventListener("click", runSyncSimulation);
  $("#sync-page-button").addEventListener("click", runSyncSimulation);

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(render, 120);
  });
}

async function loadOptionalConfig() {
  dashboardConfig = globalThis.dashboardConfig || null;
}

async function loadLiveData() {
  const sheetLoaded = await loadPublicSheetData();
  if (sheetLoaded) {
    return;
  }

  if (!dashboardConfig?.supabaseUrl || !dashboardConfig?.supabaseAnonKey) {
    return;
  }

  try {
    const url = `${dashboardConfig.supabaseUrl.replace(/\/$/, "")}/rest/v1/v_financial_actuals?select=*&order=period_month.asc,location_name.asc`;
    const response = await fetch(url, {
      headers: {
        apikey: dashboardConfig.supabaseAnonKey,
        Authorization: `Bearer ${dashboardConfig.supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase read failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload) || payload.length === 0) {
      state.loadError = "Supabase returned no rows.";
      await loadPublicSheetData();
      return;
    }

    rows = payload.map(fromSupabaseRow).map(enrich);
    state.dataMode = "live";
    state.loadError = null;
  } catch (error) {
    await loadPublicSheetData();
    state.loadError = error instanceof Error ? error.message : String(error);
  }
}

async function loadPublicSheetData() {
  try {
    const response = await fetch(publicGoogleSheetCsvUrl);
    if (!response.ok) {
      throw new Error(`Google Sheet CSV read failed with status ${response.status}`);
    }
    const csvRows = parseCsv(await response.text());
    const [headers, ...body] = csvRows;
    const parsedRows = body.map((row) => fromSheetCsvRow(headers, row)).filter((row) => row.location && row.month);

    if (!parsedRows.length) {
      throw new Error("Google Sheet returned no financial rows.");
    }

    rows = parsedRows.map(enrich);
    state.dataMode = "sheet";
    state.loadError = null;
    return true;
  } catch (error) {
    rows = sampleRows.map(enrich);
    state.dataMode = "sample";
    state.loadError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

function fromSupabaseRow(row) {
  return {
    location: row.location_name,
    month: row.period_month,
    revenue: Number(row.revenue || 0),
    costOfService: Number(row.cost_of_service || 0),
    totalExpense: Number(row.total_expense || 0),
    supplies: Number(row.supplies || 0),
    labFee: Number(row.lab_fee || 0),
    utilities: Number(row.utilities || 0),
    rent: Number(row.rent || 0),
    employeePayroll: Number(row.employee_payroll || 0),
    doctorPayroll: Number(row.doctor_payroll || 0),
    staffHeadCount: row.staff_head_count == null ? null : Number(row.staff_head_count),
    bankDeposits: Number(row.bank_deposits || 0),
    bankDebits: Number(row.bank_debits || 0),
  };
}

function fromSheetCsvRow(headers, row) {
  const raw = {};
  headers.forEach((header, index) => {
    raw[normalizeHeader(header)] = row[index] ?? "";
  });

  return {
    location: raw.companies_name,
    month: normalizeDate(raw.month),
    revenue: number(raw.revenue),
    costOfService: number(raw.cost_of_service),
    totalExpense: number(raw.total_expense),
    supplies: number(raw.supplies),
    labFee: number(raw.lab_fee),
    utilities: number(raw.utilities),
    rent: number(raw.rent),
    employeePayroll: number(raw.employee_payroll),
    doctorPayroll: number(raw.doctor_payroll),
    staffHeadCount: raw.staff_head_count ? Number(raw.staff_head_count) : null,
    bankDeposits: number(raw.bank_deposits),
    bankDebits: number(raw.bank_debits),
  };
}

function parseCsv(csv) {
  const parsed = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field);
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(field);
      parsed.push(row);
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (field || row.length) {
    row.push(field);
    parsed.push(row);
  }

  return parsed.filter((currentRow) => currentRow.some((value) => value.trim()));
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function number(value) {
  const parsed = Number(String(value || "").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toISOString().slice(0, 10);
}

async function init() {
  await loadOptionalConfig();
  await loadLiveData();
  bindEvents();
  await runSyncSimulation();

  if (dashboardConfig?.refreshIntervalMs) {
    window.setInterval(async () => {
      await loadLiveData();
      render();
    }, dashboardConfig.refreshIntervalMs);
  }
}

init();
