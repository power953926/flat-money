import { formatMoney } from "./format.js";
import { createCloudAccount, initCloudStore, isCloudConfigured, saveCloudState, signInToCloud, signOutFromCloud } from "./cloud-store.js";
import { cryptoId, loadState, normalizeState, resetState, saveState, toDateInputValue } from "./store.js";

let state = loadState();
let editingTransactionId = null;
let cloudEnabled = isCloudConfigured();
let cloudUser = null;
let suppressCloudSave = false;
let pendingBinding = null;

const els = {
  memberList: document.querySelector("#member-list"),
  memberMenu: document.querySelector("#member-menu"),
  transactionMenu: document.querySelector("#transaction-menu"),
  memberForm: document.querySelector("#member-form"),
  monthPicker: document.querySelector("#month-picker"),
  monthTitle: document.querySelector("#month-title"),
  balance: document.querySelector("#balance"),
  transactionForm: document.querySelector("#transaction-form"),
  editHint: document.querySelector("#edit-hint"),
  cancelEdit: document.querySelector("#cancel-edit"),
  memberSelect: document.querySelector('[name="memberId"]'),
  transactionsBody: document.querySelector("#transactions-body"),
  recordCount: document.querySelector("#record-count"),
  auditLog: document.querySelector("#audit-log"),
  seedDemo: document.querySelector("#seed-demo"),
  exportJson: document.querySelector("#export-json"),
  cloudStatus: document.querySelector("#cloud-status"),
  authForm: document.querySelector("#auth-form"),
  signOut: document.querySelector("#sign-out"),
  cloudHint: document.querySelector("#cloud-hint"),
  lockedView: document.querySelector("#locked-view")
};

init();

async function init() {
  render();
  initCloud();
  els.memberForm.addEventListener("submit", handleMemberSubmit);
  els.monthPicker.addEventListener("change", () => {
    state.selectedPeriod = els.monthPicker.value;
    persist("切換月份");
  });
  els.transactionForm.addEventListener("submit", handleTransactionSubmit);
  els.cancelEdit.addEventListener("click", cancelTransactionEdit);
  els.seedDemo.addEventListener("click", () => {
    state = resetState();
    cancelTransactionEdit(false);
    persist("重設資料");
  });
  els.exportJson.addEventListener("click", exportJson);
  els.authForm.addEventListener("submit", handleAuthSubmit);
  els.signOut.addEventListener("click", handleSignOut);
  document.addEventListener("click", (event) => {
    if (!els.memberMenu.contains(event.target)) closeMemberMenu();
    if (!els.transactionMenu.contains(event.target)) closeTransactionMenu();
  });
  window.addEventListener("scroll", closeMenus, { passive: true });
  window.addEventListener("resize", closeMenus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenus();
    }
  });
  els.memberMenu.addEventListener("click", handleMemberMenuAction);
  els.transactionMenu.addEventListener("click", handleTransactionMenuAction);
  els.memberMenu.addEventListener("click", (event) => event.stopPropagation());
  els.transactionMenu.addEventListener("click", (event) => event.stopPropagation());
}

async function initCloud() {
  cloudEnabled = isCloudConfigured();
  renderCloudStatus();
  if (!cloudEnabled) return;

  try {
    await initCloudStore({
      getLocalState: () => state,
      onAuth: ({ user }) => {
        cloudUser = user;
        applyCurrentUserMember();
        renderCloudStatus();
      },
      onRemoteState: (remoteState) => {
        if (shouldIgnoreRemoteState(remoteState)) return;
        const remoteDataVersion = remoteState?.dataVersion || "";
        suppressCloudSave = true;
        state = normalizeState(remoteState);
        const shouldSaveMigration = state.dataVersion !== remoteDataVersion;
        if (pendingBinding && hasMemberEmail(state, pendingBinding.memberId, pendingBinding.email)) {
          pendingBinding = null;
        }
        applyCurrentUserMember();
        saveState(state);
        cancelTransactionEdit(false);
        render();
        suppressCloudSave = false;
        if (shouldSaveMigration) {
          saveCloudState(state).catch((error) => {
            els.cloudStatus.textContent = `雲端重建失敗：${error.message}`;
          });
        }
      }
    });
  } catch (error) {
    els.cloudStatus.textContent = `雲端初始化失敗：${error.message}`;
  }
}

function render() {
  applyCurrentUserMember();
  renderMemberOptions();
  renderSummary();
  renderTransactions();
  renderAuditLog();
  renderCloudStatus();
  renderAccessState();
  saveState(state);
}

