// firebase 초기화 및 인증 관련 함수들
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInAnonymously,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
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
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

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
export const db = getFirestore(app, "bookchat-database");
const googleProvider = new GoogleAuthProvider();

signInAnonymously(auth).catch((error) => {
  console.error("Anonymous sign-in error", error);
});

//래핑 함수
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}
export async function logout() {
  return signOut(auth);
}

//사용함수들
export async function loginWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const user = result.user; // firebase user

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  if (!snap.exists()) {
    // 여기서가 “자동 회원가입” 영역
    //todo 닉네임 물어보는 모달 띄우기 - 로그아웃 되어야하는지 확인하기
    await setDoc(userRef, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      photoURL: user.photoURL,
      provider: "google",
      createdAt: new Date(),
    });
  }
}
