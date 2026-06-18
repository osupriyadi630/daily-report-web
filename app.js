import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

const firebaseConfig = window.FIREBASE_CONFIG;
if (!firebaseConfig || firebaseConfig.apiKey === "ISI_API_KEY_ANDA") {
  alert("Firebase belum dikonfigurasi. Buat web/firebase-config.js dari firebase-config.example.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

let currentUser = null;
let currentProfile = null;
let unsubscribeTasks = null;
let unsubscribeProfiles = null;
let welcomeTimer = null;
let aiContextTaskId = null;
let state = {
  tasks: [],
  people: [],
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
  document.getElementById("forgotPasswordButton").addEventListener("click", handleForgotPassword);
  document.getElementById("googleLoginButton").addEventListener("click", handleGoogleLogin);
  document.getElementById("logoutButton").addEventListener("click", handleLogout);
  document.getElementById("profileMenuButton").addEventListener("click", toggleProfileMenu);
  document.getElementById("openProfileButton").addEventListener("click", openProfileModal);
  document.getElementById("profileResetPasswordButton").addEventListener("click", handleProfilePasswordReset);
  document.getElementById("profileForm").addEventListener("submit", saveProfile);
  document.getElementById("closeProfileModalButton").addEventListener("click", closeProfileModal);
  document.getElementById("cancelProfileButton").addEventListener("click", closeProfileModal);
  document.getElementById("closeWelcomeToast").addEventListener("click", hideWelcomeToast);
  document.getElementById("profileDisplayName").addEventListener("input", updateProfilePreview);
  document.getElementById("profileNickname").addEventListener("input", updateProfilePreview);
  document.getElementById("actionMenuButton").addEventListener("click", toggleActionMenu);
  document.getElementById("aiChatLauncher").addEventListener("click", openAiChat);
  document.getElementById("closeAiChatButton").addEventListener("click", closeAiChat);
  document.getElementById("aiChatForm").addEventListener("submit", handleAiChatSubmit);
  document.querySelectorAll("[data-ai-question]").forEach(button => {
    button.addEventListener("click", () => submitAiQuestion(button.dataset.aiQuestion));
  });
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

onAuthStateChanged(auth, async user => {
  currentUser = user;
  document.body.classList.remove("auth-pending");
  document.getElementById("loadingView").classList.add("hidden");
  document.getElementById("authView").classList.toggle("hidden", !!user);
  document.getElementById("appView").classList.toggle("hidden", !user);
  document.getElementById("aiChatLauncher").classList.toggle("hidden", !user);

  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeProfiles) unsubscribeProfiles();

  if (user) {
    document.getElementById("userEmail").textContent = user.email;
    currentProfile = await loadUserProfile(user);
    renderUserProfile();
    state.tasks = loadCachedTasks();
    state.syncMessage = state.tasks.length
      ? "Menampilkan cadangan lokal. Sinkronisasi Firebase berjalan..."
      : "Memuat data dari Firebase...";
    render();
    watchTasks();
    watchProfiles();
    showWelcomeToast();
  } else {
    currentProfile = null;
    state.tasks = [];
    state.people = [];
    state.syncMessage = "Menunggu login...";
    render();
  }
});

document.addEventListener("click", event => {
  const profileWrap = event.target.closest(".sidebar-profile-wrap");
  if (!profileWrap) closeProfileMenu();
  const actionDropdown = event.target.closest(".action-dropdown");
  if (!actionDropdown) closeActionMenu();
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
  document.getElementById("loginOptions").classList.toggle("hidden", isRegister);
  document.getElementById("authSwitchText").textContent = isRegister ? "Sudah punya akun?" : "Belum punya akun?";
  document.getElementById("loginModeButton").classList.toggle("hidden", !isRegister);
  document.getElementById("registerModeButton").classList.toggle("hidden", isRegister);
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

async function handleForgotPassword() {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) {
    setAuthMessage("Isi email dulu, lalu klik Lupa password.");
    document.getElementById("authEmail").focus();
    return;
  }

  setAuthMessage("Mengirim link reset password...");
  try {
    await sendPasswordResetEmail(auth, email);
    setAuthMessage("Link reset password sudah dikirim ke email.");
  } catch (error) {
    setAuthMessage(getAuthErrorMessage(error));
  }
}

async function handleGoogleLogin() {
  setAuthMessage("Membuka login Google...");
  try {
    await signInWithPopup(auth, googleProvider);
    setAuthMessage("");
  } catch (error) {
    setAuthMessage(getAuthErrorMessage(error));
  }
}

async function handleLogout() {
  if (currentUser) sessionStorage.removeItem(`asisten-harian.welcome.${currentUser.uid}`);
  closeProfileMenu();
  await signOut(auth);
}

function getDefaultProfile(user) {
  const emailName = String(user.email || "Pengguna").split("@")[0];
  const displayName = user.displayName || emailName;
  return {
    displayName,
    nickname: displayName.split(/\s+/)[0] || emailName,
    gender: "",
    role: "",
    bio: "",
    avatarUrl: user.photoURL || "",
    email: user.email || ""
  };
}

async function loadUserProfile(user) {
  const fallback = getDefaultProfile(user);
  const cached = loadProfileCache(user.uid);

  try {
    const snapshot = await getDoc(doc(db, "profiles", user.uid));
    if (!snapshot.exists()) return { ...fallback, ...cached };
    const profile = { ...fallback, ...cached, ...snapshot.data() };
    saveProfileCache(user.uid, profile);
    return profile;
  } catch (error) {
    return { ...fallback, ...cached };
  }
}

function renderUserProfile() {
  if (!currentUser || !currentProfile) return;
  const profile = currentProfile;
  document.getElementById("sidebarNickname").textContent = profile.nickname || profile.displayName;
  document.getElementById("profileMenuName").textContent = profile.displayName;
  document.getElementById("profileMenuNickname").textContent = profile.nickname || "";
  document.getElementById("profileMenuEmail").textContent = currentUser.email || "";
  setAvatar("sidebarAvatar", profile);
  setAvatar("profileMenuAvatar", profile);
  setAvatar("welcomeAvatar", profile);
}

function toggleProfileMenu() {
  const popover = document.getElementById("profilePopover");
  const willOpen = popover.classList.contains("hidden");
  popover.classList.toggle("hidden", !willOpen);
  document.getElementById("profileMenuButton").setAttribute("aria-expanded", String(willOpen));
}

function closeProfileMenu() {
  document.getElementById("profilePopover").classList.add("hidden");
  document.getElementById("profileMenuButton").setAttribute("aria-expanded", "false");
}

function toggleActionMenu() {
  const menu = document.getElementById("actionDropdownMenu");
  const button = document.getElementById("actionMenuButton");
  const willOpen = menu.classList.contains("hidden");
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}

function closeActionMenu() {
  document.getElementById("actionDropdownMenu").classList.add("hidden");
  document.getElementById("actionMenuButton").setAttribute("aria-expanded", "false");
}

function openAiChat() {
  if (!currentUser) return;
  document.getElementById("aiChatModal").showModal();
  window.setTimeout(() => document.getElementById("aiChatInput").focus(), 60);
}

function closeAiChat() {
  document.getElementById("aiChatModal").close();
}

function handleAiChatSubmit(event) {
  event.preventDefault();
  const input = document.getElementById("aiChatInput");
  const question = input.value.trim();
  if (!question) return;
  input.value = "";
  submitAiQuestion(question);
}

function submitAiQuestion(question) {
  appendAiChatMessage(question, "user");
  const answer = answerLocalAiQuestion(question);
  window.setTimeout(() => appendAiChatMessage(answer, "assistant"), 180);
}

function appendAiChatMessage(message, role) {
  const container = document.getElementById("aiChatMessages");
  const article = document.createElement("article");
  article.className = `chat-message ${role}`;
  article.textContent = message;
  container.appendChild(article);
  container.scrollTop = container.scrollHeight;
}

function answerLocalAiQuestion(question) {
  const normalized = normalizeSearchText(question);
  const tasks = state.tasks.map(task => ({ ...task, terlambat: isOverdue(task) }));
  const active = tasks.filter(task => task.status !== "Selesai");
  const late = active.filter(task => task.terlambat);
  const done = tasks.filter(task => task.status === "Selesai");
  const people = buildPeopleDirectory(tasks);
  const matchedTasks = findTasksFromQuestion(normalized, tasks);
  const contextualTask = matchedTasks[0] ||
    tasks.find(task => task.id === aiContextTaskId) ||
    null;

  if (matchedTasks.length === 1) aiContextTaskId = matchedTasks[0].id;

  const ranked = active
    .map(task => ({ task, score: getSmartTaskScore(task) }))
    .sort((a, b) => b.score - a.score);
  const top = ranked[0];

  if (includesAny(normalized, ["siapa saja yang memberikan tugas", "siapa pemberi tugas", "pemberi tugas", "dibuat oleh siapa", "yang membuat tugas"])) {
    const creators = buildCreatorDirectory(tasks, people);
    if (!creators.length) return "Belum ada informasi pembuat tugas.";
    return `Pemberi/pembuat tugas yang tercatat:\n${creators.map(item =>
      `- ${item.name}${item.email && item.email !== item.name ? ` (${item.email})` : ""}: ${item.count} tugas`
    ).join("\n")}`;
  }

  if (includesAny(normalized, ["penanggung jawabnya siapa", "siapa penanggung jawab", "siapa pj", "pj nya siapa", "pj-nya siapa"])) {
    if (contextualTask) return formatTaskResponsibility(contextualTask, people);
    const owners = buildWorkload(tasks);
    if (!owners.length) return "Belum ada penanggung jawab yang tercatat.";
    return `Penanggung jawab yang tercatat:\n${owners.map(item => `- ${item.owner}: ${item.count} tugas`).join("\n")}`;
  }

  if (includesAny(normalized, ["daftar orang", "semua orang", "siapa saja orang", "daftar pengguna", "semua pengguna", "member"])) {
    if (!people.length) return "Belum ada profil atau orang yang tercatat.";
    return `Orang/pengguna yang terbaca (${people.length}):\n${people.map(person =>
      `- ${person.name}${person.email ? ` (${person.email})` : ""}${person.role ? ` - ${person.role}` : ""}`
    ).join("\n")}`;
  }

  if (includesAny(normalized, ["semua tugas", "daftar tugas", "tugas apa saja"])) {
    if (!tasks.length) return "Belum ada tugas yang tersimpan.";
    return `Daftar tugas (${tasks.length}):\n${tasks.slice(0, 12).map(task => formatTaskLine(task)).join("\n")}${tasks.length > 12 ? `\n...dan ${tasks.length - 12} tugas lainnya.` : ""}`;
  }

  if (matchedTasks.length) {
    if (matchedTasks.length === 1) return formatTaskDetails(matchedTasks[0], people);
    return `Saya menemukan ${matchedTasks.length} tugas yang sesuai:\n${matchedTasks.slice(0, 8).map(task => formatTaskLine(task)).join("\n")}`;
  }

  const matchedPeople = findPeopleFromQuestion(normalized, people);
  if (matchedPeople.length) {
    return matchedPeople.slice(0, 5).map(person => formatPersonDetails(person, tasks)).join("\n\n");
  }

  if (includesAny(normalized, ["fokus", "prioritas", "kerjakan dulu", "utama"])) {
    if (!top) return "Belum ada tugas aktif yang perlu diprioritaskan.";
    aiContextTaskId = top.task.id;
    return `Fokus utama adalah "${top.task.namaTugas}" dengan skor ${top.score}/100. Status: ${top.task.status}. Deadline: ${top.task.deadline || "belum diisi"}.`;
  }

  if (includesAny(normalized, ["terlambat", "telat", "lewat deadline"])) {
    if (!late.length) return "Tidak ada tugas yang terlambat saat ini.";
    return `Ada ${late.length} tugas terlambat:\n${late.slice(0, 5).map(task => `- ${task.namaTugas} (${task.penanggungJawab || "PJ belum diisi"})`).join("\n")}`;
  }

  if (includesAny(normalized, ["progres", "progress", "selesai", "persentase"])) {
    const rate = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
    return `Progres penyelesaian ${rate}%. ${done.length} dari ${tasks.length} tugas sudah selesai, dan ${active.length} masih aktif.`;
  }

  if (includesAny(normalized, ["beban", "penanggung jawab", "pj", "anggota", "tim"])) {
    const workload = buildWorkload(active);
    if (!workload.length) return "Belum ada data penanggung jawab pada tugas aktif.";
    return `Beban tugas aktif:\n${workload.slice(0, 6).map(item => `- ${item.owner}: ${item.count} tugas`).join("\n")}`;
  }

  if (includesAny(normalized, ["email", "alamat email", "kontak"])) {
    const emails = people.filter(person => person.email);
    if (!emails.length) return "Belum ada email pengguna atau penanggung jawab yang tercatat.";
    return `Email yang tercatat:\n${emails.map(person => `- ${person.name}: ${person.email}`).join("\n")}`;
  }

  if (includesAny(normalized, ["laporan", "ringkasan laporan"])) {
    if (!state.reports.length) return "Belum ada laporan yang dibuat pada sesi ini.";
    return `Ada ${state.reports.length} laporan pada sesi ini. Laporan terbaru:\n${state.reports[0]}`;
  }

  if (includesAny(normalized, ["status", "jumlah status", "rekap status"])) {
    const stats = buildStats(tasks);
    return `Rekap status: total ${stats.total}, selesai ${stats.selesai}, proses ${stats.proses}, belum selesai ${stats.belumSelesai}, tertunda ${stats.tertunda}, dan terlambat ${stats.terlambat}.`;
  }

  if (includesAny(normalized, ["kosong", "lengkap", "deadline belum", "data tugas"])) {
    const missingDeadline = active.filter(task => !task.deadline).length;
    const missingOwner = active.filter(task => !task.penanggungJawab).length;
    const missingEmail = active.filter(task => !task.emailPenanggungJawab).length;
    return `Pemeriksaan data aktif: ${missingDeadline} tanpa deadline, ${missingOwner} tanpa penanggung jawab, dan ${missingEmail} tanpa email penanggung jawab.`;
  }

  if (includesAny(normalized, ["hari ini", "today"])) {
    const todayTasks = active.filter(task =>
      task.tanggal === state.today || String(task.deadline || "").startsWith(state.today)
    );
    if (!todayTasks.length) return "Tidak ada tugas aktif yang dijadwalkan atau memiliki deadline hari ini.";
    return `Tugas hari ini:\n${todayTasks.slice(0, 6).map(task => `- ${task.namaTugas} (${task.status})`).join("\n")}`;
  }

  if (includesAny(normalized, ["bantuan", "bisa apa", "contoh", "help"])) {
    return "Saya dapat membaca tugas, profil/orang, pembuat tugas, penanggung jawab, email, deadline, status, prioritas, catatan, laporan sesi, beban kerja, progres, dan data yang belum lengkap. Anda juga dapat menyebut nama tugas atau nama orang secara langsung.";
  }

  return "Saya belum menemukan data yang cocok. Coba sebut nama tugas/orang, atau tanyakan: semua tugas, daftar orang, pemberi tugas, penanggung jawab, deadline, status, progres, terlambat, laporan, atau data belum lengkap.";
}

function includesAny(value, keywords) {
  return keywords.some(keyword => value.includes(keyword));
}

function normalizeSearchText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9@._\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTasksFromQuestion(question, tasks) {
  const genericWords = new Set([
    "apa", "apakah", "siapa", "yang", "dan", "atau", "dengan", "tugas", "tentang",
    "tolong", "beri", "berikan", "saya", "anda", "bisa", "data", "lihat", "cari",
    "status", "deadline", "prioritas", "catatan", "penanggung", "jawab", "pemberi"
  ]);
  const tokens = question.split(" ").filter(token => token.length >= 3 && !genericWords.has(token));

  return tasks
    .map(task => {
      const haystack = normalizeSearchText([
        task.namaTugas,
        task.catatan,
        task.penanggungJawab,
        task.emailPenanggungJawab,
        task.dibuatOleh,
        task.status,
        task.prioritas,
        task.deadline,
        task.tanggal
      ].join(" "));
      const title = normalizeSearchText(task.namaTugas);
      let score = question.includes(title) && title.length >= 3 ? 20 : 0;
      tokens.forEach(token => {
        if (title.includes(token)) score += 5;
        else if (haystack.includes(token)) score += 1;
      });
      return { task, score };
    })
    .filter(item => item.score >= 3)
    .sort((a, b) => b.score - a.score)
    .map(item => item.task);
}

function buildPeopleDirectory(tasks) {
  const map = new Map();

  state.people.forEach(profile => {
    const email = String(profile.email || "").trim().toLowerCase();
    const key = profile.uid || email || normalizeSearchText(profile.displayName || profile.nickname);
    if (!key) return;
    map.set(key, {
      uid: profile.uid || "",
      name: profile.displayName || profile.nickname || email,
      nickname: profile.nickname || "",
      email,
      gender: profile.gender || "",
      role: profile.role || "",
      bio: profile.bio || ""
    });
  });

  tasks.forEach(task => {
    addPersonToDirectory(map, task.dibuatOleh, "", task.ownerUid);
    addPersonToDirectory(map, task.emailPenanggungJawab, task.penanggungJawab);
    if (task.penanggungJawab && !task.emailPenanggungJawab) {
      addPersonToDirectory(map, "", task.penanggungJawab);
    }
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function addPersonToDirectory(map, emailValue, nameValue, uid = "") {
  const email = String(emailValue || "").trim().toLowerCase();
  const name = String(nameValue || "").trim();
  const existingEntry = Array.from(map.entries()).find(([, person]) =>
    (uid && person.uid === uid) || (email && person.email === email)
  );
  const key = existingEntry?.[0] || uid || email || normalizeSearchText(name);
  if (!key) return;
  const existing = existingEntry?.[1] || map.get(key) || {};
  map.set(key, {
    uid: existing.uid || uid,
    name: existing.name || name || email,
    nickname: existing.nickname || "",
    email: existing.email || email,
    gender: existing.gender || "",
    role: existing.role || "",
    bio: existing.bio || ""
  });
}

function findPeopleFromQuestion(question, people) {
  return people.filter(person => {
    const values = [person.name, person.nickname, person.email, person.role]
      .map(normalizeSearchText)
      .filter(value => value.length >= 3);
    return values.some(value => question.includes(value) ||
      value.split(" ").some(part => part.length >= 3 && question.includes(part)));
  });
}

function buildCreatorDirectory(tasks, people) {
  const counts = new Map();
  tasks.forEach(task => {
    const email = String(task.dibuatOleh || "").trim().toLowerCase();
    const key = task.ownerUid || email || "Tidak diketahui";
    const person = people.find(item => (task.ownerUid && item.uid === task.ownerUid) || (email && item.email === email));
    const current = counts.get(key) || {
      name: person?.name || email || "Tidak diketahui",
      email,
      count: 0
    };
    current.count += 1;
    counts.set(key, current);
  });
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

function formatTaskLine(task) {
  return `- ${task.namaTugas} | ${task.status || "-"} | PJ: ${task.penanggungJawab || "belum diisi"} | Deadline: ${task.deadline || "belum diisi"}`;
}

function formatTaskDetails(task, people) {
  aiContextTaskId = task.id;
  const creator = people.find(person =>
    (task.ownerUid && person.uid === task.ownerUid) ||
    (task.dibuatOleh && person.email === String(task.dibuatOleh).toLowerCase())
  );
  return [
    `Tugas: ${task.namaTugas}`,
    `Status: ${task.status || "-"}`,
    `Prioritas: ${task.prioritas || "-"}`,
    `Tanggal: ${task.tanggal || "-"}`,
    `Deadline: ${task.deadline || "belum diisi"}`,
    `Penanggung jawab: ${task.penanggungJawab || "belum diisi"}`,
    `Email PJ: ${task.emailPenanggungJawab || "belum diisi"}`,
    `Dibuat oleh: ${creator?.name || task.dibuatOleh || "tidak diketahui"}`,
    `Catatan: ${task.catatan || "tidak ada"}`
  ].join("\n");
}

function formatTaskResponsibility(task, people) {
  const person = people.find(item =>
    (task.emailPenanggungJawab && item.email === String(task.emailPenanggungJawab).toLowerCase()) ||
    normalizeSearchText(item.name) === normalizeSearchText(task.penanggungJawab)
  );
  return `Penanggung jawab tugas "${task.namaTugas}" adalah ${person?.name || task.penanggungJawab || "belum diisi"}${task.emailPenanggungJawab ? ` (${task.emailPenanggungJawab})` : ""}.`;
}

function formatPersonDetails(person, tasks) {
  const assigned = tasks.filter(task =>
    (person.email && String(task.emailPenanggungJawab || "").toLowerCase() === person.email) ||
    normalizeSearchText(task.penanggungJawab) === normalizeSearchText(person.name) ||
    normalizeSearchText(task.penanggungJawab) === normalizeSearchText(person.nickname)
  );
  const created = tasks.filter(task =>
    (person.uid && task.ownerUid === person.uid) ||
    (person.email && String(task.dibuatOleh || "").toLowerCase() === person.email)
  );
  return [
    `Nama: ${person.name}`,
    person.nickname ? `Panggilan: ${person.nickname}` : "",
    person.email ? `Email: ${person.email}` : "",
    person.role ? `Jabatan/Tim: ${person.role}` : "",
    person.gender ? `Gender: ${person.gender}` : "",
    person.bio ? `Tentang: ${person.bio}` : "",
    `Tugas sebagai PJ: ${assigned.length}`,
    `Tugas yang dibuat: ${created.length}`
  ].filter(Boolean).join("\n");
}

function openProfileModal() {
  if (!currentUser || !currentProfile) return;
  closeProfileMenu();
  document.getElementById("profileDisplayName").value = currentProfile.displayName || "";
  document.getElementById("profileNickname").value = currentProfile.nickname || "";
  document.getElementById("profileEmail").value = currentUser.email || "";
  document.getElementById("profileGender").value = currentProfile.gender || "";
  document.getElementById("profileRole").value = currentProfile.role || "";
  document.getElementById("profileBio").value = currentProfile.bio || "";
  updateProfilePreview();
  document.getElementById("profileModal").showModal();
}

function closeProfileModal() {
  document.getElementById("profileModal").close();
}

function updateProfilePreview() {
  const displayName = document.getElementById("profileDisplayName").value.trim();
  const nickname = document.getElementById("profileNickname").value.trim();
  document.getElementById("profilePreviewNickname").textContent = nickname || displayName || "Pengguna";
  setAvatar("profilePreviewAvatar", {
    displayName: displayName || currentProfile?.displayName,
    nickname: nickname || currentProfile?.nickname,
    avatarUrl: currentProfile?.avatarUrl
  });
}

async function saveProfile(event) {
  event.preventDefault();
  if (!currentUser) return;

  const profile = {
    displayName: document.getElementById("profileDisplayName").value.trim(),
    nickname: document.getElementById("profileNickname").value.trim(),
    gender: document.getElementById("profileGender").value,
    role: document.getElementById("profileRole").value.trim(),
    bio: document.getElementById("profileBio").value.trim(),
    avatarUrl: currentProfile?.avatarUrl || currentUser.photoURL || "",
    email: currentUser.email || "",
    updatedAt: serverTimestamp()
  };

  currentProfile = { ...currentProfile, ...profile };
  saveProfileCache(currentUser.uid, currentProfile);
  renderUserProfile();
  closeProfileModal();

  try {
    await updateProfile(currentUser, { displayName: profile.displayName });
    await setDoc(doc(db, "profiles", currentUser.uid), {
      ...profile,
      uid: currentUser.uid,
      createdAt: currentProfile.createdAt || serverTimestamp()
    }, { merge: true });
  } catch (error) {
    alert("Profil tersimpan pada perangkat ini, tetapi belum tersinkron ke Firebase. Periksa Rules koleksi profiles.");
  }
}

async function handleProfilePasswordReset() {
  if (!currentUser?.email) return;
  closeProfileMenu();
  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    alert("Link reset password sudah dikirim ke email Anda.");
  } catch (error) {
    alert(getAuthErrorMessage(error));
  }
}

function showWelcomeToast() {
  if (!currentUser || !currentProfile) return;
  const storageKey = `asisten-harian.welcome.${currentUser.uid}`;
  if (sessionStorage.getItem(storageKey)) return;
  sessionStorage.setItem(storageKey, "shown");

  const activeCount = state.tasks.filter(task => task.status !== "Selesai").length;
  document.getElementById("welcomeTitle").textContent =
    `Selamat datang kembali, ${currentProfile.nickname || currentProfile.displayName}!`;
  document.getElementById("welcomeMessage").textContent = activeCount
    ? `Ada ${activeCount} tugas aktif yang perlu diperhatikan hari ini.`
    : "Semoga pekerjaan hari ini berjalan lancar.";

  const toast = document.getElementById("welcomeToast");
  toast.classList.remove("hidden", "closing");
  window.clearTimeout(welcomeTimer);
  welcomeTimer = window.setTimeout(hideWelcomeToast, 3000);
}

function hideWelcomeToast() {
  const toast = document.getElementById("welcomeToast");
  window.clearTimeout(welcomeTimer);
  if (toast.classList.contains("hidden")) return;
  toast.classList.add("closing");
  window.setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("closing");
  }, 180);
}

function setAvatar(elementId, profile) {
  const element = document.getElementById(elementId);
  if (!element) return;
  const avatarUrl = String(profile?.avatarUrl || "");
  element.style.backgroundImage = avatarUrl ? `url(${JSON.stringify(avatarUrl)})` : "";
  element.textContent = avatarUrl ? "" : getInitials(profile?.nickname || profile?.displayName || "AH");
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
  if (code.includes("popup-closed-by-user")) return "Login Google dibatalkan.";
  if (code.includes("operation-not-allowed")) return "Provider login ini belum diaktifkan di Firebase Authentication.";
  return error.message || "Terjadi masalah login.";
}

function watchTasks() {
  const tasksQuery = query(collection(db, "tasks"));

  unsubscribeTasks = onSnapshot(tasksQuery, snapshot => {
    const remoteTasks = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => String(b.tanggal || "").localeCompare(String(a.tanggal || "")));
    const cachedTasks = loadCachedTasks();

    if (!remoteTasks.length && cachedTasks.length) {
      state.tasks = cachedTasks;
      state.syncMessage = "Firebase belum mengirim data. Menampilkan cadangan lokal terakhir.";
    } else {
      state.tasks = remoteTasks;
      saveTasksToCache(state.tasks);
      state.syncMessage = "Tersinkron dengan Firebase. Semua akun melihat tugas bersama.";
    }
    render();
  }, error => {
    state.tasks = loadCachedTasks();
    state.syncMessage = "Firebase gagal dibaca. Menampilkan cadangan lokal.";
    render();
    alert(error.message);
  });
}

function watchProfiles() {
  unsubscribeProfiles = onSnapshot(query(collection(db, "profiles")), snapshot => {
    state.people = snapshot.docs
      .map(item => ({ uid: item.id, ...item.data() }))
      .sort((a, b) => String(a.displayName || a.nickname || a.email || "")
        .localeCompare(String(b.displayName || b.nickname || b.email || "")));
    renderLocalAI();
  }, () => {
    state.people = currentProfile ? [{ uid: currentUser?.uid, ...currentProfile }] : [];
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
  renderLocalAI();
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

function renderLocalAI() {
  const summary = document.getElementById("localAiSummary");
  const container = document.getElementById("localAiInsights");
  if (!summary || !container) return;

  const tasks = state.tasks.map(task => ({ ...task, terlambat: isOverdue(task) }));
  const active = tasks.filter(task => task.status !== "Selesai");
  const done = tasks.filter(task => task.status === "Selesai");
  const ranked = active
    .map(task => ({ task, score: getSmartTaskScore(task) }))
    .sort((a, b) => b.score - a.score);
  const topTask = ranked[0]?.task;
  const completionRate = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;

  summary.textContent = topTask
    ? `Fokus utama: ${topTask.namaTugas}. Skor prioritas ${getSmartTaskScore(topTask)} dari 100.`
    : "Belum ada tugas aktif. Tambahkan tugas untuk mendapatkan rekomendasi otomatis.";

  const missingDeadline = active.filter(task => !task.deadline).length;
  const missingOwner = active.filter(task => !task.penanggungJawab).length;
  const late = active.filter(task => task.terlambat).length;
  const workload = buildWorkload(active);
  const busiest = workload[0];
  const insights = [];

  if (late) {
    insights.push({
      type: "danger",
      title: `${late} tugas terlambat`,
      message: "Dahulukan tugas ini atau perbarui deadline agar agenda tetap realistis."
    });
  }

  if (missingDeadline || missingOwner) {
    insights.push({
      type: "warning",
      title: "Data perlu dilengkapi",
      message: `${missingDeadline} tanpa deadline dan ${missingOwner} tanpa penanggung jawab.`
    });
  }

  if (busiest && busiest.count >= 3) {
    insights.push({
      type: "warning",
      title: `Beban tertinggi: ${busiest.owner}`,
      message: `${busiest.count} tugas aktif. Pertimbangkan pembagian pekerjaan.`
    });
  }

  if (tasks.length) {
    insights.push({
      type: completionRate >= 60 ? "success" : "",
      title: `Penyelesaian ${completionRate}%`,
      message: `${done.length} dari ${tasks.length} tugas telah selesai.`
    });
  }

  if (!insights.length) {
    insights.push({
      type: "success",
      title: "Kondisi pekerjaan baik",
      message: "Tidak ada keterlambatan atau data penting yang kosong."
    });
  }

  container.innerHTML = insights.slice(0, 4).map(insight => `
    <div class="ai-insight ${insight.type}">
      <span><strong>${escapeHtml(insight.title)}</strong><br>${escapeHtml(insight.message)}</span>
    </div>
  `).join("");
}

function getSmartTaskScore(task) {
  let score = 10;
  if (task.terlambat || isOverdue(task)) score += 45;
  if (String(task.deadline || "").startsWith(state.today) || task.tanggal === state.today) score += 25;
  if (task.prioritas === "Tinggi") score += 20;
  if (task.prioritas === "Sedang") score += 10;
  if (task.status === "Proses") score += 8;
  if (!task.deadline) score += 5;
  return Math.min(score, 100);
}

function buildWorkload(tasks) {
  const counts = tasks.reduce((result, task) => {
    const owner = String(task.penanggungJawab || "").trim();
    if (!owner) return result;
    result[owner] = (result[owner] || 0) + 1;
    return result;
  }, {});

  return Object.entries(counts)
    .map(([owner, count]) => ({ owner, count }))
    .sort((a, b) => b.count - a.count);
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
  const ownerName = task.penanggungJawab || "Belum ditentukan";
  const ownerEmail = task.emailPenanggungJawab || "";

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
      </div>
      <div class="task-preview">${escapeHtml(preview)}</div>
      <p>${escapeHtml(task.catatan || "")}</p>
      <div class="task-assignee">
        <span class="user-avatar task-avatar">${escapeHtml(getInitials(ownerName))}</span>
        <span class="task-assignee-copy">
          <strong>${escapeHtml(ownerName)}</strong>
          ${ownerEmail ? `<small>${escapeHtml(ownerEmail)}</small>` : ""}
        </span>
      </div>
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
  closeActionMenu();
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
    dibuatOleh: currentUser.email || "",
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
      updateTaskCache({ id, ...payload });
      state.tasks = loadCachedTasks();
      state.syncMessage = "Tugas disimpan di perangkat. Mengirim ke Firebase...";
      render();
      closeTaskModal();
      await updateDoc(doc(db, "tasks", id), payload);
    } else {
      const taskRef = doc(collection(db, "tasks"));
      updateTaskCache({ id: taskRef.id, ...payload });
      state.tasks = loadCachedTasks();
      state.syncMessage = "Tugas disimpan di perangkat. Mengirim ke Firebase...";
      render();
      closeTaskModal();
      await setDoc(taskRef, { ...payload, createdAt: serverTimestamp() });
    }
    state.syncMessage = "Tugas berhasil disimpan dan tersinkron.";
    state.tasks = loadCachedTasks();
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
    removeTaskFromCache(id);
    state.tasks = loadCachedTasks();
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
      updateTaskCache({ ...task, status });
      state.tasks = loadCachedTasks();
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
  closeActionMenu();
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
  closeActionMenu();
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

function loadCachedTasks() {
  try {
    return JSON.parse(localStorage.getItem("asisten-harian.tasks.shared") || "[]");
  } catch (error) {
    return [];
  }
}

function saveTasksToCache(tasks) {
  const cleanTasks = tasks.map(task => ({
    id: task.id,
    ownerUid: task.ownerUid,
    dibuatOleh: task.dibuatOleh || "",
    tanggal: task.tanggal || "",
    namaTugas: task.namaTugas || "",
    prioritas: task.prioritas || "Sedang",
    status: task.status || "Belum Selesai",
    deadline: task.deadline || "",
    penanggungJawab: task.penanggungJawab || "",
    emailPenanggungJawab: task.emailPenanggungJawab || "",
    catatan: task.catatan || ""
  }));

  localStorage.setItem("asisten-harian.tasks.shared", JSON.stringify(cleanTasks));
}

function updateTaskCache(task) {
  const tasks = loadCachedTasks();
  const index = tasks.findIndex(item => item.id === task.id);
  if (index >= 0) {
    tasks[index] = { ...tasks[index], ...task };
  } else {
    tasks.unshift(task);
  }
  saveTasksToCache(tasks);
}

function removeTaskFromCache(id) {
  saveTasksToCache(loadCachedTasks().filter(task => task.id !== id));
}

function loadProfileCache(uid) {
  try {
    return JSON.parse(localStorage.getItem(`asisten-harian.profile.${uid}`) || "{}");
  } catch (error) {
    return {};
  }
}

function saveProfileCache(uid, profile) {
  const cleanProfile = {
    displayName: profile.displayName || "",
    nickname: profile.nickname || "",
    gender: profile.gender || "",
    role: profile.role || "",
    bio: profile.bio || "",
    avatarUrl: profile.avatarUrl || "",
    email: profile.email || ""
  };
  localStorage.setItem(`asisten-harian.profile.${uid}`, JSON.stringify(cleanProfile));
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

function getInitials(value) {
  const parts = String(value || "AH").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "AH";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
