import { imported2026Members, imported2026OpeningBalance, imported2026Transactions } from "./imported-2026.js";

const STORAGE_KEY = "bubu-house-fund-state-v1";
export const DATA_VERSION = "2026-csv-authoritative-20260611-r2";

export const demoMembers = imported2026Members;

export function createInitialState(now = new Date()) {
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  return {
    dataVersion: DATA_VERSION,
    openingBalance: imported2026OpeningBalance,
    activeMemberId: "member-tsai",
    selectedPeriod: period,
    members: structuredClone(imported2026Members),
    transactions: structuredClone(imported2026Transactions),
    auditLogs: [
      {
        id: cryptoId(),
        at: new Date().toISOString(),
        actorId: "member-tsai",
        action: "匯入 2026 CSV 資料"
      }
    ]
  };
}

export function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return normalizeState(createInitialState());

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return normalizeState(createInitialState());
  }
}

export function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function resetState() {
  const state = createInitialState();
  saveState(state);
  return state;
}

export function cryptoId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function toDateInputValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeState(state) {
  const migrated = {
    ...state,
    members: (state.members || demoMembers).map((member) => ({
      ...member,
      email: member.email || "",
      active: member.active ?? true
    })),
    transactions: (state.transactions || []).map((transaction) => ({
      ...transaction,
      signedAmount: transaction.signedAmount ?? (transaction.type === "income" ? transaction.amount : -transaction.amount),
      memberIds: transaction.memberIds || [transaction.memberId].filter(Boolean)
    }))
  };

  if (migrated.dataVersion !== DATA_VERSION) {
    rebuildFromImported2026(migrated);
    migrated.dataVersion = DATA_VERSION;
  }

  return migrated;
}

function rebuildFromImported2026(state) {
  state.openingBalance = imported2026OpeningBalance;
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  imported2026Members.forEach((member) => {
    if (!membersById.has(member.id)) {
      state.members.push({ ...member });
    }
  });

  state.transactions = structuredClone(imported2026Transactions);

  state.auditLogs ||= [];
  state.auditLogs.push({
    id: cryptoId(),
    at: new Date().toISOString(),
    actorId: state.activeMemberId || "member-tsai",
    action: "依 CSV 重建 2026 收支紀錄"
  });
}