function renderCloudStatus() {
  if (!els.cloudStatus) return;

  if (!cloudEnabled) {
    els.cloudStatus.textContent = "本機模式：尚未填入 Firebase 設定";
    els.authForm.hidden = false;
    els.cloudHint.hidden = false;
    setAuthFormDisabled(true);
    els.signOut.hidden = true;
    return;
  }

  if (cloudUser) {
    const member = currentBoundMember();
    els.cloudStatus.textContent = member
      ? `已同步：${cloudUser.email}（${member.name}）`
      : canBootstrapBinding()
        ? `已登入：${cloudUser.email}，請先將帳號綁定成員`
        : `已登入：${cloudUser.email}，尚未綁定成員`;
    els.authForm.hidden = true;
    els.cloudHint.hidden = true;
    setAuthFormDisabled(false);
    els.signOut.hidden = false;
    return;
  }

  els.cloudStatus.textContent = "雲端模式：請登入";
  els.authForm.hidden = false;
  els.cloudHint.hidden = false;
  setAuthFormDisabled(false);
  els.signOut.hidden = true;
}

function setAuthFormDisabled(disabled) {
  els.authForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });
}

function renderAccessState() {
  const locked = cloudEnabled && !cloudUser;
  els.lockedView.hidden = !locked;
  document.body.classList.toggle("is-locked", locked);
  setEditingDisabled(!canEdit());
}

function setEditingDisabled(disabled) {
  els.memberForm.querySelectorAll("input, button").forEach((element) => {
    element.disabled = disabled;
  });
  els.transactionForm.querySelectorAll("input, select, button").forEach((element) => {
    element.disabled = disabled;
  });
  els.seedDemo.disabled = disabled;
}

function canEdit() {
  if (!cloudEnabled) return true;
  return Boolean(cloudUser && currentBoundMember());
}

function canManageMemberBinding(memberId = null) {
  if (!cloudEnabled) return true;
  if (!cloudUser) return false;
  if (currentBoundMember() || canBootstrapBinding()) return true;
  if (!memberId) return false;
  const member = state.members.find((item) => item.id === memberId);
  return Boolean(member?.active && !member.email);
}

function canBootstrapBinding() {
  if (!cloudUser) return false;
  return !state.members.some((member) => member.email);
}

function currentBoundMember() {
  if (!cloudUser?.email) return null;
  const email = cloudUser.email.toLowerCase();
  return state.members.find((member) => member.active && member.email?.toLowerCase() === email) || null;
}

function applyCurrentUserMember() {
  const member = currentBoundMember();
  if (member) state.activeMemberId = member.id;
}

function renderMemberOptions() {
  const activeMembers = state.members.filter((member) => member.active);
  if (!activeMembers.some((member) => member.id === state.activeMemberId)) {
    state.activeMemberId = activeMembers[0]?.id || "";
  }

  const activeOptions = activeMembers.map((member) => `<option value="${member.id}">${escapeHtml(member.name)}</option>`).join("");
  els.memberSelect.innerHTML = activeOptions;
  if (!editingTransactionId) {
    els.memberSelect.value = state.activeMemberId;
  }
  els.transactionForm.querySelector(".primary").disabled = activeMembers.length === 0;
  els.monthPicker.value = state.selectedPeriod;
  renderMemberList();
  setEditingDisabled(!canEdit());

  els.transactionForm.elements.date.value ||= toDateInputValue();
}

function renderMemberList() {
  els.memberList.innerHTML = state.members
    .map((member) => {
      const activeClass = member.id === state.activeMemberId ? "is-current" : "";
      return `
        <button class="member-name ${activeClass} ${member.active ? "" : "is-disabled"}" data-member-id="${member.id}" type="button">
          <span>${escapeHtml(member.name)}</span>
          ${member.active ? "" : `<small>停用</small>`}
        </button>
        <button class="member-menu-button" data-member-menu="${member.id}" type="button" aria-label="開啟成員操作選單">...</button>
      `;
    })
    .join("");

  els.memberList.querySelectorAll("[data-member-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const member = state.members.find((item) => item.id === button.dataset.memberId);
      if (!member?.active || !canEdit()) return;
      state.activeMemberId = member.id;
      persist("切換目前使用者");
    });
  });
  els.memberList.querySelectorAll("[data-member-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      openMemberMenu(button.dataset.memberMenu, rect.left, rect.bottom + 4);
    });
  });
}

