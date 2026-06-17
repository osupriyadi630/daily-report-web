import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig || firebaseConfig.apiKey === "ISI_API_KEY_ANDA") {
  alert("Firebase belum dikonfigurasi. Buat web/firebase-config.js dari firebase-config.example.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let unsubscribeTasks = null;
let state = {
  tasks: [],
  reports: [],
  today: getToday(),
  filter: "all",
  activeView: "dashboard",
  syncMessage: "Menunggu login...",
  authMode: "login"
};

const statusToList = {
  "Belum Selesai": "todoList",
  "Proses": "progressList",
  "Selesai": "doneList"
};

document.addEventListener("DOMContentLoaded", bindControls);

function bindControls() {
  document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
  document.getElementById("loginModeButton").addEventListener("click", () => setAuthMode("login"));
  document.getElementById("registerModeButton").addEventListener("click", () => setAuthMode("register"));
  document.getElementById("logoutButton").addEventListener("click", () => signOut(auth));
  document.getElementById("newTaskButton").addEventListener("click", openTaskModal);
  document.getElementById("newTaskButtonTable").addEventListener("click", openTaskModal);
  document.getElementById("taskForm").addEventListener("submit", saveTask);
  document.getElementById("cancelTaskButton").addEventListener("click", closeTaskModal);
  document.getElementById("closeTaskModalButton").addEventListener("click", closeTaskModal);
  document.getElementById("createReportButton").addEventListener("click", createReport);
  document.getElementById("createReportButtonReports").addEventListener("click", createReport);
  document.getElementById("exportCsvButton").addEventListener("click", exportTasksCsv);
  document.getElementById("sendAllButton").addEventListener("click", sendAllReminders);
  document.getElementById("sendSelectedButton").addEventListener("click", sendSelectedReminders);
  document.getElementById("closePreviewModalButton").addEventListener("click", closePreviewModal);
  document.getElementById("closePreviewFooterButton").addEventListener("click", closePreviewModal);
  document.getElementById("searchInput").addEventListener("input", render);
  document.getElementById("statusFilter").addEventListener("change", render);
  document.getElementById("taskDate").addEventListener("input", event => closeDatePicker(event.target));
  document.getElementById("taskDate").addEventListener("change", event => closeDatePicker(event.target));
  document.getElementById("taskDeadline").addEventListener("input", event => closeDatePicker(event.target));
  document.getElementById("taskDeadline").addEventListener("change", event => closeDatePicker(event.target));

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  document.querySelectorAll(".toolbar .segment").forEach(button => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".toolbar .segment").forEach(item => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      render();
    });
  });
}

onAuthStateChanged(auth, user => {
  currentUser = user;
  document.getElementById("authView").classList.toggle("hidden", !!user);
  document.getElementById("appView").classList.toggle("hidden", !user);

  if (unsubscribeTasks) unsubscribeTasks();

  if (user) {
    document.getElementById("userEmail").textContent = user.email;
    state.tasks = loadCachedTasks(user);
    state.syncMessage = state.tasks.length
      ? "Menampilkan cadangan lokal. Sinkronisasi Firebase berjalan..."
      : "Memuat data dari Firebase...";
    render();
    watchTasks(user.uid);
  } else {
    state.tasks = [];
    state.syncMessage = "Menunggu login...";
    render();
  }
});

function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  document.getElementById("authMessage").textContent = "";
  document.getElementById("authTitle").textContent = isRegister ? "Daftar" : "Masuk";
  document.getElementById("authHint").textContent = isRegister
    ? "Buat akun baru dengan email dan password."
    : "Masuk untuk membuka dashboard tugas dan laporan.";
  document.getElementById("authSubmitButton").textContent = isRegister ? "Daftar" : "Masuk";
  document.getElementById("loginModeButton").classList.toggle("active", !isRegister);
  document.getElementById("registerModeButton").classList.toggle("active", isRegister);
}

function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.authMode === "register") {
    handleRegister();
    return;
  }
  handleLogin();
}

async function handleLogin(event) {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;
  setAuthMessage("Memproses masuk...");
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setAuthMessage("");
  } catch (error) {
    setAuthMessage(getAuthErrorMessage(error));
  }
}

