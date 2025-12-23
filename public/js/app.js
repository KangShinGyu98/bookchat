// firebase 초기화 및 인증 관련 함수들
import { initializeAppCheck, ReCaptchaV3Provider } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app-check.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  linkWithPopup,
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { connectDatabaseEmulator, get, getDatabase, onDisconnect, ref, remove } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-database.js";
import { connectFirestoreEmulator, getFirestore } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { connectFunctionsEmulator, getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";
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
const isLocalhost = location.hostname === "127.0.0.1" || location.hostname === "localhost";
if (!isLocalhost) {
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider("6LeMgTQsAAAAAL7c3RdaDyMZBtGEzQ92QId8GFFN"),
    isTokenAutoRefreshEnabled: true,
  });
}

export const auth = getAuth(app);
export const functions = getFunctions(app, "asia-northeast3");

export const rtdb = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// 로컬에서만 에뮬레이터 사용
export const db = isLocalhost ? getFirestore(app) : getFirestore(app, "bookchat-database");
export const registerUser = httpsCallable(functions, "registerUser");
export const createBook = httpsCallable(functions, "createBook");
export const createQuestion = httpsCallable(functions, "createQuestion");
export const callNaverBooksApi = httpsCallable(functions, "callNaverBooksApi");
export const setNickname = httpsCallable(functions, "setNickname");
export const createOrUpdateRating = httpsCallable(functions, "createOrUpdateRating");
export const subscribeToggleCall = httpsCallable(functions, "subscribeToggleCall");
export const sendMainChatMessage = httpsCallable(functions, "sendMainChatMessage");
export const sendMessage = httpsCallable(functions, "sendMessage");
if (isLocalhost) {
  connectFirestoreEmulator(db, "127.0.0.1", 8080); // Firestore 에뮬레이터 포트
  connectDatabaseEmulator(rtdb, "127.0.0.1", 9000); // RTDB 에뮬레이터 포트 (쓸 거면)
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
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
  try {
    if (current && current.isAnonymous) {
      try {
        result = await linkWithPopup(current, provider);
        const googleUserDbRef = ref(db, `users/${result.user.uid}`);
        const googleUserDataSnap = await get(googleUserDbRef);
        const googleUserData = googleUserDataSnap.val() || {};
        // const updates = {};
        // updates[`mainchatroom/presence/users/${result.user.uid}`] = {
        //   nickname: googleUserData.nickname || "익명",
        //   photoURL: googleUser.photoURL,
        //   isAnonymous: false,
        //   joinedAt: serverTimestamp(),
        // };

        // await update(ref(rtdb), updates);
      } catch (err) {
        if (err.code === "auth/credential-already-in-use") {
          const cred = GoogleAuthProvider.credentialFromError(err);
          const beforeUid = current.uid;
          const anonUserRef = ref(rtdb, `mainchatroom/presence/users/${beforeUid}`);
          await onDisconnect(anonUserRef).cancel();
          await remove(anonUserRef);

          result = await signInWithCredential(auth, cred);
          // const googleUser = result.user;
          // const afterUid = googleUser.uid; // 기존에 있던 Google UID
          // const googleUserRef = ref(rtdb, `mainchatroom/presence/users/${afterUid}`);
          // // todo 기존 유저 정보 있으면 nickname 가져와야하는지
          //  ("Anonymous user merged into existing Google account:", beforeUid, "->", afterUid);
          // const googleUserDbRef = ref(db, `users/${afterUid}`);
          // const googleUserDataSnap = await get(googleUserDbRef);
          // const googleUserData = googleUserDataSnap.val() || {};
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
    await registerUser();
  } catch (e) {
    try {
      await signOut(auth); // 상태 정리
    } catch (e2) {
      console.error("signOut error", e2);
      throw e2;
    }
    console.error("loginWithGoogle error", e);
    throw e;
  }

  return result.user;
}

export async function loginWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}
