# Setup Fitur "Tanya AI" (Gemini)

Fitur ini menjawab pertanyaan berdasarkan isi notulensi (bukan ngarang bebas),
lewat Gemini API punya Google. Perlu 1 API key gratis + 1 setting di Vercel.

## 1. Ambil API key gratis (2 menit)

1. Buka https://aistudio.google.com/app/apikey
2. Login pakai akun Google apa saja
3. Klik **Create API key** → pilih project (atau buat baru) → copy key-nya
   (formatnya diawali `AIza...`)

**PENTING:** jangan pernah taruh key ini di file yang dibuka browser
(index.html, app.js, dsb). Key ini hanya boleh disimpan di Vercel sebagai
environment variable (langkah 2), karena kalau taruh di kode client, siapa
saja yang buka "View Source" bisa mencurinya dan memakai kuota gratismu.

## 2. Set environment variable di Vercel

1. Buka https://vercel.com/dashboard → pilih project `buku-ir-aurora`
2. **Settings** → **Environment Variables**
3. Tambah:
   - Key: `GEMINI_API_KEY`
   - Value: (paste API key dari langkah 1)
   - Environment: centang semua (Production, Preview, Development)
4. **Save**

## 3. Upload file baru & redeploy

Paket update ini menambahkan folder `api/` (berisi `ask.js`) yang jalan
sebagai serverless function di Vercel — otomatis terdeteksi, tidak perlu
setting tambahan. Upload semua file seperti biasa lalu `vercel --prod`.

**Setelah environment variable ditambahkan lewat dashboard, kamu WAJIB
redeploy ulang** (`vercel --prod` sekali lagi) supaya function-nya baca
env var yang baru — env var yang ditambahkan tidak otomatis masuk ke
deployment yang sudah jalan sebelumnya.

## Cara kerja singkat

Saat ada yang tanya lewat tombol "Tanya AI":
1. Pertanyaan dikirim ke `/api/ask` (jalan di server Vercel, bukan di HP user)
2. Server mencari 8 potongan notulensi paling relevan dengan pertanyaan itu
3. Potongan itu + pertanyaan dikirim ke Gemini dengan instruksi: **jawab
   hanya dari potongan itu, kalau tidak ada bilang jujur tidak ketemu**
4. Jawaban + nomor halaman sumber dikirim balik ke tampilan

Ini bukan pengganti keputusan klinis — selalu ada catatan pengingat di
tampilan untuk konfirmasi ke senior/konsulen.

## Model yang dipakai & kalau nanti error

File `api/ask.js` memakai model `gemini-3.8-flash` (per September 2026).
Google kadang menghentikan model lama. Kalau fitur ini tiba-tiba error,
kemungkinan besar modelnya sudah di-deprecate — cek daftar model terbaru di
https://ai.google.dev/gemini-api/docs/models, lalu ganti nilai `MODEL` di
baris atas `api/ask.js` dengan nama model yang masih aktif.

## Batas gratis

Free tier Gemini API dibatasi jumlah permintaan per menit/hari (angkanya
berubah-ubah, cek di halaman API key kamu). Untuk pemakaian satu angkatan
sehari-hari biasanya cukup; kalau ternyata sering kena limit, tinggal upgrade
ke tier berbayar (murah, dihitung per token) dari akun Google yang sama.