async function handleRegister() {
  const email = document.getElementById("authEmail").value;
  const password = document.getElementById("authPassword").value;
  if (!email || !password) {
    setAuthMessage("Isi email dan password dulu.");
    return;
  }
  setAuthMessage("Mendaftarkan akun...");
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    setAuthMessage("");
  } catch (error) {
    setAuthMessage(getAuthErrorMessage(error));
  }
}

function setAuthMessage(message) {
  document.getElementById("authMessage").textContent = message;
}

function getAuthErrorMessage(error) {
  const code = error.code || "";
  if (code.includes("invalid-credential") || code.includes("wrong-password")) {
    return "Email atau password salah. Periksa kembali lalu coba masuk.";
  }
  if (code.includes("user-not-found")) return "Akun belum terdaftar. Pilih Daftar untuk membuat akun.";
  if (code.includes("email-already-in-use")) return "Email ini sudah terdaftar. Pilih Masuk.";
  if (code.includes("weak-password")) return "Password minimal 6 karakter.";
  if (code.includes("invalid-email")) return "Format email belum benar.";
  return error.message || "Terjadi masalah login.";
}

function watchTasks(uid) {
  const tasksQuery = query(
    collection(db, "tasks"),
    where("ownerUid", "==", uid)
  );

  unsubscribeTasks = onSnapshot(tasksQuery, snapshot => {
    const remoteTasks = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
    const cachedTasks = loadCachedTasks(currentUser || uid);

    if (!remoteTasks.length && cachedTasks.length) {
      state.tasks = cachedTasks;
      state.syncMessage = "Firebase belum mengirim data. Menampilkan cadangan lokal terakhir.";
    } else {
      state.tasks = remoteTasks;
      saveTasksToCache(currentUser || uid, state.tasks);
      state.syncMessage = "Tersinkron dengan Firebase.";
    }
    render();
  }, error => {
    state.tasks = loadCachedTasks(currentUser || uid);
    state.syncMessage = "Firebase gagal dibaca. Menampilkan cadangan lokal.";
    render();
    alert(error.message);
  });
}

function render() {
  renderView();
  renderStats();
  renderTasks();
  renderTasksTable();
  renderReports();
  renderRecipients();
  renderAgenda();
  renderFocusList();
  renderAttentionBanner();
  document.getElementById("todayText").textContent = `Hari ini: ${formatHumanDate(state.today)}`;
  document.getElementById("syncStatus").textContent = state.syncMessage;
  document.getElementById("emailBridgeStatus").textContent = window.EMAIL_BRIDGE_URL
    ? "Email bridge aktif. Pengiriman email memakai Apps Script."
    : "Belum aktif. Tombol email akan membuka aplikasi email melalui mailto.";
}

function setView(view) {
  state.activeView = view;
  renderView();
}

function renderView() {
  const titles = { dashboard: "Dashboard", tasks: "Tugas", reports: "Laporan", settings: "Pengaturan" };
  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.view === state.activeView);
  });
  document.querySelectorAll(".view").forEach(view => {
    view.classList.toggle("active", view.id === `${state.activeView}View`);
  });
  document.getElementById("pageTitle").textContent = titles[state.activeView] || "Dashboard";
}

function renderStats() {
  const stats = buildStats(getFilteredTasks(false));
  document.getElementById("statTotal").textContent = stats.total;
  document.getElementById("statDone").textContent = stats.selesai;
  document.getElementById("statProgress").textContent = stats.proses;
  document.getElementById("statLate").textContent = stats.terlambat;
}

function renderTasks() {
  Object.values(statusToList).forEach(id => document.getElementById(id).innerHTML = "");
  const tasks = getFilteredTasks(true);

  tasks.forEach(task => {
    const targetId = statusToList[task.status] || "todoList";
    document.getElementById(targetId).insertAdjacentHTML("beforeend", taskCard(task));
  });

  Object.values(statusToList).forEach(id => {
    const list = document.getElementById(id);
    if (!list.children.length) list.innerHTML = '<p class="empty">Tidak ada tugas.</p>';
  });
}

