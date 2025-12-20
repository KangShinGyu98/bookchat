import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { db, onUser, rtdb } from "./app.js";

import {
  off,
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbServerTimestamp,
  set,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";

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
  const membersRef = ref(rtdb, `presence/${bookId}/users`);
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

  const rtdbHandler = (snapshot) => {
    const val = snapshot.val() || {};
    latestMembers = Object.entries(val).map(([uid, data]) => ({
      uid,
      ...data,
    }));

    latestOnlineCount = latestMembers.filter((m) => m.isAnonymous === false).length;
    emit();
  };

  // 등록
  onValue(membersRef, rtdbHandler);

  // Firestore listen
  const fsUnsub = onSnapshot(bookRef, (snap) => {
    const data = snap.data() || {};
    latestMembersCount = Number(data.membersCount ?? 0);
    latestSubscribedMembers = Number(data.subscribedMembers ?? 0);
    emit();
  });

  // ✅ cleanup: 해당 ref의 "value" 리스너 중 내가 등록한 것만 해제
  return () => {
    off(membersRef, "value", rtdbHandler);
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
onUser(async (user) => {
  if (user) {
    joinRoom(user);
    setupChatUI(user);
  }
});
