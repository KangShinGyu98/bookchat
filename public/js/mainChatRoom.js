import { auth, db, onUser, rtdb } from "./app.js";
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
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { toastShow } from "./myToast.js";
import { getDatabase, ref, onValue, runTransaction, onDisconnect, set } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

const params = new URLSearchParams(location.search);
const bookTitleEl = document.getElementById("bookTitle");
const bookMetaEl = document.getElementById("bookMeta");
const messagesEl = document.getElementById("messages");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
const unSubscribeBtn = document.getElementById("unSubscribeBtn");
const userArea = document.getElementById("userArea");
const loginBtn = document.getElementById("loginBtn");
const memberCountSpan = document.getElementById("chat-card-member-count");
const chatFoldBtn = document.getElementById("chat-fold-btn");
const chatWidgetContainer = document.getElementById("chat-widget-container");
const chatOpenBtn = document.getElementById("chat-widget-container-open-btn");

///
// 오늘 날짜 키 (예: "2025-12-02")
chatFoldBtn?.addEventListener("click", () => {
  chatWidgetContainer.classList.toggle("d-none", true);
  chatOpenBtn.classList.toggle("d-none", false);
});
chatOpenBtn?.addEventListener("click", () => {
  chatWidgetContainer.classList.toggle("d-none", false);
  chatOpenBtn.classList.toggle("d-none", true);
});

export function joinRoom(user) {
  if (!user) return;
  const memberRef = ref(rtdb, `mainchatroom/presence/users/${user.uid}`);

  const memberData = {
    displayName: user.displayName || "익명",
    photoURL: user.photoURL || null,
    isAnonymous: !!user.isAnonymous,
    joinedAt: serverTimestamp(),
  };

  // 접속 중일 때 멤버 정보 기록
  set(memberRef, memberData);

  // 브라우저/탭 닫히거나 끊기면 자동으로 제거
  onDisconnect(memberRef).remove();
}

// 멤버 목록 + count 구독
export function listenRoomMembers(callback) {
  const membersRef = ref(rtdb, `mainchatroom/presence/users`);

  onValue(membersRef, (snapshot) => {
    const val = snapshot.val() || {};
    const members = Object.entries(val).map(([uid, data]) => ({
      uid,
      ...data,
    }));

    const count = members.length;
    callback({ members, count });
  });
}
export function setupChatUI(user) {
  const memberCountEl = document.getElementById("chat-card-member-count");
  if (!memberCountEl) return;

  listenRoomMembers(({ count }) => {
    memberCountEl.textContent = `접속인원 ${count}명`;
  });
}
onUser((user) => joinRoom(user));
onUser(async (user) => {
  if (user) {
    setupChatUI(user);
  }
});

///

let unsubscribeMsgs = null;

function renderMessages(snapshot) {
  messagesEl.innerHTML = "";
  snapshot.forEach((docSnap) => {
    const m = docSnap.data();
    const isMe = auth.currentUser && m.senderUid === auth.currentUser.uid;
    const div = document.createElement("div");
    div.className = `d-flex ${isMe ? "justify-content-end" : "justify-content-start"}`;
    div.innerHTML = `
      <div class="msg ${isMe ? "msg-me" : "msg-other"}">
        <div class="text-xs text-muted  ${isMe ? "text-end" : "text-start"}">${m.senderName || "익명"}</div>
        <div class="text-start mb-1 small">${m.text || ""}</div>
      </div>`;
    messagesEl.appendChild(div);
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const today = new Date().toISOString().split("T")[0];
  const q = query(collection(db, "chatrooms", today, "messages"), orderBy("createdAt"));
  unsubscribeMsgs = onSnapshot(q, (snap) => renderMessages(snap));
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  const text = input.value.trim();
  if (!text) return;
  const today = new Date().toISOString().split("T")[0];
  await addDoc(collection(db, "chatrooms", today, "messages"), {
    text,
    senderUid: user.isAnonymous ? "익명#" + user.uid.slice(0, 4) : user.uid,
    senderName: user.displayName || "익명#" + user.uid.slice(0, 4),
    createdAt: serverTimestamp(),
  });
  input.value = "";
});

// unSubscribeBtn.addEventListener("click", async () => {
//   const user = auth.currentUser && !auth.currentUser.isAnonymous;
//   if (!user) {
//     alert("로그인 필요");
//     return;
//   }
//   await deleteDoc(doc(db, "books", slug, "members", user.uid));
//   location.href = "index.html";
// });

subscribeMessages();
