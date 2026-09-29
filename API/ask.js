// Vercel serverless function: /api/ask
// Menerima { question: string }, mencari potongan notulensi paling relevan,
// lalu tanya Gemini supaya jawabannya berbasis isi notulensi (bukan ngarang).
//
// WAJIB: set environment variable GEMINI_API_KEY di Vercel dashboard
// (Project -> Settings -> Environment Variables). JANGAN taruh API key di
// kode sisi client -- itu sebabnya fitur ini lewat serverless function.

const fs = require('fs');
const path = require('path');

// Ganti nama model ini kalau suatu saat Google men-deprecate model yang dipakai.
// Cek model terbaru yang tersedia di https://ai.google.dev/gemini-api/docs/models
const MODEL = 'gemini-3.8-flash';

let ENTRIES_CACHE = null;
function loadEntries(){
  if(ENTRIES_CACHE) return ENTRIES_CACHE;
  const p = path.join(process.cwd(), 'data', 'entries.json');
  ENTRIES_CACHE = JSON.parse(fs.readFileSync(p, 'utf-8'));
  return ENTRIES_CACHE;
}

const STOPWORDS = new Set(['yang','dan','di','ke','dari','untuk','pada','dengan','ini','itu',
  'apa','bagaimana','apakah','adalah','atau','jika','saat','ada','tidak','bisa','saya','kita',
  'nya','ya','jadi','juga','akan','harus','sudah','belum','kalau','the','is','a','an','of','to']);

function scoreEntry(text, words){
  const lower = text.toLowerCase();
  let score = 0;
  words.forEach(w => { if(w.length > 2 && lower.includes(w)) score += 1; });
  return score;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if(req.method === 'OPTIONS'){ res.status(200).end(); return; }
  if(req.method !== 'POST'){ res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = req.body;
  if(typeof body === 'string'){ try{ body = JSON.parse(body); }catch(e){ body = {}; } }
  const question = (body && body.question || '').toString().trim();

  if(!question || question.length > 500){
    res.status(400).json({ error: 'Pertanyaan kosong atau terlalu panjang (maks 500 karakter).' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if(!apiKey){
    res.status(500).json({ error: 'GEMINI_API_KEY belum diset di Vercel. Lihat AI_SETUP.md.' });
    return;
  }

  let entries;
  try{ entries = loadEntries(); }
  catch(e){ res.status(500).json({ error: 'Gagal membaca data notulensi di server.' }); return; }

  const words = question.toLowerCase().split(/\s+/).filter(w => w && !STOPWORDS.has(w));
  const scored = entries
    .map(e => ({ e, score: scoreEntry(e.text, words) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const context = scored
    .map(x => `[Hal. ${x.e.page} - ${x.e.cat_label}]\n${x.e.text}`)
    .join('\n\n---\n\n');

  const prompt = `Kamu adalah asisten yang HANYA boleh menjawab berdasarkan potongan notulensi PPDS IKA di bawah ini. Jangan mengarang atau menambah informasi dari luar potongan ini. Kalau jawabannya tidak ada di potongan ini, katakan dengan jujur bahwa informasi itu tidak ditemukan di notulensi dan sarankan untuk konfirmasi ke senior/konsulen. Selalu sebutkan halaman sumber dengan format (Hal. X) di akhir kalimat yang relevan. Jawab singkat, jelas, dan dalam Bahasa Indonesia.

POTONGAN NOTULENSI:
${context || '(tidak ada potongan yang cukup relevan ditemukan untuk pertanyaan ini)'}

PERTANYAAN: ${question}`;

  try{
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
      }
    );
    const data = await geminiRes.json();
    if(!geminiRes.ok){
      res.status(502).json({ error: data?.error?.message || 'Gemini API mengembalikan error.' });
      return;
    }
    const answer = data?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || 'Maaf, tidak ada jawaban dari Gemini.';
    res.status(200).json({ answer, sources: scored.map(x => x.e.page) });
  }catch(e){
    res.status(500).json({ error: 'Gagal menghubungi Gemini API.' });
  }
};
