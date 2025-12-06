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
  where,
  getCountFromServer,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { toastShow } from "./myToast.js";
import {
  getDatabase,
  ref,
  onValue,
  runTransaction,
  onDisconnect,
  set,
  serverTimestamp as rtdbServerTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

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
const params = new URLSearchParams(location.search);
const bookId = params.get("book");
if (!bookId) {
  alert("정상적인 접근이 아닙니다.");
  location.href = "index.html";
}

export function joinRoom(user) {
  if (!user) return;
  if (!bookId) return; // bookId 범위에 있는지 확인 필요

  const presenceRef = ref(rtdb, `presence/${bookId}/users/${user.uid}`);

  // ✅ v9 스타일
  set(presenceRef, {
    state: "online",
    isAnonymous: !!user.isAnonymous,
    joinedAt: rtdbServerTimestamp(),
  });

  // onDisconnect 도 함수 형태
  onDisconnect(presenceRef).remove();
}
// 멤버 목록 + count 구독
export async function listenRoomMembers(callback) {
  const membersRef = ref(rtdb, `presence/${bookId}/users`);
  const subscribeMembersRef = collection(db, "books", bookId, "members");

  // 🔥 Firestore v9 올바른 count 쿼리
  const subscribedQuery = query(subscribeMembersRef, where("subscribe", "==", true));
  const subscribedSnapshot = await getCountFromServer(subscribedQuery);
  onValue(membersRef, (snapshot) => {
    const val = snapshot.val() || {};
    const members = Object.entries(val).map(([uid, data]) => ({
      uid,
      ...data,
    }));

    const count = members.filter((member) => member.isAnonymous === false).length;

    callback({
      members,
      count,
      subscribedCount: subscribedSnapshot.data().count,
    });
  });
}

export function setupChatUI(user) {
  // 접속중 : 5/120명
  const memberCountEl = document.getElementById("membersCount");
  if (!memberCountEl) return;

  listenRoomMembers(({ count, subscribedCount }) => {
    memberCountEl.textContent = `접속인원 ${count}/${subscribedCount}명`;
  });
}
onUser((user) => joinRoom(user));
onUser(async (user) => {
  if (user) {
    setupChatUI(user);
  }
});
