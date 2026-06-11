import { readFile } from "node:fs/promises";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts/import-csv.mjs records.csv");
  process.exit(1);
}

const text = await readFile(filePath, "utf8");
const rows = parseCsv(text);
const headerIndex = rows.findIndex((row) => row.some((cell) => normalizeHeader(cell) === "date") && row.some((cell) => normalizeHeader(cell) === "amount"));
if (headerIndex < 0) {
  console.error("找不到可辨識的 CSV 表頭，至少需要日期與金額欄位。");
  process.exit(1);
}

const headers = rows[headerIndex];
const records = rows.slice(headerIndex + 1);
const normalizedHeaders = headers.map(normalizeHeader);

const members = new Map();
const transactions = [];

for (const row of records) {
  const item = Object.fromEntries(normalizedHeaders.map((key, index) => [key, row[index] || ""]));
  if (!item.date || !item.amount) continue;

  const amount = Number(String(item.amount).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(amount) || amount === 0) continue;
  const runningBalance = parseOptionalNumber(item.balance);

  const payerNames = parseMembers(item.member || item.payer || item.note || "");
  const memberNames = payerNames.length ? payerNames : ["未指定"];
  const memberIds = memberNames.map((name) => {
    const memberId = makeMemberId(name);
    members.set(memberId, { id: memberId, name, active: true });
    return memberId;
  });

  const category = item.category || inferCategory(item.title);
  const type = normalizeType(item.type, amount);
  const date = normalizeDate(item.date);

  transactions.push({
    id: `import-${transactions.length + 1}`,
    type,
    date,
    title: item.title || category,
    amount: Math.abs(amount),
    signedAmount: amount,
    sourceBalance: runningBalance,
    memberId: memberIds[0],
    memberIds,
    category,
    note: item.note || "CSV 匯入"
  });
}

console.log(JSON.stringify({
  members: [...members.values()],
  openingBalance: calculateOpeningBalance(transactions),
  transactions,
  validation: validateBalances(transactions)
}, null, 2));

function parseCsv(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function normalizeHeader(value) {
  const key = value.trim().toLowerCase();
  if (key === "項目") return "member";
  const map = {
    "日期": "date",
    "date": "date",
    "類型": "type",
    "type": "type",
    "項目": "title",
    "品項": "title",
    "支出收入名稱": "title",
    "title": "title",
    "金額": "amount",
    "amount": "amount",
    "餘額": "balance",
    "balance": "balance",
    "成員": "member",
    "付款人": "member",
    "繳納人": "member",
    "member": "member",
    "分類": "category",
    "category": "category",
    "備註": "note",
    "note": "note"
  };
  return map[key] || key;
}

function normalizeType(value, amount) {
  if (/支出|expense/i.test(value)) return "expense";
  if (/收入|income/i.test(value)) return "income";
  return amount >= 0 ? "income" : "expense";
}

function normalizeDate(value) {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slash = trimmed.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (slash) {
    return `${slash[1]}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;
  }

  const monthDay = trimmed.match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (monthDay) {
    const year = new Date().getFullYear();
    return `${year}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;
  }

  throw new Error(`Unsupported date format: ${value}`);
}

function inferCategory(title = "") {
  if (title.includes("公積金")) return "公積金";
  if (title.includes("房租")) return "房租";
  if (title.includes("水") || title.includes("電") || title.includes("瓦斯")) return "水電瓦斯";
  if (title.includes("網路")) return "網路";
  return "其他";
}

function makeMemberId(name) {
  const aliases = {
    "蔡": "tsai",
    "lu": "LU",
    "Lu": "LU",
    "LU": "LU",
    "翰": "han",
    "張": "chang"
  };
  const normalized = aliases[name] || name;
  return `member-${encodeURIComponent(normalized).replace(/%/g, "").toLowerCase()}`;
}

function parseMembers(value) {
  const text = String(value || "")
    .replace(/付款|支出|購買|繳納|繳|中獎/g, " ")
    .replace(/[，,、/]/g, " ")
    .trim();
  if (!text) return [];

  return [...new Set(text.split(/\s+/).map(normalizeMemberName).filter(Boolean))];
}

function normalizeMemberName(value) {
  if (/^lu$/i.test(value)) return "LU";
  return value.trim();
}

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function calculateOpeningBalance(records) {
  const first = records.find((record) => record.sourceBalance !== null);
  if (!first) return 0;
  return first.sourceBalance - first.signedAmount;
}

function validateBalances(records) {
  const openingBalance = calculateOpeningBalance(records);
  let running = openingBalance;
  const mismatches = [];

  records.forEach((record) => {
    running += record.signedAmount;
    if (record.sourceBalance !== null && running !== record.sourceBalance) {
      mismatches.push({
        id: record.id,
        date: record.date,
        title: record.title,
        expected: record.sourceBalance,
        calculated: running
      });
    }
  });

  return {
    openingBalance,
    endingBalance: running,
    mismatchCount: mismatches.length,
    mismatches
  };
}
