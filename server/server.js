import express from 'express';
import "dotenv/config";
import cors from 'cors';
import http from 'http';
import { connectDB } from './lib/db.js';
import userRouter from './routes/userRoutes.js';
import messageRouter from './routes/messageRotes.js';
import {Server} from 'socket.io';

const app = express();
const server = http.createServer(app);

export const io = new Server(server, {
  cors: {
    origin: "*"
  }
});




//store online users

export const userSocketMap={};//userId->socketId
export const userActiveChatMap = {};
io.on('connection', (socket) => {
    const userId=socket.handshake.query.userId;//get userId from query params
    console.log('User connected:', userId);
    if(userId){
      userSocketMap[userId]=socket.id;//store userId and socketId mapping
    }



    io.emit('getOnlineUsers',Object.keys(userSocketMap));//broadcast online users to all connected clients

    socket.on('typing', ({ sender, receiver }) => {
    const receiverSocketId = userSocketMap[receiver];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('userTyping', { sender });
    }
  });

  socket.on('stopTyping', ({ sender, receiver }) => {
    const receiverSocketId = userSocketMap[receiver];
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('userStopTyping', { sender });
    }
  });

    socket.on('disconnect', () => {
      console.log('User disconnected:', userId);

      delete userSocketMap[userId];//remove user from online users map

      delete userActiveChatMap[userId];
      io.emit('getOnlineUsers',Object.keys(userSocketMap));//broadcast updated online users to all connected clients
    })

    socket.on('setActiveChat', (activeWithUserId) => {
    if (userId) {
      userActiveChatMap[userId] = activeWithUserId; // e.g. A -> B means A has B's chat open
      // (optional) console.log(`${userId} is now viewing chat with ${activeWithUserId}`);
    }
  });

  socket.on('clearActiveChat', () => {
    if (userId) {
      delete userActiveChatMap[userId];
    }
  });

    // 🟢 Forward "messageSeenByReceiver" from receiver -> sender
socket.on("messageSeenByReceiver", ({ messageId, receiver, sender }) => {
  

  const senderSocketId = userSocketMap[sender];
  if (senderSocketId) {
    io.to(senderSocketId).emit("messageSeenByReceiver", {
      messageId,
      receiver,
    });
   
  }
});

  })


app.use(cors());
app.use(express.json({ limit: '4mb' }));

app.use('/api/status', (req, res) => {
  res.send("Server is running");
});

app.use('/api/auth',userRouter);
app.use('/api/messages',messageRouter);

await connectDB();

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