function renderTasksTable() {
  const body = document.getElementById("tasksTableBody");
  const tasks = getFilteredTasks(true);
  body.innerHTML = tasks.length
    ? tasks.map(task => `
        <tr>
          <td>${escapeHtml(task.tanggal)}</td>
          <td><strong>${escapeHtml(task.namaTugas)}</strong><small>${escapeHtml(task.catatan || "")}</small></td>
          <td><span class="chip priority-${String(task.prioritas || "").toLowerCase()}">${escapeHtml(task.prioritas)}</span></td>
          <td><span class="chip">${escapeHtml(task.status)}</span></td>
          <td>${escapeHtml(task.deadline || "-")}</td>
          <td>${escapeHtml(task.penanggungJawab || "-")}<small>${escapeHtml(task.emailPenanggungJawab || "")}</small></td>
          <td class="table-actions">
            ${task.status !== "Proses" && task.status !== "Selesai" ? `<button class="link-button" data-action="start" data-id="${task.id}">Mulai</button>` : ""}
            ${task.status !== "Selesai" ? `<button class="link-button" data-action="done" data-id="${task.id}">Selesai</button>` : ""}
            <button class="link-button" data-action="preview" data-id="${task.id}">Preview</button>
            <button class="link-button" data-action="email" data-id="${task.id}">Email</button>
            <button class="link-button" data-action="edit" data-id="${task.id}">Edit</button>
            <button class="link-button" data-action="delete" data-id="${task.id}">Hapus</button>
          </td>
        </tr>
      `).join("")
    : '<tr><td colspan="7">Tidak ada tugas.</td></tr>';

  body.querySelectorAll("[data-action]").forEach(button => bindTaskAction(button));
}

function renderReports() {
  const list = document.getElementById("reportsList");
  list.innerHTML = state.reports.length
    ? state.reports.map(report => `<article class="report-item"><pre>${escapeHtml(report)}</pre></article>`).join("")
    : '<p>Belum ada laporan. Klik tombol "Buat Laporan Hari Ini".</p>';
}

function renderRecipients() {
  const list = document.getElementById("recipientList");
  const recipients = [...new Set(state.tasks.map(task => String(task.emailPenanggungJawab || "").trim()).filter(Boolean))].sort();
  list.innerHTML = recipients.length
    ? recipients.map(email => `
        <label class="check-row">
          <input type="checkbox" value="${escapeHtml(email)}" checked>
          <span>${escapeHtml(email)}</span>
        </label>
      `).join("")
    : "<p>Belum ada email penanggung jawab pada tugas.</p>";
}

function renderAgenda() {
  const active = state.tasks
    .filter(task => task.status !== "Selesai")
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 6);

  document.getElementById("agendaList").innerHTML = active.length
    ? active.map(task => `<div class="task-meta"><strong>${escapeHtml(task.namaTugas)}</strong><span>${escapeHtml(task.deadline || task.tanggal)}</span></div>`).join("")
    : "Tidak ada agenda aktif.";
}

function renderFocusList() {
  const focusTasks = getFocusTasks().slice(0, 5);
  const list = document.getElementById("focusList");
  list.innerHTML = focusTasks.length
    ? focusTasks.map(task => {
        const urgency = getUrgency(task);
        return `
          <article class="focus-item">
            <div>
              <strong>${escapeHtml(task.namaTugas)}</strong>
              <small>${escapeHtml(task.deadline || task.tanggal || "-")}</small>
            </div>
            <span class="urgency ${urgency.className}">${urgency.label}</span>
          </article>
        `;
      }).join("")
    : "<p>Tidak ada tugas yang perlu difokuskan.</p>";
}

function renderAttentionBanner() {
  const activeTasks = state.tasks.filter(task => task.status !== "Selesai").map(task => ({ ...task, terlambat: isOverdue(task) }));
  const late = activeTasks.filter(task => task.terlambat).length;
  const today = activeTasks.filter(task => task.tanggal === state.today).length;
  const high = activeTasks.filter(task => task.prioritas === "Tinggi").length;
  const banner = document.getElementById("attentionBanner");

  if (!late && !today && !high) {
    banner.classList.add("hidden");
    banner.innerHTML = "";
    return;
  }

  banner.classList.remove("hidden");
  banner.innerHTML = `
    <div>
      <strong>Perhatian hari ini</strong>
      <p>${late} terlambat, ${today} dijadwalkan hari ini, ${high} prioritas tinggi.</p>
    </div>
    <button class="secondary-button" data-filter-shortcut="late">Lihat Terlambat</button>
  `;
}

