# Asisten Harian Web Gratis

Paket ini adalah versi web full gratis dengan:

- GitHub Pages sebagai hosting tampilan.
- Firebase Spark Plan sebagai login dan database.
- Modul opsional Apps Script untuk kirim email pengingat.
- Monitoring paket tender dan kelengkapan dokumen.
- Generator draf template dokumen tender yang dapat diedit dan dicetak.

## Struktur File

```text
asisten-harian-web-gratis/
  web/
    index.html
    styles.css
    app.js
    firebase-config.example.js
    firestore.rules
  apps-script-email-bridge/
    Code.gs
  docs/
    INSTALASI.md
    UPDATE.md
    MODUL.md
```

## Pilihan Arsitektur

```text
Browser user
  â†“
GitHub Pages
  â†“
Firebase Authentication + Firestore
  â†“
Opsional: Apps Script Email Bridge
```

Data tugas dan paket tender disimpan di Firestore. Data pekerjaan/personil tambahan tetap dapat dibaca dari Google Spreadsheet yang dikonfigurasi.

Sebelum memakai modul Tender, publikasikan isi terbaru `web/firestore.rules` melalui Firebase Console agar koleksi `tenders` dapat dibaca dan dikelola sesuai role.

## Yang Gratis

- GitHub Pages untuk hosting static web.
- Firebase Authentication email/password dalam batas gratis.
- Firestore dalam batas gratis.
- Apps Script email bridge dalam batas kuota Gmail/Apps Script.

## Langkah Cepat

1. Buat project Firebase.
2. Aktifkan Authentication `Email/Password`.
3. Buat Firestore Database.
4. Copy konfigurasi Firebase ke `web/firebase-config.js`.
5. Upload folder `web/` ke GitHub repository.
6. Aktifkan GitHub Pages.
7. Buka URL GitHub Pages.

Panduan lengkap ada di [docs/INSTALASI.md](docs/INSTALASI.md).
## Quality Check

Sebelum deploy update, jalankan:

```powershell
npm.cmd run check
```

Standar coding proyek ada di [docs/CODING-STANDARDS.md](docs/CODING-STANDARDS.md).