function renderSummary() {
  const balance = currentMonthEndingBalance();

  els.monthTitle.textContent = `${state.selectedPeriod} 總覽`;
  els.balance.textContent = formatMoney(balance);
  els.balance.classList.toggle("negative", balance < 0);
}

function renderTransactions() {
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  const balanceById = calculateRunningBalances();
  const records = currentTransactions().sort(compareTransactionsDesc);
  els.recordCount.textContent = `${records.length} 筆`;
  els.transactionsBody.innerHTML = records.length
    ? records
        .map((item) => `
          <tr data-transaction-id="${item.id}">
            <td data-label="日期">${item.date}</td>
            <td data-label="類型"><span class="type-badge ${item.type}">${item.type === "income" ? "收入" : "支出"}</span></td>
            <td data-label="項目">${escapeHtml(item.title)}</td>
            <td data-label="付款人" data-category="${escapeHtml(item.category)}">${escapeHtml(memberNames(item, membersById))}</td>
            <td data-label="分類">${escapeHtml(item.category)}</td>
            <td data-label="金額" class="numeric amount ${item.type}">${formatMoney(item.amount)}</td>
            <td data-label="當筆餘額" class="numeric running-balance ${balanceById.get(item.id) < 0 ? "negative" : ""}">${formatMoney(balanceById.get(item.id))}</td>
            <td data-label="操作" class="action-col">
              <button class="row-menu-button" data-transaction-menu="${item.id}" type="button" aria-label="開啟操作選單">...</button>
            </td>
          </tr>
        `)
        .join("")
    : `<tr><td colspan="8">這個月份還沒有紀錄。</td></tr>`;

  els.transactionsBody.querySelectorAll("[data-transaction-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      openTransactionMenu(button.dataset.transactionMenu, rect.left, rect.bottom + 4);
    });
  });
}

function renderAuditLog() {
  const membersById = new Map(state.members.map((member) => [member.id, member]));
  els.auditLog.innerHTML = state.auditLogs
    .slice(-8)
    .reverse()
    .map((log) => `<li>${formatDateTime(log.at)} · ${membersById.get(log.actorId)?.name || "系統"} · ${escapeHtml(log.action)}</li>`)
    .join("");
}

function handleTransactionSubmit(event) {
  event.preventDefault();
  if (!canEdit()) return;
  const data = new FormData(els.transactionForm);
  const type = data.get("type");
  const amount = Number(data.get("amount"));
  const transaction = {
    id: editingTransactionId || cryptoId(),
    createdAt: editingTransactionId ? state.transactions.find((item) => item.id === editingTransactionId)?.createdAt : new Date().toISOString(),
    type,
    date: data.get("date"),
    title: data.get("title").trim(),
    amount,
    signedAmount: type === "income" ? amount : -amount,
    memberId: data.get("memberId"),
    memberIds: [data.get("memberId")],
    category: data.get("category"),
    note: data.get("note").trim()
  };

  if (editingTransactionId) {
    const index = state.transactions.findIndex((item) => item.id === editingTransactionId);
    if (index >= 0) {
      state.transactions[index] = {
        ...state.transactions[index],
        ...transaction,
        sourceBalance: null
      };
    }
    addAudit(`修改紀錄：${transaction.title} ${formatMoney(transaction.amount)}`);
  } else {
    state.transactions.push(transaction);
    addAudit(`新增${transaction.type === "income" ? "收入" : "支出"}：${transaction.title} ${formatMoney(transaction.amount)}`);
  }

  state.selectedPeriod = transaction.date.slice(0, 7);
  persist("新增收支");
  resetTransactionForm();
}

function handleMemberSubmit(event) {
  event.preventDefault();
  if (!canEdit()) return;
  const name = new FormData(els.memberForm).get("memberName").trim();
  if (!name) return;

  const member = {
    id: cryptoId(),
    name,
    active: true
  };
  state.members.push(member);
  state.activeMemberId = member.id;
  addAudit(`新增成員：${name}`);
  els.memberForm.reset();
  persist("新增成員");
}

function renameMember(memberId) {
  if (!canEdit()) return;
  const member = state.members.find((item) => item.id === memberId);
  const nextName = prompt("新的成員名稱", member?.name || "")?.trim();
  if (!member || !nextName || member.name === nextName) return;

  const previousName = member.name;
  member.name = nextName;
  addAudit(`成員改名：${previousName} 改為 ${nextName}`);
  persist("成員改名");
}