function getFilteredTasks(useUi) {
  const keyword = useUi ? document.getElementById("searchInput").value.toLowerCase() : "";
  const status = useUi ? document.getElementById("statusFilter").value : "all";

  return state.tasks.map(task => ({ ...task, terlambat: isOverdue(task) })).filter(task => {
    const matchKeyword = !keyword ||
      String(task.namaTugas || "").toLowerCase().includes(keyword) ||
      String(task.catatan || "").toLowerCase().includes(keyword);
    const matchStatus = status === "all" || task.status === status;
    const matchSegment =
      state.filter === "all" ||
      (state.filter === "today" && task.tanggal === state.today) ||
      (state.filter === "late" && task.terlambat);
    return matchKeyword && matchStatus && matchSegment;
  });
}

function taskCard(task) {
  const priorityClass = `priority-${String(task.prioritas || "").toLowerCase()}`;
  const lateChip = task.terlambat ? '<span class="chip late">Terlambat</span>' : "";
  const preview = buildTaskPreview(task);
  const urgency = getUrgency(task);

  return `
    <article class="task-card">
      <div>
        <h3>${escapeHtml(task.namaTugas)}</h3>
        <div class="task-meta">
          <span class="chip ${priorityClass}">${escapeHtml(task.prioritas)}</span>
          <span class="chip">${escapeHtml(task.status)}</span>
          <span class="urgency ${urgency.className}">${urgency.label}</span>
          ${lateChip}
        </div>
      </div>
      <div class="task-meta">
        <span>Deadline: ${escapeHtml(task.deadline || "-")}</span>
        <span>PJ: ${escapeHtml(task.penanggungJawab || "-")}</span>
        <span>${escapeHtml(task.emailPenanggungJawab || "")}</span>
      </div>
      <div class="task-preview">${escapeHtml(preview)}</div>
      <p>${escapeHtml(task.catatan || "")}</p>
      <div class="card-actions">
        ${task.status !== "Proses" && task.status !== "Selesai" ? `<button class="link-button" data-action="start" data-id="${task.id}">Mulai</button>` : ""}
        ${task.status !== "Selesai" ? `<button class="link-button" data-action="done" data-id="${task.id}">Selesai</button>` : ""}
        <button class="link-button" data-action="preview" data-id="${task.id}">Preview</button>
        <button class="link-button" data-action="email" data-id="${task.id}">Email</button>
        <button class="link-button" data-action="edit" data-id="${task.id}">Edit</button>
        <button class="link-button" data-action="delete" data-id="${task.id}">Hapus</button>
      </div>
    </article>
  `;
}

document.addEventListener("click", event => {
  const filterShortcut = event.target.closest("[data-filter-shortcut]");
  if (filterShortcut) {
    state.filter = filterShortcut.dataset.filterShortcut;
    document.querySelectorAll(".toolbar .segment").forEach(item => {
      item.classList.toggle("active", item.dataset.filter === state.filter);
    });
    render();
    return;
  }

  const button = event.target.closest("[data-action]");
  if (button) bindTaskAction(button, true);
});

function bindTaskAction(button, runNow = false) {
  const action = button.dataset.action;
  const id = button.dataset.id;
  if (!runNow) return;
  if (action === "preview") previewTask(id);
  if (action === "email") sendTaskEmail(id);
  if (action === "start") setTaskStatus(id, "Proses");
  if (action === "done") setTaskStatus(id, "Selesai");
  if (action === "edit") editTask(id);
  if (action === "delete") removeTask(id);
}

function openTaskModal() {
  document.getElementById("modalTitle").textContent = "Tugas Baru";
  document.getElementById("taskId").value = "";
  document.getElementById("taskName").value = "";
  document.getElementById("taskDate").value = state.today;
  document.getElementById("taskDeadline").value = "";
  document.getElementById("taskPriority").value = "Sedang";
  document.getElementById("taskStatus").value = "Belum Selesai";
  document.getElementById("taskOwner").value = "";
  document.getElementById("taskOwnerEmail").value = "";
  document.getElementById("taskNote").value = "";
  document.getElementById("taskModal").showModal();
}

function closeTaskModal() {
  document.getElementById("taskModal").close();
}

function closeDatePicker(input) {
  if (!input.value) return;
  window.setTimeout(() => {
    const currentType = input.type;
    input.blur();
    input.type = "text";
    input.type = currentType;
  }, 80);
}

