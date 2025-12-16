/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
// 🔹 Firebase Functions v2
const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const logger = require("firebase-functions/logger");
const { defineString } = require("firebase-functions/params");

// 🔹 Firebase Admin SDK
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const admin = require("firebase-admin");

// 🔹 Functions 공통 옵션
setGlobalOptions({ maxInstances: 10 });

// 🔹 Admin 초기화 (한 번만)
const app = initializeApp();

// 🔹 Firestore: 멀티 DB 중 "bookchat-database" 사용
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";

// 에뮬레이터일 땐 기본 DB, 배포 환경일 땐 멀티 DB (정말 필요하다면)
const db = isEmulator
  ? getFirestore() // 기본 DB (에뮬레이터 호환)
  : getFirestore(app, "bookchat-database");

// 🔹 Realtime Database
const rtdb = getDatabase(app);

// 🔹 환경 변수 (Firebase Functions params)
const client_id = defineString("NAVER_CLIENT_ID");
const client_secret = defineString("NAVER_CLIENT_SECRET");

// 🔹 (선택) v1 스타일 함수가 아직 남아있다면 사용
const functions = require("firebase-functions");

exports.searchBooks = functions.https.onRequest(async (req, res) => {
  const allowed = ["http://127.0.0.1:5005", "https://book-chat-da2d6.web.app"];
  const origin = req.headers.origin;
  if (allowed.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
  }
  res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  res.set("Access-Control-Max-Age", "3600");
  if (req.method === "OPTIONS") return res.status(204).send("");

  const { query, display = 10, start = 1, sort = "sim" } = req.query;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    const r = await fetch(
      `https://openapi.naver.com/v1/search/book.json?query=${encodeURIComponent(query)}&display=${display}&start=${start}&sort=${sort}`,
      { headers: { "X-Naver-Client-Id": client_id.value(), "X-Naver-Client-Secret": client_secret.value() } }
    );
    const data = await r.json();
    return res.status(r.ok ? 200 : r.status).json(data);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "naver fetch failed" });
  }
});

exports.createBook = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ID 토큰 검증
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }

  const { title, author, rating = 0, imageUrl = "", question = "", createdByName, ISBN = "" } = req.body || {};
  if (!title || !author) return res.status(400).json({ error: "title/author required" });
  const now = Timestamp.now();
  const uid = decoded.uid;
  const displayName = createdByName || "익명";
  const questions = question ? [{ text: question, authorName: displayName, authorUid: uid, createdAt: now }] : [];
  if (ISBN) {
    // ISBN이 있으면 중복 검사
    const existingSnap = await db.collection("books").where("ISBN", "==", ISBN).limit(1).get();
    if (!existingSnap.empty) {
      return res.status(400).json({ error: "이미 등록된 책입니다." });
    }
  }
  const bookRef = db.collection("books").doc(); // admin.firestore() 사용 금지
  await bookRef.set({
    title,
    author,
    ratingAvg: null,
    ratingSum: null,
    ratingCount: null,
    imageUrl,
    questions,
    createdByUid: uid,
    createdByName: displayName,
    createdAt: now,
    lastMessage: null,
    lastMessageAt: null,
    members: [uid],
    membersCount: 1,
    subscribedMembers: 1,
    ISBN: ISBN,
  });
  //books/{bookId}/members 컬렉션에도 추가
  const membersRef = db.collection("books").doc(bookRef.id).collection("members").doc(uid);
  await membersRef.set({
    subscribe: true,
    joinedAt: now,
  });
  // 유저 문서에도 이 책 구독 추가
  await db
    .collection("users")
    .doc(uid)
    .set({ subscribedBooks: FieldValue.arrayUnion(bookRef.id) }, { merge: true });

  return res.json({ ok: true, id: bookRef.id });
});

exports.createQuestion = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ID 토큰 검증
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });

  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }

  const { bookId, question, createdBy, createdAt, createdByUid } = req.body || {};
  if (!bookId) return res.status(400).json({ error: "bookId required" });
  if (!question) return res.status(400).json({ error: "질문을 입력해야합니다." });

  const questionsRef = db.collection("books").doc(bookId).collection("questions");

  try {
    const result = await db.runTransaction(async (tx) => {
      // 최대 3개만 허용이니까, 3개만 읽어도 충분
      const snap = await tx.get(questionsRef.limit(3));

      // 1) 개수 제한
      if (snap.size >= 3) {
        return { status: "LIMIT" };
      }

      // 2) 중복 검사 (현재 존재하는 최대 2개/3개 내에서 검사)
      const isDuplicate = snap.docs.some((d) => d.data().question === question);
      if (isDuplicate) {
        return { status: "DUPLICATE" };
      }

      // 3) 없으면 생성
      const newRef = questionsRef.doc(); // 자동 ID (조건 통과한 경우에만 생성)
      tx.set(newRef, {
        question,
        createdBy: createdBy || null,
        createdByUid: decoded.uid,
        createdAt: Timestamp.now(),
      });

      return { status: "CREATED", id: newRef.id };
    });

    if (result.status === "LIMIT") {
      return res.status(400).json({ error: "질문은 최대 3개까지만 허용됩니다." });
    }
    if (result.status === "DUPLICATE") {
      return res.status(200).json({ error: "중복된 질문입니다." });
    }
    return res.status(201).json({ id: result.id });
  } catch (e) {
    // 트랜잭션 자체 실패(네트워크/권한 등)
    return res.status(500).json({ error: "transaction failed" });
  }
});