function deleteMember(memberId) {
  if (!canEdit()) return;
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;

  const hasRecords = state.transactions.some((item) => item.memberId === memberId || item.memberIds?.includes(memberId));
  if (hasRecords) {
    member.active = false;
    addAudit(`停用成員：${member.name}`);
  } else {
    state.members = state.members.filter((item) => item.id !== memberId);
    addAudit(`刪除成員：${member.name}`);
  }

  const activeMembers = state.members.filter((item) => item.active);
  if (state.activeMemberId === memberId) {
    state.activeMemberId = activeMembers[0]?.id || "";
  }
  persist("刪除成員");
}

function openMemberMenu(memberId, x, y) {
  closeTransactionMenu();
  els.memberMenu.dataset.memberId = memberId;
  els.memberMenu.style.left = `${x}px`;
  els.memberMenu.style.top = `${y}px`;
  els.memberMenu.hidden = false;
}

function closeMemberMenu() {
  els.memberMenu.hidden = true;
  delete els.memberMenu.dataset.memberId;
}

function closeMenus() {
  closeMemberMenu();
  closeTransactionMenu();
}

function handleMemberMenuAction(event) {
  const action = event.target.dataset.action;
  const memberId = els.memberMenu.dataset.memberId;
  if (!action || !memberId) return;
  if (!canEdit() && !["bind-email", "clear-email"].includes(action)) return;
  if (action === "bind-email" && !canManageMemberBinding(memberId)) {
    alert("這位成員已綁定帳號，請確認是否點到正確名字。");
    return;
  }
  if (action === "clear-email" && !canManageMemberBinding()) return;

  if (action === "rename") renameMember(memberId);
  if (action === "bind-email") bindMemberEmail(memberId);
  if (action === "clear-email") clearMemberEmail(memberId);
  if (action === "delete" && confirm("確定要刪除或停用這位成員嗎？")) deleteMember(memberId);
  closeMemberMenu();
}

function bindMemberEmail(memberId) {
  if (!cloudUser?.email) return;
  const member = state.members.find((item) => item.id === memberId);
  if (!member) return;
  if (member.email && member.email.toLowerCase() !== cloudUser.email.toLowerCase()) {
    alert("這位成員已經綁定其他帳號，請確認是否點到正確名字。");
    return;
  }
  const confirmed = confirm(`確定要將目前登入帳號 ${cloudUser.email} 綁定到「${member.name}」嗎？`);
  if (!confirmed) return;

  state.members.forEach((item) => {
    if (item.email?.toLowerCase() === cloudUser.email.toLowerCase()) item.email = "";
  });
  member.email = cloudUser.email;
  pendingBinding = { memberId, email: cloudUser.email };
  state.activeMemberId = member.id;
  addAudit(`綁定帳號：${member.name} ${cloudUser.email}`);
  persist("綁定帳號");
}

function clearMemberEmail(memberId) {
  const member = state.members.find((item) => item.id === memberId);
  if (!member?.email) return;
  addAudit(`解除帳號綁定：${member.name} ${member.email}`);
  member.email = "";
  persist("解除帳號綁定");
}

function deleteTransaction(id) {
  if (!canEdit()) return;
  const item = state.transactions.find((record) => record.id === id);
  state.transactions = state.transactions.filter((record) => record.id !== id);
  if (editingTransactionId === id) resetTransactionForm();
  addAudit(`刪除紀錄：${item?.title || id}`);
  persist("刪除收支");
}

