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
  notify("Firebase belum dikonfigurasi. Buat web/firebase-config.js dari firebase-config.example.js.");
}

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
const db = getFirestore(app);

function notify(message, options = {}) {
  const text = String(message || "").trim();
  if (!text) return;

  const type = options.type || (/(gagal|error|tidak|belum|invalid|berakhir|ditolak|izin|permission)/i.test(text) ? "error" : "info");
  const stack = getToastStack_();
  const toast = document.createElement("div");
  toast.className = `app-toast app-toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");
  toast.setAttribute("aria-live", type === "error" ? "assertive" : "polite");

  const dot = document.createElement("span");
  dot.className = "app-toast-dot";
  dot.setAttribute("aria-hidden", "true");

  const messageNode = document.createElement("span");
  messageNode.className = "app-toast-message";
  messageNode.textContent = text;

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "app-toast-close";
  closeButton.setAttribute("aria-label", "Tutup notifikasi");
  closeButton.textContent = "x";

  const close = () => {
    toast.classList.add("closing");
    window.setTimeout(() => toast.remove(), 180);
  };

  closeButton.addEventListener("click", close);
  toast.append(dot, messageNode, closeButton);
  stack.appendChild(toast);
  window.setTimeout(close, options.duration || (type === "error" ? 5200 : 3600));
}

function getToastStack_() {
  let stack = document.getElementById("appToastStack");
  if (!stack) {
    stack = document.createElement("div");
    stack.id = "appToastStack";
    stack.className = "app-toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}


let currentUser = null;
let currentProfile = null;
let unsubscribeTasks = null;
let unsubscribeProfiles = null;
let unsubscribeRoles = null;
let unsubscribeCurrentRole = null;
let unsubscribeAppSettings = null;
let unsubscribeTenders = null;
let welcomeTimer = null;
let aiContextTaskId = null;
let externalSheetTimer = null;
let externalSheetLastLoadedAt = 0;
let currentJobDetail = null;
let jobDetailResizeObserver = null;
let tenderJobSyncInProgress = false;
let lastTenderJobSignature = "";

const DEFAULT_EXTERNAL_SHEET_SOURCES = [
  {
    id: "data-utama",
    label: "Sheet DATA UTAMA",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR20HvphHOLEYaiTrgLSlBqFPkqSq0y44IYFQE_MDzMVjNHRHNpdQkYrOX2sLeu6OzQ_a4sXGzT7CYq/pub?gid=2034016714&single=true&output=csv"
  },
  {
    id: "personil-bmc",
    label: "Sheet PERSONIL BMC",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR20HvphHOLEYaiTrgLSlBqFPkqSq0y44IYFQE_MDzMVjNHRHNpdQkYrOX2sLeu6OzQ_a4sXGzT7CYq/pub?gid=2048149704&single=true&output=csv"
  },
  {
    id: "outsourcing",
    label: "Sheet Outsourcing",
    url: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR20HvphHOLEYaiTrgLSlBqFPkqSq0y44IYFQE_MDzMVjNHRHNpdQkYrOX2sLeu6OzQ_a4sXGzT7CYq/pub?gid=1030462578&single=true&output=csv"
  }
];

const DEFAULT_DRIVE_URL = "https://drive.google.com/drive/folders/1d5-UJScndg70lIXMvM4DrqxAMEOCqkXR?usp=sharing";
const CONFIGURABLE_ROLES = ["admin", "editor", "author", "contributor", "moderator", "member"];
const MENU_DEFINITIONS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tenders", label: "Tender" },
  { id: "jobs", label: "Portofolio" },
  { id: "personnel", label: "Personil" },
  { id: "tasks", label: "Tugas" },
  { id: "reports", label: "Laporan" },
  { id: "settings", label: "Pengaturan" }
];
const DEFAULT_MENU_ROLES = {
  dashboard: [...CONFIGURABLE_ROLES],
  tenders: [...CONFIGURABLE_ROLES],
  jobs: [...CONFIGURABLE_ROLES],
  personnel: [...CONFIGURABLE_ROLES],
  tasks: [...CONFIGURABLE_ROLES],
  reports: [...CONFIGURABLE_ROLES],
  settings: ["admin", "editor", "author", "contributor"]
};

const TENDER_DOCUMENT_BLUEPRINT = [
  ["Persiapan", "Kerangka Acuan Kerja (KAK)"],
  ["Persiapan", "HPS dan rincian perhitungan"],
  ["Persiapan", "Rancangan kontrak dan syarat kontrak"],
  ["Kualifikasi", "Akta perusahaan dan perubahan"],
  ["Kualifikasi", "NIB, perizinan, dan sertifikat badan usaha"],
  ["Kualifikasi", "Data pengalaman perusahaan"],
  ["Kualifikasi", "Pakta integritas"],
  ["Administrasi", "Surat penawaran"],
  ["Administrasi", "Surat kuasa (jika diperlukan)"],
  ["Teknis", "Pendekatan dan metodologi"],
  ["Teknis", "Rencana kerja dan jadwal pelaksanaan"],
  ["Teknis", "Organisasi dan komposisi tim"],
  ["Personel", "Daftar personel tenaga ahli"],
  ["Personel", "CV dan pengalaman personel"],
  ["Personel", "Ijazah dan sertifikat kompetensi"],
  ["Personel", "Surat pernyataan ketersediaan personel"],
  ["Personel", "Jadwal penugasan personel"],
  ["Biaya", "Rekapitulasi penawaran biaya"],
  ["Biaya", "Rincian remunerasi personel"],
  ["Biaya", "Rincian biaya langsung non-personel"],
  ["Finalisasi", "Berita acara klarifikasi/negosiasi"],
  ["Finalisasi", "SPPBJ dan dokumen kontrak"]
];

const TENDER_DOCUMENT_STATUSES = [
  "Belum Ada",
  "Draf",
  "Pemeriksaan",
  "Revisi",
  "Disetujui",
  "Final"
];
const TENDER_STORAGE_COLLECTION = "tasks";

function createDefaultAppConfig() {
  return {
    driveUrl: DEFAULT_DRIVE_URL,
    sheetUrls: Object.fromEntries(DEFAULT_EXTERNAL_SHEET_SOURCES.map(source => [source.id, source.url])),
    menuRoles: Object.fromEntries(
      Object.entries(DEFAULT_MENU_ROLES).map(([menu, roles]) => [menu, [...roles]])
    )
  };
}

const BOOTSTRAP_SUPER_ADMIN_EMAIL = "o.supriyadi630@gmail.com";
const ACCESS_ROLES = {
  super_admin: {
    label: "Super Admin",
    group: 1,
    description: "Kendali penuh atas sistem, data, pengaturan, dan seluruh role."
  },
  admin: {
    label: "Administrator",
    group: 1,
    description: "Mengelola operasional, seluruh data, pengguna, dan role tingkat bawah."
  },
  editor: {
    label: "Editor",
    group: 2,
    description: "Melihat, menambah, mengubah, dan menghapus seluruh tugas serta konten."
  },
  author: {
    label: "Author",
    group: 2,
    description: "Membuat, menerbitkan, dan mengelola tugas miliknya sendiri."
  },
  contributor: {
    label: "Contributor",
    group: 2,
    description: "Membuat dan mengubah draf miliknya sendiri untuk diperiksa pengelola."
  },
  moderator: {
    label: "Moderator",
    group: 3,
    description: "Akses pengawasan dan baca pada fitur utama aplikasi."
  },
  member: {
    label: "Member",
    group: 4,
    description: "Akses baca, unduh data, mengelola profil, dan memakai fitur standar."
  },
  guest: {
    label: "Guest",
    group: 4,
    description: "Pengunjung anonim yang hanya dapat melihat halaman publik."
  }
};

let state = {
  tasks: [],
  people: [],
  reports: [],
  tenders: [],
  accessRole: "guest",
  roleAssignments: [],
  appConfig: createDefaultAppConfig(),
  externalSheets: createInitialExternalSheets(createDefaultAppConfig()),
  today: getToday(),
  filter: "all",
  activeView: "dashboard",
  syncMessage: "Menunggu login...",
  authMode: "login",
  selectedRecipientEmail: "",
  personnelSource: "personil-bmc",
  personnelSearch: "",
  personnelYear: "all",
  personnelWorkFilter: "all",
  personnelSort: "name-asc",
  personnelPage: 1,
  personnelPageSize: 25,
  jobsSearch: "",
  jobsYear: "all",
  jobsStatus: "all",
  jobsPage: 1,
  jobsPageSize: 25,
  jobsVisibleRecords: [],
  portfolioFeaturedJobs: [],
  dashboardFeaturedJobs: [],
  dashboardActivePersonnelRecords: [],
  dashboardInactivePersonnelRecords: [],
  selectedTenderId: "",
  tenderSearch: "",
  tenderStatusFilter: "all"
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
  document.getElementById("recipientSearch").addEventListener("focus", openRecipientCombobox);
  document.getElementById("recipientSearch").addEventListener("input", handleRecipientInput);
  document.getElementById("recipientToggleButton").addEventListener("click", toggleRecipientCombobox);
  document.getElementById("recipientSearch").addEventListener("keydown", handleRecipientKeydown);
  document.getElementById("closePreviewModalButton").addEventListener("click", closePreviewModal);
  document.getElementById("closePreviewFooterButton").addEventListener("click", closePreviewModal);
  document.getElementById("searchInput").addEventListener("input", render);
  document.getElementById("statusFilter").addEventListener("change", render);
  document.getElementById("roleAssignmentForm").addEventListener("submit", saveRoleAssignment);
  document.getElementById("roleAssignmentsBody").addEventListener("click", handleRoleAssignmentAction);
  document.getElementById("dataSourceConfigForm").addEventListener("submit", saveDataSourceConfig);
  document.getElementById("menuVisibilityForm").addEventListener("submit", saveMenuVisibilityConfig);
  document.querySelectorAll("[data-personnel-source]").forEach(button => {
    button.addEventListener("click", () => selectPersonnelSource(button.dataset.personnelSource));
  });
  document.getElementById("personnelSearch").addEventListener("input", event => {
    state.personnelSearch = event.target.value;
    state.personnelPage = 1;
    renderPersonnel();
  });
  document.getElementById("personnelYearFilter").addEventListener("change", event => {
    state.personnelYear = event.target.value;
    state.personnelPage = 1;
    renderPersonnel();
  });
  document.getElementById("personnelWorkFilter").addEventListener("change", event => {
    state.personnelWorkFilter = event.target.value;
    state.personnelPage = 1;
    renderPersonnel();
  });
  document.getElementById("personnelSort").addEventListener("change", event => {
    state.personnelSort = event.target.value;
    state.personnelPage = 1;
    renderPersonnel();
  });
  document.getElementById("personnelPageSize").addEventListener("change", event => {
    state.personnelPageSize = Number(event.target.value) || 25;
    state.personnelPage = 1;
    renderPersonnel();
  });
  document.getElementById("resetPersonnelFilters").addEventListener("click", resetPersonnelFilters);
  document.getElementById("refreshPersonnelButton").addEventListener("click", loadExternalSheetData);
  document.getElementById("exportPersonnelButton").addEventListener("click", exportPersonnelCsv);
  document.getElementById("exportPersonnelExcelButton").addEventListener("click", exportPersonnelExcel);
  document.getElementById("exportPersonnelPdfButton").addEventListener("click", exportPersonnelPdf);
  document.getElementById("personnelToolsButton").addEventListener("click", togglePersonnelToolsMenu);
  document.getElementById("personnelPrevPage").addEventListener("click", () => changePersonnelPage(-1));
  document.getElementById("personnelNextPage").addEventListener("click", () => changePersonnelPage(1));
  document.getElementById("personnelTableBody").addEventListener("click", handlePersonnelTableClick);
  document.getElementById("dashboardActivePersonnelBody").addEventListener("click", handleDashboardPersonnelClick);
  document.getElementById("dashboardInactivePersonnelBody").addEventListener("click", handleDashboardPersonnelClick);
  document.getElementById("dashboardAddItemButton").addEventListener("click", () => openJobRecordForm());
  document.getElementById("dashboardTaskAddButton").addEventListener("click", openTaskModal);
  document.getElementById("dashboardOpenPortfolioButton").addEventListener("click", () => setView("jobs"));
  document.getElementById("dashboardPortfolioSummary").addEventListener("click", handlePortfolioSummaryClick);
  document.getElementById("dashboardFeaturedJobs").addEventListener("click", handleDashboardPortfolioCardClick);
  document.getElementById("addPersonnelButton").addEventListener("click", () => openPersonnelForm());
  document.getElementById("closePersonnelDetailButton").addEventListener("click", closePersonnelDetail);
  document.getElementById("closePersonnelDetailFooter").addEventListener("click", closePersonnelDetail);
  document.getElementById("personnelForm").addEventListener("submit", savePersonnelRecord);
  document.getElementById("closePersonnelFormButton").addEventListener("click", closePersonnelForm);
  document.getElementById("cancelPersonnelFormButton").addEventListener("click", closePersonnelForm);
  document.getElementById("jobsSearch").addEventListener("input", event => {
    state.jobsSearch = event.target.value;
    state.jobsPage = 1;
    renderJobs();
  });
  document.getElementById("jobsYearFilter").addEventListener("change", event => {
    state.jobsYear = event.target.value;
    state.jobsPage = 1;
    renderJobs();
  });
  document.getElementById("jobsStatusFilter").addEventListener("change", event => {
    state.jobsStatus = event.target.value;
    state.jobsPage = 1;
    renderJobs();
  });
  document.getElementById("jobsPageSize").addEventListener("change", event => {
    state.jobsPageSize = Number(event.target.value) || 25;
    state.jobsPage = 1;
    renderJobs();
  });
  document.getElementById("refreshJobsButton").addEventListener("click", refreshJobsData);
  document.getElementById("jobsToolsButton").addEventListener("click", toggleJobsToolsMenu);
  document.getElementById("addJobButton").addEventListener("click", () => openJobRecordForm());
  document.getElementById("exportJobsPdfButton").addEventListener("click", exportJobsPdf);
  document.getElementById("exportJobsExcelButton").addEventListener("click", exportJobsExcel);
  document.getElementById("exportJobsCsvButton").addEventListener("click", exportJobsCsv);
  document.getElementById("resetJobsFilters").addEventListener("click", resetJobsFilters);
  document.getElementById("jobsPrevPage").addEventListener("click", () => changeJobsPage(-1));
  document.getElementById("jobsNextPage").addEventListener("click", () => changeJobsPage(1));
  document.getElementById("jobsTableBody").addEventListener("click", handleJobsTableClick);
  document.getElementById("portfolioFeaturedJobs").addEventListener("click", handlePortfolioCardClick);
  document.getElementById("portfolioSummary").addEventListener("click", handlePortfolioSummaryClick);
  document.getElementById("portfolioAddItemButton").addEventListener("click", () => openJobRecordForm());
  document.getElementById("closeJobDetailButton").addEventListener("click", closeJobDetail);
  document.getElementById("closeJobDetailFooter").addEventListener("click", closeJobDetail);
  document.getElementById("addJobDetailRowButton").addEventListener("click", () => openJobRecordForm(null, currentJobDetail));
  document.getElementById("jobDetailBody").addEventListener("click", handleJobDetailAction);
  document.getElementById("jobRecordForm").addEventListener("submit", saveJobRecord);
  document.getElementById("closeJobRecordFormButton").addEventListener("click", closeJobRecordForm);
  document.getElementById("cancelJobRecordFormButton").addEventListener("click", closeJobRecordForm);
  document.getElementById("exportJobDetailPdfButton").addEventListener("click", exportCurrentJobDetailPdf);
  document.getElementById("exportJobDetailExcelButton").addEventListener("click", exportCurrentJobDetailExcel);
  document.getElementById("taskDate").addEventListener("input", event => closeDatePicker(event.target));
  document.getElementById("taskDate").addEventListener("change", event => closeDatePicker(event.target));
  document.getElementById("taskDeadline").addEventListener("input", event => closeDatePicker(event.target));
  document.getElementById("taskDeadline").addEventListener("change", event => closeDatePicker(event.target));
  document.getElementById("newTenderButton").addEventListener("click", () => openTenderForm());
  document.getElementById("tenderForm").addEventListener("submit", saveTender);
  document.getElementById("closeTenderFormButton").addEventListener("click", closeTenderForm);
  document.getElementById("cancelTenderFormButton").addEventListener("click", closeTenderForm);
  document.getElementById("tenderName").addEventListener("input", () => {
    renderTenderPersonnelReferenceFromForm();
    renderTenderPersonnelMembersFromForm();
  });
  document.getElementById("addTenderPersonnelButton").addEventListener("click", addTenderPersonnelFromForm);
  document.getElementById("tenderPersonnelMembersList").addEventListener("click", handleTenderPersonnelMemberAction);
  document.getElementById("tenderSearch").addEventListener("input", event => {
    state.tenderSearch = event.target.value;
    renderTenders();
  });
  document.getElementById("tenderStatusFilter").addEventListener("change", event => {
    state.tenderStatusFilter = event.target.value;
    renderTenders();
  });
  document.getElementById("tenderTableBody").addEventListener("click", handleTenderTableClick);
  document.getElementById("editTenderButton").addEventListener("click", editSelectedTender);
  document.getElementById("deleteTenderButton").addEventListener("click", deleteSelectedTender);
  document.getElementById("saveTenderChecklistButton").addEventListener("click", saveTenderChecklist);
  document.getElementById("generateTenderTemplateButton").addEventListener("click", generateTenderTemplate);
  document.getElementById("saveTenderTemplateButton").addEventListener("click", saveTenderTemplateDraft);
  document.getElementById("printTenderTemplateButton").addEventListener("click", printTenderTemplate);

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
  window.clearTimeout(window.__appBootTimer);
  currentUser = user;
  document.body.classList.remove("auth-pending");
  document.getElementById("loadingView").classList.add("hidden");
  document.getElementById("authView").classList.toggle("hidden", !!user);
  document.getElementById("appView").classList.toggle("hidden", !user);
  document.getElementById("aiChatLauncher").classList.toggle("hidden", !user);

  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeProfiles) unsubscribeProfiles();
  if (unsubscribeRoles) {
    unsubscribeRoles();
    unsubscribeRoles = null;
  }
  if (unsubscribeCurrentRole) {
    unsubscribeCurrentRole();
    unsubscribeCurrentRole = null;
  }
  if (unsubscribeAppSettings) {
    unsubscribeAppSettings();
    unsubscribeAppSettings = null;
  }
  if (unsubscribeTenders) {
    unsubscribeTenders();
    unsubscribeTenders = null;
  }
  if (externalSheetTimer) {
    window.clearInterval(externalSheetTimer);
    externalSheetTimer = null;
  }

  if (user) {
    currentProfile = await loadUserProfile(user);
    state.accessRole = await loadAccessRole(user);
    watchCurrentAccessRole(user);
    watchAppSettings();
    renderUserProfile();
    state.tasks = loadCachedTasks();
    state.syncMessage = state.tasks.length
      ? "Menampilkan cadangan lokal. Sinkronisasi Firebase berjalan..."
      : "Memuat data dari Firebase...";
    render();
    watchTasks();
    watchTenders();
    watchProfiles();
    if (canManageRoles()) watchRoleAssignments();
    loadExternalSheetData();
    externalSheetTimer = window.setInterval(() => {
      if (!document.hidden) loadExternalSheetData();
    }, 60 * 1000);
    showWelcomeToast();
  } else {
    currentProfile = null;
    state.accessRole = "guest";
    state.roleAssignments = [];
    state.appConfig = createDefaultAppConfig();
    state.tasks = [];
    state.tenders = [];
    state.people = [];
    state.externalSheets = createInitialExternalSheets(state.appConfig);
    externalSheetLastLoadedAt = 0;
    state.syncMessage = "Menunggu login...";
    render();
  }
});

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && currentUser && Date.now() - externalSheetLastLoadedAt > 30 * 1000) {
    loadExternalSheetData();
  }
});

document.addEventListener("click", event => {
  const profileWrap = event.target.closest(".sidebar-profile-wrap");
  if (!profileWrap) closeProfileMenu();
  const actionDropdown = event.target.closest(".action-dropdown");
  if (!actionDropdown) closeActionMenu();
  const personnelDropdown = event.target.closest(".personnel-action-dropdown, .personnel-row-dropdown");
  if (!personnelDropdown) closePersonnelMenus();
  const jobsDropdown = event.target.closest(".jobs-action-dropdown");
  if (!jobsDropdown) closeJobsMenus();
  const recipientCombobox = event.target.closest(".recipient-combobox");
  if (!recipientCombobox) closeRecipientCombobox();
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

async function loadAccessRole(user) {
  const email = normalizeEmail(user?.email);
  if (!email) return "guest";
  if (email === BOOTSTRAP_SUPER_ADMIN_EMAIL) return "super_admin";

  try {
    const snapshot = await getDoc(doc(db, "roles", email));
    const role = snapshot.exists() ? snapshot.data().role : "member";
    return ACCESS_ROLES[role] ? role : "member";
  } catch (error) {
    return "member";
  }
}

function watchCurrentAccessRole(user) {
  const email = normalizeEmail(user?.email);
  if (!email || email === BOOTSTRAP_SUPER_ADMIN_EMAIL) return;

  unsubscribeCurrentRole = onSnapshot(doc(db, "roles", email), snapshot => {
    const nextRole = snapshot.exists() && ACCESS_ROLES[snapshot.data().role]
      ? snapshot.data().role
      : "member";
    if (nextRole === state.accessRole) return;

    state.accessRole = nextRole;
    if (unsubscribeRoles) {
      unsubscribeRoles();
      unsubscribeRoles = null;
    }
    state.roleAssignments = [];
    if (canManageRoles()) watchRoleAssignments();
    renderUserProfile();
    render();
  }, () => {
    state.accessRole = "member";
    renderUserProfile();
    render();
  });
}

function normalizeAppConfig(value = {}) {
  const defaults = createDefaultAppConfig();
  const sheetUrls = { ...defaults.sheetUrls, ...(value.sheetUrls || {}) };
  const menuRoles = {};

  MENU_DEFINITIONS.forEach(menu => {
    const configuredRoles = Array.isArray(value.menuRoles?.[menu.id])
      ? value.menuRoles[menu.id].filter(role => CONFIGURABLE_ROLES.includes(role))
      : defaults.menuRoles[menu.id];
    menuRoles[menu.id] = [...new Set(configuredRoles)];
  });

  return {
    driveUrl: String(value.driveUrl || defaults.driveUrl).trim(),
    sheetUrls,
    menuRoles
  };
}

function watchAppSettings() {
  unsubscribeAppSettings = onSnapshot(doc(db, "appSettings", "general"), snapshot => {
    state.appConfig = normalizeAppConfig(snapshot.exists() ? snapshot.data() : {});
    state.externalSheets = createInitialExternalSheets(state.appConfig);
    renderSystemConfiguration();
    renderAccessControl();
    renderView();
    loadExternalSheetData();
  }, () => {
    state.appConfig = createDefaultAppConfig();
    state.externalSheets = createInitialExternalSheets(state.appConfig);
    renderSystemConfiguration();
    renderAccessControl();
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getAccessRoleDefinition(role = state.accessRole) {
  return ACCESS_ROLES[role] || ACCESS_ROLES.member;
}

function hasAccessRole(...roles) {
  return roles.includes(state.accessRole);
}

function canViewMenu(view, role = state.accessRole) {
  if (role === "super_admin") return true;
  const allowedRoles = state.appConfig?.menuRoles?.[view] || DEFAULT_MENU_ROLES[view] || [];
  return allowedRoles.includes(role);
}

function canViewSettings() {
  return canViewMenu("settings");
}

function canManageRoles() {
  return hasAccessRole("super_admin", "admin");
}

function canManageSystemConfig() {
  return hasAccessRole("super_admin");
}

function canManageAllTasks() {
  return hasAccessRole("super_admin", "admin", "editor");
}

function isOwnTask(task) {
  if (!task || !currentUser) return false;
  return task.ownerUid === currentUser.uid ||
    normalizeEmail(task.dibuatOleh) === normalizeEmail(currentUser.email);
}

function canCreateTask() {
  return hasAccessRole("super_admin", "admin", "editor", "author", "contributor");
}

function canEditTask(task) {
  if (canManageAllTasks()) return true;
  if (hasAccessRole("author")) return isOwnTask(task);
  if (hasAccessRole("contributor")) return isOwnTask(task) && task.status === "Tertunda";
  return false;
}

function canDeleteTask(task) {
  if (canManageAllTasks()) return true;
  return hasAccessRole("author") && isOwnTask(task);
}

function canChangeTaskStatus(task, nextStatus) {
  if (canManageAllTasks()) return true;
  if (hasAccessRole("author")) return isOwnTask(task);
  if (hasAccessRole("contributor")) return isOwnTask(task) && nextStatus === "Tertunda";
  return false;
}

function canSendReminders() {
  return hasAccessRole("super_admin", "admin", "editor", "author");
}

function canCreateReports() {
  return hasAccessRole("super_admin", "admin", "editor", "author", "contributor");
}

function canManagePersonnel() {
  return hasAccessRole("super_admin", "editor", "author");
}

function canManageTenders() {
  return hasAccessRole("super_admin", "admin", "editor");
}

function requirePermission(condition, message = "Anda tidak memiliki izin untuk tindakan ini.") {
  if (condition) return true;
  notify(message);
  return false;
}

function renderUserProfile() {
  if (!currentUser || !currentProfile) return;
  const profile = currentProfile;
  document.getElementById("sidebarNickname").textContent = profile.nickname || profile.displayName;
  document.getElementById("profileMenuName").textContent = profile.displayName;
  document.getElementById("profileMenuNickname").textContent = profile.nickname || "";
  document.getElementById("profileMenuEmail").textContent = currentUser.email || "";
  document.getElementById("profileAccessRole").textContent = getAccessRoleDefinition().label;
  setAvatar("sidebarAvatar", profile);
  setAvatar("profileMenuAvatar", profile);
  setAvatar("welcomeAvatar", profile);
  renderAccessControl();
}

function renderAccessControl() {
  const role = getAccessRoleDefinition();
  const nav = document.querySelector(".nav");
  let visibleMenuCount = 0;
  document.querySelectorAll(".nav-item[data-view]").forEach(button => {
    const visible = canViewMenu(button.dataset.view);
    button.classList.toggle("hidden", !visible);
    if (visible) visibleMenuCount += 1;
  });
  nav.style.setProperty("--visible-nav-count", String(Math.max(1, visibleMenuCount)));

  if (!canViewMenu(state.activeView)) {
    state.activeView = MENU_DEFINITIONS.find(menu => canViewMenu(menu.id))?.id || "dashboard";
  }

  document.getElementById("settingsAccessRole").textContent = role.label;
  document.getElementById("settingsAccessDescription").textContent = role.description;
  document.getElementById("settingsAccessEmail").textContent = currentUser?.email || "";
  document.getElementById("roleManagerBadge").textContent = role.label;
  document.getElementById("roleManagementPanel").classList.toggle("hidden", !canManageRoles());
  document.getElementById("dataSourceConfigPanel").classList.toggle("hidden", !canManageSystemConfig());
  document.getElementById("menuVisibilityPanel").classList.toggle("hidden", !canManageSystemConfig());

  const canCreate = canCreateTask();
  document.getElementById("newTaskButton").classList.toggle("hidden", !canCreate);
  document.getElementById("newTaskButtonTable").classList.toggle("hidden", !canCreate);
  document.getElementById("dashboardTaskAddButton").classList.toggle("hidden", !canCreate);
  document.getElementById("sendAllButton").classList.toggle("hidden", !canSendReminders());
  document.getElementById("sendSelectedButton").classList.toggle("hidden", !canSendReminders());
  document.getElementById("createReportButton").classList.toggle("hidden", !canCreateReports());
  document.getElementById("createReportButtonReports").classList.toggle("hidden", !canCreateReports());
  document.getElementById("addPersonnelButton").classList.toggle("hidden", !canManagePersonnel());
  document.getElementById("addJobButton").classList.toggle("hidden", !canManagePersonnel());
  document.getElementById("addJobDetailRowButton").classList.toggle("hidden", !canManagePersonnel());
  document.getElementById("newTenderButton").classList.toggle("hidden", !canManageTenders());
  document.getElementById("editTenderButton").classList.toggle("hidden", !canManageTenders());
  document.getElementById("deleteTenderButton").classList.toggle("hidden", !canManageTenders());
  document.getElementById("saveTenderChecklistButton").classList.toggle("hidden", !canManageTenders());
  document.getElementById("saveTenderTemplateButton").classList.toggle("hidden", !canManageTenders());
  renderSystemConfiguration();
  renderRoleSelectOptions();
  renderRoleAssignments();
}

function renderRoleSelectOptions() {
  const select = document.getElementById("roleSelect");
  if (!select) return;
  const allowedRoles = state.accessRole === "super_admin"
    ? ["super_admin", "admin", "editor", "author", "contributor", "moderator", "member"]
    : ["editor", "author", "contributor", "moderator", "member"];
  select.innerHTML = allowedRoles.map(role => (
    `<option value="${role}">${escapeHtml(ACCESS_ROLES[role].label)}</option>`
  )).join("");
  document.getElementById("roleManagementNote").textContent = state.accessRole === "super_admin"
    ? "Super Admin dapat menetapkan seluruh role, termasuk Super Admin lainnya."
    : "Administrator hanya dapat menetapkan Editor, Author, Contributor, Moderator, dan Member.";
}

function renderSystemConfiguration() {
  const config = normalizeAppConfig(state.appConfig);
  const driveLink = document.getElementById("googleDriveLink");
  if (driveLink) driveLink.href = config.driveUrl;

  const fields = {
    configDriveUrl: config.driveUrl,
    configDataUtamaUrl: config.sheetUrls["data-utama"],
    configPersonilBmcUrl: config.sheetUrls["personil-bmc"],
    configOutsourcingUrl: config.sheetUrls.outsourcing
  };
  Object.entries(fields).forEach(([id, value]) => {
    const input = document.getElementById(id);
    if (input && document.activeElement !== input) input.value = value || "";
  });

  const head = document.getElementById("menuVisibilityHead");
  const body = document.getElementById("menuVisibilityBody");
  if (!head || !body) return;

  head.innerHTML = `
    <tr>
      <th>Menu</th>
      ${CONFIGURABLE_ROLES.map(role => `<th>${escapeHtml(ACCESS_ROLES[role].label)}</th>`).join("")}
    </tr>
  `;
  const menuForm = document.getElementById("menuVisibilityForm");
  if (menuForm?.contains(document.activeElement)) return;
  body.innerHTML = MENU_DEFINITIONS.map(menu => `
    <tr>
      <td><strong>${escapeHtml(menu.label)}</strong></td>
      ${CONFIGURABLE_ROLES.map(role => `
        <td>
          <input
            type="checkbox"
            name="menu-role"
            data-menu="${escapeHtml(menu.id)}"
            data-role="${escapeHtml(role)}"
            ${config.menuRoles[menu.id]?.includes(role) ? "checked" : ""}
            aria-label="${escapeHtml(`${menu.label} untuk ${ACCESS_ROLES[role].label}`)}"
          >
        </td>
      `).join("")}
    </tr>
  `).join("");
}

function validateHttpsUrl(value, label) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch (error) {
    throw new Error(`${label} harus berupa tautan HTTPS yang valid.`);
  }
}

async function saveDataSourceConfig(event) {
  event.preventDefault();
  if (!requirePermission(canManageSystemConfig(), "Hanya Super Admin yang dapat mengubah sumber data.")) return;

  const status = document.getElementById("dataSourceConfigStatus");
  try {
    const driveUrl = validateHttpsUrl(document.getElementById("configDriveUrl").value, "Google Drive");
    const sheetUrls = {
      "data-utama": validateHttpsUrl(document.getElementById("configDataUtamaUrl").value, "CSV DATA UTAMA"),
      "personil-bmc": validateHttpsUrl(document.getElementById("configPersonilBmcUrl").value, "CSV PERSONIL BMC"),
      outsourcing: validateHttpsUrl(document.getElementById("configOutsourcingUrl").value, "CSV Outsourcing")
    };
    status.textContent = "Menyimpan...";
    await setDoc(doc(db, "appSettings", "general"), {
      driveUrl,
      sheetUrls,
      updatedBy: normalizeEmail(currentUser?.email),
      updatedAt: serverTimestamp()
    }, { merge: true });
    status.textContent = "Sumber data berhasil disimpan.";
  } catch (error) {
    status.textContent = error.message || "Sumber data gagal disimpan.";
  }
}

async function saveMenuVisibilityConfig(event) {
  event.preventDefault();
  if (!requirePermission(canManageSystemConfig(), "Hanya Super Admin yang dapat mengatur visibilitas menu.")) return;

  const menuRoles = Object.fromEntries(MENU_DEFINITIONS.map(menu => [menu.id, []]));
  document.querySelectorAll('input[name="menu-role"]:checked').forEach(input => {
    if (menuRoles[input.dataset.menu] && CONFIGURABLE_ROLES.includes(input.dataset.role)) {
      menuRoles[input.dataset.menu].push(input.dataset.role);
    }
  });

  const status = document.getElementById("menuVisibilityStatus");
  const roleWithoutMenu = CONFIGURABLE_ROLES.find(role =>
    !MENU_DEFINITIONS.some(menu => menuRoles[menu.id].includes(role))
  );
  if (roleWithoutMenu) {
    status.textContent = `${ACCESS_ROLES[roleWithoutMenu].label} harus memiliki minimal satu menu.`;
    return;
  }

  try {
    status.textContent = "Menyimpan...";
    await setDoc(doc(db, "appSettings", "general"), {
      menuRoles,
      updatedBy: normalizeEmail(currentUser?.email),
      updatedAt: serverTimestamp()
    }, { merge: true });
    status.textContent = "Visibilitas menu berhasil disimpan.";
  } catch (error) {
    status.textContent = `Gagal menyimpan: ${error.message}`;
  }
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

function togglePersonnelToolsMenu() {
  const menu = document.getElementById("personnelToolsMenu");
  const button = document.getElementById("personnelToolsButton");
  const willOpen = menu.classList.contains("hidden");
  closePersonnelMenus();
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}

function closePersonnelMenus() {
  document.querySelectorAll(".personnel-tools-menu, .personnel-row-menu").forEach(menu => {
    menu.classList.add("hidden");
  });
  document.querySelectorAll(".personnel-action-dropdown .action-dropdown-button, .personnel-row-dropdown .action-dropdown-button").forEach(button => {
    button.setAttribute("aria-expanded", "false");
  });
}

function toggleJobsToolsMenu(event) {
  event?.preventDefault();
  event?.stopPropagation();
  const menu = document.getElementById("jobsToolsMenu");
  const button = document.getElementById("jobsToolsButton");
  const willOpen = menu.classList.contains("hidden");
  closeJobsMenus();
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}

function closeJobsMenus() {
  const menu = document.getElementById("jobsToolsMenu");
  const button = document.getElementById("jobsToolsButton");
  if (menu) menu.classList.add("hidden");
  if (button) button.setAttribute("aria-expanded", "false");
}

async function refreshJobsData() {
  const button = document.getElementById("refreshJobsButton");
  if (!button || button.disabled) return;

  const originalText = button.textContent;
  button.disabled = true;
  button.classList.add("is-loading");
  button.setAttribute("aria-busy", "true");
  button.textContent = "Memuat...";

  try {
    await loadExternalSheetData();
    button.textContent = "Diperbarui";
    await new Promise(resolve => window.setTimeout(resolve, 700));
  } finally {
    button.disabled = false;
    button.classList.remove("is-loading");
    button.removeAttribute("aria-busy");
    button.textContent = originalText;
  }
}

function togglePersonnelRowMenu(button) {
  const menu = button.closest(".personnel-row-dropdown")?.querySelector(".personnel-row-menu");
  if (!menu) return;
  const willOpen = menu.classList.contains("hidden");
  closePersonnelMenus();
  menu.classList.toggle("hidden", !willOpen);
  button.setAttribute("aria-expanded", String(willOpen));
}

function openAiChat() {
  if (!currentUser) return;
  if (Date.now() - externalSheetLastLoadedAt > 60 * 1000) {
    loadExternalSheetData();
  }
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
  const liveContext = buildLiveAiContext(tasks, people);
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
    return `Saya membaca konteks aplikasi secara realtime. Saat ini tersedia ${liveContext.datasets.length} kelompok data (${liveContext.datasets.map(item => item.label).join(", ")}), ${liveContext.fields.length} jenis field, dan ${liveContext.interfaceItems.length} elemen menu/tampilan. Anda dapat menyebut nama data, field, tugas, orang, laporan, atau menu secara langsung.`;
  }

  const dynamicAnswer = answerFromLiveContext(normalized, liveContext);
  if (dynamicAnswer) return dynamicAnswer;

  return `Saya belum menemukan data yang cocok. Data yang terbaca saat ini: ${liveContext.datasets.map(item => item.label).join(", ")}. Field yang tersedia antara lain: ${liveContext.fields.slice(0, 12).join(", ")}. Coba gunakan nama data, field, menu, tugas, atau orang yang lebih spesifik.`;
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
      const haystack = normalizeSearchText(objectSearchText(task));
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

function buildLiveAiContext(tasks, people) {
  const reports = state.reports.map((report, index) => ({
    urutan: index + 1,
    isi: report
  }));
  const datasets = [
    { label: "Tugas", records: tasks },
    { label: "Orang/Profil", records: people },
    { label: "Laporan", records: reports },
    ...state.externalSheets
      .filter(sheet => sheet.status === "ready")
      .map(sheet => ({ label: sheet.label, records: sheet.records }))
  ];
  const fields = Array.from(new Set(datasets.flatMap(dataset =>
    dataset.records.flatMap(record => Object.keys(record || {}))
  ))).sort((a, b) => a.localeCompare(b));
  const interfaceItems = Array.from(document.querySelectorAll(
    "[data-view], nav button, .view h2, .view h3, .view label, .view th, .view button, .action-dropdown-menu button"
  ))
    .map(element => String(element.textContent || "").replace(/\s+/g, " ").trim())
    .filter(text => text && text.toLowerCase() !== "x")
    .filter((text, index, items) => items.indexOf(text) === index);

  return {
    datasets,
    fields,
    interfaceItems,
    capturedAt: new Date()
  };
}

function answerFromLiveContext(question, context) {
  if (includesAny(question, ["menu", "fitur", "halaman", "tampilan", "elemen", "tombol", "navigasi"])) {
    const matchedItems = rankTextMatches(question, context.interfaceItems);
    const items = matchedItems.length ? matchedItems : context.interfaceItems;
    return items.length
      ? `Menu dan elemen aplikasi yang terbaca:\n${items.slice(0, 18).map(item => `- ${item}`).join("\n")}`
      : "Belum ada menu atau elemen aplikasi yang dapat dibaca.";
  }

  if (includesAny(question, ["database", "penyimpanan", "firebase", "firestore", "google drive", "drive"])) {
    const storageItems = context.interfaceItems.filter(item =>
      includesAny(normalizeSearchText(item), ["database", "firebase", "firestore", "google drive", "drive", "folder"])
    );
    return [
      "Penyimpanan aplikasi yang terbaca:",
      "- Firebase Firestore menyimpan dan menyinkronkan data aplikasi.",
      "- Google Drive disediakan sebagai lokasi penyimpanan file/dokumen.",
      storageItems.length ? `Elemen terkait: ${storageItems.join(", ")}.` : ""
    ].filter(Boolean).join("\n");
  }

  if (includesAny(question, ["field", "kolom", "jenis data", "struktur data", "elemen data", "data apa"])) {
    return context.fields.length
      ? `Struktur data yang terbaca realtime (${context.fields.length} field):\n${context.fields.map(field => `- ${humanizeFieldName(field)}`).join("\n")}`
      : "Belum ada field data yang dapat dibaca.";
  }

  const tokens = getMeaningfulTokens(question);
  if (!tokens.length) return "";

  const matchedDatasets = context.datasets.filter(dataset => {
    const datasetName = normalizeSearchText(dataset.label);
    return tokens.some(token => datasetName.includes(token));
  });
  if (matchedDatasets.length === 1) {
    const dataset = matchedDatasets[0];
    if (includesAny(question, ["berapa", "jumlah", "total", "banyak"])) {
      return `${dataset.label} berisi ${dataset.records.length} data yang sedang terbaca.`;
    }
    if (includesAny(question, ["daftar", "tampilkan", "lihat", "siapa", "apa saja"])) {
      return dataset.records.length
        ? `${dataset.label} (${dataset.records.length} data):\n${dataset.records.slice(0, 12).map((record, index) =>
          `- ${summarizeDynamicRecord(record, index)}`
        ).join("\n")}${dataset.records.length > 12 ? `\n...dan ${dataset.records.length - 12} data lainnya.` : ""}`
        : `${dataset.label} belum memiliki data yang dapat dibaca.`;
    }
  }

  const matches = [];
  context.datasets.forEach(dataset => {
    dataset.records.forEach((record, index) => {
      const searchable = normalizeSearchText(objectSearchText(record));
      const score = tokens.reduce((total, token) => total + (searchable.includes(token) ? 1 : 0), 0);
      if (score) matches.push({ dataset: dataset.label, record, index, score });
    });
  });

  matches.sort((a, b) => b.score - a.score);
  if (!matches.length) return "";

  return `Saya menemukan ${matches.length} data yang berkaitan:\n${matches.slice(0, 8).map(match =>
    `- ${match.dataset}: ${summarizeDynamicRecord(match.record, match.index)}`
  ).join("\n")}`;
}

function getMeaningfulTokens(value) {
  const ignored = new Set([
    "apa", "apakah", "ada", "yang", "dan", "atau", "dari", "untuk", "dengan",
    "saya", "anda", "bisa", "tolong", "beri", "berikan", "tentang", "disini",
    "di", "ke", "ini", "itu", "semua", "data", "informasi"
  ]);
  return normalizeSearchText(value)
    .split(" ")
    .filter(token => token.length >= 3 && !ignored.has(token));
}

function objectSearchText(value, depth = 0) {
  if (value == null || depth > 3) return "";
  if (Array.isArray(value)) return value.map(item => objectSearchText(item, depth + 1)).join(" ");
  if (typeof value === "object") {
    if (typeof value.toDate === "function") return String(value.toDate());
    return Object.entries(value)
      .map(([key, item]) => `${humanizeFieldName(key)} ${objectSearchText(item, depth + 1)}`)
      .join(" ");
  }
  return String(value);
}

function summarizeDynamicRecord(record, index) {
  if (typeof record !== "object" || record == null) return String(record);
  const preferredKeys = [
    "namaTugas", "displayName", "nickname", "name", "email", "status",
    "prioritas", "penanggungJawab", "deadline", "isi"
  ];
  const entries = Object.entries(record)
    .filter(([, value]) => value != null && value !== "" && typeof value !== "object")
    .sort(([keyA], [keyB]) => preferredKeys.indexOf(keyB) - preferredKeys.indexOf(keyA))
    .slice(0, 6);
  if (!entries.length) return `Data ${index + 1}`;
  return entries.map(([key, value]) => `${humanizeFieldName(key)}: ${String(value)}`).join(" | ");
}

function humanizeFieldName(value) {
  return String(value || "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, character => character.toUpperCase());
}

function rankTextMatches(question, items) {
  const tokens = getMeaningfulTokens(question);
  return items
    .map(item => ({
      item,
      score: tokens.reduce((total, token) =>
        total + (normalizeSearchText(item).includes(token) ? 1 : 0), 0)
    }))
    .filter(result => result.score)
    .sort((a, b) => b.score - a.score)
    .map(result => result.item);
}

function createInitialExternalSheets(config = createDefaultAppConfig()) {
  return DEFAULT_EXTERNAL_SHEET_SOURCES.map(source => ({
    ...source,
    url: config?.sheetUrls?.[source.id] || source.url,
    records: [],
    status: "idle",
    error: ""
  }));
}

async function loadExternalSheetData() {
  const loadingSheets = state.externalSheets.map(sheet => ({
    ...sheet,
    status: "loading",
    error: ""
  }));
  state.externalSheets = loadingSheets;
  renderExternalSheetStatus();

  let bridgeRecords = {};
  if (window.PERSONNEL_BRIDGE_URL && window.PERSONNEL_BRIDGE_TOKEN) {
    try {
      bridgeRecords = await loadPersonnelBridgeData();
    } catch (error) {
      bridgeRecords = {};
    }
  }

  const results = await Promise.all(loadingSheets.map(async sheet => {
    if (Array.isArray(bridgeRecords[sheet.id])) {
      return {
        ...sheet,
        records: bridgeRecords[sheet.id],
        status: "ready",
        error: ""
      };
    }
    try {
      const separator = sheet.url.includes("?") ? "&" : "?";
      const response = await fetch(`${sheet.url}${separator}_=${Date.now()}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const csvText = await response.text();
      if (!csvText.trim()) throw new Error("Data kosong");
      return {
        ...sheet,
        records: csvToRecords(csvText),
        status: "ready",
        error: ""
      };
    } catch (error) {
      if (Array.isArray(bridgeRecords[sheet.id])) {
        return {
          ...sheet,
          records: bridgeRecords[sheet.id],
          status: "ready",
          error: ""
        };
      }
      return {
        ...sheet,
        status: "error",
        error: error?.message || "Gagal memuat data"
      };
    }
  }));

  state.externalSheets = results;
  externalSheetLastLoadedAt = Date.now();
  await syncTenderJobsFromDataUtama();
  renderExternalSheetStatus();
  renderPersonnelNameSuggestions();
  renderStats();
  renderTasks();
  renderFocusList();
  renderAgenda();
  renderLocalAI();
  renderPersonnel();
  renderJobs();
  renderTenders();
  renderDashboardPortfolioHome();
  renderDashboardWorkSummary();
}