exports.onMessage = onDocumentCreated("books/{bookId}/messages/{msgId}", async (event) => {
  const snap = event.data;
  const ctx = event;
  const bookId = ctx.params.bookId;
  const message = snap.data();

  // 1. 이 책을 구독하는 유저 가져오기
  const subscribers = await db.collection("users").where("subscribedBooks", "array-contains", bookId).get();
  if (subscribers.empty) {
    return;
  }

  // 2. RTDB에서 online인지 확인
  const presenceSnap = await rtdb.ref(`presence/${bookId}/users`).get();
  const presenceData = presenceSnap.val() || {};

  const onlineUsers = Object.entries(presenceData)
    .filter(([uid, info]) => info.state === "online")
    .map(([uid]) => uid);
  const notifyTargets = subscribers.docs.filter((doc) => !onlineUsers.includes(doc.id));

  // 3. 알림 보관 저장 or FCM 전송
  const writePromises = notifyTargets.map(async (user) => {
    const notificationsRef = db.collection("users").doc(user.id).collection("notifications");

    // 이 유저에게 이 책(bookId)에 대한 "읽지 않은 알림"이 있는지 확인
    const existingSnap = await notificationsRef
      .where("bookId", "==", bookId)
      .where("read", "==", false)
      // .orderBy("createdAt", "desc") // 필요하면 사용 (인덱스 필요)
      .limit(1)
      .get();

    const bookDoc = await db.collection("books").doc(bookId).get();
    const bookData = bookDoc.data() || {};

    const payload = {
      bookId,
      bookTitle: bookData.title || "제목 없음",
      bookImageUrl: bookData.imageUrl || "",
      senderId: message.senderUid,
      senderName: message.senderName || "익명",
      msgPreview: message.text,
      createdAt: Timestamp.now(),
    };

    if (existingSnap.empty) {
      // 3-1. 읽지 않은 알림이 없다 → 새 알림 생성
      await notificationsRef.add({
        ...payload,
        read: false,
      });
    } else {
      // 3-2. 이미 읽지 않은 알림이 있다 → 그 알림만 내용/시간 업데이트
      const docRef = existingSnap.docs[0].ref;
      await docRef.update(payload);
    }
  });

  await Promise.all(writePromises);
});

exports.createOrUpdateRating = functions.https.onRequest(async (req, res) => {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  // ID 토큰 검증
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "unauthorized" });

  console.log("here1");
  let decoded;
  try {
    decoded = await admin.auth().verifyIdToken(token);
  } catch {
    return res.status(401).json({ error: "invalid token" });
  }
  const { bookId, rating, createdBy, createdByUid } = req.body || {};
  if (!bookId) return res.status(400).json({ error: "bookId required" });
  if (!Number.isFinite(rating)) {
    return res.status(400).json({ error: "평점을 입력해야합니다." });
  }
  if (typeof rating !== "number" || !Number.isFinite(rating)) return res.status(400).json({ error: "올바른 평점을 입력해주세요." });
  const bookRef = db.collection("books").doc(bookId);
  const ratingsRef = db.collection("books").doc(bookId).collection("ratings");

  try {
    console.log("Starting transaction for createOrUpdateRating");
    const result = await db.runTransaction(async (tx) => {
      // 기존의 값이 있으면 update 처리
      const snap = await tx.get(ratingsRef.where("createdByUid", "==", decoded.uid).limit(1));
      const bookDoc = await tx.get(bookRef);
      const bookData = bookDoc.data() || {};
      if (snap.empty) {
        // 없으면 생성
        const newRef = ratingsRef.doc(); // 자동 ID
        tx.set(newRef, {
          rating,
          createdBy: createdBy || null,
          createdByUid: decoded.uid,
          createdAt: Timestamp.now(),
        });
        // 책 문서의 ratingSum, ratingCount, ratingAvg 업데이트
        const prevSum = bookData.ratingSum || 0;
        const prevCount = bookData.ratingCount || 0;
        const newSum = prevSum + rating;
        const newCount = prevCount + 1;
        const newAvg = Number((newSum / newCount).toFixed(1));
        console.log("newAvg:", newAvg);
        console.log("newSum:", newSum);
        console.log("newCount:", newCount);
        tx.update(bookRef, {
          ratingSum: newSum,
          ratingCount: newCount,
          ratingAvg: newAvg,
        });

        return { status: "CREATED", id: newRef.id };
      } else {
        const doc = snap.docs[0];
        tx.update(doc.ref, {
          rating,
          createdAt: Timestamp.now(),
        });
        // 책 문서의 ratingSum, ratingAvg 업데이트
        const prevSum = bookData.ratingSum || 0;
        const prevCount = bookData.ratingCount || 0;
        const oldRating = doc.data().rating || 0;
        const newSum = prevSum - oldRating + rating;
        const newAvg = (newSum / prevCount).toFixed(2);
        tx.update(bookRef, {
          ratingSum: newSum,
          ratingAvg: newAvg,
        });
        return { status: "UPDATED", id: doc.id };
      }
    });

    if (result.status === "UPDATED") {
      return res.status(200).json({ id: result.id });
    }
    return res.status(201).json({ id: result.id });
  } catch (e) {
    // 트랜잭션 자체 실패(네트워크/권한 등)
    console.error(e);
    return res.status(500).json({ error: e.message || "transaction failed" });
  }
});
