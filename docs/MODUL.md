# Modul Aplikasi

## 1. Modul Login

Lokasi: `web/app.js`

Fungsi utama:

- daftar akun email/password
- login
- logout
- membaca user aktif

Menggunakan Firebase Authentication.

## 2. Modul Database Tugas

Lokasi: `web/app.js`

Collection Firestore:

```text
tasks
```

Field utama:

```text
ownerUid
tanggal
namaTugas
prioritas
status
deadline
penanggungJawab
emailPenanggungJawab
catatan
createdAt
updatedAt
```

## 3. Modul Dashboard

Lokasi: `web/index.html`, `web/app.js`, `web/styles.css`

Fitur:

- statistik total tugas
- kanban board
- filter hari ini / terlambat
- agenda aktif
- laporan sesi

## 4. Modul Email

Ada 2 mode:

### Mode Gratis Tanpa Bridge

Menggunakan `mailto`. Browser membuka aplikasi email, user klik kirim manual.

### Mode Apps Script Email Bridge

Frontend mengirim request ke Apps Script Web App.
Apps Script mengirim email melalui Gmail akun pemilik script.

File:

```text
apps-script-email-bridge/Code.gs
```

Catatan:

- Pengiriman mengikuti kuota Gmail/Apps Script.
- Gunakan token rahasia sederhana agar endpoint tidak mudah disalahgunakan.

## 5. Modul Monitoring Tender

Penyimpanan Firestore aktif:

```text
tasks
```

Dokumen Tender dibedakan dari tugas menggunakan field:

```text
entityType: "tender"
```

Cara ini menggunakan aturan akses koleksi `tasks` yang sudah aktif sehingga modul dapat langsung dipakai. Renderer tugas selalu menyaring `entityType: "tender"`, sehingga paket Tender tidak muncul pada daftar tugas.

Fitur:

- daftar dan status paket tender
- progres kelengkapan dokumen
- PIC, deadline, dan tautan dokumen
- checklist administrasi, kualifikasi, teknis, personel, biaya, dan finalisasi
- sinkronisasi realtime antar akun

Hak perubahan paket dan checklist diberikan kepada:

```text
super_admin
admin
editor
```

Semua akun yang telah login dan mendapatkan akses menu Tender dapat membaca data.

## 6. Modul Template Dokumen Tender

Template awal yang tersedia:

- Surat Penawaran
- Pakta Integritas
- Daftar Personel
- Jadwal Penugasan Personel
- Kerangka Pendekatan dan Metodologi

Template dapat diedit langsung di halaman lalu dicetak atau disimpan sebagai PDF melalui dialog cetak browser. Isi template wajib diperiksa kembali terhadap Dokumen Pemilihan dan adendum paket terkait.
