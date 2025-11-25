// firebase 초기화 및 인증 관련 함수들
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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
export const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

//래핑 함수
export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
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

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  // showLoginUI();

  // user = 구글 로그인 정보 (Auth)

  // Firestore에 있는 나의 서비스 회원 정보 로드
  const profileRef = doc(db, "users", user.uid);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) {
    // 서비스 최초 회원가입
    showNicknameModal();
  } else {
    const profile = profileSnap.data();
    console.log("내 서비스 유저 정보:", profile);
  }
});