function loadPersonnelBridgeData() {
  return new Promise((resolve, reject) => {
    const callbackName = `personnelBridgeCallback_${Date.now()}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Personnel Bridge tidak merespons."));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      script.remove();
      delete window[callbackName];
    }

    window[callbackName] = response => {
      cleanup();
      if (!response?.ok) {
        reject(new Error(response?.error || "Personnel Bridge gagal membaca data."));
        return;
      }
      resolve(response.sheets || {});
    };

    const url = new URL(window.PERSONNEL_BRIDGE_URL);
    url.searchParams.set("action", "read");
    url.searchParams.set("token", window.PERSONNEL_BRIDGE_TOKEN);
    url.searchParams.set("callback", callbackName);
    url.searchParams.set("_", String(Date.now()));
    script.src = url.toString();
    script.onerror = () => {
      cleanup();
      reject(new Error("Personnel Bridge gagal dimuat."));
    };
    document.head.appendChild(script);
  });
}

function csvToRecords(csvText) {
  const rows = parseCsv(csvText)
    .map(row => row.map(value => String(value || "").trim()));
  if (!rows.length) return [];

  const headerIndex = findCsvHeaderRow(rows);
  const headers = makeUniqueHeaders(rows[headerIndex]);

  return rows.slice(headerIndex + 1)
    .filter(row => row.some(value => value !== ""))
    .map((row, index) => {
      const record = { "_Sumber Baris": headerIndex + index + 2 };
      headers.forEach((header, columnIndex) => {
        record[header] = row[columnIndex] || "";
      });
      return record;
    });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === "\"") {
      if (quoted && nextCharacter === "\"") {
        value += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(value);
      value = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && nextCharacter === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}

function findCsvHeaderRow(rows) {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 30).forEach((row, index) => {
    const nonEmpty = row.filter(value => value !== "");
    const textCells = nonEmpty.filter(value => /[a-z]/i.test(value));
    const score = (nonEmpty.length * 2) + textCells.length;
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function makeUniqueHeaders(headerRow) {
  const counts = new Map();
  return headerRow.map((header, index) => {
    const base = header || `Kolom ${index + 1}`;
    const count = (counts.get(base) || 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function renderExternalSheetStatus() {
  const container = document.getElementById("sheetSourceStatus");
  if (!container) return;

  container.innerHTML = state.externalSheets.map(sheet => {
    const statusLabel = sheet.status === "ready"
      ? `${sheet.records.length} data`
      : sheet.status === "loading"
        ? "Memuat..."
        : sheet.status === "error"
          ? "Tidak dapat dibaca"
          : "Menunggu";
    return `
      <div class="sheet-status-row">
        <span class="sheet-status-dot ${escapeHtml(sheet.status)}"></span>
        <span>${escapeHtml(sheet.label)}</span>
        <strong>${escapeHtml(statusLabel)}</strong>
      </div>
    `;
  }).join("");
}

function getDataUtamaSheet() {
  return state.externalSheets.find(sheet => sheet.id === "data-utama") || null;
}

function findRecordColumn(record, keywords) {
  return Object.keys(record || {}).find(key =>
    includesAny(normalizeSearchText(key), keywords)
  ) || "";
}

function getRecordValue(record, keywords) {
  const key = findRecordColumn(record, keywords);
  return key ? String(record?.[key] || "").trim() : "";
}

function getComparableDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const nativeDate = new Date(raw);
  if (!Number.isNaN(nativeDate.getTime())) return nativeDate.getTime();

  const months = {
    januari: 0,
    februari: 1,
    maret: 2,
    april: 3,
    mei: 4,
    juni: 5,
    juli: 6,
    agustus: 7,
    september: 8,
    oktober: 9,
    november: 10,
    desember: 11
  };
  const parts = normalizeSearchText(raw).split(" ");
  if (parts.length >= 3 && months[parts[1]] !== undefined) {
    const day = Number(parts[0]);
    const year = Number(parts[2]);
    if (day && year) return new Date(year, months[parts[1]], day).getTime();
  }
  return 0;
}

function getYearFromDateValue(value) {
  const timestamp = getComparableDate(value);
  if (timestamp) return new Date(timestamp).getFullYear();
  const match = String(value || "").match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : 0;
}

function getJobYears(job) {
  const overrideYears = String(job?.yearOverride || "")
    .match(/\b(19|20)\d{2}\b/g)
    ?.map(Number) || [];
  const explicitYears = (job?.records || [])
    .map(record => Number(getRecordValue(record, ["tahun", "year"])))
    .filter(year => year >= 1900 && year <= 2200);
  const startYear = getYearFromDateValue(job?.tanggalMulai);
  const finishYear = getYearFromDateValue(job?.tanggalSelesai);
  const years = new Set([...overrideYears, ...explicitYears]);

  if (startYear && finishYear && finishYear >= startYear && finishYear - startYear <= 20) {
    for (let year = startYear; year <= finishYear; year += 1) years.add(year);
  } else {
    if (startYear) years.add(startYear);
    if (finishYear) years.add(finishYear);
  }
  return [...years].sort((a, b) => a - b);
}

function getJobYearLabel(job) {
  const years = getJobYears(job);
  if (!years.length) return "-";
  if (years.length === 1) return String(years[0]);
  return `${years[0]}-${years[years.length - 1]}`;
}

function getAvailableJobYears() {
  return [...new Set(buildJobsFromAllSources().flatMap(getJobYears))]
    .sort((a, b) => b - a);
}

function renderYearFilterOptions() {
  const years = getAvailableJobYears();
  [
    ["jobsYearFilter", "jobsYear"],
    ["personnelYearFilter", "personnelYear"]
  ].forEach(([elementId, stateKey]) => {
    const select = document.getElementById(elementId);
    if (!select || document.activeElement === select) return;
    const selected = String(state[stateKey] || "all");
    select.innerHTML = [
      '<option value="all">Semua Tahun</option>',
      ...years.map(year => `<option value="${year}">${year}</option>`)
    ].join("");
    select.value = years.includes(Number(selected)) ? selected : "all";
    state[stateKey] = select.value;
  });
}

function buildJobsFromDataUtama() {
  const sheet = getDataUtamaSheet();
  if (!sheet || sheet.status !== "ready") return [];

  const groups = new Map();
  sheet.records.forEach((record, index) => {
    const jobName = getRecordValue(record, ["pekerjaan", "nama pekerjaan", "project", "proyek"]);
    if (!jobName) return;
    const key = normalizeSearchText(jobName);
    const startDate = getRecordValue(record, ["tanggal mulai", "tgl mulai", "mulai"]);
    const finishDate = getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"]);
    const existing = groups.get(key) || {
      id: key || `pekerjaan-${index}`,
      pekerjaan: jobName,
      tanggalMulai: startDate,
      tanggalSelesai: finishDate,
      records: []
    };
    existing.records.push(record);
    if (!existing.tanggalMulai && startDate) existing.tanggalMulai = startDate;
    if (!existing.tanggalSelesai && finishDate) existing.tanggalSelesai = finishDate;
    groups.set(key, existing);
  });

  return Array.from(groups.values());
}

function buildJobsFromAllSources() {
  const jobs = buildJobsFromDataUtama();
  const knownKeys = new Set(jobs.map(job => normalizeSearchText(job.pekerjaan)));

  state.tenders.forEach(tender => {
    const name = String(tender.name || "").trim();
    const key = normalizeSearchText(tender.sourceJobKey || name);
    if (!name || knownKeys.has(key)) return;
    const personnel = getTenderPersonnel(tender);
    jobs.push({
      id: `tender:${tender.id}`,
      pekerjaan: name,
      tanggalMulai: tender.startDate || "",
      tanggalSelesai: tender.deadline ? formatTenderDateTime(tender.deadline) : "",
      records: [],
      statusOverride: "Tender",
      yearOverride: tender.budgetYear || "",
      personnelCount: personnel.length || tender.sourcePersonnelCount || 0,
      tenderId: tender.id,
      sourceType: "tender"
    });
    knownKeys.add(key);
  });

  return jobs;
}

function getJobStatus(job) {
  if (job?.statusOverride) return job.statusOverride;
  const statuses = [...new Set((job?.records || [])
    .map(record => getRecordValue(record, ["status pekerjaan", "status project", "status proyek"]))
    .filter(Boolean))];
  return statuses.length ? statuses.join(", ") : "-";
}

function getNormalizedJobStatus(job) {
  return normalizeSearchText(getJobStatus(job));
}

function jobMatchesStatusFilter(job, filter) {
  if (!filter || filter === "all") return true;
  const status = getNormalizedJobStatus(job);
  if (filter === "tender") return status.includes("tender");
  if (filter === "completed") {
    return (status.includes("finish") || status.includes("selesai")) &&
      !status.includes("overtime");
  }
  if (filter === "finish-overtime") {
    return (status.includes("finish") || status.includes("selesai")) &&
      status.includes("overtime");
  }
  if (filter === "finish") {
    return (status.includes("finish") || status.includes("selesai")) &&
      !status.includes("overtime");
  }
  if (filter === "upcoming") {
    return status.includes("upcoming") || status.includes("rencana");
  }
  if (filter === "ongoing") {
    return status.includes("ongoing") ||
      status.includes("aktif") ||
      status.includes("active") ||
      status.includes("overtime") ||
      status.includes("progress") ||
      status.includes("proses") ||
      status.includes("berjalan") ||
      (job.records || []).some(isActiveWorkRecord);
  }
  return true;
}

function getPortfolioScopeJobs() {
  const queryText = normalizeSearchText(state.jobsSearch);
  const queryTokens = getMeaningfulTokens(queryText);
  return buildJobsFromAllSources().filter(job => {
    const matchesYear = state.jobsYear === "all" ||
      getJobYears(job).includes(Number(state.jobsYear));
    if (!matchesYear) return false;
    if (!queryTokens.length) return true;
    const haystack = normalizeSearchText([
      job.pekerjaan,
      job.tanggalMulai,
      job.tanggalSelesai,
      getJobStatus(job),
      ...job.records.map(record => objectSearchText(record))
    ].join(" "));
    return queryTokens.every(token => haystack.includes(token));
  });
}

function getFilteredJobs() {
  let jobs = getPortfolioScopeJobs()
    .filter(job => jobMatchesStatusFilter(job, state.jobsStatus));

  jobs = jobs.sort((a, b) => a.pekerjaan.localeCompare(b.pekerjaan, "id"));

  return jobs;
}

function getPortfolioCounts(jobs) {
  return {
    total: jobs.length,
    active: jobs.filter(job => getPortfolioStatusKey(job) === "active").length,
    finish: jobs.filter(job => getPortfolioStatusKey(job) === "finish").length,
    tender: jobs.filter(job => getPortfolioStatusKey(job) === "tender").length,
    upcoming: jobs.filter(job => getPortfolioStatusKey(job) === "upcoming").length
  };
}

function getPortfolioStatusKey(job) {
  if (jobMatchesStatusFilter(job, "tender")) return "tender";
  if (jobMatchesStatusFilter(job, "finish-overtime")) return "active";
  if (jobMatchesStatusFilter(job, "finish")) return "finish";
  if (jobMatchesStatusFilter(job, "upcoming")) return "upcoming";
  if (jobMatchesStatusFilter(job, "ongoing") ||
      (job.records || []).some(isActiveWorkRecord)) return "active";
  return "neutral";
}

function getPortfolioStatusLabel(job) {
  const status = getJobStatus(job);
  if (status && status !== "-") return status;
  const key = getPortfolioStatusKey(job);
  return {
    active: "Aktif",
    tender: "Tender",
    upcoming: "Upcoming",
    finish: "Finish",
    "finish-overtime": "Finish Overtime"
  }[key] || "Belum Ditentukan";
}

function getPortfolioProgress(job) {
  const key = getPortfolioStatusKey(job);
  if (key === "finish" || key === "finish-overtime") return 100;
  if (key === "tender") {
    const target = normalizeSearchText(job.pekerjaan);
    const tender = state.tenders.find(item =>
      item.id === job.tenderId ||
      item.sourceJobKey === target ||
      normalizeSearchText(item.name) === target
    );
    return tender ? getTenderProgress(tender).percent : 0;
  }
  if (key === "upcoming") return 12;
  if (key !== "active") return 0;

  const start = getComparableDate(job.tanggalMulai);
  const finish = getComparableDate(job.tanggalSelesai);
  const now = Date.now();
  if (start && finish && finish > start) {
    return Math.min(95, Math.max(5, Math.round(((now - start) / (finish - start)) * 100)));
  }
  return 60;
}

function getPortfolioPeople(job) {
  const names = [];
  const seen = new Set();
  (job.records || []).forEach(record => {
    const name = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]);
    const key = canonicalPersonnelName(name) || normalizeSearchText(name);
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  });
  return names.slice(0, 4);
}

function getPortfolioCardPriority(job) {
  return {
    tender: 0,
    active: 1,
    upcoming: 2,
    "finish-overtime": 3,
    finish: 4,
    neutral: 5
  }[getPortfolioStatusKey(job)] ?? 6;
}

function renderPortfolioOverview(filteredJobs) {
  const scopeJobs = getPortfolioScopeJobs();
  const counts = getPortfolioCounts(scopeJobs);
  document.getElementById("portfolioYearLabel").textContent = state.jobsYear === "all"
    ? "Seluruh portofolio"
    : `Portofolio tahun ${state.jobsYear}`;
  document.getElementById("portfolioTotalCount").textContent = counts.total;
  document.getElementById("portfolioActiveCount").textContent = counts.active;
  document.getElementById("portfolioFinishCount").textContent = counts.finish;
  document.getElementById("portfolioTenderCount").textContent = counts.tender;
  document.getElementById("portfolioUpcomingCount").textContent = counts.upcoming;
  document.getElementById("portfolioCollectionCount").textContent = `${filteredJobs.length} item`;

  const featured = [...filteredJobs]
    .sort((left, right) =>
      getPortfolioCardPriority(left) - getPortfolioCardPriority(right) ||
      left.pekerjaan.localeCompare(right.pekerjaan, "id")
    )
    .slice(0, 3);
  state.portfolioFeaturedJobs = featured;

  const container = document.getElementById("portfolioFeaturedJobs");
  container.innerHTML = featured.length
    ? featured.map((job, index) => {
        const statusKey = getPortfolioStatusKey(job);
        const people = getPortfolioPeople(job);
        const progress = getPortfolioProgress(job);
        const personCount = job.personnelCount ?? job.records.length;
        const footerLabel = statusKey === "tender"
          ? `${progress}% dokumen`
          : job.tanggalSelesai || `${personCount} personil`;
        return `
          <button class="portfolio-job-card status-${escapeHtml(statusKey)}" type="button" data-portfolio-job-index="${index}">
            <span class="portfolio-card-accent"></span>
            <span class="portfolio-card-heading">
              <strong>${escapeHtml(job.pekerjaan)}</strong>
              <span class="portfolio-status">${escapeHtml(getPortfolioStatusLabel(job))}</span>
            </span>
            <span class="portfolio-card-team">
              <span class="portfolio-avatars">
                ${people.map(name => `<i title="${escapeHtml(name)}">${escapeHtml(getInitials(name))}</i>`).join("")}
                ${people.length ? "" : "<em>Belum ada personil</em>"}
              </span>
              <small>${personCount} personil</small>
            </span>
            <span class="portfolio-progress-track" aria-label="Indikator tahap ${progress}%">
              <span style="width:${progress}%"></span>
            </span>
            <span class="portfolio-card-footer">
              <b>${progress}%</b>
              <small>${escapeHtml(footerLabel)}</small>
            </span>
          </button>
        `;
      }).join("")
    : '<div class="portfolio-empty">Tidak ada pekerjaan yang cocok dengan filter.</div>';

  const selectedYear = getCurrentSummaryYear();
  const personnel = getAllIntegratedPersonnelRecords(selectedYear);
  const availablePersonnel = personnel.filter(record => getPersonnelActiveWork(record) <= 0).length;
  const briefParts = [];
  if (counts.tender) briefParts.push(`${counts.tender} paket Tender perlu dipantau`);
  if (counts.upcoming) briefParts.push(`${counts.upcoming} pekerjaan Upcoming perlu persiapan`);
  if (availablePersonnel) briefParts.push(`${availablePersonnel} personil tersedia untuk dialokasikan`);
  document.getElementById("portfolioAiBrief").textContent = briefParts.length
    ? `${briefParts.join(". ")}.`
    : "Portofolio tidak memiliki peringatan utama berdasarkan data yang tersedia.";

  renderPortfolioActivity(scopeJobs);
  renderPortfolioAgenda();
}

function renderPortfolioActivity(allJobs) {
  const activities = buildPortfolioActivities(allJobs);
  document.getElementById("portfolioActivityList").innerHTML = renderPortfolioActivityItems(activities);
}

function buildPortfolioActivities(allJobs) {
  const activities = [];
  state.tenders.slice(0, 2).forEach(tender => {
    activities.push({
      initials: getInitials(tender.updatedBy || tender.ownerName || "Tender"),
      tone: "purple",
      title: `memperbarui paket ${tender.name || "Tender"}`,
      meta: `${tender.status || "Persiapan"} - ${tender.ownerName || tender.updatedBy || "Tim Tender"}`
    });
  });
  state.tasks
    .slice()
    .sort((left, right) => String(right.deadline || right.tanggal || "").localeCompare(String(left.deadline || left.tanggal || "")))
    .slice(0, Math.max(0, 3 - activities.length))
    .forEach(task => {
      activities.push({
        initials: getInitials(task.penanggungJawab || task.dibuatOleh || "Tim"),
        tone: task.status === "Selesai" ? "green" : "blue",
        title: `${task.status === "Selesai" ? "menyelesaikan" : "menangani"} ${task.namaTugas}`,
        meta: task.deadline ? `Deadline ${task.deadline}` : task.tanggal || "Agenda aktif"
      });
    });
  if (activities.length < 3) {
    allJobs.slice(0, 3 - activities.length).forEach(job => {
      activities.push({
        initials: getInitials(job.pekerjaan),
        tone: getPortfolioStatusKey(job) === "upcoming" ? "orange" : "green",
        title: `${job.pekerjaan} berstatus ${getPortfolioStatusLabel(job)}`,
        meta: `${job.personnelCount ?? job.records.length} personil terhubung`
      });
    });
  }

  return activities.slice(0, 3);
}

function renderPortfolioActivityItems(activities) {
  return activities.length
    ? activities.slice(0, 3).map(activity => `
        <div class="portfolio-activity-item">
          <span class="portfolio-activity-avatar ${escapeHtml(activity.tone)}">${escapeHtml(activity.initials)}</span>
          <span>
            <strong>${escapeHtml(activity.title)}</strong>
            <small>${escapeHtml(activity.meta)}</small>
          </span>
        </div>
      `).join("")
    : '<p class="portfolio-empty-note">Belum ada aktivitas yang dapat ditampilkan.</p>';
}

function renderPortfolioAgenda() {
  const agenda = getFocusTasks().slice(0, 2);
  document.getElementById("portfolioAgendaCount").textContent = `${agenda.length} agenda`;
  document.getElementById("portfolioAgendaList").innerHTML = agenda.length
    ? agenda.map(task => `
        <div class="portfolio-agenda-item">
          <span>${escapeHtml(task.deadline ? task.deadline.slice(0, 10) : task.tanggal || "-")}</span>
          <strong>${escapeHtml(task.namaTugas)}</strong>
          <small>${escapeHtml(task.penanggungJawab || "Penanggung jawab belum diisi")}</small>
        </div>
      `).join("")
    : '<p class="portfolio-empty-note">Belum ada agenda prioritas.</p>';
}

function renderDashboardPortfolioHome() {
  const allJobs = buildJobsFromAllSources();
  const counts = getPortfolioCounts(allJobs);
  document.getElementById("dashboardPortfolioYearLabel").textContent = "Seluruh portofolio";
  document.getElementById("dashboardPortfolioTotal").textContent = counts.total;
  document.getElementById("dashboardPortfolioActive").textContent = counts.active;
  document.getElementById("dashboardPortfolioFinish").textContent = counts.finish;
  document.getElementById("dashboardPortfolioTender").textContent = counts.tender;
  document.getElementById("dashboardPortfolioUpcoming").textContent = counts.upcoming;

  const featured = [...allJobs]
    .sort((left, right) =>
      getPortfolioCardPriority(left) - getPortfolioCardPriority(right) ||
      left.pekerjaan.localeCompare(right.pekerjaan, "id")
    )
    .slice(0, 3);
  state.dashboardFeaturedJobs = featured;
  document.getElementById("dashboardFeaturedJobs").innerHTML = featured.length
    ? featured.map((job, index) => renderPortfolioJobCard(job, index, "dashboard-portfolio-job-index")).join("")
    : '<div class="portfolio-empty">Belum ada proyek yang dapat ditampilkan.</div>';

  document.getElementById("dashboardActivityList").innerHTML =
    renderPortfolioActivityItems(buildPortfolioActivities(allJobs));

  const agenda = getFocusTasks().slice(0, 2);
  document.getElementById("dashboardAgendaCount").textContent = `${agenda.length} agenda`;
  document.getElementById("dashboardAgendaBento").innerHTML = agenda.length
    ? agenda.map(task => `
        <div class="portfolio-agenda-item">
          <span>${escapeHtml(task.deadline ? task.deadline.slice(0, 10) : task.tanggal || "-")}</span>
          <strong>${escapeHtml(task.namaTugas)}</strong>
          <small>${escapeHtml(task.penanggungJawab || "Penanggung jawab belum diisi")}</small>
        </div>
      `).join("")
    : '<p class="portfolio-empty-note">Belum ada agenda prioritas.</p>';

  const availablePersonnel = getAllIntegratedPersonnelRecords(getCurrentSummaryYear())
    .filter(record => getPersonnelActiveWork(record) <= 0).length;
  const brief = [];
  if (counts.tender) brief.push(`${counts.tender} Tender perlu dipantau`);
  if (counts.upcoming) brief.push(`${counts.upcoming} proyek Upcoming perlu persiapan`);
  if (availablePersonnel) brief.push(`${availablePersonnel} personil tersedia untuk dialokasikan`);
  document.getElementById("dashboardPortfolioBrief").textContent = brief.length
    ? `${brief.join(". ")}.`
    : "Seluruh proyek dan kapasitas tim berada dalam kondisi stabil.";
}

function renderPortfolioJobCard(job, index, dataAttribute) {
  const statusKey = getPortfolioStatusKey(job);
  const people = getPortfolioPeople(job);
  const progress = getPortfolioProgress(job);
  const personCount = job.personnelCount ?? job.records.length;
  const footerLabel = statusKey === "tender"
    ? `${progress}% dokumen`
    : job.tanggalSelesai || `${personCount} personil`;
  return `
    <button class="portfolio-job-card status-${escapeHtml(statusKey)}" type="button" data-${dataAttribute}="${index}">
      <span class="portfolio-card-accent"></span>
      <span class="portfolio-card-heading">
        <strong>${escapeHtml(job.pekerjaan)}</strong>
        <span class="portfolio-status">${escapeHtml(getPortfolioStatusLabel(job))}</span>
      </span>
      <span class="portfolio-card-team">
        <span class="portfolio-avatars">
          ${people.map(name => `<i title="${escapeHtml(name)}">${escapeHtml(getInitials(name))}</i>`).join("")}
          ${people.length ? "" : "<em>Belum ada personil</em>"}
        </span>
        <small>${personCount} personil</small>
      </span>
      <span class="portfolio-progress-track" aria-label="Indikator tahap ${progress}%">
        <span style="width:${progress}%"></span>
      </span>
      <span class="portfolio-card-footer">
        <b>${progress}%</b>
        <small>${escapeHtml(footerLabel)}</small>
      </span>
    </button>
  `;
}

function handleDashboardPortfolioCardClick(event) {
  const card = event.target.closest("[data-dashboard-portfolio-job-index]");
  if (!card) return;
  openPortfolioJob(state.dashboardFeaturedJobs[Number(card.dataset.dashboardPortfolioJobIndex)]);
}

function handlePortfolioSummaryClick(event) {
  const trigger = event.target.closest("[data-portfolio-summary-filter]");
  if (!trigger) return;
  const context = trigger.dataset.portfolioSummaryContext;
  const filter = trigger.dataset.portfolioSummaryFilter || "all";

  if (context === "dashboard") {
    state.jobsSearch = "";
    state.jobsYear = "all";
  }
  state.jobsStatus = filter;
  state.jobsPage = 1;
  setView("jobs");

  const searchInput = document.getElementById("jobsSearch");
  const yearFilter = document.getElementById("jobsYearFilter");
  const statusFilter = document.getElementById("jobsStatusFilter");
  if (searchInput) searchInput.value = state.jobsSearch;
  if (yearFilter) yearFilter.value = state.jobsYear;
  if (statusFilter) statusFilter.value = state.jobsStatus;
  renderJobs();

  window.requestAnimationFrame(() => {
    document.querySelector(".portfolio-list-panel")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  });
}

function renderJobs() {
  const sheet = getDataUtamaSheet();
  const syncText = document.getElementById("jobsSyncText");
  const tableBody = document.getElementById("jobsTableBody");
  const resultCount = document.getElementById("jobsResultCount");
  if (!tableBody) return;
  renderYearFilterOptions();

  if (syncText) {
    const statusText = sheet?.status === "ready"
      ? "DATA UTAMA tersinkron"
      : sheet?.status === "loading"
        ? "Memuat DATA UTAMA..."
        : sheet?.status === "error"
          ? "DATA UTAMA belum dapat dibaca."
          : "Menunggu sinkronisasi DATA UTAMA...";
    syncText.textContent = statusText;
  }

  const jobs = getFilteredJobs();
  renderPortfolioOverview(jobs);
  state.jobsVisibleRecords = jobs;
  const pageSize = Number(state.jobsPageSize) || 25;
  const pageCount = Math.max(1, Math.ceil(jobs.length / pageSize));
  state.jobsPage = Math.min(Math.max(1, state.jobsPage), pageCount);
  const startIndex = (state.jobsPage - 1) * pageSize;
  const visible = jobs.slice(startIndex, startIndex + pageSize);

  if (resultCount) resultCount.textContent = `${jobs.length} pekerjaan ditemukan`;
  if (!visible.length) {
    tableBody.innerHTML = '<tr><td class="personnel-empty" colspan="7">Tidak ada pekerjaan yang cocok.</td></tr>';
  } else {
    tableBody.innerHTML = visible.map((job, index) => `
      <tr class="clickable-row" data-job-index="${startIndex + index}" tabindex="0">
        <td data-label="No.">${startIndex + index + 1}</td>
        <td data-label="Pekerjaan"><strong>${escapeHtml(job.pekerjaan)}</strong></td>
        <td data-label="Tahun">${escapeHtml(getJobYearLabel(job))}</td>
        <td data-label="Tanggal Mulai">${escapeHtml(job.tanggalMulai || "-")}</td>
        <td data-label="Tanggal Selesai">${escapeHtml(job.tanggalSelesai || "-")}</td>
        <td data-label="Jumlah Personil">${job.personnelCount ?? job.records.length}</td>
        <td data-label="Status Pekerjaan">${escapeHtml(getJobStatus(job))}</td>
      </tr>
    `).join("");
  }

  setJobsPaginationButtons(pageCount);
}

function setJobsPaginationButtons(pageCount) {
  const info = document.getElementById("jobsPageInfo");
  const prev = document.getElementById("jobsPrevPage");
  const next = document.getElementById("jobsNextPage");
  if (info) info.textContent = `Halaman ${state.jobsPage} dari ${pageCount}`;
  if (prev) prev.disabled = state.jobsPage <= 1;
  if (next) next.disabled = state.jobsPage >= pageCount;
}

function resetJobsFilters() {
  state.jobsSearch = "";
  state.jobsYear = "all";
  state.jobsStatus = "all";
  state.jobsPage = 1;
  state.jobsPageSize = 25;
  document.getElementById("jobsSearch").value = "";
  document.getElementById("jobsYearFilter").value = "all";
  document.getElementById("jobsStatusFilter").value = state.jobsStatus;
  document.getElementById("jobsPageSize").value = "25";
  renderJobs();
}

function changeJobsPage(offset) {
  state.jobsPage += offset;
  renderJobs();
}

function handleJobsTableClick(event) {
  const row = event.target.closest("[data-job-index]");
  if (!row) return;
  const job = state.jobsVisibleRecords[Number(row.dataset.jobIndex)];
  openPortfolioJob(job);
}

function handlePortfolioCardClick(event) {
  const card = event.target.closest("[data-portfolio-job-index]");
  if (!card) return;
  openPortfolioJob(state.portfolioFeaturedJobs[Number(card.dataset.portfolioJobIndex)]);
}

function openPortfolioJob(job) {
  if (!job) return;
  if (job.tenderId) {
    state.selectedTenderId = job.tenderId;
    setView("tenders");
    renderTenders();
    return;
  }
  openJobDetail(job);
}

function getJobDetailColumns(records) {
  return getPersonnelColumns(records).filter(column => {
    const normalized = normalizeSearchText(column);
    return normalized !== "bobot" && normalized !== "beban";
  });
}

function getJobDetailColumnClass(column) {
  const normalized = normalizeSearchText(column);
  if (normalized === "id") return "compact";
  if (normalized.includes("nama personil")) return "wide";
  if (normalized === "pekerjaan") return "wide";
  if (normalized.includes("remunerasi") || normalized.includes("billing rate")) return "medium";
  if (normalized.includes("posisi") || normalized.includes("jabatan")) return "medium";
  return "";
}

function isRemunerationColumn(column) {
  const normalized = normalizeSearchText(column);
  return normalized.includes("remunerasi") || normalized.includes("billing rate");
}

function parseIndonesianNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return null;
  let numeric = raw.replace(/[^\d,.-]/g, "");
  if (!numeric) return null;

  if (numeric.includes(",")) {
    numeric = numeric.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(numeric)) {
    numeric = numeric.replace(/\./g, "");
  }
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatRupiah(value) {
  const number = parseIndonesianNumber(value);
  if (number == null) return String(value || "-");
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(number);
}

function getRecordDisplayValue(record, column) {
  const normalized = normalizeSearchText(column);
  if (normalized === "bobot individual") {
    const involvementKey = Object.keys(record || {}).find(key =>
      normalizeSearchText(key) === "keterlibatan"
    );
    return normalizeSearchText(record?.[involvementKey]) === "ya" ? "1" : "0";
  }
  if (isRemunerationColumn(column)) return formatRupiah(record?.[column]);
  return String(record?.[column] || "-");
}

function openJobDetail(job) {
  const modal = document.getElementById("jobDetailModal");
  const title = document.getElementById("jobDetailTitle");
  const source = document.getElementById("jobDetailSource");
  const body = document.getElementById("jobDetailBody");
  if (!modal || !body) return;
  currentJobDetail = job;

  if (title) title.textContent = job.pekerjaan;
  if (source) {
    source.textContent = "Rincian pekerjaan dari Sheet DATA UTAMA";
  }

  const columns = getJobDetailColumns(job.records);
  body.innerHTML = `
    <div class="job-detail-summary">
      <div><span>Tanggal Mulai</span><strong>${escapeHtml(job.tanggalMulai || "-")}</strong></div>
      <div><span>Tanggal Selesai</span><strong>${escapeHtml(job.tanggalSelesai || "-")}</strong></div>
      <div><span>Jumlah Personil</span><strong>${job.records.length}</strong></div>
    </div>
    <div class="job-detail-table-surface">
      <table class="job-detail-wide-table">
        <colgroup>
          ${columns.map(column => `<col class="${getJobDetailColumnClass(column)}">`).join("")}
          ${canManagePersonnel() ? '<col class="compact">' : ""}
        </colgroup>
        <thead>
          <tr>
            ${columns.map(column => `<th>${escapeHtml(humanizeFieldName(column))}</th>`).join("")}
            ${canManagePersonnel() ? "<th>AKSI</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${job.records.map((record, recordIndex) => `
            <tr>
              ${columns.map(column => `
                <td data-label="${escapeHtml(humanizeFieldName(column))}">
                  ${escapeHtml(getRecordDisplayValue(record, column))}
                </td>
              `).join("")}
              ${canManagePersonnel() ? `
                <td class="job-detail-row-actions" data-label="Aksi">
                  <button
                    type="button"
                    class="job-detail-action-button"
                    data-job-record-menu
                    popovertarget="jobRecordActions${recordIndex}"
                  >
                    Pilihan <span class="dropdown-chevron" aria-hidden="true"></span>
                  </button>
                  <div id="jobRecordActions${recordIndex}" class="job-detail-action-menu" popover>
                    <button type="button" data-job-record-action="edit" data-job-record-index="${recordIndex}">Edit</button>
                    <button type="button" class="danger-text" data-job-record-action="delete" data-job-record-index="${recordIndex}">Hapus</button>
                  </div>
                </td>
              ` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
    <div class="job-detail-floating-scrollbar" aria-label="Geser tabel secara horizontal">
      <div class="job-detail-scrollbar-track"></div>
    </div>
  `;
  if (!modal.open) modal.showModal();
  setupJobDetailScrollSync(body);
}

function closeJobDetail() {
  const modal = document.getElementById("jobDetailModal");
  jobDetailResizeObserver?.disconnect();
  jobDetailResizeObserver = null;
  if (modal?.open) modal.close();
}

function setupJobDetailScrollSync(container) {
  const floatingScroller = container.querySelector(".job-detail-floating-scrollbar");
  const floatingTrack = container.querySelector(".job-detail-scrollbar-track");
  const tableScroller = container.querySelector(".job-detail-table-surface");
  const table = container.querySelector(".job-detail-wide-table");
  if (!floatingScroller || !floatingTrack || !tableScroller || !table) return;

  let syncing = false;
  const updateTrackWidth = () => {
    floatingTrack.style.width = `${table.scrollWidth}px`;
  };
  const syncScroll = (source, target) => {
    if (syncing) return;
    syncing = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncing = false;
    });
  };

  floatingScroller.addEventListener("scroll", () => syncScroll(floatingScroller, tableScroller));
  tableScroller.addEventListener("scroll", () => syncScroll(tableScroller, floatingScroller));
  jobDetailResizeObserver?.disconnect();
  jobDetailResizeObserver = new ResizeObserver(updateTrackWidth);
  jobDetailResizeObserver.observe(table);
  window.requestAnimationFrame(updateTrackWidth);
}

function getCurrentJobDetailExportData() {
  if (!currentJobDetail) {
    notify("Rincian pekerjaan belum dipilih.");
    return null;
  }

  return {
    title: currentJobDetail.pekerjaan,
    columns: getJobDetailColumns(currentJobDetail.records),
    records: currentJobDetail.records,
    tanggalMulai: currentJobDetail.tanggalMulai || "-",
    tanggalSelesai: currentJobDetail.tanggalSelesai || "-"
  };
}

function buildJobDetailExportTable(data) {
  return `
    <table>
      <thead>
        <tr>${data.columns.map(column => `<th>${escapeHtml(humanizeFieldName(column))}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${data.records.map(record => `
          <tr>${data.columns.map(column => `<td>${escapeHtml(getRecordDisplayValue(record, column))}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function getExportFileName(value) {
  return String(value || "pekerjaan")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

function exportCurrentJobDetailExcel() {
  const data = getCurrentJobDetailExportData();
  if (!data) return;

  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin: 0 0 6px; font-size: 18px; }
          p { margin: 0 0 14px; color: #64748b; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th { background: #3b82e6; color: #ffffff; font-weight: 700; text-align: center; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        <p>Tanggal ${escapeHtml(data.tanggalMulai)} sampai ${escapeHtml(data.tanggalSelesai)} - ${data.records.length} personil</p>
        ${buildJobDetailExportTable(data)}
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rincian-${getExportFileName(data.title)}-${state.today}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function printHtmlDocument(html) {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.border = "0";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const cleanup = () => {
    window.setTimeout(() => frame.remove(), 500);
  };

  frame.onload = () => {
    const printWindow = frame.contentWindow;
    if (!printWindow) {
      cleanup();
      notify("Dokumen PDF tidak dapat disiapkan. Muat ulang halaman lalu coba kembali.");
      return;
    }
    printWindow.addEventListener("afterprint", cleanup, { once: true });
    window.setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 150);
  };

  document.body.appendChild(frame);
  frame.srcdoc = html;
}

function exportCurrentJobDetailPdf() {
  const data = getCurrentJobDetailExportData();
  if (!data) return;

  const html = `
    <html>
      <head>
        <title>${escapeHtml(data.title)}</title>
        <style>
          @page { size: A3 landscape; margin: 9mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin: 0 0 5px; font-size: 18px; }
          p { margin: 0 0 12px; color: #64748b; font-size: 10px; }
          table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 7px; }
          th { background: #3b82e6; color: #ffffff; font-weight: 700; text-align: center; }
          th, td { border: 1px solid #94a3b8; padding: 4px; vertical-align: top; overflow-wrap: anywhere; }
          tr { break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        <p>Tanggal ${escapeHtml(data.tanggalMulai)} sampai ${escapeHtml(data.tanggalSelesai)} - ${data.records.length} personil</p>
        ${buildJobDetailExportTable(data)}
      </body>
    </html>
  `;
  printHtmlDocument(html);
}

function isJobComputedColumn(column) {
  return includesAny(normalizeSearchText(column), [
    "bobot",
    "beban",
    "jumlah bulan",
    "jumlah bulan overtime",
    "bobot individual"
  ]);
}

function getEditableJobColumns(records) {
  return getPersonnelColumns(records).filter(column =>
    column !== "_Sumber Baris" && !isJobComputedColumn(column)
  );
}

function renderJobRecordInput(column, value) {
  const normalized = normalizeSearchText(column);
  const escapedValue = escapeHtml(value || "");
  if (includesAny(normalized, ["nama personil", "nama lengkap"])) {
    return `<input name="${escapeHtml(column)}" value="${escapedValue}" list="personnelNameSuggestions" autocomplete="off" placeholder="Ketik nama personil dari Bemaco atau Outsourcing">`;
  }
  if (normalized === "keterlibatan") {
    return `
      <select name="${escapeHtml(column)}">
        <option value=""></option>
        <option value="YA" ${normalizeSearchText(value) === "ya" ? "selected" : ""}>YA</option>
        <option value="TIDAK" ${normalizeSearchText(value) === "tidak" ? "selected" : ""}>TIDAK</option>
      </select>
    `;
  }
  if (normalized === "id" || normalized.includes("status personil")) {
    return `
      <select name="${escapeHtml(column)}">
        <option value=""></option>
        <option value="Bemaco" ${includesAny(normalizeSearchText(value), ["bemaco", "bmc"]) ? "selected" : ""}>Bemaco</option>
        <option value="Outsourcing" ${normalizeSearchText(value).includes("outsour") ? "selected" : ""}>Outsourcing</option>
      </select>
    `;
  }
  if (normalized.includes("status pekerjaan")) {
    return `
      <input name="${escapeHtml(column)}" value="${escapedValue}" list="jobStatusOptions" autocomplete="off">
    `;
  }
  return `<input name="${escapeHtml(column)}" value="${escapedValue}" autocomplete="off">`;
}

function getPersonnelNameSuggestions() {
  const names = new Map();
  ["personil-bmc", "outsourcing"].forEach(sourceId => {
    const sheet = getPersonnelSheet(sourceId);
    if (!sheet || sheet.status !== "ready") return;
    sheet.records.forEach(record => {
      const name = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]);
      const key = canonicalPersonnelName(name) || normalizeSearchText(name);
      if (name && key && !names.has(key)) names.set(key, name);
    });
  });
  return [...names.values()].sort((left, right) => left.localeCompare(right, "id"));
}

function renderPersonnelNameSuggestions() {
  const list = document.getElementById("personnelNameSuggestions");
  if (!list) return;
  const names = getPersonnelNameSuggestions();
  list.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function renderTenderPersonnelSuggestions() {
  const list = document.getElementById("tenderPersonnelNameSuggestions");
  if (!list) return;
  const names = getPersonnelNameSuggestions();
  list.innerHTML = names.map(name => `<option value="${escapeHtml(name)}"></option>`).join("");
}

function getTenderReferencePersonnelByName(name) {
  const sheet = getDataUtamaSheet();
  if (!sheet || sheet.status !== "ready") return [];
  const target = normalizeSearchText(name);
  if (!target) return [];
  return sheet.records.filter(record =>
    normalizeSearchText(getRecordValue(record, ["pekerjaan", "nama pekerjaan", "project", "proyek"])) === target
  );
}

function renderTenderPersonnelReferenceFromForm() {
  const element = document.getElementById("tenderPersonnelReference");
  if (!element) return;
  const name = document.getElementById("tenderName")?.value || "";
  const personnel = getTenderReferencePersonnelByName(name);

  if (!name.trim()) {
    element.innerHTML = `
      <strong>Referensi personil DATA UTAMA</strong>
      <span>Isi nama paket untuk membaca personil terkait dari Sheet DATA UTAMA.</span>
    `;
    return;
  }

  if (!personnel.length) {
    element.innerHTML = `
      <strong>Referensi personil DATA UTAMA</strong>
      <span>Belum ditemukan personil terkait untuk paket ini.</span>
    `;
    return;
  }

  element.innerHTML = `
    <strong>Referensi personil DATA UTAMA (${personnel.length} personil)</strong>
    <div class="tender-personnel-reference-list">
      ${personnel.slice(0, 8).map(record => {
        const personName = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]) || "-";
        const position = getRecordValue(record, [
          "posisi/jabatan (kontrak)",
          "posisi/jabatan",
          "jabatan",
          "posisi"
        ]) || "-";
        const involvement = getRecordValue(record, ["keterlibatan"]) || "-";
        return `
          <div class="tender-personnel-reference-item">
            <strong>${escapeHtml(personName)}</strong>
            <span>${escapeHtml(position)}</span>
            <span>Keterlibatan: ${escapeHtml(involvement)}</span>
          </div>
        `;
      }).join("")}
    </div>
    ${personnel.length > 8 ? `<span>+ ${personnel.length - 8} personil lainnya tersedia di DATA UTAMA.</span>` : ""}
  `;
}

function normalizeTenderPersonnelMembers(value) {
  const members = Array.isArray(value) ? value : [];
  const unique = new Map();
  members.forEach(member => {
    const name = String(member?.name || member?.personnelName || "").trim();
    if (!name) return;
    const key = normalizeSearchText(name);
    if (!key || unique.has(key)) return;
    unique.set(key, createTenderPersonnelRecord({
      name,
      position: String(member?.position || member?.personnelPosition || "").trim(),
      involvement: String(member?.involvement || member?.personnelInvolvement || "").trim(),
      source: member?.source || "Tambahan"
    }));
  });
  return [...unique.values()];
}

function createTenderPersonnelRecord(member) {
  const name = String(member?.name || "").trim();
  const position = String(member?.position || "").trim();
  const involvement = String(member?.involvement || "").trim();
  const source = String(member?.source || "").trim();
  return {
    name,
    position,
    involvement,
    source,
    "NAMA PERSONIL": name,
    "POSISI/JABATAN (Kontrak)": position,
    "POSISI/JABATAN": position,
    "JABATAN": position,
    "KETERLIBATAN": involvement
  };
}

function getTenderPersonnelMembersFromForm() {
  const input = document.getElementById("tenderPersonnelMembersData");
  if (!input) return [];
  try {
    return normalizeTenderPersonnelMembers(JSON.parse(input.value || "[]"));
  } catch (error) {
    input.value = "[]";
    return [];
  }
}

function setTenderPersonnelMembersToForm(members) {
  const input = document.getElementById("tenderPersonnelMembersData");
  if (!input) return;
  input.value = JSON.stringify(normalizeTenderPersonnelMembers(members));
}

function getTenderManualPersonnelFromLegacyFields(tender) {
  if (!tender?.personnelName) return [];
  return normalizeTenderPersonnelMembers([{
    name: tender.personnelName,
    position: tender.personnelPosition,
    involvement: tender.personnelInvolvement
  }]);
}

function getTenderReferencePersonnelMembers(name) {
  return getTenderReferencePersonnelByName(name).map(record => createTenderPersonnelRecord({
    name: getRecordValue(record, ["nama personil", "nama lengkap", "nama"]) || "-",
    position: getRecordValue(record, [
      "posisi/jabatan (kontrak)",
      "posisi/jabatan",
      "jabatan",
      "posisi"
    ]) || "-",
    involvement: getRecordValue(record, ["keterlibatan"]) || "-",
    source: "DATA UTAMA"
  })).filter(member => member.name && member.name !== "-");
}

function renderTenderPersonnelMembersFromForm() {
  const list = document.getElementById("tenderPersonnelMembersList");
  if (!list) return;
  const tenderName = document.getElementById("tenderName")?.value || "";
  const referenceMembers = getTenderReferencePersonnelMembers(tenderName);
  const manualMembers = getTenderPersonnelMembersFromForm().map((member, index) => ({
    ...member,
    source: "Tambahan",
    index
  }));
  const members = [...referenceMembers, ...manualMembers];

  if (!members.length) {
    list.innerHTML = '<div class="tender-personnel-member-empty">Belum ada personil paket. Isi nama personil di atas lalu klik Masukkan.</div>';
    return;
  }

  list.innerHTML = members.map(member => `
    <article class="tender-personnel-member-item">
      <div>
        <strong>${escapeHtml(member.name)}</strong>
        <span>${escapeHtml(member.position || "-")} · Keterlibatan: ${escapeHtml(member.involvement || "-")}</span>
      </div>
      <div class="tender-personnel-member-actions">
        <span class="tender-personnel-member-source">${escapeHtml(member.source)}</span>
        ${member.source === "Tambahan"
          ? `<button class="text-danger-button" type="button" data-remove-tender-personnel="${member.index}">Hapus</button>`
          : ""}
      </div>
    </article>
  `).join("");
}

function addTenderPersonnelFromForm() {
  const nameInput = document.getElementById("tenderPersonnelName");
  const positionInput = document.getElementById("tenderPersonnelPosition");
  const involvementInput = document.getElementById("tenderPersonnelInvolvement");
  const name = nameInput?.value.trim() || "";
  if (!name) {
    setTenderFormStatus("Isi Nama Personil terlebih dahulu, lalu klik Masukkan.", "error");
    nameInput?.focus();
    return;
  }

  const members = getTenderPersonnelMembersFromForm();
  const key = normalizeSearchText(name);
  const existsInManual = members.some(member => normalizeSearchText(member.name) === key);
  const existsInReference = getTenderReferencePersonnelMembers(document.getElementById("tenderName")?.value || "")
    .some(member => normalizeSearchText(member.name) === key);
  if (existsInManual || existsInReference) {
    setTenderFormStatus("Personil tersebut sudah ada di daftar paket tender.", "error");
    return;
  }

  members.push({
    name,
    position: positionInput?.value.trim() || "",
    involvement: involvementInput?.value || ""
  });
  setTenderPersonnelMembersToForm(members);
  nameInput.value = "";
  if (positionInput) positionInput.value = "";
  if (involvementInput) involvementInput.value = "";
  setTenderFormStatus("Personil ditambahkan ke daftar paket. Klik Simpan Paket untuk menyimpan permanen.", "success");
  renderTenderPersonnelMembersFromForm();
}

function handleTenderPersonnelMemberAction(event) {
  const button = event.target.closest("[data-remove-tender-personnel]");
  if (!button) return;
  const index = Number(button.dataset.removeTenderPersonnel);
  const members = getTenderPersonnelMembersFromForm();
  if (!Number.isInteger(index) || index < 0 || index >= members.length) return;
  members.splice(index, 1);
  setTenderPersonnelMembersToForm(members);
  setTenderFormStatus("Personil tambahan dihapus dari daftar sementara.", "success");
  renderTenderPersonnelMembersFromForm();
}

function collectTenderPersonnelMembersForSave() {
  const members = getTenderPersonnelMembersFromForm();
  const pendingName = document.getElementById("tenderPersonnelName")?.value.trim() || "";
  if (pendingName) {
    const key = normalizeSearchText(pendingName);
    const exists = members.some(member => normalizeSearchText(member.name) === key) ||
      getTenderReferencePersonnelMembers(document.getElementById("tenderName")?.value || "")
        .some(member => normalizeSearchText(member.name) === key);
    if (!exists) {
      members.push({
        name: pendingName,
        position: document.getElementById("tenderPersonnelPosition")?.value.trim() || "",
        involvement: document.getElementById("tenderPersonnelInvolvement")?.value || ""
      });
    }
  }
  return normalizeTenderPersonnelMembers(members);
}

function openJobRecordForm(record = null, job = null) {
  closeJobsMenus();
  if (!requirePermission(
    canManagePersonnel(),
    "Hanya Super Admin, Editor, atau Author yang dapat mengubah data pekerjaan."
  )) return;

  const sheet = getDataUtamaSheet();
  if (!sheet || sheet.status !== "ready") {
    notify("DATA UTAMA belum terbaca. Klik Refresh lalu coba lagi.");
    return;
  }
  const columns = getEditableJobColumns(sheet.records);
  const jobColumn = columns.find(column =>
    includesAny(normalizeSearchText(column), ["pekerjaan", "nama pekerjaan", "project", "proyek"])
  );
  if (!jobColumn) return notify("Kolom PEKERJAAN tidak ditemukan pada DATA UTAMA.");

  const initialRecord = { ...(record || {}) };
  if (!record && job?.pekerjaan) initialRecord[jobColumn] = job.pekerjaan;
  document.getElementById("jobRecordFormTitle").textContent = record
    ? "Edit Rincian Pekerjaan"
    : job
      ? "Tambah Rincian Pekerjaan"
      : "Tambah Pekerjaan Lengkap";
  document.getElementById("jobRecordFormSource").textContent =
    job?.pekerjaan || record?.[jobColumn] || "Sheet DATA UTAMA";
  document.getElementById("jobRecordRowNumber").value = record?.["_Sumber Baris"] || "";
  document.getElementById("jobRecordFormStatus").textContent = "";
  document.getElementById("jobRecordFormFields").innerHTML = `
    <datalist id="personnelNameSuggestions"></datalist>
    <datalist id="jobStatusOptions">
      <option value="Upcoming">
      <option value="Active">
      <option value="Progress">
      <option value="Finish">
      <option value="Finish, Overtime">
    </datalist>
    ${columns.map(column => `
      <label class="${column === jobColumn ? "full" : ""}">
        <span>${escapeHtml(humanizeFieldName(column))}</span>
        ${renderJobRecordInput(column, initialRecord[column] || "")}
      </label>
    `).join("")}
  `;
  renderPersonnelNameSuggestions();
  document.getElementById("jobRecordFormFields")
    .querySelector(`[name="${CSS.escape(jobColumn)}"]`)
    ?.setAttribute("required", "");
  document.getElementById("jobRecordFormModal").showModal();
}

function closeJobRecordForm() {
  const modal = document.getElementById("jobRecordFormModal");
  if (modal?.open) modal.close();
}

async function saveJobRecord(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const rowNumber = Number(document.getElementById("jobRecordRowNumber").value) || 0;
  const data = Object.fromEntries(
    Array.from(new FormData(form).entries())
      .filter(([key]) => key !== "")
      .map(([key, value]) => [key, String(value).trim()])
  );
  document.getElementById("jobRecordFormStatus").textContent = "Mengirim perubahan...";
  document.getElementById("saveJobRecordButton").disabled = true;
  await sendJobMutation(rowNumber ? "update" : "add", { rowNumber, data });
}

function handleJobDetailAction(event) {
  const menuButton = event.target.closest("[data-job-record-menu]");
  if (menuButton) {
    const menu = document.getElementById(menuButton.getAttribute("popovertarget"));
    if (!menu) return;
    const rect = menuButton.getBoundingClientRect();
    const menuWidth = 150;
    const menuHeight = 92;
    const left = Math.min(window.innerWidth - menuWidth - 12, Math.max(12, rect.right - menuWidth));
    const belowTop = rect.bottom + 6;
    const top = belowTop + menuHeight <= window.innerHeight - 12
      ? belowTop
      : Math.max(12, rect.top - menuHeight - 6);
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
    return;
  }

  const button = event.target.closest("[data-job-record-action]");
  if (!button || !currentJobDetail) return;
  const actionMenu = button.closest("[popover]");
  if (actionMenu?.matches(":popover-open")) actionMenu.hidePopover();
  const record = currentJobDetail.records?.[Number(button.dataset.jobRecordIndex)];
  if (!record) return;
  if (button.dataset.jobRecordAction === "edit") {
    openJobRecordForm(record, currentJobDetail);
    return;
  }
  if (button.dataset.jobRecordAction === "delete") {
    deleteJobRecord(record);
  }
}

async function deleteJobRecord(record) {
  if (!requirePermission(
    canManagePersonnel(),
    "Hanya Super Admin, Editor, atau Author yang dapat menghapus rincian pekerjaan."
  )) return;
  const rowNumber = Number(record?.["_Sumber Baris"]) || 0;
  if (!rowNumber) return notify("Nomor baris DATA UTAMA tidak ditemukan.");
  const personName = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]) || "baris ini";
  if (!confirm(`Hapus rincian "${personName}" dari pekerjaan ${currentJobDetail?.pekerjaan || ""}?`)) return;
  await sendJobMutation("delete", { rowNumber, data: {} });
}

async function sendJobMutation(action, payload) {
  if (!window.PERSONNEL_BRIDGE_URL || !window.PERSONNEL_BRIDGE_TOKEN) {
    notify("Bridge Google Spreadsheet belum dikonfigurasi.");
    return;
  }
  if (!currentUser) return notify("Silakan login kembali.");

  const selectedJobName = currentJobDetail?.pekerjaan || "";
  try {
    const firebaseIdToken = await currentUser.getIdToken(true);
    await fetch(window.PERSONNEL_BRIDGE_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: window.PERSONNEL_BRIDGE_TOKEN,
        firebaseIdToken,
        action,
        sourceId: "data-utama",
        targetSourceId: "data-utama",
        rowNumber: payload.rowNumber || 0,
        data: payload.data || {}
      })
    });

    if (action !== "delete") closeJobRecordForm();
    notify(action === "delete"
      ? "Permintaan hapus rincian dikirim ke Google Spreadsheet."
      : "Data pekerjaan dikirim ke Google Spreadsheet.");
    await new Promise(resolve => window.setTimeout(resolve, 1400));
    await loadExternalSheetData();
    if (selectedJobName && document.getElementById("jobDetailModal")?.open) {
      const updatedJob = buildJobsFromDataUtama().find(job =>
        normalizeSearchText(job.pekerjaan) === normalizeSearchText(selectedJobName)
      );
      if (updatedJob) openJobDetail(updatedJob);
      else closeJobDetail();
    }
  } catch (error) {
    notify(`Data pekerjaan gagal dikirim: ${error.message}`);
    document.getElementById("jobRecordFormStatus").textContent = error.message || "Perubahan gagal dikirim.";
  } finally {
    const saveButton = document.getElementById("saveJobRecordButton");
    if (saveButton) saveButton.disabled = false;
  }
}

function getJobsExportData() {
  const jobs = getFilteredJobs();
  if (!jobs.length) {
    notify("Tidak ada pekerjaan untuk diekspor.");
    return null;
  }
  return {
    title: "Daftar Pekerjaan",
    columns: ["No.", "Pekerjaan", "Tahun", "Tanggal Mulai", "Tanggal Selesai", "Jumlah Personil", "Status Pekerjaan"],
    records: jobs.map((job, index) => ({
      "No.": index + 1,
      Pekerjaan: job.pekerjaan,
      Tahun: getJobYearLabel(job),
      "Tanggal Mulai": job.tanggalMulai || "-",
      "Tanggal Selesai": job.tanggalSelesai || "-",
      "Jumlah Personil": job.personnelCount ?? job.records.length,
      "Status Pekerjaan": getJobStatus(job)
    }))
  };
}

function buildJobsExportTable(data) {
  return `
    <table>
      <thead><tr>${data.columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
      <tbody>
        ${data.records.map(record => `
          <tr>${data.columns.map(column => `<td>${escapeHtml(record[column] || "-")}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function exportJobsExcel() {
  closeJobsMenus();
  const data = getJobsExportData();
  if (!data) return;
  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
          th { background: #e8eef7; color: #111827; font-weight: 700; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
          h1 { font-family: Arial, sans-serif; font-size: 18px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        ${buildJobsExportTable(data)}
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daftar-pekerjaan-${state.today}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportJobsPdf() {
  closeJobsMenus();
  const data = getJobsExportData();
  if (!data) return;
  const html = `
    <html>
      <head>
        <title>${escapeHtml(data.title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin: 0 0 6px; font-size: 20px; }
          p { margin: 0 0 14px; color: #64748b; }
          table { border-collapse: collapse; width: 100%; font-size: 11px; }
          th { background: #e8eef7; color: #111827; font-weight: 700; }
          th, td { border: 1px solid #cbd5e1; padding: 7px; vertical-align: top; word-break: break-word; }
          tr { break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        <p>Diekspor ${formatHumanDate(state.today)} - ${data.records.length} pekerjaan</p>
        ${buildJobsExportTable(data)}
      </body>
    </html>
  `;
  printHtmlDocument(html);
}

function exportJobsCsv() {
  closeJobsMenus();
  const data = getJobsExportData();
  if (!data) return;

  const rows = data.records.map(record =>
    data.columns.map(column => record[column] ?? "")
  );
  const csv = [data.columns, ...rows]
    .map(row => row.map(csvCell).join(","))
    .join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daftar-pekerjaan-${state.today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getPersonnelSheet(sourceId = state.personnelSource) {
  return state.externalSheets.find(sheet => sheet.id === sourceId) || null;
}

function getPersonnelName(record) {
  const nameKey = Object.keys(record || {}).find(key =>
    includesAny(normalizeSearchText(key), ["nama personil", "nama lengkap", "nama"])
  );
  return String(record?.[nameKey] || "Tanpa nama").trim();
}

function canonicalPersonnelName(value) {
  const beforeDegree = String(value || "").split(",")[0];
  const degreeTokens = new Set([
    "ir", "dr", "dra", "h", "s", "t", "st", "mt", "mm", "msc", "meng",
    "sh", "se", "si", "amd", "ars", "ipm"
  ]);
  const tokens = normalizeSearchText(beforeDegree).split(" ").filter(Boolean);
  while (tokens.length > 1 && degreeTokens.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

function isSamePersonnelName(left, right) {
  const leftName = canonicalPersonnelName(left);
  const rightName = canonicalPersonnelName(right);
  if (!leftName || !rightName) return false;
  return leftName === rightName ||
    (leftName.length >= 6 && rightName.length >= 6 &&
      (leftName.includes(rightName) || rightName.includes(leftName)));
}

function isFinishedWorkStatus(value) {
  return includesAny(normalizeSearchText(value), [
    "finish", "finished", "selesai", "completed", "complete", "done"
  ]);
}

function isActiveWorkRecord(record) {
  const status = getRecordValue(record, ["status pekerjaan", "status project", "status proyek"]);
  const normalizedStatus = normalizeSearchText(status);
  if (isFinishedWorkStatus(status)) return false;
  if (includesAny(normalizedStatus, [
    "aktif", "active", "proses", "progress", "ongoing", "berjalan", "overtime"
  ])) return true;
  if (includesAny(normalizedStatus, ["upcoming", "rencana", "pending", "tertunda"])) return false;

  const start = getComparableDate(getRecordValue(record, ["tanggal mulai", "tgl mulai", "mulai"]));
  const finish = getComparableDate(getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"]));
  const today = getComparableDate(state.today);
  return Boolean(start && start <= today && (!finish || finish >= today));
}

function isFinishedWorkRecord(record) {
  const status = getRecordValue(record, ["status pekerjaan", "status project", "status proyek"]);
  if (isFinishedWorkStatus(status)) return true;
  if (status) return false;
  const finish = getComparableDate(getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"]));
  return Boolean(finish && finish < getComparableDate(state.today));
}

function getRecordYears(record) {
  const explicitYear = Number(getRecordValue(record, ["tahun", "year"]));
  const startYear = getYearFromDateValue(getRecordValue(record, ["tanggal mulai", "tgl mulai", "mulai"]));
  const finishYear = getYearFromDateValue(getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"]));
  const years = new Set();
  if (explicitYear >= 1900 && explicitYear <= 2200) years.add(explicitYear);
  if (startYear && finishYear && finishYear >= startYear && finishYear - startYear <= 20) {
    for (let year = startYear; year <= finishYear; year += 1) years.add(year);
  } else {
    if (startYear) years.add(startYear);
    if (finishYear) years.add(finishYear);
  }
  return [...years];
}

function recordMatchesPersonnelYear(record, selectedYear, finished) {
  if (selectedYear === "all") return true;
  const year = Number(selectedYear);
  if (finished) {
    const finishYear = getYearFromDateValue(
      getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"])
    );
    if (finishYear) return finishYear === year;
    return getRecordYears(record).includes(year);
  }
  const recordYears = getRecordYears(record);
  return !recordYears.length || recordYears.includes(year);
}

function getPersonnelWorkMetrics(personnelName, selectedYear = state.personnelYear) {
  const dataSheet = getDataUtamaSheet();
  const assignments = dataSheet?.status === "ready" ? dataSheet.records : [];
  let active = 0;
  let finished = 0;

  assignments.forEach(record => {
    const assignmentName = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]);
    if (!isSamePersonnelName(personnelName, assignmentName)) return;
    const involvement = getRecordValue(record, ["keterlibatan"]);
    if (normalizeSearchText(involvement) !== "ya") return;

    if (isFinishedWorkRecord(record) && recordMatchesPersonnelYear(record, selectedYear, true)) {
      finished += 1;
    } else if (isActiveWorkRecord(record) && recordMatchesPersonnelYear(record, selectedYear, false)) {
      active += 1;
    }
  });

  return { active, finished, total: active + finished };
}

function setComputedPersonnelValue(record, canonicalColumn, aliases, value) {
  const existingColumn = Object.keys(record).find(column =>
    aliases.includes(normalizeSearchText(column))
  );
  record[existingColumn || canonicalColumn] = value;
}

function getIntegratedPersonnelRecords(records, selectedYear = state.personnelYear) {
  return (records || []).map(record => {
    const integrated = { ...record };
    const metrics = getPersonnelWorkMetrics(getPersonnelName(record), selectedYear);
    setComputedPersonnelValue(integrated, "TAHUN", ["tahun"], selectedYear === "all" ? "Semua Tahun" : selectedYear);
    setComputedPersonnelValue(integrated, "PEKERJAAN AKTIF", ["pekerjaan aktif", "tugas aktif", "project aktif"], metrics.active);
    setComputedPersonnelValue(
      integrated,
      "KETERLIBATAN PEKERJAAN STATUS SELESAI",
      ["keterlibatan pekerjaan status selesai", "keterlibatan pekerjaan", "status selesai"],
      metrics.finished
    );
    setComputedPersonnelValue(integrated, "AKUMULASI", ["akumulasi"], metrics.total);
    return integrated;
  });
}

function getCurrentSummaryYear() {
  return String(getYearFromDateValue(state.today) || new Date().getFullYear());
}

function getAllIntegratedPersonnelRecords(selectedYear = getCurrentSummaryYear()) {
  return ["personil-bmc", "outsourcing"].flatMap(sourceId => {
    const sheet = getPersonnelSheet(sourceId);
    if (!sheet || sheet.status !== "ready") return [];
    return getIntegratedPersonnelRecords(sheet.records, selectedYear).map(record => ({
      ...record,
      _PersonSource: sourceId
    }));
  });
}

function getPersonnelPosition(record) {
  return getRecordValue(record, [
    "posisi jabatan real",
    "posisi jabatan kontrak",
    "jabatan atau posisi",
    "jabatan",
    "posisi"
  ]) || "-";
}

function getPersonnelStatus(record) {
  const statusKey = Object.keys(record || {}).find(column =>
    ["status", "status personil", "kategori personil"].includes(normalizeSearchText(column))
  );
  return String(record?.[statusKey] || "").trim() ||
    (record?._PersonSource === "outsourcing" ? "Outsourcing" : "Bemaco");
}

function getPersonnelAccumulation(record) {
  const key = Object.keys(record || {}).find(column =>
    normalizeSearchText(column) === "akumulasi"
  );
  return key ? getRecordDisplayValue(record, key) : "0";
}

function getPersonnelFinishedWork(record) {
  const key = Object.keys(record || {}).find(column =>
    normalizeSearchText(column) === "keterlibatan pekerjaan status selesai"
  );
  return key ? getRecordDisplayValue(record, key) : "0";
}

function getActivePersonnelForJob(job, selectedYear) {
  const names = new Set();
  (job?.records || []).forEach(record => {
    const involvement = normalizeSearchText(getRecordValue(record, ["keterlibatan"]));
    if (involvement !== "ya" || !isActiveWorkRecord(record)) return;
    if (!recordMatchesPersonnelYear(record, selectedYear, false)) return;
    const name = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]);
    if (name) names.add(canonicalPersonnelName(name) || normalizeSearchText(name));
  });
  return names.size;
}

function renderDashboardWorkSummary() {
  const activeJobsBody = document.getElementById("dashboardActiveJobsBody");
  const activePersonnelBody = document.getElementById("dashboardActivePersonnelBody");
  const inactivePersonnelBody = document.getElementById("dashboardInactivePersonnelBody");
  if (!activeJobsBody || !activePersonnelBody || !inactivePersonnelBody) return;

  const selectedYear = getCurrentSummaryYear();
  const activeJobs = buildJobsFromDataUtama()
    .filter(job => getActivePersonnelForJob(job, selectedYear) > 0)
    .sort((left, right) => left.pekerjaan.localeCompare(right.pekerjaan, "id"));
  const personnel = getAllIntegratedPersonnelRecords(selectedYear)
    .sort((left, right) => getPersonnelName(left).localeCompare(getPersonnelName(right), "id"));
  const activePersonnel = personnel.filter(record => getPersonnelActiveWork(record) > 0);
  const inactivePersonnel = personnel.filter(record => getPersonnelActiveWork(record) <= 0);

  state.dashboardActivePersonnelRecords = activePersonnel;
  state.dashboardInactivePersonnelRecords = inactivePersonnel;

  document.getElementById("dashboardWorkSummaryPeriod").textContent = `Ringkasan tahun ${selectedYear}`;
  document.getElementById("dashboardActiveJobsCount").textContent = activeJobs.length;
  document.getElementById("dashboardActivePersonnelCount").textContent = activePersonnel.length;
  document.getElementById("dashboardInactivePersonnelCount").textContent = inactivePersonnel.length;

  activeJobsBody.innerHTML = activeJobs.length
    ? activeJobs.map(job => `
      <tr>
        <td><strong>${escapeHtml(job.pekerjaan)}</strong></td>
        <td>${escapeHtml(getJobYearLabel(job))}</td>
        <td>${escapeHtml(job.tanggalSelesai || "-")}</td>
        <td>${getActivePersonnelForJob(job, selectedYear)}</td>
        <td><span class="work-status-badge active">Aktif</span></td>
      </tr>
    `).join("")
    : '<tr><td class="dashboard-summary-empty" colspan="5">Belum ada pekerjaan aktif pada tahun ini.</td></tr>';

  activePersonnelBody.innerHTML = activePersonnel.length
    ? activePersonnel.map((record, index) => `
      <tr>
        <td>
          <button class="personnel-history-link" type="button" data-dashboard-personnel-group="active" data-dashboard-personnel-index="${index}">
            ${escapeHtml(getPersonnelName(record))}
          </button>
        </td>
        <td>${escapeHtml(getPersonnelStatus(record))}</td>
        <td>${escapeHtml(String(getPersonnelActiveWork(record)))}</td>
        <td>${escapeHtml(getPersonnelAccumulation(record))}</td>
      </tr>
    `).join("")
    : '<tr><td class="dashboard-summary-empty" colspan="4">Belum ada personil dengan pekerjaan aktif.</td></tr>';

  inactivePersonnelBody.innerHTML = inactivePersonnel.length
    ? inactivePersonnel.map((record, index) => `
      <tr>
        <td>
          <button class="personnel-history-link" type="button" data-dashboard-personnel-group="inactive" data-dashboard-personnel-index="${index}">
            ${escapeHtml(getPersonnelName(record))}
          </button>
        </td>
        <td>${escapeHtml(getPersonnelStatus(record))}</td>
        <td>${escapeHtml(getPersonnelPosition(record))}</td>
        <td>${escapeHtml(getPersonnelFinishedWork(record))}</td>
      </tr>
    `).join("")
    : '<tr><td class="dashboard-summary-empty" colspan="4">Semua personil memiliki pekerjaan aktif.</td></tr>';
}

function handleDashboardPersonnelClick(event) {
  const button = event.target.closest("[data-dashboard-personnel-index]");
  if (!button) return;
  const records = button.dataset.dashboardPersonnelGroup === "active"
    ? state.dashboardActivePersonnelRecords
    : state.dashboardInactivePersonnelRecords;
  const record = records?.[Number(button.dataset.dashboardPersonnelIndex)];
  if (record) openPersonnelDetail(record);
}

function getPersonnelActiveWork(record) {
  const workKey = Object.keys(record || {}).find(key =>
    includesAny(normalizeSearchText(key), ["pekerjaan aktif", "tugas aktif", "project aktif"])
  );
  const value = String(record?.[workKey] || "0").replace(",", ".");
  const number = Number.parseFloat(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function getFilteredPersonnelRecords() {
  const sheet = getPersonnelSheet();
  if (!sheet || sheet.status !== "ready") return [];

  const queryText = normalizeSearchText(state.personnelSearch);
  const queryTokens = getMeaningfulTokens(queryText);
  const records = getIntegratedPersonnelRecords(sheet.records).filter(record => {
    const searchable = normalizeSearchText(objectSearchText(record));
    const matchesSearch = !queryText ||
      searchable.includes(queryText) ||
      queryTokens.every(token => searchable.includes(token));
    const activeWork = getPersonnelActiveWork(record);
    const matchesWork = state.personnelWorkFilter === "all" ||
      (state.personnelWorkFilter === "active" && activeWork > 0) ||
      (state.personnelWorkFilter === "inactive" && activeWork <= 0);
    return matchesSearch && matchesWork;
  });

  return records.sort((recordA, recordB) => {
    if (state.personnelSort === "name-desc") {
      return getPersonnelName(recordB).localeCompare(getPersonnelName(recordA), "id");
    }
    if (state.personnelSort === "work-desc") {
      return getPersonnelActiveWork(recordB) - getPersonnelActiveWork(recordA);
    }
    if (state.personnelSort === "work-asc") {
      return getPersonnelActiveWork(recordA) - getPersonnelActiveWork(recordB);
    }
    return getPersonnelName(recordA).localeCompare(getPersonnelName(recordB), "id");
  });
}

function renderPersonnel() {
  const tableHead = document.getElementById("personnelTableHead");
  const tableBody = document.getElementById("personnelTableBody");
  if (!tableHead || !tableBody) return;
  renderYearFilterOptions();

  document.querySelectorAll("[data-personnel-source]").forEach(button => {
    button.classList.toggle("active", button.dataset.personnelSource === state.personnelSource);
  });

  const bemacoSheet = getPersonnelSheet("personil-bmc");
  const outsourcingSheet = getPersonnelSheet("outsourcing");
  updatePersonnelSourceSummary("personnelBemacoCount", "personnelBemacoActive", bemacoSheet);
  updatePersonnelSourceSummary("personnelOutsourcingCount", "personnelOutsourcingActive", outsourcingSheet);

  const sheet = getPersonnelSheet();
  const sourceName = state.personnelSource === "outsourcing" ? "Personil Outsourcing" : "Personil Bemaco";
  document.getElementById("personnelTableTitle").textContent = sourceName;

  if (!sheet || sheet.status !== "ready") {
    const message = sheet?.status === "loading"
      ? "Sedang memuat data spreadsheet..."
      : sheet?.status === "error"
        ? "Spreadsheet belum dapat dibaca. Periksa publikasi CSV lalu klik Refresh."
        : "Menunggu sinkronisasi spreadsheet...";
    document.getElementById("personnelSyncText").textContent = message;
    document.getElementById("personnelResultCount").textContent = "0 data ditemukan";
    document.getElementById("personnelPageInfo").textContent = "Halaman 1 dari 1";
    tableHead.innerHTML = "";
    tableBody.innerHTML = `<tr><td class="personnel-empty">${escapeHtml(message)}</td></tr>`;
    setPersonnelPaginationButtons(1);
    return;
  }

  const integratedRecords = getIntegratedPersonnelRecords(sheet.records);
  const filteredRecords = getFilteredPersonnelRecords();
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / state.personnelPageSize));
  state.personnelPage = Math.min(Math.max(1, state.personnelPage), pageCount);
  const pageStart = (state.personnelPage - 1) * state.personnelPageSize;
  const pageRecords = filteredRecords.slice(pageStart, pageStart + state.personnelPageSize);
  const columns = getPersonnelColumns(integratedRecords);
  state.personnelVisibleRecords = pageRecords;

  document.getElementById("personnelSyncText").textContent =
    `${sheet.records.length} data tersinkron · kategori ${state.personnelYear === "all" ? "semua tahun" : state.personnelYear} · diperbarui ${formatSyncTime(externalSheetLastLoadedAt)}`;
  document.getElementById("personnelResultCount").textContent =
    `${filteredRecords.length} data ditemukan`;
  document.getElementById("personnelPageInfo").textContent =
    `Halaman ${state.personnelPage} dari ${pageCount}`;
  setPersonnelPaginationButtons(pageCount);

  tableHead.innerHTML = `<tr>${columns.map(column =>
    `<th>${escapeHtml(humanizeFieldName(column))}</th>`
  ).join("")}<th>Aksi</th></tr>`;

  tableBody.innerHTML = pageRecords.length
    ? pageRecords.map((record, index) => `
      <tr>
        ${columns.map(column => {
          const value = escapeHtml(getRecordDisplayValue(record, column));
          const isName = includesAny(normalizeSearchText(column), ["nama personil", "nama lengkap"]);
          return `<td data-label="${escapeHtml(humanizeFieldName(column))}">${isName
            ? `<button class="personnel-history-link" type="button" data-personnel-history-index="${index}">${value}</button>`
            : value}</td>`;
        }).join("")}
        <td data-label="Aksi" class="personnel-row-actions">
          <div class="personnel-row-dropdown">
            <button class="secondary-button action-dropdown-button" type="button" data-personnel-menu="${index}" aria-expanded="false">
              Options <span class="dropdown-chevron" aria-hidden="true"></span>
            </button>
            <div class="personnel-row-menu hidden">
              <button type="button" data-personnel-action="detail" data-personnel-index="${index}">View</button>
              ${canManagePersonnel() ? `
                <button type="button" data-personnel-action="edit" data-personnel-index="${index}">Edit</button>
                <button class="danger-text" type="button" data-personnel-action="delete" data-personnel-index="${index}">Delete</button>
              ` : ""}
            </div>
          </div>
        </td>
      </tr>
    `).join("")
    : '<tr><td class="personnel-empty">Tidak ada data yang sesuai dengan filter.</td></tr>';
}

function getPersonnelColumns(records) {
  const columns = [];
  records.forEach(record => {
    Object.keys(record || {}).forEach(key => {
      if (key !== "_Sumber Baris" && !columns.includes(key)) columns.push(key);
    });
  });
  return columns;
}

function updatePersonnelSourceSummary(countId, activeId, sheet) {
  const records = sheet?.status === "ready" ? sheet.records : [];
  const integratedRecords = getIntegratedPersonnelRecords(records);
  document.getElementById(countId).textContent = records.length;
  document.getElementById(activeId).textContent =
    `${integratedRecords.filter(record => getPersonnelActiveWork(record) > 0).length} memiliki pekerjaan aktif`;
}

function selectPersonnelSource(sourceId) {
  state.personnelSource = sourceId;
  state.personnelPage = 1;
  renderPersonnel();
}

function resetPersonnelFilters() {
  state.personnelSearch = "";
  state.personnelYear = "all";
  state.personnelWorkFilter = "all";
  state.personnelSort = "name-asc";
  state.personnelPage = 1;
  document.getElementById("personnelSearch").value = "";
  document.getElementById("personnelYearFilter").value = "all";
  document.getElementById("personnelWorkFilter").value = "all";
  document.getElementById("personnelSort").value = "name-asc";
  renderPersonnel();
}

function changePersonnelPage(offset) {
  const records = getFilteredPersonnelRecords();
  const pageCount = Math.max(1, Math.ceil(records.length / state.personnelPageSize));
  state.personnelPage = Math.min(pageCount, Math.max(1, state.personnelPage + offset));
  renderPersonnel();
}

function setPersonnelPaginationButtons(pageCount) {
  document.getElementById("personnelPrevPage").disabled = state.personnelPage <= 1;
  document.getElementById("personnelNextPage").disabled = state.personnelPage >= pageCount;
}

function handlePersonnelTableClick(event) {
  const historyButton = event.target.closest("[data-personnel-history-index]");
  if (historyButton) {
    const record = state.personnelVisibleRecords?.[Number(historyButton.dataset.personnelHistoryIndex)];
    if (record) openPersonnelDetail(record);
    return;
  }

  const menuButton = event.target.closest("[data-personnel-menu]");
  if (menuButton) {
    togglePersonnelRowMenu(menuButton);
    return;
  }

  const button = event.target.closest("[data-personnel-index]");
  if (!button) return;
  const record = state.personnelVisibleRecords?.[Number(button.dataset.personnelIndex)];
  if (!record) return;
  const action = button.dataset.personnelAction || "detail";
  closePersonnelMenus();
  if (action === "edit") openPersonnelForm(record);
  else if (action === "delete") deletePersonnelRecord(record);
  else openPersonnelDetail(record);
}

function openPersonnelDetail(record) {
  const sourceId = record?._PersonSource || state.personnelSource;
  const sheet = getPersonnelSheet(sourceId);
  const personnelName = getPersonnelName(record);
  const history = getPersonnelWorkHistory(personnelName);
  const activeCount = history.filter(item => item.category === "active").length;
  const finishedCount = history.filter(item => item.category === "finished").length;

  document.getElementById("personnelDetailTitle").textContent = personnelName;
  document.getElementById("personnelDetailSource").textContent =
    `${sheet?.label || "Data Personil"} - histori pekerjaan aktif dan selesai`;
  document.getElementById("personnelDetailBody").innerHTML = `
    <section class="personnel-history-profile">
      <div>
        <span>Status</span>
        <strong>${escapeHtml(getPersonnelStatus({ ...record, _PersonSource: sourceId }))}</strong>
      </div>
      <div>
        <span>Jabatan atau Posisi</span>
        <strong>${escapeHtml(getPersonnelPosition(record))}</strong>
      </div>
      <div>
        <span>Pekerjaan Aktif</span>
        <strong>${activeCount}</strong>
      </div>
      <div>
        <span>Histori Selesai</span>
        <strong>${finishedCount}</strong>
      </div>
      <div>
        <span>Total Histori</span>
        <strong>${history.length}</strong>
      </div>
    </section>
    <section class="personnel-history-section">
      <div class="personnel-history-section-header">
        <div>
          <h3>Histori Pekerjaan</h3>
          <p>Pekerjaan aktif ditampilkan lebih dahulu, diikuti pekerjaan yang telah selesai.</p>
        </div>
      </div>
      <div class="personnel-history-table-wrap">
        <table class="personnel-history-table">
          <thead>
            <tr>
              <th>Pekerjaan</th>
              <th>Tahun</th>
              <th>Tanggal Mulai</th>
              <th>Tanggal Selesai</th>
              <th>Status</th>
              <th>Keterlibatan</th>
              <th>Bobot Individual</th>
            </tr>
          </thead>
          <tbody>
            ${history.length ? history.map(item => `
              <tr>
                <td><strong>${escapeHtml(item.pekerjaan)}</strong></td>
                <td>${escapeHtml(item.tahun)}</td>
                <td>${escapeHtml(item.tanggalMulai)}</td>
                <td>${escapeHtml(item.tanggalSelesai)}</td>
                <td><span class="work-status-badge ${item.category}">${escapeHtml(item.status)}</span></td>
                <td>${escapeHtml(item.keterlibatan)}</td>
                <td>${escapeHtml(item.bobot)}</td>
              </tr>
            `).join("") : '<tr><td class="dashboard-summary-empty" colspan="7">Belum ada histori pekerjaan yang cocok pada DATA UTAMA.</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
  document.getElementById("personnelDetailModal").showModal();
}

function getPersonnelWorkHistory(personnelName) {
  const sheet = getDataUtamaSheet();
  if (!sheet || sheet.status !== "ready") return [];

  return sheet.records
    .filter(record => {
      const assignmentName = getRecordValue(record, ["nama personil", "nama lengkap", "nama"]);
      return isSamePersonnelName(personnelName, assignmentName);
    })
    .map(record => {
      const isFinished = isFinishedWorkRecord(record);
      const isActive = isActiveWorkRecord(record);
      const statusValue = getRecordValue(record, ["status pekerjaan", "status project", "status proyek"]);
      const years = getRecordYears(record).sort((left, right) => left - right);
      return {
        pekerjaan: getRecordValue(record, ["pekerjaan", "nama pekerjaan", "project", "proyek"]) || "-",
        tahun: years.length
          ? (years.length === 1 ? String(years[0]) : `${years[0]}-${years[years.length - 1]}`)
          : "-",
        tanggalMulai: getRecordValue(record, ["tanggal mulai", "tgl mulai", "mulai"]) || "-",
        tanggalSelesai: getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"]) || "-",
        status: statusValue || (isFinished ? "Selesai" : isActive ? "Aktif" : "Belum ditentukan"),
        keterlibatan: getRecordValue(record, ["keterlibatan"]) || "-",
        bobot: normalizeSearchText(getRecordValue(record, ["keterlibatan"])) === "ya" ? "1" : "0",
        category: isFinished ? "finished" : isActive ? "active" : "neutral",
        sortTime: Math.max(
          getComparableDate(getRecordValue(record, ["tanggal selesai", "tgl selesai", "selesai"])),
          getComparableDate(getRecordValue(record, ["tanggal mulai", "tgl mulai", "mulai"]))
        )
      };
    })
    .sort((left, right) => {
      const rank = { active: 0, neutral: 1, finished: 2 };
      return rank[left.category] - rank[right.category] || right.sortTime - left.sortTime;
    });
}

function closePersonnelDetail() {
  document.getElementById("personnelDetailModal").close();
}

function isComputedPersonnelColumn(column) {
  return includesAny(normalizeSearchText(column), [
    "tahun",
    "pekerjaan aktif",
    "tugas aktif",
    "project aktif",
    "keterlibatan pekerjaan",
    "status selesai",
    "akumulasi"
  ]);
}

function getEditablePersonnelColumns(records) {
  return getPersonnelColumns(records).filter(column => !isComputedPersonnelColumn(column));
}

function getPersonnelStatusColumn(columns) {
  return columns.find(column => includesAny(normalizeSearchText(column), ["status"])) || "";
}

function normalizePersonnelSourceFromStatus(value, fallbackSource = state.personnelSource) {
  const text = normalizeSearchText(value);
  if (includesAny(text, ["outsourcing", "out sour", "outsourching", "outsorcing"])) return "outsourcing";
  if (includesAny(text, ["bemaco", "bmc", "rekaprima"])) return "personil-bmc";
  return fallbackSource;
}

function normalizePersonnelStatusLabel(sourceId) {
  return sourceId === "outsourcing" ? "Outsourcing" : "Bemaco";
}

function renderPersonnelInput(column, value, required) {
  const statusColumn = includesAny(normalizeSearchText(column), ["status"]);
  if (statusColumn) {
    const selectedSource = normalizePersonnelSourceFromStatus(value, state.personnelSource);
    return `
      <select name="${escapeHtml(column)}" ${required ? "required" : ""}>
        <option value="Bemaco" ${selectedSource === "personil-bmc" ? "selected" : ""}>Bemaco</option>
        <option value="Outsourcing" ${selectedSource === "outsourcing" ? "selected" : ""}>Outsourcing</option>
      </select>
    `;
  }
  return `
    <input
      name="${escapeHtml(column)}"
      value="${escapeHtml(value || "")}"
      autocomplete="off"
      ${required ? "required" : ""}
    >
  `;
}

function openPersonnelForm(record = null) {
  if (!requirePermission(
    canManagePersonnel(),
    "Hanya Super Admin, Editor, atau Author yang dapat mengubah data personil."
  )) return;

  const sheet = getPersonnelSheet();
  if (!sheet || sheet.status !== "ready") {
    notify("Data personil belum selesai dimuat.");
    return;
  }

  const columns = getEditablePersonnelColumns(sheet.records);
  if (!columns.length) {
    notify("Kolom personil belum dapat dikenali.");
    return;
  }

  document.getElementById("personnelFormTitle").textContent =
    record ? "Edit Personil" : "Tambah Personil";
  document.getElementById("personnelFormSource").textContent = sheet.label;
  document.getElementById("personnelFormRow").value = record?.["_Sumber Baris"] || "";
  document.getElementById("personnelFormFields").innerHTML = columns.map((column, index) => `
    <label class="${columns.length % 2 && index === columns.length - 1 ? "full" : ""}">
      <span>${escapeHtml(humanizeFieldName(column))}</span>
      ${renderPersonnelInput(column, record?.[column] || "", index === 0)}
    </label>
  `).join("");
  document.getElementById("personnelFormModal").showModal();
}

function closePersonnelForm() {
  document.getElementById("personnelFormModal").close();
}

async function savePersonnelRecord(event) {
  event.preventDefault();
  if (!requirePermission(
    canManagePersonnel(),
    "Hanya Super Admin, Editor, atau Author yang dapat menyimpan data personil."
  )) return;

  const form = event.currentTarget;
  const rowNumber = Number(document.getElementById("personnelFormRow").value) || 0;
  const data = Object.fromEntries(
    Array.from(new FormData(form).entries()).map(([key, value]) => [key, String(value).trim()])
  );
  const columns = Object.keys(data);
  const statusColumn = getPersonnelStatusColumn(columns);
  const targetSourceId = normalizePersonnelSourceFromStatus(data[statusColumn], state.personnelSource);
  if (statusColumn) data[statusColumn] = normalizePersonnelStatusLabel(targetSourceId);
  await sendPersonnelMutation(rowNumber ? "update" : "add", {
    rowNumber,
    data,
    targetSourceId
  });
}

async function deletePersonnelRecord(record) {
  if (!requirePermission(
    canManagePersonnel(),
    "Hanya Super Admin, Editor, atau Author yang dapat menghapus data personil."
  )) return;
  const rowNumber = Number(record?.["_Sumber Baris"]) || 0;
  if (!rowNumber) return notify("Nomor baris personil tidak ditemukan.");
  if (!confirm(`Hapus data personil "${getPersonnelName(record)}" dari Google Spreadsheet?`)) return;
  await sendPersonnelMutation("delete", { rowNumber, data: {} });
}

async function sendPersonnelMutation(action, payload) {
  if (!window.PERSONNEL_BRIDGE_URL || !window.PERSONNEL_BRIDGE_TOKEN) {
    notify("Personnel Bridge belum dikonfigurasi. Ikuti panduan PERSONNEL-BRIDGE.md.");
    return;
  }
  if (!currentUser) return notify("Silakan login kembali.");

  const submitButton = document.querySelector("#personnelForm button[type='submit']");
  if (submitButton) submitButton.disabled = true;

  try {
    const firebaseIdToken = await currentUser.getIdToken(true);
    await fetch(window.PERSONNEL_BRIDGE_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        token: window.PERSONNEL_BRIDGE_TOKEN,
        firebaseIdToken,
        action,
        sourceId: state.personnelSource,
        targetSourceId: payload.targetSourceId || state.personnelSource,
        rowNumber: payload.rowNumber || 0,
        data: payload.data || {}
      })
    });

    closePersonnelForm();
    notify(action === "delete"
      ? "Permintaan hapus dikirim ke Google Spreadsheet."
      : "Data personil dikirim ke Google Spreadsheet.");
    await new Promise(resolve => window.setTimeout(resolve, 1400));
    await loadExternalSheetData();
  } catch (error) {
    notify(`Data personil gagal dikirim: ${error.message}`);
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
}

function exportPersonnelCsv() {
  const records = getFilteredPersonnelRecords();
  if (!records.length) return notify("Tidak ada data personil untuk diekspor.");
  const columns = getPersonnelColumns(records);
  const rows = records.map(record => columns.map(column => getRecordDisplayValue(record, column)));
  const csv = [columns, ...rows].map(row => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.personnelSource}-${state.today}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function getPersonnelExportData() {
  const records = getFilteredPersonnelRecords();
  if (!records.length) {
    notify("Tidak ada data personil untuk diekspor.");
    return null;
  }
  return {
    records,
    columns: getPersonnelColumns(records),
    title: document.getElementById("personnelTableTitle").textContent || "Personil"
  };
}

function buildPersonnelExportTable(data) {
  const header = data.columns.map(column =>
    `<th>${escapeHtml(humanizeFieldName(column))}</th>`
  ).join("");
  const rows = data.records.map(record => `
    <tr>
      ${data.columns.map(column => `<td>${escapeHtml(getRecordDisplayValue(record, column))}</td>`).join("")}
    </tr>
  `).join("");
  return `
    <table>
      <thead><tr>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function exportPersonnelExcel() {
  const data = getPersonnelExportData();
  if (!data) return;
  const html = `
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 12px; }
          th { background: #e8eef7; color: #111827; font-weight: 700; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
          h1 { font-family: Arial, sans-serif; font-size: 18px; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        ${buildPersonnelExportTable(data)}
      </body>
    </html>
  `;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${state.personnelSource}-${state.today}.xls`;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPersonnelPdf() {
  const data = getPersonnelExportData();
  if (!data) return;
  const html = `
    <html>
      <head>
        <title>${escapeHtml(data.title)}</title>
        <style>
          @page { size: A4 landscape; margin: 12mm; }
          body { font-family: Arial, sans-serif; color: #111827; }
          h1 { margin: 0 0 6px; font-size: 20px; }
          p { margin: 0 0 14px; color: #64748b; }
          table { border-collapse: collapse; width: 100%; font-size: 10px; }
          th { background: #e8eef7; color: #111827; font-weight: 700; }
          th, td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; word-break: break-word; }
          tr { break-inside: avoid; }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(data.title)}</h1>
        <p>Diekspor ${formatHumanDate(state.today)} - ${data.records.length} data</p>
        ${buildPersonnelExportTable(data)}
      </body>
    </html>
  `;
  printHtmlDocument(html);
}

function formatSyncTime(timestamp) {
  if (!timestamp) return "belum pernah";
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta"
  }).format(new Date(timestamp)) + " WIB";
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
    notify("Profil tersimpan pada perangkat ini, tetapi belum tersinkron ke Firebase. Periksa Rules koleksi profiles.");
  }
}

async function handleProfilePasswordReset() {
  if (!currentUser?.email) return;
  closeProfileMenu();
  try {
    await sendPasswordResetEmail(auth, currentUser.email);
    notify("Link reset password sudah dikirim ke email Anda.");
  } catch (error) {
    notify(getAuthErrorMessage(error));
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
      .filter(item => item.entityType !== "tender")
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
    notify(error.message);
  });
}

function watchTenders() {
  setTenderSyncStatus("loading", "Menghubungkan ke Firebase...");
  unsubscribeTenders = onSnapshot(query(collection(db, TENDER_STORAGE_COLLECTION)), snapshot => {
    state.tenders = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => item.entityType === "tender")
      .sort((left, right) =>
        String(right.updatedAt?.seconds || right.createdAt?.seconds || "")
          .localeCompare(String(left.updatedAt?.seconds || left.createdAt?.seconds || ""))
      );
    if (state.selectedTenderId && !state.tenders.some(item => item.id === state.selectedTenderId)) {
      state.selectedTenderId = "";
    }
    if (!state.selectedTenderId && state.tenders.length) {
      state.selectedTenderId = state.tenders[0].id;
    }
    setTenderSyncStatus("ready", `Tersinkron realtime - ${state.tenders.length} paket`);
    renderTenders();
    renderJobs();
    renderDashboardPortfolioHome();
    renderDashboardWorkSummary();
  }, error => {
    state.tenders = [];
    setTenderSyncStatus("error", getTenderFirestoreErrorMessage(error, "Sinkronisasi Tender gagal."));
    renderTenders();
    renderJobs();
    renderDashboardPortfolioHome();
    renderDashboardWorkSummary();
    console.error("Tender gagal disinkronkan:", error);
  });
}

function createStableTenderJobId(jobName) {
  const value = normalizeSearchText(jobName);
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `tender-job-${(hash >>> 0).toString(36)}`;
}

function getFirstJobRecordValue(job, keywords) {
  for (const record of job?.records || []) {
    const value = getRecordValue(record, keywords);
    if (value !== "") return value;
  }
  return "";
}

async function syncTenderJobsFromDataUtama() {
  if (!currentUser || !canManageTenders() || tenderJobSyncInProgress) return;
  const tenderJobs = buildJobsFromDataUtama()
    .filter(job => jobMatchesStatusFilter(job, "tender"));
  const signature = JSON.stringify(tenderJobs.map(job => [
    normalizeSearchText(job.pekerjaan),
    getJobYearLabel(job),
    getJobStatus(job),
    job.records.length
  ]));
  if (signature === lastTenderJobSignature) return;

  tenderJobSyncInProgress = true;
  try {
    for (const job of tenderJobs) {
      const sourceJobKey = normalizeSearchText(job.pekerjaan);
      const knownTender = state.tenders.find(item =>
        item.sourceJobKey === sourceJobKey ||
        normalizeSearchText(item.name) === sourceJobKey
      );
      const reference = doc(
        db,
        TENDER_STORAGE_COLLECTION,
        knownTender?.id || createStableTenderJobId(job.pekerjaan)
      );
      const snapshot = await getDoc(reference);
      const existing = snapshot.exists() ? snapshot.data() : (knownTender || null);
      const sourcePayload = {
        entityType: "tender",
        sourceType: "data-utama",
        sourceJobKey,
        sourceStatus: getJobStatus(job),
        name: job.pekerjaan,
        agency: getFirstJobRecordValue(job, ["instansi", "satker", "pemberi kerja", "owner"]),
        location: getFirstJobRecordValue(job, ["lokasi", "wilayah"]),
        funding: getFirstJobRecordValue(job, ["sumber dana", "pendanaan"]),
        budgetYear: getJobYearLabel(job),
        budgetCeiling: parseIndonesianNumber(
          getFirstJobRecordValue(job, ["pagu", "nilai pagu", "pagu anggaran"])
        ),
        hps: parseIndonesianNumber(
          getFirstJobRecordValue(job, ["hps", "nilai hps"])
        ),
        method: getFirstJobRecordValue(job, ["metode seleksi", "metode pengadaan"]),
        contractType: getFirstJobRecordValue(job, ["jenis kontrak", "tipe kontrak"]),
        deadline: getFirstJobRecordValue(job, [
          "deadline",
          "batas pemasukan",
          "tanggal pemasukan",
          "tanggal penawaran"
        ]),
        owner: getFirstJobRecordValue(job, ["pic", "penanggung jawab"]),
        ownerEmail: getFirstJobRecordValue(job, ["email pic", "email penanggung jawab"]),
        sourcePersonnelCount: job.records.length
      };
      const comparableKeys = Object.keys(sourcePayload);
      const changed = !existing || comparableKeys.some(key =>
        String(existing?.[key] ?? "") !== String(sourcePayload[key] ?? "")
      );
      if (!changed) continue;

      const payload = {
        ...sourcePayload,
        updatedAt: serverTimestamp()
      };
      if (!existing) {
        Object.assign(payload, {
          status: "Persiapan",
          driveUrl: "",
          notes: "Paket dibuat otomatis dari DATA UTAMA karena Status Pekerjaan adalah Tender.",
          documents: createTenderChecklist(),
          createdAt: serverTimestamp()
        });
      }
      await setDoc(reference, payload, { merge: true });
    }
    lastTenderJobSignature = signature;
  } catch (error) {
    console.error("Pekerjaan berstatus Tender gagal disinkronkan:", error);
  } finally {
    tenderJobSyncInProgress = false;
  }
}

function setTenderSyncStatus(status, message) {
  const element = document.getElementById("tenderSyncStatus");
  if (!element) return;
  element.className = `tender-sync-status ${status}`;
  element.textContent = message;
}

function createTenderChecklist(existing = []) {
  const existingMap = new Map((existing || []).map(item => [item.id, item]));
  return TENDER_DOCUMENT_BLUEPRINT.map(([group, name], index) => {
    const id = `doc-${index + 1}`;
    return {
      id,
      group,
      name,
      status: "Belum Ada",
      owner: "",
      deadline: "",
      url: "",
      ...(existingMap.get(id) || {})
    };
  });
}

function getSelectedTender() {
  return state.tenders.find(item => item.id === state.selectedTenderId) || null;
}

function getTenderProgress(tender) {
  const documents = createTenderChecklist(tender?.documents);
  const finalCount = documents.filter(item => item.status === "Final").length;
  return {
    documents,
    finalCount,
    total: documents.length,
    percent: documents.length ? Math.round((finalCount / documents.length) * 100) : 0
  };
}

function getFilteredTenders() {
  const keyword = normalizeSearchText(state.tenderSearch);
  return state.tenders.filter(tender => {
    const matchesStatus = state.tenderStatusFilter === "all" ||
      tender.status === state.tenderStatusFilter;
    const searchable = normalizeSearchText([
      tender.name,
      tender.agency,
      tender.location,
      tender.owner,
      tender.ownerEmail,
      tender.status,
      tender.budgetYear
    ].join(" "));
    return matchesStatus && (!keyword || searchable.includes(keyword));
  });
}

function isTenderDeadlineUrgent(tender) {
  if (!tender?.deadline || ["Kontrak", "Arsip", "Siap/Final"].includes(tender.status)) return false;
  const deadline = new Date(tender.deadline).getTime();
  if (!Number.isFinite(deadline)) return false;
  const remainingDays = (deadline - Date.now()) / 86400000;
  return remainingDays >= 0 && remainingDays <= 7;
}

function renderTenders() {
  const body = document.getElementById("tenderTableBody");
  if (!body) return;
  const filtered = getFilteredTenders();
  const selected = getSelectedTender();

  document.getElementById("tenderStatTotal").textContent = state.tenders.length;
  document.getElementById("tenderStatPreparation").textContent =
    state.tenders.filter(item => item.status === "Persiapan").length;
  document.getElementById("tenderStatReady").textContent =
    state.tenders.filter(item => ["Siap/Final", "Kontrak", "Arsip"].includes(item.status)).length;
  document.getElementById("tenderStatUrgent").textContent =
    state.tenders.filter(isTenderDeadlineUrgent).length;

  body.innerHTML = filtered.length
    ? filtered.map(tender => {
      const progress = getTenderProgress(tender);
      return `
        <tr class="clickable-row ${tender.id === state.selectedTenderId ? "selected" : ""}" data-tender-id="${escapeHtml(tender.id)}">
          <td>
            <strong>${escapeHtml(tender.name || "Tanpa nama")}</strong>
            <small>${escapeHtml(tender.location || tender.budgetYear || "")}</small>
          </td>
          <td>${escapeHtml(tender.agency || "-")}</td>
          <td>${escapeHtml(formatTenderDateTime(tender.deadline))}</td>
          <td>
            <div class="tender-table-progress">
              <span style="width:${progress.percent}%"></span>
            </div>
            <small>${progress.percent}%</small>
          </td>
          <td><span class="tender-status-badge">${escapeHtml(tender.status || "Persiapan")}</span></td>
        </tr>
      `;
    }).join("")
    : '<tr><td colspan="5" class="personnel-empty">Belum ada paket tender yang cocok.</td></tr>';

  document.getElementById("tenderEmptyState").classList.toggle("hidden", Boolean(selected));
  document.getElementById("tenderDetailContent").classList.toggle("hidden", !selected);
  if (selected) renderTenderDetail(selected);
}

function handleTenderTableClick(event) {
  const row = event.target.closest("[data-tender-id]");
  if (!row) return;
  state.selectedTenderId = row.dataset.tenderId;
  renderTenders();
}

function openTenderForm(tender = null) {
  if (!requirePermission(canManageTenders(), "Role Anda tidak dapat mengubah paket tender.")) return;
  document.getElementById("tenderForm").reset();
  setTenderFormStatus("");
  document.getElementById("tenderId").value = tender?.id || "";
  document.getElementById("tenderFormTitle").textContent = tender ? "Edit Paket Tender" : "Paket Tender Baru";
  document.getElementById("tenderName").value = tender?.name || "";
  document.getElementById("tenderAgency").value = tender?.agency || "";
  document.getElementById("tenderLocation").value = tender?.location || "";
  document.getElementById("tenderFunding").value = tender?.funding || "";
  document.getElementById("tenderBudgetYear").value = tender?.budgetYear || new Date().getFullYear();
  document.getElementById("tenderBudgetCeiling").value = tender?.budgetCeiling || "";
  document.getElementById("tenderHps").value = tender?.hps || "";
  document.getElementById("tenderMethod").value = tender?.method || "Seleksi kualitas dan biaya";
  document.getElementById("tenderContractType").value = tender?.contractType || "";
  document.getElementById("tenderDeadline").value = tender?.deadline || "";
  document.getElementById("tenderStatus").value = tender?.status || "Persiapan";
  document.getElementById("tenderOwner").value = tender?.owner || "";
  document.getElementById("tenderOwnerEmail").value = tender?.ownerEmail || "";
  document.getElementById("tenderPersonnelName").value = tender?.personnelName || "";
  document.getElementById("tenderPersonnelPosition").value = tender?.personnelPosition || "";
  document.getElementById("tenderPersonnelInvolvement").value = tender?.personnelInvolvement || "";
  setTenderPersonnelMembersToForm([
    ...normalizeTenderPersonnelMembers(tender?.personnelMembers),
    ...getTenderManualPersonnelFromLegacyFields(tender)
  ]);
  document.getElementById("tenderDriveUrl").value = tender?.driveUrl || state.appConfig?.driveUrl || "";
  document.getElementById("tenderNotes").value = tender?.notes || "";
  renderTenderPersonnelSuggestions();
  renderTenderPersonnelReferenceFromForm();
  renderTenderPersonnelMembersFromForm();
  document.getElementById("tenderFormModal").showModal();
}

function closeTenderForm() {
  document.getElementById("tenderFormModal").close();
}

async function saveTender(event) {
  event.preventDefault();
  if (!requirePermission(canManageTenders(), "Role Anda tidak dapat menyimpan paket tender.")) return;

  const tenderId = document.getElementById("tenderId").value;
  const existing = state.tenders.find(item => item.id === tenderId);
  const personnelMembers = collectTenderPersonnelMembersForSave();
  const primaryPersonnel = personnelMembers[0] || {
    name: document.getElementById("tenderPersonnelName").value.trim(),
    position: document.getElementById("tenderPersonnelPosition").value.trim(),
    involvement: document.getElementById("tenderPersonnelInvolvement").value
  };
  const payload = {
    entityType: "tender",
    name: document.getElementById("tenderName").value.trim(),
    agency: document.getElementById("tenderAgency").value.trim(),
    location: document.getElementById("tenderLocation").value.trim(),
    funding: document.getElementById("tenderFunding").value.trim(),
    budgetYear: document.getElementById("tenderBudgetYear").value,
    budgetCeiling: Number(document.getElementById("tenderBudgetCeiling").value || 0),
    hps: Number(document.getElementById("tenderHps").value || 0),
    method: document.getElementById("tenderMethod").value.trim(),
    contractType: document.getElementById("tenderContractType").value.trim(),
    deadline: document.getElementById("tenderDeadline").value,
    status: document.getElementById("tenderStatus").value,
    owner: document.getElementById("tenderOwner").value.trim(),
    ownerEmail: normalizeEmail(document.getElementById("tenderOwnerEmail").value),
    personnelName: primaryPersonnel.name || "",
    personnelPosition: primaryPersonnel.position || "",
    personnelInvolvement: primaryPersonnel.involvement || "",
    personnelMembers,
    driveUrl: document.getElementById("tenderDriveUrl").value.trim(),
    notes: document.getElementById("tenderNotes").value.trim(),
    documents: createTenderChecklist(existing?.documents),
    updatedBy: normalizeEmail(currentUser?.email),
    updatedAt: serverTimestamp()
  };

  const saveButton = document.getElementById("saveTenderButton");
  saveButton.disabled = true;
  saveButton.textContent = "Menyimpan...";
  setTenderFormStatus("Menyimpan paket ke Firebase...", "loading");
  try {
    const reference = tenderId
      ? doc(db, TENDER_STORAGE_COLLECTION, tenderId)
      : doc(collection(db, TENDER_STORAGE_COLLECTION));
    await setDoc(reference, {
      ...payload,
      ownerUid: existing?.ownerUid || currentUser?.uid || "",
      createdBy: existing?.createdBy || normalizeEmail(currentUser?.email),
      createdAt: existing?.createdAt || serverTimestamp()
    }, { merge: true });
    state.selectedTenderId = reference.id;
    setTenderFormStatus("Paket berhasil disimpan.", "success");
    setTenderSyncStatus("ready", "Paket berhasil disimpan dan sedang disinkronkan...");
    await new Promise(resolve => window.setTimeout(resolve, 450));
    closeTenderForm();
  } catch (error) {
    const message = getTenderFirestoreErrorMessage(error, "Paket tender gagal disimpan.");
    setTenderFormStatus(message, "error");
    notify(message);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Simpan Paket";
  }
}

function setTenderFormStatus(message, status = "") {
  const element = document.getElementById("tenderFormStatus");
  if (!element) return;
  element.className = `tender-form-status ${status}`.trim();
  element.textContent = message;
}

function editSelectedTender() {
  const tender = getSelectedTender();
  if (tender) openTenderForm(tender);
}

async function deleteSelectedTender() {
  const tender = getSelectedTender();
  if (!tender || !requirePermission(canManageTenders(), "Role Anda tidak dapat menghapus paket tender.")) return;
  if (!confirm(`Hapus paket tender "${tender.name}" beserta checklist monitoringnya?`)) return;
  try {
    await deleteDoc(doc(db, TENDER_STORAGE_COLLECTION, tender.id));
    state.selectedTenderId = "";
  } catch (error) {
    notify(getTenderFirestoreErrorMessage(error, "Paket tender gagal dihapus."));
  }
}

function renderTenderDetail(tender) {
  const progress = getTenderProgress(tender);
  const tenderPersonnel = getTenderPersonnel(tender);
  document.getElementById("tenderDetailStatus").textContent = tender.status || "Persiapan";
  document.getElementById("tenderDetailTitle").textContent = tender.name || "Paket Tender";
  document.getElementById("tenderDetailMeta").textContent =
    [tender.agency, tender.location, tender.budgetYear].filter(Boolean).join(" - ") || "Informasi paket belum lengkap";
  document.getElementById("tenderProgressLabel").textContent = `${progress.percent}% lengkap`;
  document.getElementById("tenderDocumentCount").textContent =
    `${progress.finalCount} dari ${progress.total} dokumen final`;
  document.getElementById("tenderProgressBar").style.width = `${progress.percent}%`;
  document.getElementById("tenderInfoGrid").innerHTML = [
    ["Sumber Dana", escapeHtml(tender.funding || "-")],
    ["Pagu", escapeHtml(formatRupiah(tender.budgetCeiling))],
    ["HPS", escapeHtml(formatRupiah(tender.hps))],
    ["Metode Seleksi", escapeHtml(tender.method || "-")],
    ["Jenis Kontrak", escapeHtml(tender.contractType || "-")],
    ["Status DATA UTAMA", escapeHtml(tender.sourceStatus || "-")],
    ["Jumlah Personil", escapeHtml(String(tenderPersonnel.length || tender.sourcePersonnelCount || "-"))],
    ["Deadline", escapeHtml(formatTenderDateTime(tender.deadline))],
    ["Penanggung Jawab", escapeHtml(tender.owner || "-")],
    ["Nama Personil", escapeHtml(tender.personnelName || "-")],
    ["POSISI/JABATAN", escapeHtml(tender.personnelPosition || "-")],
    ["KETERLIBATAN", escapeHtml(tender.personnelInvolvement || "-")],
    ["Folder Dokumen", tender.driveUrl
      ? `<a href="${escapeHtml(tender.driveUrl)}" target="_blank" rel="noopener noreferrer">Buka folder</a>`
      : "-"]
  ].map(([label, value]) => `
    <div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>
  `).join("");

  document.getElementById("tenderChecklistBody").innerHTML = progress.documents.map(item => `
    <tr data-tender-document-id="${escapeHtml(item.id)}">
      <td>${escapeHtml(item.group)}</td>
      <td><strong>${escapeHtml(item.name)}</strong></td>
      <td>
        <select data-document-field="status" ${canManageTenders() ? "" : "disabled"}>
          ${TENDER_DOCUMENT_STATUSES.map(status =>
            `<option ${status === item.status ? "selected" : ""}>${escapeHtml(status)}</option>`
          ).join("")}
        </select>
      </td>
      <td><input data-document-field="owner" list="tenderPersonnelNameSuggestions" autocomplete="off" value="${escapeHtml(item.owner)}" ${canManageTenders() ? "" : "disabled"}></td>
      <td><input data-document-field="deadline" type="date" value="${escapeHtml(item.deadline)}" ${canManageTenders() ? "" : "disabled"}></td>
      <td class="tender-document-link-cell">
        <input data-document-field="url" type="url" value="${escapeHtml(item.url)}" placeholder="https://..." ${canManageTenders() ? "" : "disabled"}>
        ${item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Buka</a>` : ""}
      </td>
    </tr>
  `).join("");
}

async function saveTenderChecklist() {
  const tender = getSelectedTender();
  if (!tender || !requirePermission(canManageTenders(), "Role Anda tidak dapat mengubah monitoring dokumen.")) return;
  const documents = [...document.querySelectorAll("[data-tender-document-id]")].map(row => ({
    id: row.dataset.tenderDocumentId,
    group: createTenderChecklist().find(item => item.id === row.dataset.tenderDocumentId)?.group || "",
    name: createTenderChecklist().find(item => item.id === row.dataset.tenderDocumentId)?.name || "",
    status: row.querySelector('[data-document-field="status"]').value,
    owner: row.querySelector('[data-document-field="owner"]').value.trim(),
    deadline: row.querySelector('[data-document-field="deadline"]').value,
    url: row.querySelector('[data-document-field="url"]').value.trim()
  }));
  try {
    await setDoc(doc(db, TENDER_STORAGE_COLLECTION, tender.id), {
      documents,
      updatedBy: normalizeEmail(currentUser?.email),
      updatedAt: serverTimestamp()
    }, { merge: true });
    notify("Monitoring dokumen berhasil disimpan.");
  } catch (error) {
    notify(getTenderFirestoreErrorMessage(error, "Monitoring dokumen gagal disimpan."));
  }
}

function formatTenderDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: value.includes("T") ? "2-digit" : undefined,
    minute: value.includes("T") ? "2-digit" : undefined
  }).format(date);
}

function getTenderPersonnel(tender) {
  const references = getTenderReferencePersonnelMembers(tender?.sourceJobKey || tender?.name);
  const manual = [
    ...normalizeTenderPersonnelMembers(tender?.personnelMembers),
    ...getTenderManualPersonnelFromLegacyFields(tender)
  ];
  const unique = new Map();

  [...references, ...manual].forEach(member => {
    const record = createTenderPersonnelRecord({
      name: member?.name || getRecordValue(member, ["nama personil", "nama lengkap", "nama"]),
      position: member?.position || getRecordValue(member, [
        "posisi/jabatan (kontrak)",
        "posisi/jabatan",
        "jabatan",
        "posisi"
      ]),
      involvement: member?.involvement || getRecordValue(member, ["keterlibatan"]),
      source: member?.source || "Tambahan"
    });
    const key = normalizeSearchText(record.name);
    if (!key || unique.has(key)) return;
    unique.set(key, record);
  });

  return [...unique.values()];
}

function buildTenderTemplate(tender, type) {
  const personnel = getTenderPersonnel(tender);
  const companyName = "PT. BEMACO REKAPRIMA";
  const commonHeader = `
    <div class="template-letterhead">
      <strong>${companyName}</strong>
      <span>Dokumen Tender Jasa Konsultansi</span>
    </div>
  `;
  const identity = `
    <table>
      <tr><th>Nama Paket</th><td>${escapeHtml(tender.name || "-")}</td></tr>
      <tr><th>Instansi/Satker</th><td>${escapeHtml(tender.agency || "-")}</td></tr>
      <tr><th>Lokasi</th><td>${escapeHtml(tender.location || "-")}</td></tr>
      <tr><th>Tahun Anggaran</th><td>${escapeHtml(tender.budgetYear || "-")}</td></tr>
    </table>
  `;
  const signature = `
    <div class="template-signature">
      <p>[Kota], [Tanggal Dokumen]</p>
      <p>${companyName}</p>
      <br><br><br>
      <strong>[Nama Penandatangan]</strong>
      <p>[Jabatan]</p>
    </div>
  `;

  if (type === "pakta-integritas") {
    return `${commonHeader}<h1>PAKTA INTEGRITAS</h1>${identity}
      <p>Kami yang bertanda tangan di bawah ini menyatakan bahwa dalam proses pengadaan untuk paket tersebut:</p>
      <ol>
        <li>Tidak akan melakukan praktik korupsi, kolusi, dan nepotisme.</li>
        <li>Akan melaporkan indikasi penyimpangan yang diketahui.</li>
        <li>Akan mengikuti proses pengadaan secara bersih, transparan, dan profesional.</li>
        <li>Bersedia dikenakan sanksi apabila melanggar pernyataan ini.</li>
      </ol>${signature}`;
  }

  if (type === "daftar-personel" || type === "jadwal-penugasan") {
    const isSchedule = type === "jadwal-penugasan";
    return `${commonHeader}<h1>${isSchedule ? "JADWAL PENUGASAN PERSONEL" : "DAFTAR PERSONEL TENAGA AHLI"}</h1>${identity}
      <table>
        <thead><tr><th>No.</th><th>Nama Personel</th><th>Posisi/Jabatan</th>${isSchedule
          ? "<th>Mulai</th><th>Selesai</th>"
          : "<th>Bidang Keahlian</th><th>Status</th>"}</tr></thead>
        <tbody>${personnel.length ? personnel.map((record, index) => `
          <tr>
            <td>${index + 1}</td>
            <td>${escapeHtml(getRecordValue(record, ["nama personil", "nama lengkap", "nama"]) || "-")}</td>
            <td>${escapeHtml(getRecordValue(record, ["posisi jabatan kontrak", "jabatan", "posisi"]) || "-")}</td>
            ${isSchedule
              ? `<td>${escapeHtml(getRecordValue(record, ["tanggal mulai", "mulai"]) || "-")}</td><td>${escapeHtml(getRecordValue(record, ["tanggal selesai", "selesai"]) || "-")}</td>`
              : `<td>${escapeHtml(getRecordValue(record, ["ska bidang keahlian", "bidang keahlian", "ska"]) || "-")}</td><td>${escapeHtml(getRecordValue(record, ["status kontrak", "status"]) || "-")}</td>`}
          </tr>`).join("") : '<tr><td colspan="6">Tambahkan data personel paket pada DATA UTAMA atau isi tabel ini secara manual.</td></tr>'}</tbody>
      </table>${signature}`;
  }

  if (type === "metodologi") {
    return `${commonHeader}<h1>PENDEKATAN DAN METODOLOGI</h1>${identity}
      <h2>1. Pemahaman terhadap Kerangka Acuan Kerja</h2>
      <p>[Jelaskan pemahaman tujuan, keluaran, lokasi, ruang lingkup, dan kondisi pekerjaan.]</p>
      <h2>2. Pendekatan Teknis</h2>
      <p>[Uraikan pendekatan teknis yang relevan dengan paket dan standar PUPR/Cipta Karya.]</p>
      <h2>3. Metodologi Pelaksanaan</h2>
      <p>[Uraikan tahapan pengumpulan data, analisis, perencanaan, koordinasi, pengendalian mutu, dan pelaporan.]</p>
      <h2>4. Rencana Kerja dan Organisasi Tim</h2>
      <p>[Jelaskan jadwal, pembagian peran, mekanisme komunikasi, serta pengendalian risiko.]</p>
      <h2>5. Keluaran dan Pengendalian Mutu</h2>
      <p>[Tuliskan daftar keluaran dan mekanisme pemeriksaan sebelum penyerahan.]</p>`;
  }

  return `${commonHeader}<h1>SURAT PENAWARAN</h1>
    <p>Nomor: [Nomor Surat]</p>
    <p>Kepada Yth.<br><strong>Pokja Pemilihan / Pejabat Pengadaan</strong><br>${escapeHtml(tender.agency || "[Nama Instansi/Satker]")}</p>
    <p>Dengan hormat,</p>
    <p>Sehubungan dengan proses pemilihan penyedia jasa konsultansi untuk paket berikut:</p>
    ${identity}
    <p>Kami mengajukan penawaran sesuai Dokumen Pemilihan beserta seluruh adendum. Nilai penawaran biaya kami adalah <strong>${formatRupiah(tender.hps || tender.budgetCeiling)}</strong> atau sesuai rincian penawaran biaya terlampir.</p>
    <p>Penawaran ini berlaku selama [masa berlaku penawaran] hari kalender sejak batas akhir pemasukan penawaran.</p>
    ${signature}`;
}

function generateTenderTemplate() {
  const tender = getSelectedTender();
  if (!tender) return notify("Pilih paket tender terlebih dahulu.");
  const type = document.getElementById("tenderTemplateType").value;
  document.getElementById("tenderTemplatePreview").innerHTML =
    sanitizeTenderTemplateHtml(tender.templates?.[type] || buildTenderTemplate(tender, type));
}

async function saveTenderTemplateDraft() {
  const tender = getSelectedTender();
  if (!tender || !requirePermission(canManageTenders(), "Role Anda tidak dapat menyimpan draf template.")) return;
  const type = document.getElementById("tenderTemplateType").value;
  const content = sanitizeTenderTemplateHtml(
    document.getElementById("tenderTemplatePreview").innerHTML.trim()
  );
  if (!content) return notify("Buat atau isi template terlebih dahulu.");
  try {
    await setDoc(doc(db, TENDER_STORAGE_COLLECTION, tender.id), {
      templates: {
        ...(tender.templates || {}),
        [type]: content
      },
      updatedBy: normalizeEmail(currentUser?.email),
      updatedAt: serverTimestamp()
    }, { merge: true });
    notify("Draf template berhasil disimpan pada paket tender.");
  } catch (error) {
    notify(getTenderFirestoreErrorMessage(error, "Draf template gagal disimpan."));
  }
}

function getTenderFirestoreErrorMessage(error, prefix) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  if (code.includes("permission-denied") || message.toLowerCase().includes("insufficient permissions")) {
    return `${prefix}\n\nFirestore menolak izin koleksi tenders. Buka Firebase Console > Firestore Database > Rules, masukkan firestore.rules terbaru, lalu klik Publish. Setelah itu muat ulang web.`;
  }
  return `${prefix}\n\n${message || "Terjadi kesalahan yang tidak diketahui."}`;
}

function sanitizeTenderTemplateHtml(value) {
  const documentFragment = new DOMParser().parseFromString(String(value || ""), "text/html");
  documentFragment.querySelectorAll("script, style, iframe, object, embed, form").forEach(node => node.remove());
  documentFragment.querySelectorAll("*").forEach(node => {
    [...node.attributes].forEach(attribute => {
      const name = attribute.name.toLowerCase();
      const content = attribute.value.trim().toLowerCase();
      if (name.startsWith("on") || ((name === "href" || name === "src") && content.startsWith("javascript:"))) {
        node.removeAttribute(attribute.name);
      }
    });
  });
  return documentFragment.body.innerHTML;
}

function printTenderTemplate() {
  const tender = getSelectedTender();
  const preview = document.getElementById("tenderTemplatePreview");
  if (!tender || !preview.textContent.trim()) return notify("Buat template terlebih dahulu.");
  const html = `
    <!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(tender.name)} - Dokumen Tender</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { color:#111827; font:12pt Arial,sans-serif; line-height:1.55; }
      h1 { margin:22px 0; font-size:16pt; text-align:center; }
      h2 { margin-top:20px; font-size:13pt; }
      table { width:100%; border-collapse:collapse; margin:14px 0; }
      th,td { border:1px solid #9ca3af; padding:7px; text-align:left; vertical-align:top; }
      .template-letterhead { display:flex; justify-content:space-between; border-bottom:2px solid #1d4ed8; padding-bottom:10px; }
      .template-signature { width:42%; margin:30px 0 0 auto; }
    </style></head><body>${sanitizeTenderTemplateHtml(preview.innerHTML)}</body></html>`;
  printHtmlDocument(html);
}

function watchProfiles() {
  unsubscribeProfiles = onSnapshot(query(collection(db, "profiles")), snapshot => {
    state.people = snapshot.docs
      .map(item => ({ uid: item.id, ...item.data() }))
      .sort((a, b) => String(a.displayName || a.nickname || a.email || "")
        .localeCompare(String(b.displayName || b.nickname || b.email || "")));
    renderLocalAI();
    renderRecipients();
  }, () => {
    state.people = currentProfile ? [{ uid: currentUser?.uid, ...currentProfile }] : [];
  });
}

function watchRoleAssignments() {
  if (!canManageRoles()) return;
  unsubscribeRoles = onSnapshot(query(collection(db, "roles")), snapshot => {
    state.roleAssignments = snapshot.docs
      .map(item => ({ email: item.id, ...item.data() }))
      .sort((a, b) => normalizeEmail(a.email).localeCompare(normalizeEmail(b.email)));
    renderRoleAssignments();
  }, () => {
    state.roleAssignments = [];
    renderRoleAssignments();
  });
}

async function saveRoleAssignment(event) {
  event.preventDefault();
  if (!requirePermission(canManageRoles(), "Hanya Super Admin atau Administrator yang dapat mengatur role.")) return;

  const email = normalizeEmail(document.getElementById("roleEmailInput").value);
  const role = document.getElementById("roleSelect").value;
  if (!email || !ACCESS_ROLES[role]) return notify("Email atau role tidak valid.");

  if (email === BOOTSTRAP_SUPER_ADMIN_EMAIL && role !== "super_admin") {
    return notify("Role Super Admin utama tidak dapat diturunkan.");
  }
  if (state.accessRole !== "super_admin" && includesAny(role, ["super_admin", "admin"])) {
    return notify("Administrator tidak dapat menetapkan Super Admin atau Administrator lain.");
  }

  try {
    await setDoc(doc(db, "roles", email), {
      email,
      role,
      updatedBy: normalizeEmail(currentUser?.email),
      updatedAt: serverTimestamp()
    }, { merge: true });
    document.getElementById("roleAssignmentForm").reset();
    renderRoleSelectOptions();
  } catch (error) {
    notify(`Role gagal disimpan: ${error.message}`);
  }
}

function handleRoleAssignmentAction(event) {
  const button = event.target.closest("[data-role-delete]");
  if (!button) return;
  removeRoleAssignment(button.dataset.roleDelete);
}

async function removeRoleAssignment(emailValue) {
  const email = normalizeEmail(emailValue);
  const assignment = state.roleAssignments.find(item => normalizeEmail(item.email) === email);
  if (!requirePermission(canManageRoles(), "Anda tidak memiliki izin menghapus role.")) return;
  if (email === BOOTSTRAP_SUPER_ADMIN_EMAIL) return notify("Super Admin utama tidak dapat dihapus.");
  if (state.accessRole !== "super_admin" && includesAny(assignment?.role || "", ["super_admin", "admin"])) {
    return notify("Administrator tidak dapat menghapus role tingkat atas.");
  }
  if (!confirm(`Hapus penetapan role untuk ${email}? Pengguna akan kembali menjadi Member.`)) return;

  try {
    await deleteDoc(doc(db, "roles", email));
  } catch (error) {
    notify(`Role gagal dihapus: ${error.message}`);
  }
}

function renderRoleAssignments() {
  const body = document.getElementById("roleAssignmentsBody");
  if (!body) return;
  if (!canManageRoles()) {
    body.innerHTML = "";
    return;
  }

  const assignments = [
    {
      email: BOOTSTRAP_SUPER_ADMIN_EMAIL,
      role: "super_admin",
      updatedBy: "Sistem",
      protected: true
    },
    ...state.roleAssignments.filter(item => normalizeEmail(item.email) !== BOOTSTRAP_SUPER_ADMIN_EMAIL)
  ];

  body.innerHTML = assignments.map(item => {
    const role = ACCESS_ROLES[item.role] || ACCESS_ROLES.member;
    const canDelete = !item.protected &&
      (state.accessRole === "super_admin" || !includesAny(item.role, ["super_admin", "admin"]));
    return `
      <tr>
        <td><strong>${escapeHtml(item.email)}</strong></td>
        <td><span class="access-role-badge role-${escapeHtml(item.role)}">${escapeHtml(role.label)}</span></td>
        <td>${escapeHtml(item.updatedBy || "-")}</td>
        <td>${canDelete
          ? `<button class="text-button danger-text" type="button" data-role-delete="${escapeHtml(item.email)}">Hapus</button>`
          : '<span class="protected-role-label">Dilindungi</span>'}</td>
      </tr>
    `;
  }).join("");
}

function render() {
  if (currentUser) renderAccessControl();
  renderView();
  renderStats();
  renderTasks();
  renderTasksTable();
  renderReports();
  renderRecipients();
  renderAgenda();
  renderFocusList();
  renderLocalAI();
  renderExternalSheetStatus();
  renderPersonnel();
  renderJobs();
  renderTenders();
  renderDashboardPortfolioHome();
  renderDashboardWorkSummary();
  renderAttentionBanner();
  document.getElementById("todayText").textContent = `Hari ini: ${formatHumanDate(state.today)}`;
  document.getElementById("syncStatus").textContent = state.syncMessage;
}

function setView(view) {
  if (!canViewMenu(view)) {
    notify("Role Anda tidak memiliki akses untuk membuka menu ini.");
    return;
  }
  state.activeView = view;
  renderView();
}

function renderView() {
  const titles = {
    dashboard: "Dashboard",
    tenders: "Tender",
    jobs: "Portofolio",
    personnel: "Personil",
    tasks: "Tugas",
    reports: "Laporan",
    settings: "Pengaturan"
  };
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
    ? tasks.map(task => {
        const canEdit = canEditTask(task);
        const canDelete = canDeleteTask(task);
        const canChange = canChangeTaskStatus(task, "Proses");
        return `
        <tr>
          <td>${escapeHtml(task.tanggal)}</td>
          <td><strong>${escapeHtml(task.namaTugas)}</strong><small>${escapeHtml(task.catatan || "")}</small></td>
          <td><span class="chip priority-${String(task.prioritas || "").toLowerCase()}">${escapeHtml(task.prioritas)}</span></td>
          <td><span class="chip">${escapeHtml(task.status)}</span></td>
          <td>${escapeHtml(task.deadline || "-")}</td>
          <td>${escapeHtml(task.penanggungJawab || "-")}<small>${escapeHtml(task.emailPenanggungJawab || "")}</small></td>
          <td class="table-actions">
            ${canChange && task.status !== "Proses" && task.status !== "Selesai" ? `<button class="link-button" data-action="start" data-id="${task.id}">Mulai</button>` : ""}
            ${canChange && task.status !== "Selesai" ? `<button class="link-button" data-action="done" data-id="${task.id}">Selesai</button>` : ""}
            <button class="link-button" data-action="preview" data-id="${task.id}">Preview</button>
            ${canSendReminders() ? `<button class="link-button" data-action="email" data-id="${task.id}">Email</button>` : ""}
            ${canEdit ? `<button class="link-button" data-action="edit" data-id="${task.id}">Edit</button>` : ""}
            ${canDelete ? `<button class="link-button" data-action="delete" data-id="${task.id}">Hapus</button>` : ""}
          </td>
        </tr>
      `;
      }).join("")
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
  const options = getRecipientOptions();
  if (state.selectedRecipientEmail && !options.some(item => item.email === state.selectedRecipientEmail)) {
    state.selectedRecipientEmail = "";
    document.getElementById("selectedRecipientEmail").value = "";
    document.getElementById("recipientSearch").value = "";
  }
  updateRecipientSelectionHint(options);
  renderRecipientOptions();
}

function getRecipientOptions() {
  const tasks = state.tasks;
  const people = buildPeopleDirectory(tasks);
  const map = new Map();

  people.filter(person => person.email).forEach(person => {
    const email = person.email.toLowerCase();
    map.set(email, {
      name: person.name || person.nickname || email,
      email,
      role: person.role || "",
      taskCount: tasks.filter(task =>
        String(task.emailPenanggungJawab || "").trim().toLowerCase() === email &&
        task.status !== "Selesai"
      ).length
    });
  });

  tasks.forEach(task => {
    const email = String(task.emailPenanggungJawab || "").trim().toLowerCase();
    if (!email) return;
    const existing = map.get(email);
    map.set(email, {
      name: existing?.name || task.penanggungJawab || email,
      email,
      role: existing?.role || "",
      taskCount: tasks.filter(item =>
        String(item.emailPenanggungJawab || "").trim().toLowerCase() === email &&
        item.status !== "Selesai"
      ).length
    });
  });

  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function renderRecipientOptions() {
  const list = document.getElementById("recipientList");
  const keyword = normalizeSearchText(document.getElementById("recipientSearch").value);
  const options = getRecipientOptions().filter(item => {
    if (!keyword) return true;
    return normalizeSearchText(`${item.name} ${item.email} ${item.role}`).includes(keyword);
  });

  list.innerHTML = options.length
    ? options.map(item => `
        <button class="recipient-option ${item.email === state.selectedRecipientEmail ? "active" : ""}"
                type="button"
                role="option"
                aria-selected="${item.email === state.selectedRecipientEmail}"
                data-recipient-email="${escapeHtml(item.email)}">
          <span class="recipient-option-copy">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(item.email)}${item.role ? ` - ${escapeHtml(item.role)}` : ""} - ${item.taskCount} tugas aktif</small>
          </span>
          <span class="recipient-option-check">${item.email === state.selectedRecipientEmail ? "✓" : ""}</span>
        </button>
      `).join("")
    : '<div class="recipient-empty">Nama atau email tidak ditemukan.</div>';

  list.querySelectorAll("[data-recipient-email]").forEach(button => {
    button.addEventListener("click", () => selectRecipient(button.dataset.recipientEmail));
  });
}

function handleRecipientInput() {
  state.selectedRecipientEmail = "";
  document.getElementById("selectedRecipientEmail").value = "";
  updateRecipientSelectionHint([]);
  openRecipientCombobox();
}

function selectRecipient(email) {
  const option = getRecipientOptions().find(item => item.email === email);
  if (!option) return;
  state.selectedRecipientEmail = option.email;
  document.getElementById("selectedRecipientEmail").value = option.email;
  document.getElementById("recipientSearch").value = option.name;
  updateRecipientSelectionHint([option]);
  closeRecipientCombobox();
}

function updateRecipientSelectionHint(options = getRecipientOptions()) {
  const selected = options.find(item => item.email === state.selectedRecipientEmail) ||
    getRecipientOptions().find(item => item.email === state.selectedRecipientEmail);
  document.getElementById("recipientSelectionHint").textContent = selected
    ? `${selected.name} - ${selected.email} - ${selected.taskCount} tugas aktif`
    : "Belum ada penerima dipilih.";
}

function openRecipientCombobox() {
  document.getElementById("recipientList").classList.remove("hidden");
  document.getElementById("recipientSearch").setAttribute("aria-expanded", "true");
  renderRecipientOptions();
}

function closeRecipientCombobox() {
  document.getElementById("recipientList").classList.add("hidden");
  document.getElementById("recipientSearch").setAttribute("aria-expanded", "false");
}

function toggleRecipientCombobox() {
  const list = document.getElementById("recipientList");
  if (list.classList.contains("hidden")) openRecipientCombobox();
  else closeRecipientCombobox();
}

function handleRecipientKeydown(event) {
  if (event.key === "Escape") {
    closeRecipientCombobox();
    return;
  }
  if (event.key === "Enter") {
    const options = getRecipientOptions().filter(item =>
      normalizeSearchText(`${item.name} ${item.email}`).includes(
        normalizeSearchText(document.getElementById("recipientSearch").value)
      )
    );
    if (options.length === 1) {
      event.preventDefault();
      selectRecipient(options[0].email);
    }
  }
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
  const canEdit = canEditTask(task);
  const canDelete = canDeleteTask(task);
  const canChange = canChangeTaskStatus(task, "Proses");

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
        ${canChange && task.status !== "Proses" && task.status !== "Selesai" ? `<button class="link-button" data-action="start" data-id="${task.id}">Mulai</button>` : ""}
        ${canChange && task.status !== "Selesai" ? `<button class="link-button" data-action="done" data-id="${task.id}">Selesai</button>` : ""}
        <button class="link-button" data-action="preview" data-id="${task.id}">Preview</button>
        ${canSendReminders() ? `<button class="link-button" data-action="email" data-id="${task.id}">Email</button>` : ""}
        ${canEdit ? `<button class="link-button" data-action="edit" data-id="${task.id}">Edit</button>` : ""}
        ${canDelete ? `<button class="link-button" data-action="delete" data-id="${task.id}">Hapus</button>` : ""}
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
  if (!requirePermission(canCreateTask(), "Role Anda hanya memiliki akses baca dan tidak dapat membuat tugas.")) return;
  closeActionMenu();
  document.getElementById("modalTitle").textContent = "Tugas Baru";
  document.getElementById("taskId").value = "";
  document.getElementById("taskName").value = "";
  document.getElementById("taskDate").value = state.today;
  document.getElementById("taskDeadline").value = "";
  document.getElementById("taskPriority").value = "Sedang";
  const statusInput = document.getElementById("taskStatus");
  statusInput.value = state.accessRole === "contributor" ? "Tertunda" : "Belum Selesai";
  statusInput.disabled = state.accessRole === "contributor";
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
  const existingTask = id ? state.tasks.find(item => item.id === id) : null;
  const allowed = existingTask ? canEditTask(existingTask) : canCreateTask();
  if (!requirePermission(allowed, "Anda tidak memiliki izin menyimpan tugas ini.")) return;
  const forcedStatus = state.accessRole === "contributor"
    ? "Tertunda"
    : document.getElementById("taskStatus").value;
  const payload = {
    ownerUid: existingTask?.ownerUid || currentUser.uid,
    dibuatOleh: existingTask?.dibuatOleh || currentUser.email || "",
    tanggal: document.getElementById("taskDate").value,
    namaTugas: document.getElementById("taskName").value.trim(),
    prioritas: document.getElementById("taskPriority").value,
    status: forcedStatus,
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
    notify(error.message);
  }
}

function editTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return notify("Tugas tidak ditemukan.");
  if (!requirePermission(canEditTask(task), "Anda hanya dapat mengubah tugas sesuai kewenangan role Anda.")) return;
  document.getElementById("modalTitle").textContent = "Edit Tugas";
  document.getElementById("taskId").value = task.id;
  document.getElementById("taskName").value = task.namaTugas || "";
  document.getElementById("taskDate").value = task.tanggal || state.today;
  document.getElementById("taskDeadline").value = task.deadline || "";
  document.getElementById("taskPriority").value = task.prioritas || "Sedang";
  const statusInput = document.getElementById("taskStatus");
  statusInput.value = task.status || "Belum Selesai";
  statusInput.disabled = state.accessRole === "contributor";
  document.getElementById("taskOwner").value = task.penanggungJawab || "";
  document.getElementById("taskOwnerEmail").value = task.emailPenanggungJawab || "";
  document.getElementById("taskNote").value = task.catatan || "";
  document.getElementById("taskModal").showModal();
}

async function removeTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!requirePermission(canDeleteTask(task), "Anda tidak memiliki izin menghapus tugas ini.")) return;
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
    notify(error.message);
  }
}

async function setTaskStatus(id, status) {
  const selectedTask = state.tasks.find(item => item.id === id);
  if (!requirePermission(canChangeTaskStatus(selectedTask, status), "Anda tidak memiliki izin mengubah status tugas ini.")) return;
  try {
    const task = selectedTask;
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
    notify(error.message);
  }
}

function previewTask(id) {
  const task = state.tasks.find(item => item.id === id);
  if (!task) return notify("Tugas tidak ditemukan.");
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
  const sendButton = document.getElementById("previewSendButton");
  sendButton.classList.toggle("hidden", !canSendReminders());
  sendButton.onclick = () => sendTaskEmail(task.id);
  document.getElementById("previewModal").showModal();
}

function closePreviewModal() {
  document.getElementById("previewModal").close();
}

function sendTaskEmail(id) {
  if (!requirePermission(canSendReminders(), "Role Anda tidak dapat mengirim reminder.")) return;
  const task = state.tasks.find(item => item.id === id);
  if (!task) return notify("Tugas tidak ditemukan.");
  if (!task.emailPenanggungJawab) return notify("Email Penanggung Jawab belum diisi.");
  sendEmail([task], [task.emailPenanggungJawab]);
}

function sendAllReminders() {
  if (!requirePermission(canSendReminders(), "Role Anda tidak dapat mengirim reminder.")) return;
  closeActionMenu();
  const tasks = state.tasks.filter(task => task.status !== "Selesai" && (task.tanggal === state.today || isOverdue(task)));
  const recipients = [...new Set(tasks.map(task => task.emailPenanggungJawab).filter(Boolean))];
  if (!recipients.length) return notify("Belum ada email penanggung jawab pada tugas aktif.");
  sendEmail(tasks, recipients);
}

function sendSelectedReminders() {
  if (!requirePermission(canSendReminders(), "Role Anda tidak dapat mengirim reminder.")) return;
  const email = state.selectedRecipientEmail || document.getElementById("selectedRecipientEmail").value;
  if (!email) return notify("Pilih nama atau email penerima terlebih dahulu.");
  const tasks = state.tasks.filter(task =>
    String(task.emailPenanggungJawab || "").trim().toLowerCase() === email.toLowerCase() &&
    task.status !== "Selesai"
  );
  if (!tasks.length) return notify("Penerima ini belum memiliki tugas aktif untuk dikirim.");
  sendEmail(tasks, [email]);
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
    notify("Permintaan email dikirim ke Apps Script Email Bridge.");
    return;
  }

  const firstRecipient = recipients[0];
  const subject = encodeURIComponent("Pengingat Tugas Harian");
  const body = encodeURIComponent(buildEmailBody(tasks));
  window.location.href = `mailto:${firstRecipient}?subject=${subject}&body=${body}`;
}

function createReport() {
  if (!requirePermission(canCreateReports(), "Role Anda hanya dapat melihat laporan.")) return;
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
  if (!tasks.length) return notify("Belum ada tugas untuk diekspor.");

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
