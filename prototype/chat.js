import { auth, db, loginWithGoogle, loginWithEmailPassword, logout, onUser } from "./app.js";
import {
  doc,
  getDoc,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  setDoc,
  deleteDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const params = new URLSearchParams(location.search);
const slug = params.get("book");

const bookTitleEl = document.getElementById("bookTitle");
const bookMetaEl = document.getElementById("bookMeta");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("msgForm");
const input = document.getElementById("msgInput");
const leaveBtn = document.getElementById("leaveBtn");
const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");

loginBtn?.addEventListener("click", () => loginWithGoogle());

if (!slug) {
  alert("book 파라미터가 없습니다.");
  location.href = "index.html";
}

let unsubscribeMsgs = null;

async function loadBook() {
  const snap = await getDoc(doc(db, "books", slug));
  if (!snap.exists()) {
    alert("존재하지 않는 책입니다.");
    location.href = "index.html";
    return;
  }
  const data = snap.data();
  bookTitleEl.textContent = data.title;
  const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000) : null;
  bookMetaEl.textContent = `${data.author || "-"} · 평점 ${data.rating ?? "-"} · 작성일 ${createdAt ? createdAt.toLocaleDateString() : "-"}`;
}

function renderMessages(snapshot) {
  messagesEl.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const m = docSnap.data();
    const isMe = auth.currentUser && m.senderUid === auth.currentUser.uid;
    const div = document.createElement("div");
    div.className = `d-flex mb-2 ${isMe ? "justify-content-end" : "justify-content-start"}`;
    div.innerHTML = `
      <div class="msg ${isMe ? "msg-me" : "msg-other"}">
        <div class="small text-muted mb-1">${m.senderName || "익명"}</div>
        <div>${m.text || ""}</div>
      </div>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const q = query(collection(db, "books", slug, "messages"), orderBy("createdAt"));
  unsubscribeMsgs = onSnapshot(q, (snap) => renderMessages(snap));
}

async function joinIfNeeded(user) {
  await setDoc(doc(db, "books", slug, "members", user.uid), { joinedAt: serverTimestamp(), lastReadAt: serverTimestamp() }, { merge: true });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    alert("로그인 후 작성 가능합니다.");
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  await addDoc(collection(db, "books", slug, "messages"), {
    text,
    senderUid: user.uid,
    senderName: user.displayName || user.email || "사용자",
    createdAt: serverTimestamp(),
  });
  input.value = "";
});

leaveBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) {
    alert("로그인 필요");
    return;
  }
  await deleteDoc(doc(db, "books", slug, "members", user.uid));
  location.href = "index.html";
});

onUser((user) => {
  if (user) {
    userArea.innerHTML = `<span class="small text-muted">${user.email || user.displayName}</span>
      <button class="btn btn-outline-secondary btn-sm" id="logoutBtn">로그아웃</button>`;
    document.getElementById("logoutBtn").onclick = () => logout();
    joinIfNeeded(user);
  } else {
    userArea.innerHTML = `<button class="btn btn-outline-primary btn-sm" id="loginBtn">로그인</button>`;
    document.getElementById("loginBtn").onclick = () => loginWithGoogle();
  }
});

loadBook();
subscribeMessages();
