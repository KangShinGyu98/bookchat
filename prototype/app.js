// Firebase client setup (modular SDK).
// 채운 뒤 그대로 사용하세요. 이 파일은 브라우저에서 import 됩니다.
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

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, "bookchat-database");
const googleProvider = new GoogleAuthProvider();

export function onUser(cb) {
  return onAuthStateChanged(auth, cb);
}

export async function loginWithGoogle() {
  await signInWithPopup(auth, googleProvider);
}

export async function loginWithEmailPassword(email, password) {
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signupWithEmailPassword(email, password) {
  return createUserWithEmailAndPassword(auth, email, password);
}

export async function sendPasswordReset(email) {
  return sendPasswordResetEmail(auth, email);
}

export async function logout() {
  return signOut(auth);
}
