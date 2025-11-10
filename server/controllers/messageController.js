

import User from "../models/User.js";
import Message from "../models/Message.js";
import cloudinary from "../lib/cloudinaru.js";
import { io, userSocketMap } from "../server.js";

// 🟢 1. Get users for sidebar

export const getUserforsidebar = async (req, res) => {
  try {
    const userId = req.user._id; // logged-in user (e.g. User B)
    
    // Get all users except me
    const filteredUsers = await User.find({ _id: { $ne: userId } }).select("-password");

    // Calculate unseen messages from each user
    let unseenMessages = {};

    const promises = filteredUsers.map(async (user) => {
      const messages = await Message.find({
        sender: user._id,         // message sent by this user
        receiver: userId,         // to me
        $or: [
          { seenBy: { $exists: false } },   // for old messages
          { seenBy: { $nin: [userId] } }    // not seen by me yet
        ],
      });

      if (messages.length > 0) {
        unseenMessages[user._id] = messages.length;
      }
    });

    await Promise.all(promises);

    res.json({ success: true, users: filteredUsers, unseenMessages });
  } catch (error) {
    console.log("❌ getUserforsidebar error:", error.message);
    res.json({ success: false, message: error.message });
  }
};


// export const getUserforsidebar = async (req, res) => {
//   try {
//     const userId = req.user._id;
//     const filteredUsers = await User.find({ _id: { $ne: userId } }).select(
//       "-password"
//     );

//     // Count unseen messages from each user
//     let unseenMessage = {};
//     const promise = filteredUsers.map(async (user) => {
//       const message = await Message.find({
//         sender: user._id,
//         receiver: userId,
//         $or: [{ seenBy: { $exists: false } }, { seenBy: { $ne: userId } }],
//       });
//       if (message.length > 0) {
//         unseenMessage[user._id] = message.length;
//       }
//     });
//     await Promise.all(promise);

//     res.json({ success: true, users: filteredUsers, unseenMessage });
//   } catch (error) {
//     console.log(error.message);
//     res.json({ success: false, message: error.message });
//   }
// };



// export const getMessages = async (req, res) => {
//   try {
//     const { id: selectedUserId } = req.params;
//     const myId = req.user._id;

//     const messages = await Message.find({
//       $or: [
//         { sender: myId, receiver: selectedUserId },
//         { sender: selectedUserId, receiver: myId },
//       ],
//     });

//     // 🟢 Mark all messages from selected user → me as seen
//     await Message.updateMany(
//       { sender: selectedUserId, receiver: myId, seenBy: { $ne: myId } },
//       { $addToSet: { seenBy: myId } }
//     );

//     // 🟢 Real-time notify sender that I have seen messages
//     const senderSocketId = userSocketMap[selectedUserId];
//     if (senderSocketId) {
//       io.to(senderSocketId).emit("messagesSeen", {
//         by: myId,
//         user: selectedUserId,
//       });
//     }

//     res.json({ success: true, messages });
//   } catch (error) {
//     console.log(error.message);
//     res.json({ success: false, message: error.message });
//   }
// };

export const getMessages = async (req, res) => {
  try {
    const { id: selectedUserId } = req.params;
    const myId = req.user._id;

    // 1️⃣ Get all messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: myId, receiver: selectedUserId },
        { sender: selectedUserId, receiver: myId },
      ],
    });

    // 2️⃣ Mark unseen messages (sent *to me*) as seen
    const updateResult = await Message.updateMany(
      { sender: selectedUserId, receiver: myId, seenBy: { $ne: myId } },
      { $addToSet: { seenBy: myId } }
    );

    // 3️⃣ If any messages were updated, emit "messagesSeen" event to sender
    if (updateResult.modifiedCount > 0) {
      const senderSocketId = userSocketMap[selectedUserId]; // get sender's socket ID
      if (senderSocketId) {
        io.to(senderSocketId).emit("messagesSeen", {
          by: myId, // ✅ who saw the messages
          user: selectedUserId, // ✅ whose messages were seen
        });
        console.log(`💙 Emitted "messagesSeen" to ${selectedUserId}`);
      } else {
        console.log("⚠️ Sender offline, skipping messagesSeen emit");
      }
    }

    // 4️⃣ Send messages back to frontend
    res.json({ success: true, messages });
  } catch (error) {
    console.error("❌ getMessages error:", error.message);
    res.json({ success: false, message: error.message });
  }
};


// 🟢 3. Mark a specific message as seen (optional single update)
export const markMessagesAsSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    await Message.findByIdAndUpdate(id, {
      $addToSet: { seenBy: userId },
    });

    res.json({ success: true });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

// 🟢 4. Send a new message


export const sendMessage = async (req, res) => {
  try {
    const sender = req.user._id;
    const receiver = req.params.id;
    const { text, image } = req.body;

    let imageUrl;
    if (image) {
      const uploadedImage = await cloudinary.uploader.upload(image);
      imageUrl = uploadedImage.secure_url;
    }

    // 🟢 Create new message
    const newMessage = await Message.create({
      sender,
      receiver,
      text,
      image: imageUrl,
    });

    // 🟣 If receiver is online, mark message as delivered and send it
    const receiverSocketId = userSocketMap[receiver];
    if (receiverSocketId) {
      newMessage.delivered = true;
      await newMessage.save();

      // 🟢 Send new message to receiver in real-time
      io.to(receiverSocketId).emit("newMessage", newMessage);

      // 🟢 Notify sender message delivered
      io.to(userSocketMap[sender]).emit("messageDelivered", newMessage._id);

      // 🟣 NEW: If receiver is already chatting with sender,
      // instantly notify them and mark message as "seen"
      io.to(receiverSocketId).emit("messageReceivedInActiveChat", {
        messageId: newMessage._id,
        sender, // sender = the one who sent it
      });
    }

    res.json({ success: true, newMessage });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};
