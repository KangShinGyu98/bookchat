// firebase 초기화 및 인증 관련 함수들
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  linkWithPopup,
  signInWithCredential,
  connectAuthEmulator,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
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
  getFirestore,
  connectFirestoreEmulator,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { getDatabase, ref, get, update, remove, connectDatabaseEmulator } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";
export const firebaseConfig = {
  apiKey: "AIzaSyA9bkq2Zgs2yWfCBfgCl1GdSDehMY3ZGRs",
  authDomain: "book-chat-da2d6.firebaseapp.com",
  projectId: "book-chat-da2d6",
  storageBucket: "book-chat-da2d6.firebasestorage.app",
  messagingSenderId: "636447158366",
  appId: "1:636447158366:web:0103fd018cc5c19ece04cf",
  measurementId: "G-YE0KCFD67Y",
};
//인증정보
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const functions = getFunctions(app);
export const rtdb = getDatabase();
const googleProvider = new GoogleAuthProvider();
const isLocalhost = location.hostname === "127.0.0.1" || location.hostname === "localhost";

// 로컬에서만 에뮬레이터 사용
export const db = isLocalhost ? getFirestore(app) : getFirestore(app, "bookchat-database");
if (isLocalhost) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080); // Firestore 에뮬레이터 포트
  connectDatabaseEmulator(rtdb, "127.0.0.1", 9000); // RTDB 에뮬레이터 포트 (쓸 거면)
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5005);
}
console.log("dbId:", db._databaseId?.database);
//래핑 함수
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}
export async function logout() {
  const user = auth.currentUser;
  try {
    if (user) {
      const presenceRef = ref(rtdb, `mainchatroom/presence/users/${user.uid}`);
      await remove(presenceRef);
    }
    await signOut(auth);
    location.reload();
  } catch (err) {
    alert("로그아웃 중 문제가 발생했습니다.");
  }
}

//사용함수들
export async function loginWithGoogle() {
  const provider = googleProvider;
  const current = auth.currentUser;
  let result = null;
  // 이미 익명 로그인된 상태라면 → 계정 업그레이드
  if (current && current.isAnonymous) {
    const beforeUid = current.uid; // 익명 UID 저장
    // const today = new Date().toISOString().split("T")[0];
    try {
      result = await linkWithPopup(current, provider);
    } catch (err) {
      // 계정이 이미 다른 provider로 만들어져 있을 때 등 예외 처리
      // 여기서 credential-already-in-use 발생 가능
      if (err.code === "auth/credential-already-in-use") {
        // ① 에러에서 credential 추출
        const cred = GoogleAuthProvider.credentialFromError(err);

        // ② 기존 Google 계정으로 로그인
        result = await signInWithCredential(auth, cred);
        const googleUser = result.user;
        const afterUid = googleUser.uid; // 기존에 있던 Google UID

        // ③ 익명 UID → Google UID로 데이터 merge / 정리
        await mergeAnonymousUserData(beforeUid, afterUid);
      }
    }
  } else {
    try {
      result = await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("signInWithPopup error", err);
      throw err;
    }
  }

  // const result = await signInWithPopup(auth, googleProvider);
  const user = result.user; // firebase user

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // 여기서가 “자동 회원가입” 영역
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      provider: "google",
      createdAt: new Date(),
      autoSubscribe: true,
      notificationSetting: true,
    });
  }
}

export async function mergeAnonymousUserData(anonUid, googleUid) {
  if (!anonUid || !googleUid) return;

  const anonUserRef = ref(rtdb, `mainchatroom/presence/users/${anonUid}`);
  const googleUserRef = ref(rtdb, `mainchatroom/presence/users/${googleUid}`);

  try {
    const snap = await get(anonUserRef);
    if (!snap.exists()) {
      return;
    }

    const anonData = snap.val();

    // 🔹 googleUid 에 이미 데이터가 있을 수도 있으니 merge 형태로 처리
    const updates = {};
    updates[`mainchatroom/presence/users/${googleUid}`] = {
      ...(typeof anonData === "object" ? anonData : {}),
      // 여기서 displayName, isAnonymous 등 필요하면 덮어쓰기 가능
      isAnonymous: false,
    };
    updates[`mainchatroom/presence/users/${anonUid}`] = null; // 익명 노드 삭제

    await update(ref(rtdb), updates);
  } catch (err) {
    console.error("mergeAnonymousUserData 에러:", err);
  }
}

export async function loginWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