async function saveTask(event) {
  event.preventDefault();
  if (!currentUser) return;

  const id = document.getElementById("taskId").value;
  const payload = {
    ownerUid: currentUser.uid,
    tanggal: document.getElementById("taskDate").value,
    namaTugas: document.getElementById("taskName").value.trim(),
    prioritas: document.getElementById("taskPriority").value,
    status: document.getElementById("taskStatus").value,
    deadline: document.getElementById("taskDeadline").value,
    penanggungJawab: document.getElementById("taskOwner").value.trim(),
    emailPenanggungJawab: document.getElementById("taskOwnerEmail").value.trim(),
    catatan: document.getElementById("taskNote").value.trim(),
    updatedAt: serverTimestamp()
  };

  try {
    if (id) {
      updateTaskCache(currentUser, { id, ...payload });
      state.tasks = loadCachedTasks(currentUser);
      state.syncMessage = "Tugas disimpan di perangkat. Mengirim ke Firebase...";
      render();
      closeTaskModal();
      await updateDoc(doc(db, "tasks", id), payload);
    } else {
      const taskRef = doc(collection(db, "tasks"));
      updateTaskCache(currentUser, { id: taskRef.id, ...payload });
      state.tasks = loadCachedTasks(currentUser);
      state.syncMessage = "Tugas disimpan di perangkat. Mengirim ke Firebase...";
      render();
      closeTaskModal();
      await setDoc(taskRef, { ...payload, createdAt: serverTimestamp() });
    }
    state.syncMessage = "Tugas berhasil disimpan dan tersinkron.";
    state.tasks = loadCachedTasks(currentUser);
    render();
  } catch (error) {
    state.syncMessage = "Firebase gagal menyimpan. Tugas tetap ada di cadangan lokal perangkat ini.";
    render();
    alert(error.message);
  }
}

function editTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return alert("Tugas tidak ditemukan.");
  document.getElementById("modalTitle").textContent = "Edit Tugas";
  document.getElementById("taskId").value = task.id;
  document.getElementById("taskName").value = task.namaTugas || "";
  document.getElementById("taskDate").value = task.tanggal || state.today;
  document.getElementById("taskDeadline").value = task.deadline || "";
  document.getElementById("taskPriority").value = task.prioritas || "Sedang";
  document.getElementById("taskStatus").value = task.status || "Belum Selesai";
  document.getElementById("taskOwner").value = task.penanggungJawab || "";
  document.getElementById("taskOwnerEmail").value = task.emailPenanggungJawab || "";
  document.getElementById("taskNote").value = task.catatan || "";
  document.getElementById("taskModal").showModal();
}

async function removeTask(id) {
  if (!confirm("Hapus tugas ini?")) return;
  try {
    removeTaskFromCache(currentUser, id);
    state.tasks = loadCachedTasks(currentUser);
    state.syncMessage = "Tugas dihapus dari perangkat. Mengirim ke Firebase...";
    render();
    await deleteDoc(doc(db, "tasks", id));
    state.syncMessage = "Tugas berhasil dihapus.";
    render();
  } catch (error) {
    alert(error.message);
  }
}

async function setTaskStatus(id, status) {
  try {
    const task = state.tasks.find(item => item.id === id);
    if (task) {
      updateTaskCache(currentUser, { ...task, status });
      state.tasks = loadCachedTasks(currentUser);
      state.syncMessage = `Status tugas diubah ke ${status}. Mengirim ke Firebase...`;
      render();
    }
    await updateDoc(doc(db, "tasks", id), {
      status,
      updatedAt: serverTimestamp()
    });
    state.syncMessage = `Status tugas tersinkron ke ${status}.`;
    render();
  } catch (error) {
    state.syncMessage = "Firebase gagal memperbarui status. Perubahan tetap ada di cadangan lokal.";
    render();
    alert(error.message);
  }
}

function previewTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return alert("Tugas tidak ditemukan.");
  document.getElementById("previewTitle").textContent = task.namaTugas || "Preview Tugas";
  document.getElementById("previewSubtitle").textContent = `${task.status || "-"} - ${task.prioritas || "-"}`;
  document.getElementById("previewBody").innerHTML = `
    <dl class="preview-list">
      <div><dt>Tanggal</dt><dd>${escapeHtml(task.tanggal || "-")}</dd></div>
      <div><dt>Deadline</dt><dd>${escapeHtml(task.deadline || "-")}</dd></div>
      <div><dt>Penanggung Jawab</dt><dd>${escapeHtml(task.penanggungJawab || "-")}</dd></div>
      <div><dt>Email</dt><dd>${escapeHtml(task.emailPenanggungJawab || "-")}</dd></div>
      <div><dt>Status</dt><dd>${escapeHtml(task.status || "-")}</dd></div>
      <div><dt>Prioritas</dt><dd>${escapeHtml(task.prioritas || "-")}</dd></div>
      <div class="full"><dt>Catatan</dt><dd>${escapeHtml(task.catatan || "-")}</dd></div>
    </dl>
  `;
  document.getElementById("previewSendButton").onclick = () => sendTaskEmail(task.id);
  document.getElementById("previewModal").showModal();
}

