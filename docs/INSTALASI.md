# Instalasi

## A. Firebase

1. Buka Firebase Console: https://console.firebase.google.com
2. Buat project baru.
3. Buka `Authentication`.
4. Aktifkan metode login `Email/Password`.
5. Buka `Firestore Database`.
6. Klik `Create database`.
7. Pilih mode produksi.
8. Buka tab `Rules`.
9. Copy isi `web/firestore.rules` ke rules Firestore, lalu publish.
10. Buka `Project settings`.
11. Tambahkan aplikasi Web.
12. Copy konfigurasi Firebase.
13. Di folder `web/`, duplikat:

```text
firebase-config.example.js
```

menjadi:

```text
firebase-config.js
```

14. Isi `window.FIREBASE_CONFIG` dengan konfigurasi Firebase Anda.

## B. GitHub Pages

1. Buat repository GitHub baru, misalnya `asisten-harian-web`.
2. Upload semua isi folder `web/` ke repository.
3. Pastikan file `firebase-config.js` ikut terupload.
4. Buka repository `Settings`.
5. Buka menu `Pages`.
6. Pada `Build and deployment`, pilih:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
7. Klik `Save`.
8. Tunggu sampai GitHub memberi URL:

```text
https://username.github.io/asisten-harian-web/
```

## C. Email Bridge Opsional

Tanpa email bridge, tombol email akan membuka aplikasi email melalui `mailto`.

Jika ingin email terkirim otomatis via Apps Script:

1. Buka https://script.google.com
2. Buat project baru.
3. Copy isi `apps-script-email-bridge/Code.gs`.
4. Ganti:

```javascript
const EMAIL_BRIDGE_TOKEN = 'GANTI_DENGAN_TOKEN_RAHASIA';
```

5. Klik `Terapkan > Deployment baru`.
6. Pilih `Aplikasi web`.
7. Jalankan sebagai: `Saya`.
8. Akses: `Siapa saja`.
9. Copy URL `/exec`.
10. Masukkan URL dan token ke `web/firebase-config.js`:

```javascript
window.EMAIL_BRIDGE_URL = "URL_APPS_SCRIPT_EXEC";
window.EMAIL_BRIDGE_TOKEN = "TOKEN_RAHASIA_YANG_SAMA";
```

11. Upload ulang `firebase-config.js` ke GitHub.

