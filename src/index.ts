import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";

/* ================================
   基本設定
================================ */
const PORT = Number(process.env.PORT || 8080);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================
   Express + Socket.IO 初期化
================================ */
const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.send("Monsters Socket Server is running");
});

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 20000,
});

/* ================================
   認証（Supabase Token 検証）
================================ */
io.use(async (socket, next) => {
  try {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) return next(new Error("No token"));

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data.user) return next(new Error("Invalid token"));

    (socket as any).user = data.user;

    next();
  } catch (e) {
    next(new Error("Auth failed"));
  }
});

/* ================================
   接続イベント
================================ */
io.on("connection", (socket) => {
  const user = (socket as any).user;

  console.log("✅ connected:", user.id);

  socket.join("feed");
  socket.join(`user:${user.id}`);

  /* ---------------------------
      🔵 reconnect 再同期 要求
  --------------------------- */
  socket.on("feed:resync-request", () => {
    console.log("🔄 feed resync request from:", user.id);
    socket.emit("feed:resync-ack");
  });

  /* ---------------------------
      🔵 投稿リアクション更新
  --------------------------- */
  socket.on("feed:update-reaction", (payload) => {
    console.log("📣 reaction received:", payload);
    io.to("feed").emit("feed:update-reaction", payload);
  });

  /* ---------------------------
      🔵 コメント更新
  --------------------------- */
  socket.on("feed:update-comment", (payload) => {
    console.log("📣 comment received:", payload);
    io.to("feed").emit("feed:update-comment", payload);
  });

  /* ---------------------------
      🔵 コメントリアクション更新 
  --------------------------- */
  socket.on("feed:update-comment-reaction", (payload) => {
    console.log("📣 comment reaction received:", payload);
    io.to("feed").emit("feed:update-comment-reaction", payload);
  });

  /* ---------------------------
      🔵 投稿内容更新（編集）
  --------------------------- */
  socket.on("feed:update-post", (payload) => {
    console.log("📣 post update received:", payload);
    io.to("feed").emit("feed:update-post", payload);
  });

  /* ---------------------------
      🔵 投稿削除
  --------------------------- */
  socket.on("feed:delete-post", (postId: string) => {
    console.log("📣 post delete received:", postId);
    io.to("feed").emit("feed:delete-post", postId);
  });

  /* ---------------------------
      ping/pong
  --------------------------- */
  socket.on("ping", () => socket.emit("pong"));

  socket.on("disconnect", () => {
    console.log("❌ disconnected:", user.id);
  });
});

/* ================================
   ★ Supabase → Socket.IO 連携
================================ */
app.post("/emit", (req, res) => {
  const { event, payload } = req.body;

  if (!event) {
    return res.status(400).json({ error: "event required" });
  }

  console.log("📢 Emit received:", event, payload);

  io.emit(event, payload);

  res.json({ ok: true });
});

/* ================================
   サーバー起動
================================ */
httpServer.listen(PORT, () => {
  console.log(`🚀 Socket.IO server listening on port ${PORT}`);
});

