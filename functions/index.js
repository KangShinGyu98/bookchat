/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const { setGlobalOptions } = require("firebase-functions");
const { onRequest } = require("firebase-functions/https");
const logger = require("firebase-functions/logger");
const { defineInt, defineString } = require("firebase-functions/params");

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
setGlobalOptions({ maxInstances: 10 });

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });

const functions = require("firebase-functions");
const fetch = require("node-fetch"); // Node 18+면 글로벌 fetch 가능
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();

const client_id = defineString("NAVER_CLIENT_ID");
const client_secret = defineString("NAVER_CLIENT_SECRET");
//

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

  const { title, author, rating = 0, imageUrl = "", question = "", createdByName } = req.body || {};
  if (!title || !author) return res.status(400).json({ error: "title/author required" });

  const uid = decoded.uid;
  const displayName = createdByName || "익명";

  const bookRef = admin.firestore().collection("books").doc();
  const questions = question
    ? [{ text: question, authorName: displayName, authorUid: uid, createdAt: admin.firestore.FieldValue.serverTimestamp() }]
    : [];

  const bookData = {
    title,
    author,
    rating: Number(rating) || 0,
    imageUrl,
    questions,
    createdByUid: uid,
    createdByName: displayName,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastMessage: null,
    lastMessageAt: null,
    members: [uid],
    membersCount: 1,
  };

  await bookRef.set(bookData);
  await admin
    .firestore()
    .collection("users")
    .doc(uid)
    .set({ subscribedBooks: admin.firestore.FieldValue.arrayUnion(bookRef.id) }, { merge: true });

  return res.json({ ok: true, id: bookRef.id });
});