function editTransaction(id) {
  if (!canEdit()) return;
  const transaction = state.transactions.find((item) => item.id === id);
  if (!transaction) return;

  editingTransactionId = id;
  els.transactionForm.elements.type.value = transaction.type;
  els.transactionForm.elements.date.value = transaction.date;
  els.transactionForm.elements.title.value = transaction.title;
  els.transactionForm.elements.amount.value = transaction.amount;
  els.transactionForm.elements.memberId.value = transaction.memberId;
  els.transactionForm.elements.category.value = transaction.category;
  els.transactionForm.elements.note.value = transaction.note || "";
  els.transactionForm.querySelector(".primary").textContent = "儲存修改";
  els.editHint.hidden = false;
  els.cancelEdit.hidden = false;
  els.transactionForm.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelTransactionEdit(shouldRender = true) {
  editingTransactionId = null;
  resetTransactionForm();
  if (shouldRender) render();
}

function resetTransactionForm() {
  editingTransactionId = null;
  els.transactionForm.reset();
  els.transactionForm.elements.date.value = toDateInputValue();
  els.memberSelect.value = state.activeMemberId;
  els.transactionForm.querySelector(".primary").textContent = "新增紀錄";
  els.editHint.hidden = true;
  els.cancelEdit.hidden = true;
}

function openTransactionMenu(transactionId, x, y) {
  closeMemberMenu();
  els.transactionMenu.dataset.transactionId = transactionId;
  els.transactionMenu.style.left = `${x}px`;
  els.transactionMenu.style.top = `${y}px`;
  els.transactionMenu.hidden = false;
}

function closeTransactionMenu() {
  els.transactionMenu.hidden = true;
  delete els.transactionMenu.dataset.transactionId;
}

function handleTransactionMenuAction(event) {
  const action = event.target.dataset.action;
  const transactionId = els.transactionMenu.dataset.transactionId;
  if (!action || !transactionId) return;
  if (!canEdit()) return;

  if (action === "edit") editTransaction(transactionId);
  if (action === "delete" && confirm("確定要刪除這筆收支紀錄嗎？")) deleteTransaction(transactionId);
  closeTransactionMenu();
}

function exportJson() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bubu-house-fund-${state.selectedPeriod}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function currentTransactions() {
  return state.transactions.filter((item) => item.date.startsWith(state.selectedPeriod));
}

function calculateRunningBalances() {
  const balances = new Map();
  let running = Number(state.openingBalance || 0);
  chronologicalTransactions().forEach((transaction) => {
    running += signedAmount(transaction);
    balances.set(transaction.id, running);
  });
  return balances;
}

function currentMonthEndingBalance() {
  const balances = calculateRunningBalances();
  const records = currentTransactions().sort(compareTransactionsAsc);
  const last = records.at(-1);
  if (last) return balances.get(last.id) || 0;

  const previous = chronologicalTransactions()
    .filter((transaction) => transaction.date < `${state.selectedPeriod}-01`)
    .at(-1);
  return previous ? balances.get(previous.id) || 0 : Number(state.openingBalance || 0);
}

function chronologicalTransactions() {
  return [...state.transactions].sort(compareTransactionsAsc);
}

function compareTransactionsAsc(a, b) {
  return a.date.localeCompare(b.date) || transactionOrderValue(a) - transactionOrderValue(b);
}

function compareTransactionsDesc(a, b) {
  return b.date.localeCompare(a.date) || transactionOrderValue(b) - transactionOrderValue(a);
}

function transactionOrderValue(transaction) {
  const createdAt = Date.parse(transaction.createdAt || "");
  const index = state.transactions.findIndex((item) => item.id === transaction.id);
  if (Number.isFinite(createdAt)) return (createdAt * 100000) + index;
  return index;
}

function signedAmount(transaction) {
  if (Number.isFinite(transaction.signedAmount)) return Number(transaction.signedAmount);
  return transaction.type === "income" ? Number(transaction.amount || 0) : -Number(transaction.amount || 0);
}

function persist() {
  saveState(state);
  if (!suppressCloudSave) {
    saveCloudState(state).catch((error) => {
      pendingBinding = null;
      els.cloudStatus.textContent = `雲端儲存失敗：${error.message}`;
    });
  }
  render();
}

function shouldIgnoreRemoteState(remoteState) {
  if (!pendingBinding) return false;
  const normalizedRemote = normalizeState(remoteState);
  return !hasMemberEmail(normalizedRemote, pendingBinding.memberId, pendingBinding.email);
}

function hasMemberEmail(targetState, memberId, email) {
  return targetState.members?.some((member) => (
    member.id === memberId && member.email?.toLowerCase() === email.toLowerCase()
  ));
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const submitter = event.submitter;
  const data = new FormData(els.authForm);
  const email = data.get("email")?.trim();
  const password = data.get("password")?.trim();
  if (!email || !password) return;

  try {
    if (submitter?.dataset.authAction === "sign-up") {
      await createCloudAccount(email, password);
    } else {
      await signInToCloud(email, password);
    }
    els.authForm.reset();
  } catch (error) {
    els.cloudStatus.textContent = `登入失敗：${error.message}`;
  }
}

async function handleSignOut() {
  try {
    await signOutFromCloud();
  } catch (error) {
    els.cloudStatus.textContent = `登出失敗：${error.message}`;
  }
}

function addAudit(action) {
  state.auditLogs.push({
    id: cryptoId(),
    at: new Date().toISOString(),
    actorId: state.activeMemberId,
    action
  });
}

function memberNames(transaction, membersById) {
  const ids = transaction.memberIds?.length ? transaction.memberIds : [transaction.memberId];
  return ids.map((id) => membersById.get(id)?.name || "未知").join("、");
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
