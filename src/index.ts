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

  console.log("connected:", user.id);

  // すべてのユーザーは feed を購読
  socket.join("feed");

  // 個別チャンネルにも参加
  socket.join(`user:${user.id}`);

  /* ============================================
     🔥 リアクション更新（フロント → サーバー）
  ============================================ */
  socket.on("feed:update-reaction", (payload) => {
    console.log("📢 reaction event from client:", payload);

    // feed を見ている全員に配信
    io.to("feed").emit("feed:update-reaction", payload);
  });

  /* ============================================
     🔥 コメント更新（フロント → サーバー）
  ============================================ */
  socket.on("feed:update-comment", (payload) => {
    console.log("📢 comment event from client:", payload);

    // feed を見ている全員に配信
    io.to("feed").emit("feed:update-comment", payload);
  });

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", user.id);
  });
});

/* ================================
   ★ Supabase → Socket.IO 連携
   create_post2 から POST される場所
================================ */
app.post("/emit", (req, res) => {
  const { event, payload } = req.body;

  if (!event) {
    return res.status(400).json({ error: "event required" });
  }

  console.log("📢 Emit received:", event, payload);

  // 指定イベント名で全クライアントへ通知
  io.emit(event, payload);

  res.json({ ok: true });
});

/* ================================
   サーバー起動
================================ */
httpServer.listen(PORT, () => {
  console.log(`Socket.IO server listening on port ${PORT}`);
});

