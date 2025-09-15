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
    onlineUsers[userId] = socket.id; // map userId to socketId
    io.emit("onlineUsers", Object.keys(onlineUsers).map(Number)); // send userIds only
    console.log("Online users from server:", onlineUsers);
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


socket.on("createGroup", (groupDetails) => {
  // notify all group members
  groupDetails.groupUsers.forEach(({ userId }) => {
    const socketId = onlineUsers[userId];
    if (socketId) {
      io.to(socketId).emit("createGroup", groupDetails);
    }
  });
});
// group message
socket.on("groupMessage", ({ groupId, senderId, message, messageId, timestamp, groupUsers }) => {
  const msgObj = { groupId, senderId, message, messageId, timestamp: timestamp || new Date().toISOString() };

  // Broadcast to all group members
  groupUsers.forEach(({ userId }) => {
    const socketId = onlineUsers[userId];
    if (socketId) {
      io.to(socketId).emit("groupMessage", msgObj);
    }
  });

  console.log("Group message sent:", msgObj);
});

// group typing indicator
socket.on("groupTyping", ({ groupId, senderId, typing, groupUsers }) => {
  groupUsers.forEach(({ userId }) => {
    if (userId !== senderId) {
      const socketId = onlineUsers[userId];
      if (socketId) {
        io.to(socketId).emit("groupTyping", { groupId, senderId, typing });
      }
    }
  });
});

// update group message
socket.on("updateGroupMessage", ({ groupId, messageId, senderId, message, groupUsers }) => {
  const updatedMsg = { groupId, messageId, message, updatedAt: new Date(), senderId };

  groupUsers.forEach(({ userId }) => {
    const socketId = onlineUsers[userId];
    if (socketId) {
      io.to(socketId).emit("updateGroupMessage", updatedMsg);
    }
  });

  console.log("Group message updated:", updatedMsg);
});




async function handleGroupExit({ groupId, userId, action, removedById = null, isAdmin = false }) {
  try {
    // The actual group membership updates will be handled by the client-side Redux store
    // and persisted to the database through your API endpoints
    
    const actionType = action === 'removed' ? 'removed' : 'left';
    
    const payload = {
      groupId,
      action: actionType,
      userId,
      removedById,
      isAdmin,
      timestamp: new Date().toISOString()
    };

    // Notify all connected clients about the group update
    // Each client will handle the update based on their Redux store
    io.emit('groupUpdate', payload);
    
    console.log(`User ${userId} ${actionType} from group ${groupId}`);
    
  } catch (error) {
    console.error('Error handling group exit:', error);
    
    // Notify the user who initiated the action if they're still connected
    const initiatorSocketId = onlineUsers[removedById || userId];
    if (initiatorSocketId) {
      io.to(initiatorSocketId).emit('groupUpdateError', {
        groupId,
        error: 'Failed to process group update',
        action: action === 'removed' ? 'remove' : 'leave'
      });
    }
  }
}


// Handle group leave/remove events
socket.on("groupUpdate", async ({ groupId, action, userId, removedById, isAdmin = false }) => {
  if (action === 'left' || action === 'removed') {
    await handleGroupExit({ 
      groupId, 
      userId, 
      action, 
      removedById,
      isAdmin 
    });
  }
});

// For backward compatibility
socket.on("leaveGroup", async (data) => {
  await handleGroupExit({ ...data, action: "left" });
});

socket.on("removeGroupUser", async ({ groupId, userId, removedById, isAdmin = false }) => {
  await handleGroupExit({ 
    groupId, 
    userId, 
    action: "removed", 
    removedById, 
    isAdmin 
  });
});



  
// delete group message
socket.on("deleteGroupMessage", ({ groupId, messageId, senderId, groupUsers }) => {
  const deletedMsg = { groupId, messageId, isDeleted: true, deletedAt: new Date() };

  groupUsers.forEach(({ userId }) => {
    const socketId = onlineUsers[userId];
    if (socketId) {
      io.to(socketId).emit("deleteGroupMessage", deletedMsg);
    }
  });

  console.log("Group message deleted:", deletedMsg);
});

// delete all group messages
socket.on("deleteAllGroupMessages", ({ groupId, senderId, groupUsers }) => {
  const deleteAllMsg = { groupId, deleteAll: true, deletedAt: new Date() };

  groupUsers.forEach(({ userId }) => {
    if (userId === senderId) {
      const socketId = onlineUsers[userId];
      if (socketId) {
        io.to(socketId).emit("deleteAllGroupMessages", deleteAllMsg);
      }
    }
  });

  console.log("All group messages deleted for user:", senderId);
});

  
  socket.on("userLogout", (userId,ack) => {
    if (onlineUsers[userId]) {
      console.log(`User ${userId} logged out`);
      delete onlineUsers[userId];
      io.emit("onlineUsers", Object.keys(onlineUsers).map(Number));
    }
  // console.log('logged out');
  if (typeof ack === "function") {
  ack("ok");
}
  
  });

  // private message
socket.on("privateMessage", ({ senderId, receiverId, message, messageId, timestamp }) => {
  const receiverSocketId = onlineUsers[receiverId];

  const msgObj = { senderId, receiverId, message, messageId, timestamp: timestamp || new Date() };

  if (receiverSocketId) {
    io.to(receiverSocketId).emit("privateMessage", msgObj);
  }

  // also send back to sender
  socket.emit("privateMessage", msgObj);
});




// update message
socket.on("updateMessage", ({ chatId, senderId, receiverId, messageId, message }) => {
  const updatedMsg = { chatId, messageId,message, updatedAt: new Date() };

  const senderSocketId = onlineUsers[senderId];
  const receiverSocketId = onlineUsers[receiverId];

  if (senderSocketId) io.to(senderSocketId).emit("updateMessage", updatedMsg);
  if (receiverSocketId) io.to(receiverSocketId).emit("updateMessage", updatedMsg);

  console.log("Updated message emitted:", updatedMsg);
});






  // typing indicator
  socket.on("typing", ({ senderId, receiverId, typing }) => {
    //  console.log("inside typing serveris"+senderId);
  const receiverSocketId = onlineUsers[receiverId];
  if (receiverSocketId) {
    // console.log('inside'+receiverSocketId);
    io.to(receiverSocketId).emit("typing", { userId: senderId, typing });
    
  }
});


  // user disconnects

socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    for (let userId in onlineUsers) {
      if (onlineUsers[userId] === socket.id) {
        console.log(`Removing user ${userId} from onlineUsers`);
        delete onlineUsers[userId];
      }
    }
    io.emit("onlineUsers", Object.keys(onlineUsers).map(Number));
    console.log("Online users after disconnect:", onlineUsers);
  });
});

// Port for Render will be from process.env.PORT
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Chatly backend server running on port ${PORT}`);
});
