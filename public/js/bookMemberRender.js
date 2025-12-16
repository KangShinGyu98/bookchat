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
  off,
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
export function listenRoomMembers(bookId, callback) {
  // RTDB: presence
  const membersRef = ref(rtdb, `presence/${bookId}/users`);

  // Firestore: books/{bookId} 카운트들
  const bookRef = doc(db, "books", bookId);

  // 최신값 캐시(둘 중 하나가 먼저 와도 합쳐서 callback)
  let latestMembers = [];
  let latestOnlineCount = 0;

  let latestMembersCount = 0; // books/{bookId}.membersCount
  let latestSubscribedMembers = 0; // books/{bookId}.subscribedMembers

  const emit = () => {
    callback({
      members: latestMembers,
      count: latestOnlineCount, // 현재 접속 인원(비익명만)
      membersCount: latestMembersCount, // 전체 멤버 수(또는 너가 정한 의미)
      subscribedCount: latestSubscribedMembers, // 구독 멤버 수
    });
  };

  // 1) RTDB listen (접속자 목록/인원)
  const rtdbUnsub = onValue(membersRef, (snapshot) => {
    const val = snapshot.val() || {};
    latestMembers = Object.entries(val).map(([uid, data]) => ({
      uid,
      ...data,
    }));

    latestOnlineCount = latestMembers.filter((m) => m.isAnonymous === false).length;
    emit();
  });

  // 2) Firestore listen (membersCount, subscribedMembers)
  const fsUnsub = onSnapshot(bookRef, (snap) => {
    const data = snap.data() || {};

    // 필드가 없을 수도 있으니 안전하게 숫자 처리
    latestMembersCount = Number(data.membersCount ?? 0);
    latestSubscribedMembers = Number(data.subscribedMembers ?? 0);

    emit();
  });

  // cleanup(구독 해제) 반환
  return () => {
    // RTDB v9 onValue는 off로 해제하는 패턴이 안전함
    off(membersRef);
    // Firestore onSnapshot은 함수 호출로 해제
    fsUnsub();
  };
}

export function setupChatUI(user) {
  // 접속중 : 5/120명
  const memberCountEl = document.getElementById("membersCount");
  if (!memberCountEl) return;

  const unsubscribe = listenRoomMembers(bookId, ({ count, subscribedCount }) => {
    memberCountEl.textContent = `접속인원 ${count}/${subscribedCount}명`;
  });
}
onUser((user) => joinRoom(user));
onUser(async (user) => {
  if (user) {
    setupChatUI(user);
  }
});
