/**
 * Import function triggers from their respective submodules:
 *
 *
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
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

const { defineSecret } = require("firebase-functions/params");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");

const logger = require("firebase-functions/logger");

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp, FieldValue } = require("firebase-admin/firestore");
const { getDatabase } = require("firebase-admin/database");
const { getAuth } = require("firebase-admin/auth");

// Functions 공통 옵션
setGlobalOptions({ maxInstances: 10 });

// Admin 초기화
const app = initializeApp();

// Firestore / RTDB
const isEmulator = process.env.FUNCTIONS_EMULATOR === "true" || process.env.FIRESTORE_EMULATOR_HOST || process.env.FUNCTIONS_EMULATOR_HOST;

const db = isEmulator ? getFirestore(app) : getFirestore(app, "bookchat-database");
const rtdb = getDatabase(app);

// 🔹 환경 변수 (Firebase Functions params)
const NAVER_CLIENT_ID = defineSecret("NAVER_CLIENT_ID");
const NAVER_CLIENT_SECRET = defineSecret("NAVER_CLIENT_SECRET");
const RECAPTCHA_SECRET_KEY = defineSecret("RECAPTCHA_SECRET_KEY");
const allowedOrigins = ["http://127.0.0.1:5005", "https://book-chat-da2d6.web.app"];

exports.callNaverBooksApi = onCall(
  {
    region: "asia-northeast3",
    secrets: [NAVER_CLIENT_ID, NAVER_CLIENT_SECRET],
    enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true",
  },
  async (request) => {
    const { data, auth } = request;
    // ✅ 로그인 강제(원하면 익명도 허용/차단 가능)
    if (!auth) {
      throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
    }
    const provider = auth.token?.firebase?.sign_in_provider;
    if (provider === "anonymous") {
      throw new HttpsError("permission-denied", "로그인이 필요합니다.");
    }
    const query = data?.query;
    const display = 10;
    const start = 1;
    const sort = "sim";

    if (!query || !String(query).trim()) {
      throw new HttpsError("invalid-argument", "query required");
    }
    if (String(query).trim().length > 50) {
      throw new HttpsError("invalid-argument", "검색은 최대 50자까지 가능합니다.");
    }
    // 간단한 입력 정리(원하면 더 빡세게 제한 가능)

    try {
      const url =
        `https://openapi.naver.com/v1/search/book.json` + `?query=${encodeURIComponent(query)}` + `&display=${display}&start=${start}&sort=${sort}`;

      const r = await fetch(url, {
        headers: {
          "X-Naver-Client-Id": NAVER_CLIENT_ID.value(),
          "X-Naver-Client-Secret": NAVER_CLIENT_SECRET.value(),
        },
      });

      const bodyText = await r.text();
      let json;
      try {
        json = JSON.parse(bodyText);
      } catch {
        throw new HttpsError("internal", "naver response parse failed");
      }

      if (!r.ok) {
        // 네이버가 내려주는 에러를 그대로 넘기되, code는 적당히 매핑
        throw new HttpsError("internal", `naver api error: ${r.status}`);
      }

      return json; // 클라이언트에서 result.data로 받음
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      console.error(e);
      throw new HttpsError("internal", "naver fetch failed");
    }
  }
);
exports.createBook = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;

  //validation 시작
  if (!auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const uid = auth.uid;
  const { title, author, imageUrl = "", question = "", ISBN = "" } = data || {};
  if (!title || !author) {
    throw new HttpsError("invalid-argument", "title/author required");
  }
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "책을 등록하기 위해서는 로그인이 필요합니다.");
  }
  if (String(title).trim().length > 100) {
    throw new HttpsError("invalid-argument", "책제목은 최대 100자까지 입력할 수 있습니다.");
  }
  if (String(author).trim().length > 100) {
    throw new HttpsError("invalid-argument", "저자는 최대 100자까지 입력할 수 있습니다.");
  }
  if (String(question).trim().length > 300) {
    throw new HttpsError("invalid-argument", "질문은 최대 300자까지 입력할 수 있습니다.");
  }
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || !userSnap.data().nickname) {
    throw new HttpsError("failed-precondition", "질문을 등록하려면 닉네임을 설정해야합니다.");
  }
  //validation 끝

  const createdByName = String(userSnap.data().nickname);
  let bookId = null;
  const now = Timestamp.now();

  try {
    await db.runTransaction(async (tx) => {
      // ISBN 중복 검사
      if (ISBN) {
        const existingSnap = await tx.get(db.collection("books").where("ISBN", "==", ISBN).limit(1));
        if (!existingSnap.empty) {
          throw new HttpsError("already-exists", "이미 등록된 책입니다.");
        }
      }

      const bookRef = db.collection("books").doc();
      bookId = bookRef.id;
      if (question) {
        const questionRef = bookRef.collection("questions").doc();

        await tx.set(questionRef, {
          text: question,
          createdBy: createdByName,
          createdByUid: uid,
          createdAt: now,
        });
      }
      await tx.set(bookRef, {
        title,
        author,
        ratingAvg: null,
        ratingSum: null,
        ratingCount: null,
        imageUrl,
        createdByUid: uid,
        createdByName: createdByName, // ✅ 원본의 displayName undefined 버그 제거
        createdAt: now,
        lastMessage: null,
        lastMessageAt: null,
        membersCount: 1,
        subscribedMembers: 1,
        ISBN: ISBN || "",
      });

      await tx.set(bookRef.collection("members").doc(uid), {
        subscribe: true,
        joinedAt: now,
      });

      await tx.set(db.collection("users").doc(uid), { subscribedBooks: FieldValue.arrayUnion(bookRef.id) }, { merge: true });
    });
    return { ok: true, id: bookId };
  } catch (e) {
    // 이미 HttpsError로 던진 건 그대로 전달
    if (e instanceof HttpsError) throw e;

    console.error(e);
    throw new HttpsError("internal", "createBook failed");
  }
});
exports.createQuestion = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async ({ data, auth }) => {
  if (!auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const uid = auth.uid;
  const { bookId, text } = data || {};
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "질문을 등록하기 위해서는 로그인이 필요합니다.");
  }

  if (!bookId) {
    throw new HttpsError("invalid-argument", "bookId required");
  }
  if (!text || !String(text).trim()) {
    throw new HttpsError("invalid-argument", "질문을 입력해야합니다.");
  }
  if (String(text).trim().length > 300) {
    throw new HttpsError("invalid-argument", "질문은 최대 300자까지 입력할 수 있습니다.");
  }
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists || !userSnap.data().nickname) {
    throw new HttpsError("failed-precondition", "질문을 등록하려면 닉네임을 설정해야합니다.");
  }
  const createdBy = String(userSnap.data().nickname);

  const normalizedText = String(text).trim();
  const questionsRef = db.collection("books").doc(bookId).collection("questions");
  const myQuestionRef = questionsRef.where("createdByUid", "==", uid).limit(3);
  try {
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(questionsRef);
      const mySnap = await tx.get(myQuestionRef);
      // 412: 사전조건 실패 (최대 개수 초과)
      if (mySnap.size >= 3) {
        throw new HttpsError("failed-precondition", "질문은 최대 3개까지만 허용됩니다.");
      }

      // 409: 이미 존재 (중복)
      const isDuplicate = snap.docs.some((d) => (d.data().text || "") === normalizedText);
      if (isDuplicate) {
        throw new HttpsError("already-exists", "중복된 질문입니다.");
      }

      const newRef = questionsRef.doc();
      tx.set(newRef, {
        text: normalizedText,
        createdBy: createdBy,
        createdByUid: uid,
        createdAt: Timestamp.now(),
      });
    });

    return { ok: true };
  } catch (e) {
    // 트랜잭션 내부에서 던진 HttpsError는 그대로 전달
    if (e instanceof HttpsError) throw e;

    console.error(e);
    throw new HttpsError("internal", "transaction failed");
  }
});
exports.onMessage = onDocumentCreated(
  {
    document: "books/{bookId}/messages/{msgId}",
    region: "asia-northeast3", // Firestore 위치와 동일
    ...(isEmulator ? {} : { database: "bookchat-database" }),
  },
  async (event) => {
    const snap = event.data;
    const ctx = event;
    const bookId = ctx.params.bookId;
    1;
    const message = snap.data();
    const writePromises = [];

    //4. book 문서의 lastMessage, lastMessageAt 업데이트
    const bookRef = db.collection("books").doc(bookId);
    writePromises.push(
      bookRef.update({
        lastMessage: message.text,
        lastMessageAt: Timestamp.now(),
      })
    );
    // 1. 이 책을 구독하는 유저 가져오기
    const subscribers = await db.collection("users").where("subscribedBooks", "array-contains", bookId).get();
    if (subscribers.empty) {
      await Promise.all(writePromises);
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
    writePromises.push(
      ...notifyTargets.map(async (user) => {
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
      })
    );

    await Promise.all(writePromises);
  }
);
// 트리거 사용하지 않는  이유는 linkwith popup 과 같은 경우 때문
exports.registerUser = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;
  if (!auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "로그인이 필요합니다.");
  }

  //validation 끝
  const uid = auth.uid;

  // Auth 프로필 가져오기 (displayName, photoURL, email)
  const userRecord = await getAuth().getUser(uid);

  const userRef = db.doc(`users/${uid}`);
  // ✅ 없으면 생성 (동시 호출에도 안전하게)
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) {
      tx.set(userRef, {
        uid,
        email: userRecord.email ?? null,
        displayName: userRecord.displayName ?? null,
        photoURL: userRecord.photoURL ?? null,
        provider: userRecord.providerData?.[0]?.providerId ?? "unknown",
        createdAt: Timestamp.now(),
        autoSubscribe: true,
        notificationSetting: true,
      });
    }
  });
  return { ok: true };
});
exports.createOrUpdateRating = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;

  if (!auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") throw new HttpsError("permission-denied", "로그인이 필요합니다.");

  const uid = auth.uid;
  const { bookId, rating } = data || {};

  if (!bookId) throw new HttpsError("invalid-argument", "bookId required");

  const ratingNum = Number(rating);
  if (!Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5 || !Number.isInteger(ratingNum * 2)) {
    throw new HttpsError("invalid-argument", "올바른 평점을 입력해주세요.");
  }

  // 닉네임은 서버에서 users 문서로 읽어서 확정(클라 payload 신뢰 X)
  const userSnap = await db.collection("users").doc(uid).get();
  const nickname = userSnap.exists ? userSnap.data()?.nickname : null;
  if (!nickname) throw new HttpsError("failed-precondition", "별명 설정이 필요합니다.");

  const bookRef = db.collection("books").doc(bookId);
  const ratingsCol = bookRef.collection("ratings");

  try {
    const result = await db.runTransaction(async (tx) => {
      const bookDoc = await tx.get(bookRef);
      if (!bookDoc.exists) throw new HttpsError("not-found", "책을 찾을 수 없습니다.");

      // 기존 평점(유저당 1개) 조회
      const existingQ = ratingsCol.where("createdByUid", "==", uid).limit(1);
      const existingSnap = await tx.get(existingQ);

      const bookData = bookDoc.data() || {};
      const prevSum = Number(bookData.ratingSum || 0);
      const prevCount = Number(bookData.ratingCount || 0);
      const now = Timestamp.now();
      if (existingSnap.empty) {
        // 생성
        const newRef = ratingsCol.doc();
        tx.set(newRef, {
          rating: ratingNum,
          createdBy: nickname,
          createdByUid: uid,
          createdAt: now,
          updatedAt: now,
        });

        const newSum = prevSum + ratingNum;
        const newCount = prevCount + 1;
        const newAvg = Number((newSum / newCount).toFixed(1));

        tx.update(bookRef, {
          ratingSum: newSum,
          ratingCount: newCount,
          ratingAvg: newAvg,
          updatedAt: now,
        });

        return { status: "CREATED", id: newRef.id };
      } else {
        // 업데이트
        const docSnap = existingSnap.docs[0];
        const oldRating = Number(docSnap.data()?.rating || 0);

        tx.update(docSnap.ref, {
          rating: ratingNum,
          updatedAt: now,
        });

        const newSum = prevSum - oldRating + ratingNum;
        const newAvg = prevCount > 0 ? Number((newSum / prevCount).toFixed(1)) : null;

        tx.update(bookRef, {
          ratingSum: newSum,
          ratingAvg: newAvg,
          updatedAt: now,
        });

        return { status: "UPDATED", id: docSnap.id };
      }
    });

    return { ok: true, ...result };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(e);
    throw new HttpsError("internal", "createOrUpdateRating failed");
  }
});
function normalizeNickname(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase();
}
exports.setNickname = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;
  const now = Timestamp.now();

  // 1) auth validation
  if (!auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "닉네임 설정을 위해서는 로그인이 필요합니다.");
  }

  const uid = auth.uid;
  const rawNickname = String(data?.nickname || "").trim();
  if (!rawNickname) throw new HttpsError("invalid-argument", "별명을 입력해주세요.");

  // (선택) 길이/형식 제한 - 필요에 맞게 조정
  if (rawNickname.length > 50) {
    throw new HttpsError("invalid-argument", "별명은 최대 50자까지 입력할 수 있습니다.");
  }

  const normalizedNickname = normalizeNickname(rawNickname);
  if (!normalizedNickname) throw new HttpsError("invalid-argument", "별명을 입력해주세요.");

  const userRef = db.collection("users").doc(uid);
  const newNickRef = db.collection("nicknames").doc(normalizedNickname);

  try {
    await db.runTransaction(async (tx) => {
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        throw new HttpsError("failed-precondition", "회원 정보가 없습니다. 다시 로그인해주세요.");
      }

      // ✅ 닉네임 이미 있으면 1회 정책상 거절
      const existingNickname = userSnap.data()?.nickname;
      if (existingNickname) {
        throw new HttpsError("failed-precondition", "닉네임은 변경할 수 없습니다.");
      }
      // 새 닉네임 중복 검사
      const newNickSnap = await tx.get(newNickRef);
      if (newNickSnap.exists) {
        throw new HttpsError("already-exists", "이미 사용 중인 별명입니다.");
      }
      // nicknames 예약(유일키)
      tx.set(newNickRef, {
        nickname: rawNickname,
        normalizedNickname,
        uid,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(userRef, { nickname: rawNickname }, { merge: true });
    });

    return { ok: true, nickname: rawNickname, normalizedNickname };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(e);
    throw new HttpsError("internal", "setNickname failed");
  }
});
exports.subscribeToggleCall = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;
  const { bookId, subscribe } = data;
  const now = Timestamp.now();
  // 1) auth validation
  if (!auth) throw new HttpsError("unauthenticated", "로그인이 필요합니다.");

  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "닉네임 설정을 위해서는 로그인이 필요합니다.");
  }
  const uid = auth.uid;
  try {
    await db.runTransaction(async (tx) => {
      const bookRef = db.collection("books").doc(bookId);
      const memberRef = bookRef.collection("members").doc(uid);
      const userRef = db.collection("users").doc(uid);
      const [memberSnap, userSnap] = await Promise.all([tx.get(memberRef), tx.get(userRef)]);
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "유저 정보가 없습니다.");
      }
      if (subscribe === "subscribe") {
        //books/{slug}/members/{uid} 에 없으면 문서생성
        // 다음 3개 필드 작성
        // await setDoc(membersRef, {
        //       joinedAt: serverTimestamp(),
        //       lastAccessAt: serverTimestamp(),
        //       subscribe: autoSubscribe === true, // autoSubscribe면 true, 아니면 false
        //     });
        //있으면 subscribe 를 true 로 변경
        // users/{uid} 의 subscribedBooks 에 bookId 추가
        // const userRef = db.collection("users").doc(uid);
        // await updateDoc(userRef, {
        //   subscribedBooks: arrayUnion(bookId),
        // });
        // books/{slug} 의 membersCount +1, subscribedMembers +1
        if (!memberSnap.exists) {
          // 최초 가입
          tx.set(memberRef, {
            joinedAt: now,
            lastAccessAt: now,
            subscribe: true,
          });

          tx.update(bookRef, {
            membersCount: FieldValue.increment(1),
            subscribedMembers: FieldValue.increment(1),
          });
        } else {
          const wasSubscribed = memberSnap.data()?.subscribe === true;

          tx.update(memberRef, {
            subscribe: true,
            lastAccessAt: now,
          });

          if (!wasSubscribed) {
            tx.update(bookRef, {
              subscribedMembers: FieldValue.increment(1),
            });
          }
        }
        tx.update(userRef, {
          subscribedBooks: FieldValue.arrayUnion(bookId),
        });
      } else {
        //books/{slug}/members/{uid} 에 없으면 오류
        //있으면 subscribe 를 false 로 변경
        // users/{uid} 의 subscribedBooks 에 bookId 제거
        // const userRef = db.collection("users").doc(uid);
        // await updateDoc(userRef, {
        //   subscribedBooks: arrayRemove(bookId),
        // });
        // books/{slug} 의 subscribedMembers -1
        if (!memberSnap.exists) {
          throw new HttpsError("not-found", "구독 정보가 없습니다.");
        }

        const wasSubscribed = memberSnap.data()?.subscribe === true;

        tx.update(memberRef, {
          subscribe: false,
          lastAccessAt: now,
        });

        tx.update(userRef, {
          subscribedBooks: FieldValue.arrayRemove(bookId),
        });

        if (wasSubscribed) {
          tx.update(bookRef, {
            subscribedMembers: FieldValue.increment(-1),
          });
        }
      }
    });

    return { ok: true, subscribeState: data?.subscribe };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    console.error(e);
    throw new HttpsError("internal", "subscribeToggleCall failed");
  }
});
exports.sendMessage = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;

  if (!auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }
  const provider = auth.token?.firebase?.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError("permission-denied", "로그인이 필요합니다.");
  }
  const uid = auth.uid;
  const { bookId, text } = data || {};

  if (typeof text !== "string") {
    throw new HttpsError("invalid-argument", "입력이 올바르지 않습니다.");
  }

  if (!text) {
    throw new HttpsError("invalid-argument", "빈 메시지는 보낼 수 없습니다.");
  }

  // 길이 제한 (원하는 값으로 조정)
  if (text.length > 1000) {
    throw new HttpsError("invalid-argument", "메시지는 최대 1000자까지 입력할 수 있습니다.");
  }
  // ✅ validation 끝

  try {
    // senderName 신뢰성 확보(클라 displayName 믿지 않음)
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists || !userSnap.data().nickname) {
      throw new HttpsError("failed-precondition", "질문을 등록하려면 닉네임을 설정해야합니다.");
    }
    const nickname = userSnap.data()?.nickname;

    // 메시지 저장
    await db.collection("books").doc(bookId).collection("messages").add({
      text: text,
      senderUid: uid,
      senderName: nickname,
      createdAt: Timestamp.now(), // 서버 시간 고정
      // clientCreatedAt: Date.now(), // 필요하면 사용(선택)
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("sendMessage failed", e);
    throw new HttpsError("internal", "sendMessage failed");
  }
});
exports.sendMainChatMessage = onCall({ region: "asia-northeast3", enforceAppCheck: process.env.FUNCTIONS_EMULATOR !== "true" }, async (request) => {
  const { data, auth } = request;

  // ✅ validation 시작
  if (!auth) {
    throw new HttpsError("unauthenticated", "일시적 장애입니다. 새로고침 후 이용해 주세요.");
  }

  const uid = auth.uid;
  const { text } = data || {};
  const roomDate = new Date().toISOString().split("T")[0];
  if (!auth) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  if (typeof text !== "string") {
    throw new HttpsError("invalid-argument", "입력이 올바르지 않습니다.");
  }

  if (!text) {
    throw new HttpsError("invalid-argument", "빈 메시지는 보낼 수 없습니다.");
  }

  // 길이 제한 (원하는 값으로 조정)
  if (text.length > 100) {
    throw new HttpsError("invalid-argument", "메시지는 최대 100자까지 입력할 수 있습니다.");
  }
  // ✅ validation 끝

  try {
    // senderName 신뢰성 확보(클라 displayName 믿지 않음)
    const userSnap = await db.collection("users").doc(uid).get();
    const nickname = userSnap.exists ? userSnap.data()?.nickname : null;

    const senderName = nickname || `익명#${uid.slice(0, 4)}`;

    // 메시지 저장
    await db.collection("chatrooms").doc(roomDate).collection("messages").add({
      text: text,
      senderUid: uid,
      senderName,
      createdAt: Timestamp.now(), // 서버 시간 고정
      // clientCreatedAt: Date.now(), // 필요하면 사용(선택)
    });

    return { ok: true };
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    logger.error("sendMessage failed", e);
    throw new HttpsError("internal", "sendMessage failed");
  }
});
