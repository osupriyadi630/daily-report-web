# Cara Update

## Update Tampilan atau Fitur Frontend

1. Edit file di folder `web/`.
2. Upload perubahan ke repository GitHub.
3. GitHub Pages akan memperbarui website otomatis.
4. Refresh browser.

File yang paling sering diedit:

- `index.html` untuk struktur tampilan.
- `styles.css` untuk warna/layout.
- `app.js` untuk fitur dan logika.

## Update Versi 2

Versi 2 menambahkan:

- Panel `Fokus Hari Ini`.
- Banner perhatian untuk tugas terlambat, tugas hari ini, dan prioritas tinggi.
- Tombol cepat `Mulai` dan `Selesai` pada kartu/tabel tugas.
- Tombol `Export CSV` untuk mengunduh data tugas.
- Cadangan lokal per akun agar tugas tidak kosong saat halaman di-refresh dan Firebase belum selesai sinkron.
- Status sinkronisasi di bawah tanggal dashboard.

File yang perlu di-upload ulang ke GitHub:

- `web/index.html`
- `web/styles.css`
- `web/app.js`

Setelah upload, buka website dengan tambahan cache buster, contoh:

```text
https://osupriyadi630.github.io/daily-report-web/?v=9
```

## Update Firebase Rules

1. Edit `web/firestore.rules`.
2. Buka Firebase Console.
3. Masuk ke Firestore Database > Rules.
4. Paste rules baru.
5. Klik Publish.

### Wajib Setelah Update Sistem Role

Versi role menambahkan collection Firestore `roles`. Setelah file web terbaru
diunggah ke GitHub, lakukan langkah berikut satu kali:

1. Buka Firebase Console project `Daily Report`.
2. Pilih `Firestore Database`.
3. Buka tab `Rules`.
4. Hapus rules lama.
5. Copy seluruh isi file `web/firestore.rules`.
6. Paste ke editor Rules.
7. Klik `Publish`.
8. Keluar lalu login kembali ke web.

Email `o.supriyadi630@gmail.com` ditetapkan sebagai Super Admin utama melalui
rules dan kode aplikasi. Akun ini tidak dapat diturunkan atau dihapus melalui
panel role.

Collection role memakai email huruf kecil sebagai ID dokumen:

```text
roles
  o.supriyadi630@gmail.com
    role: super_admin
```

Dokumen untuk Super Admin utama tidak wajib dibuat karena aksesnya sudah
ditetapkan sebagai bootstrap owner. Role pengguna lain dibuat otomatis dari
menu `Pengaturan > Manajemen Role`.

## Update Email Bridge

1. Buka project Apps Script email bridge.
2. Edit `Code.gs`.
3. Klik Simpan.
4. Klik `Terapkan > Kelola deployment`.
5. Klik edit deployment.
6. Pilih versi baru.
7. Klik Terapkan.

## Menambah Modul Baru

Rekomendasi struktur:

```text
web/
  modules/
    nama-modul.js
```

Lalu import dari `app.js` jika aplikasi mulai besar. Untuk versi awal, semua logika masih di `app.js` agar mudah dipelajari.
