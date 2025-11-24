import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import { createClient } from "@supabase/supabase-js";

const PORT = Number(process.env.PORT || 3001);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => res.send("Monsters Socket Server is running"));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    credentials: true
  }
});

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
  } catch {
    next(new Error("Auth failed"));
  }
});

io.on("connection", (socket) => {
  const user = (socket as any).user;
  console.log("connected:", user.id);

  socket.join("feed");
  socket.join(`user:${user.id}`);

  socket.on("ping", () => {
    socket.emit("pong");
  });

  socket.on("disconnect", () => {
    console.log("disconnected:", user.id);
  });
});

app.post("/emit/feed:new-post", (req, res) => {
  io.to("feed").emit("feed:new-post", req.body);
  res.json({ ok: true });
});

httpServer.listen(PORT, () => {
  console.log(`Socket.IO server listening on ${PORT}`);
});