function closePreviewModal() {
  document.getElementById("previewModal").close();
}

function sendTaskEmail(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return alert("Tugas tidak ditemukan.");
  if (!task.emailPenanggungJawab) return alert("Email Penanggung Jawab belum diisi.");
  sendEmail([task], [task.emailPenanggungJawab]);
}

function sendAllReminders() {
  const tasks = state.tasks.filter(task => task.status !== "Selesai" && (task.tanggal === state.today || isOverdue(task)));
  const recipients = [...new Set(tasks.map(task => task.emailPenanggungJawab).filter(Boolean))];
  if (!recipients.length) return alert("Belum ada email penanggung jawab pada tugas aktif.");
  sendEmail(tasks, recipients);
}

function sendSelectedReminders() {
  const recipients = Array.from(document.querySelectorAll("#recipientList input:checked")).map(input => input.value);
  if (!recipients.length) return alert("Pilih minimal satu email penerima.");
  const tasks = state.tasks.filter(task => recipients.includes(task.emailPenanggungJawab));
  sendEmail(tasks, recipients);
}

function sendEmail(tasks, recipients) {
  if (window.EMAIL_BRIDGE_URL) {
    fetch(window.EMAIL_BRIDGE_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: window.EMAIL_BRIDGE_TOKEN,
        appName: "Asisten Harian",
        recipients,
        tasks
      })
    });
    alert("Permintaan email dikirim ke Apps Script Email Bridge.");
    return;
  }

  const firstRecipient = recipients[0];
  const subject = encodeURIComponent("Pengingat Tugas Harian");
  const body = encodeURIComponent(buildEmailBody(tasks));
  window.location.href = `mailto:${firstRecipient}?subject=${subject}&body=${body}`;
}

function createReport() {
  const tasks = state.tasks.filter(task => task.tanggal === state.today);
  const stats = buildStats(tasks);
  const summary = [
    "LAPORAN HARIAN",
    `Tanggal: ${state.today}`,
    "",
    `Total tugas: ${stats.total}`,
    `Selesai: ${stats.selesai}`,
    `Proses: ${stats.proses}`,
    `Belum selesai: ${stats.belumSelesai}`,
    `Tertunda: ${stats.tertunda}`,
    `Terlambat: ${stats.terlambat}`,
    "",
    "Tugas aktif:",
    tasks.filter(task => task.status !== "Selesai").map(task => `- ${task.namaTugas} (${task.status})`).join("\n") || "- Tidak ada"
  ].join("\n");
  state.reports.unshift(summary);
  document.getElementById("reportPreview").textContent = summary;
  renderReports();
}

