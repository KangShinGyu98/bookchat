import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp as rtdbServerTimestamp,
  set,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { auth, db, onUser, rtdb, sendMainChatMessage } from "./app.js";
import { toastShow } from "./myToast.js";

const messagesEl = document.getElementById("messages");
const form = document.getElementById("chatForm");
const input = document.getElementById("chatInput");
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

export async function joinRoom(user) {
  if (!user) return;
  const memberRef = ref(rtdb, `mainchatroom/presence/users/${user.uid}`);
  const userDoc = await getDoc(doc(db, "users", user.uid));
  const userData = userDoc.exists() ? userDoc.data() : null;
  const nickname = userData?.nickname || "익명";

  const memberData = {
    nickname: nickname,
    photoURL: user.photoURL || null,
    isAnonymous: !!user.isAnonymous,
    joinedAt: rtdbServerTimestamp(),
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
onUser((user) => {
  if (user) {
    setupChatUI(user);
    joinRoom(user);
  }
});

///

let unsubscribeMsgs = null;
//todo renderMessages 도 chat 처럼 innerhtml 말고 createElement 로 바꾸기 + 바꾸면서 왜 익명일때 남의 채팅처럼 나오는지 수정
function renderMessages(snapshot) {
  if (!messagesEl) return;

  messagesEl.textContent = "";

  snapshot.forEach((docSnap) => {
    const m = docSnap.data();
    const isMe = auth.currentUser && m.senderUid === auth.currentUser.uid;

    const wrapper = document.createElement("div");
    wrapper.className = `d-flex ${isMe ? "justify-content-end" : "justify-content-start"}`;

    const msgBox = document.createElement("div");
    msgBox.className = `msg ${isMe ? "msg-me" : "msg-other"}`;

    // sender name
    const senderEl = document.createElement("div");
    senderEl.className = `text-xs text-muted ${isMe ? "text-end" : "text-start"}`;
    senderEl.textContent = m.senderName || "익명";

    // message text
    const textEl = document.createElement("div");
    textEl.className = "text-start mb-1 small";
    textEl.textContent = m.text || "";

    msgBox.append(senderEl, textEl);
    wrapper.appendChild(msgBox);
    messagesEl.appendChild(wrapper);
  });

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function subscribeMessages() {
  if (unsubscribeMsgs) unsubscribeMsgs();
  const today = new Date().toISOString().split("T")[0];
  const q = query(collection(db, "chatrooms", today, "messages"), orderBy("createdAt"));
  unsubscribeMsgs = onSnapshot(q, (snap) => renderMessages(snap));
}

//todo 메시지작성도 functions 로 옮겨
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) {
    alert("일시적 오류입니다. 새로고침 후 이용해주세요.");
    location.reload();
    return;
  }
  const text = input.value;
  if (!text) return;
  if (text.length > 100) {
    toastShow("메시지는 최대 100자까지 입력할 수 있습니다.");
    return;
  }

  try {
    // callable로 메시지 전송
    input.value = "";
    const res = await sendMainChatMessage({ text });

    // if (res?.data?.ok) {
    //   input.value = "";
    // }
  } catch (err) {
    switch (err?.code) {
      case "functions/invalid-argument":
        toastShow(err?.message ?? "메시지 입력값이 올바르지 않습니다.");
        break;
      case "functions/resource-exhausted":
        toastShow("메시지를 너무 빠르게 보냈습니다. 잠시 후 다시 시도하세요.");
        break;
      default:
        toastShow("서버 오류가 발생했습니다.");
    }
    input.value = text; // 실패 시 입력 복원
  }
});

subscribeMessages();
