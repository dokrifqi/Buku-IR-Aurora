# Setup Fitur Kolaborasi (Tambah Catatan, Komentar, Riwayat)

Fitur ini butuh database gratis dari Firebase supaya catatan/komentar yang
ditambahkan satu orang muncul juga di HP orang lain. Sekali setup, jalan terus.

## 1. Buat project Firebase (2 menit)

1. Buka https://console.firebase.google.com
2. Klik **Add project** → kasih nama bebas (misal `notulensi-aurora`)
3. Matikan Google Analytics (tidak perlu) → **Create project**

## 2. Daftarkan web app (1 menit)

1. Di dashboard project, klik ikon **`</>`** (Web)
2. Kasih nickname bebas → **Register app**
3. Copy blok `firebaseConfig = { ... }` yang muncul
4. Buka file `firebase-config.js` di paket ini, tempel nilai-nilainya
   menggantikan tulisan `GANTI_...`

## 3. Aktifkan Firestore Database (1 menit)

1. Di sidebar kiri Firebase Console → **Build** → **Firestore Database**
2. Klik **Create database** → pilih lokasi (misal `asia-southeast2` / Jakarta) → **Start in test mode**
3. Setelah aktif, buka tab **Rules**, ganti isinya dengan ini, lalu **Publish**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{id} {
      allow read: if true;
      allow create: if request.resource.data.text is string
                    && request.resource.data.text.size() < 5000;
      allow update, delete: if false;
    }
    match /comments/{id} {
      allow read: if true;
      allow create: if request.resource.data.text is string
                    && request.resource.data.text.size() < 2000;
      allow update, delete: if false;
    }
    match /history/{id} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if false;
    }
  }
}
```

Aturan ini artinya: **siapa saja yang punya link website bisa menambah**
catatan/komentar (tidak perlu login), tapi **tidak bisa mengedit/menghapus**
punya orang lain langsung dari luar — jadi datanya aman dari vandalisme acak,
cocok untuk grup tertutup seangkatan. Kalau nanti mau ditambah login supaya
tercatat siapa yang nulis (bukan cuma nama yang diketik manual), kasih tahu saya.

## 4. Redeploy

Upload ulang semua file (termasuk `firebase-config.js` yang sudah diisi) ke
Vercel seperti biasa (`vercel --prod`).

## Batas gratis (Spark plan)

Firestore gratis sampai 50.000 baca dan 20.000 tulis per hari — untuk satu
angkatan PPDS, ini jauh lebih dari cukup dan tidak akan kena biaya.