function exportTasksCsv() {
  const tasks = getFilteredTasks(false);
  if (!tasks.length) return alert("Belum ada tugas untuk diekspor.");

  const headers = ["Tanggal", "Nama Tugas", "Prioritas", "Status", "Deadline", "Penanggung Jawab", "Email", "Catatan"];
  const rows = tasks.map(task => [
    task.tanggal,
    task.namaTugas,
    task.prioritas,
    task.status,
    task.deadline,
    task.penanggungJawab,
    task.emailPenanggungJawab,
    task.catatan
  ]);
  const csv = [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `asisten-harian-${state.today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function buildStats(tasks) {
  const normalized = tasks.map(task => ({ ...task, terlambat: isOverdue(task) }));
  return {
    total: normalized.length,
    selesai: normalized.filter(task => task.status === "Selesai").length,
    proses: normalized.filter(task => task.status === "Proses").length,
    belumSelesai: normalized.filter(task => task.status === "Belum Selesai").length,
    tertunda: normalized.filter(task => task.status === "Tertunda").length,
    terlambat: normalized.filter(task => task.terlambat).length
  };
}

function getFocusTasks() {
  return state.tasks
    .filter(task => task.status !== "Selesai")
    .map(task => ({ ...task, terlambat: isOverdue(task) }))
    .sort((a, b) => {
      const scoreA = getUrgency(a).score;
      const scoreB = getUrgency(b).score;
      if (scoreA !== scoreB) return scoreB - scoreA;
      return String(a.deadline || a.tanggal || "").localeCompare(String(b.deadline || b.tanggal || ""));
    });
}

function getUrgency(task) {
  if (task.terlambat || isOverdue(task)) return { label: "Mendesak", className: "urgency-late", score: 4 };
  if (String(task.deadline || "").startsWith(state.today) || task.tanggal === state.today) {
    return { label: "Hari Ini", className: "urgency-today", score: 3 };
  }
  if (task.prioritas === "Tinggi") return { label: "Prioritas", className: "urgency-high", score: 2 };
  return { label: "Normal", className: "urgency-normal", score: 1 };
}

function buildEmailBody(tasks) {
  const lines = tasks.length
    ? tasks.map(task => `- ${task.namaTugas} (${task.prioritas}, ${task.status}, deadline: ${task.deadline || "-"})`)
    : ["Tidak ada tugas aktif hari ini."];
  return `Tugas aktif hari ini:\n\n${lines.join("\n")}`;
}

function buildTaskPreview(task) {
  return [task.deadline ? `Deadline ${task.deadline}` : "", task.penanggungJawab ? `PJ ${task.penanggungJawab}` : "", task.catatan || ""]
    .filter(Boolean)
    .join(" - ") || "Tidak ada detail tambahan.";
}

function csvCell(value) {
  return `"${String(value || "").replaceAll('"', '""')}"`;
}

function getCacheKeys(userOrUid) {
  const fallbackKey = "asisten-harian.tasks.last";
  if (!userOrUid) return [fallbackKey];
  if (typeof userOrUid === "string") return [`asisten-harian.tasks.${userOrUid}`, fallbackKey];

  const keys = [fallbackKey];
  if (userOrUid.uid) keys.push(`asisten-harian.tasks.${userOrUid.uid}`);
  if (userOrUid.email) keys.push(`asisten-harian.tasks.email.${userOrUid.email.toLowerCase()}`);
  return [...new Set(keys)];
}

function loadCachedTasks(userOrUid) {
  const keys = getCacheKeys(userOrUid);
  if (!keys.length) return [];

  let bestTasks = [];
  keys.forEach(key => {
    try {
      const tasks = JSON.parse(localStorage.getItem(key) || "[]");
      if (tasks.length > bestTasks.length) bestTasks = tasks;
    } catch (error) {
      // Abaikan cache rusak dan lanjutkan kunci berikutnya.
    }
  });
  return bestTasks;
}

function saveTasksToCache(userOrUid, tasks) {
  const keys = getCacheKeys(userOrUid);
  if (!keys.length) return;

  const cleanTasks = tasks.map(task => ({
    id: task.id,
    ownerUid: task.ownerUid,
    tanggal: task.tanggal || "",
    namaTugas: task.namaTugas || "",
    prioritas: task.prioritas || "Sedang",
    status: task.status || "Belum Selesai",
    deadline: task.deadline || "",
    penanggungJawab: task.penanggungJawab || "",
    emailPenanggungJawab: task.emailPenanggungJawab || "",
    catatan: task.catatan || ""
  }));

  keys.forEach(key => {
    localStorage.setItem(key, JSON.stringify(cleanTasks));
  });
}

function updateTaskCache(userOrUid, task) {
  const tasks = loadCachedTasks(userOrUid);
  const index = tasks.findIndex(item => item.id === task.id);
  if (index >= 0) {
    tasks[index] = { ...tasks[index], ...task };
  } else {
    tasks.unshift(task);
  }
  saveTasksToCache(userOrUid, tasks);
}

function removeTaskFromCache(userOrUid, id) {
  saveTasksToCache(userOrUid, loadCachedTasks(userOrUid).filter(task => task.id !== id));
}

function loadLegacyCache(uid) {
  try {
    return JSON.parse(localStorage.getItem(`asisten-harian.tasks.${uid}`) || "[]");
  } catch (error) {
    return [];
  }
}

function isOverdue(task) {
  return Boolean(task.deadline && task.status !== "Selesai" && new Date(task.deadline).getTime() < Date.now());
}

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function formatHumanDate(value) {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .format(new Date(value + "T00:00:00"));
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
