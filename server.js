// Utility function to get a chat ID for two users
function getChatId(userId1, userId2) {
  // Make sure the smaller ID comes first for consistency
  const [idA, idB] = [userId1, userId2].sort();
  return `${idA}_${idB}`;
}


const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");


const app = express();
app.use(cors());
app.use(express.json());

// Example route
app.get("/", (req, res) => {
  res.send("Chatly backend (private chat) server is running....");
});

// Create HTTP server (will be HTTPS when deployed)
const server = http.createServer(app);

// Update CORS to allow only your frontend domain
const io = new Server(server, {
  cors: {
origin: [
      "http://localhost:5173",      // dev
      "https://chatly-app-pearl.vercel.app" // vercel frontend
    ],
    methods: ["GET", "POST"],
  },
});

// store mapping { userId: socketId }
let onlineUsers = {};

io.on("connection", (socket) => {
  console.log("⚡ User connected:", socket.id);

  // user comes online
  socket.on("userOnline", (userId) => {
    onlineUsers[userId] = socket.id;
    io.emit("onlineUsers", Object.keys(onlineUsers).map(Number));
    console.log("Online users:", onlineUsers);
  });

// delete message (soft delete)
socket.on("deleteMessage", ({ chatId, messageId, senderId, receiverId }) => {
  const deletedMsg = { chatId, messageId, isDeleted: true, deletedAt: new Date() };

  const senderSocketId = onlineUsers[senderId];
  const receiverSocketId = onlineUsers[receiverId];

  if (senderSocketId) io.to(senderSocketId).emit("deleteMessage", deletedMsg);
  if (receiverSocketId) io.to(receiverSocketId).emit("deleteMessage", deletedMsg);

  console.log("Deleted message emitted:", deletedMsg);
});


  
  // user logout
  socket.on("userLogout", (userId, ack) => {
    if (onlineUsers[userId]) {
      delete onlineUsers[userId];
      io.emit("onlineUsers", Object.keys(onlineUsers).map(Number));
    }
    if (typeof ack === "function") ack("ok");
  });

  // private message
  socket.on("privateMessage", ({ senderId, receiverId, message, messageId, timestamp }) => {
    const receiverSocketId = onlineUsers[receiverId];
    const msgObj = { senderId, receiverId, message, messageId, timestamp: timestamp || new Date() };
    if (receiverSocketId) io.to(receiverSocketId).emit("privateMessage", msgObj);
    socket.emit("privateMessage", msgObj);
  });

  // update message
  socket.on("updateMessage", ({ chatId, senderId, receiverId, messageId, message }) => {
    const updatedMsg = { chatId, messageId, message, updatedAt: new Date() };
    const senderSocketId = onlineUsers[senderId];
    const receiverSocketId = onlineUsers[receiverId];
    if (senderSocketId) io.to(senderSocketId).emit("updateMessage", updatedMsg);
    if (receiverSocketId) io.to(receiverSocketId).emit("updateMessage", updatedMsg);
  });

  // typing indicator
  socket.on("typing", ({ senderId, receiverId, typing }) => {
    const receiverSocketId = onlineUsers[receiverId];
    if (receiverSocketId) io.to(receiverSocketId).emit("typing", { userId: senderId, typing });
  });

  // disconnect
  socket.on("disconnect", () => {
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) delete onlineUsers[userId];
    }
    io.emit("onlineUsers", Object.keys(onlineUsers).map(Number));
  });
});

// Port for Render will be from process.env.PORT
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Chatly backend server running on port ${PORT}`);
});
