// Modul ini menghubungkan website ke Firebase Firestore untuk fitur
// kolaborasi (tambah catatan, komentar, riwayat). Kalau firebase-config.js
// belum diisi config asli, fitur ini nonaktif tapi sisanya tetap jalan normal.

if (window.FIREBASE_READY) {
  import('https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js').then(async (appMod) => {
    const { initializeApp } = appMod;
    const {
      getFirestore, collection, addDoc, onSnapshot,
      query, orderBy, limit, serverTimestamp
    } = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');

    const app = initializeApp(window.FIREBASE_CONFIG);
    const db = getFirestore(app);

    async function addNote(cat, text, author){
      await addDoc(collection(db, 'notes'), {
        cat, text, author: author || 'Anonim', createdAt: serverTimestamp()
      });
      await addDoc(collection(db, 'history'), {
        type: 'note', summary: `menambahkan catatan baru`, cat, author: author || 'Anonim',
        createdAt: serverTimestamp()
      });
    }

    async function addComment(page, text, author){
      await addDoc(collection(db, 'comments'), {
        page, text, author: author || 'Anonim', createdAt: serverTimestamp()
      });
      await addDoc(collection(db, 'history'), {
        type: 'comment', summary: `mengomentari halaman ${page}`, page, author: author || 'Anonim',
        createdAt: serverTimestamp()
      });
    }

    function subscribeNotes(cb){
      const q = query(collection(db, 'notes'), orderBy('createdAt', 'desc'));
      return onSnapshot(q, (snap) => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => cb([]));
    }

    function subscribeComments(cb){
      const q = query(collection(db, 'comments'), orderBy('createdAt', 'asc'));
      return onSnapshot(q, (snap) => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => cb([]));
    }

    function subscribeHistory(cb){
      const q = query(collection(db, 'history'), orderBy('createdAt', 'desc'), limit(100));
      return onSnapshot(q, (snap) => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => cb([]));
    }

    window.AuroraDB = { addNote, addComment, subscribeNotes, subscribeComments, subscribeHistory, ready: true };
    window.dispatchEvent(new CustomEvent('aurora-db-ready'));
  }).catch(() => {
    window.AuroraDB = { ready: false };
    window.dispatchEvent(new CustomEvent('aurora-db-ready'));
  });
} else {
  window.AuroraDB = { ready: false };
  window.dispatchEvent(new CustomEvent('aurora-db-ready'));
}
