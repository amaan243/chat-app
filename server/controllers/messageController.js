
import { io, userSocketMap, userActiveChatMap } from "../server.js";

import User from "../models/User.js";
import Message from "../models/Message.js";
import cloudinary from "../lib/cloudinaru.js";



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
    
    res.json({ success: false, message: error.message });
  }
};



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
        
      } else {
        console.log("⚠️ Sender offline, skipping messagesSeen emit");
      }
    }

    // 4️⃣ Send messages back to frontend
    res.json({ success: true, messages });
  } catch (error) {
    
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
   
    res.json({ success: false, message: error.message });
  }
};

// controllers/messageController.js (add this export)
export const deleteMessage = async (req, res) => {
  try {
    const userId = req.user._id; // requester
    const messageId = req.params.id;

    const msg = await Message.findById(messageId);
    if (!msg) return res.status(404).json({ success: false, message: "Message not found" });

    // Only sender may delete
    if (msg.sender.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this message" });
    }

    // Disallow if any user has seen it (double-blue)
    if ((msg.seenBy || []).length > 0) {
      return res.status(400).json({ success: false, message: "Cannot delete message that has been seen" });
    }

    // Mark as deleted (soft delete) so chat history stays consistent
    msg.deleted = true;
    msg.deletedBy = userId;
    msg.deletedAt = new Date();
    await msg.save();

    // Emit socket event to both participants (if online)
    // Send minimal payload to update UI
    const payload = {
      messageId,
      chatBetween: [msg.sender.toString(), msg.receiver.toString()],
      deletedBy: userId.toString(),
    };

    // Emit to both participants if they are online
    const senderSocket = userSocketMap[msg.sender];
    const receiverSocket = userSocketMap[msg.receiver];
    if (senderSocket) io.to(senderSocket).emit("messageDeleted", payload);
    if (receiverSocket && receiverSocket !== senderSocket) io.to(receiverSocket).emit("messageDeleted", payload);

    return res.json({ success: true, message: "Message deleted" });
  } catch (error) {
   
    res.status(500).json({ success: false, message: error.message });
  }
};


// 🟢 4. Send a new message



export const sendMessage = async (req, res) => {
  try {
    const sender = req.user._id.toString();
    const receiver = req.params.id; // make sure this is string
    const { text, image } = req.body;

    // upload image if exists (your code)
    let imageUrl;
    if (image) {
      const uploadedImage = await cloudinary.uploader.upload(image);
      imageUrl = uploadedImage.secure_url;
    }

    const newMessage = await Message.create({
      sender,
      receiver,
      text,
      image: imageUrl,
    });

    const receiverSocketId = userSocketMap[receiver];
    if (receiverSocketId) {
      // mark delivered and notify receiver
      newMessage.delivered = true;
      await newMessage.save();

      io.to(receiverSocketId).emit("newMessage", newMessage);
      io.to(userSocketMap[sender]).emit("messageDelivered", newMessage._id);

      // ONLY mark as seen / emit 'messageReceivedInActiveChat' when receiver currently has this chat open
      const receiverActiveChat = userActiveChatMap[receiver]; // userId of who receiver is viewing
      if (receiverActiveChat && receiverActiveChat.toString() === sender.toString()) {
        // mark as seen in DB
        await Message.findByIdAndUpdate(newMessage._id, { $addToSet: { seenBy: receiver } });

        // notify the receiver locally (so their UI adds seenBy immediately)
        io.to(receiverSocketId).emit("messageReceivedInActiveChat", {
          messageId: newMessage._id,
          sender,
        });

        // inform the sender that message was seen (so sender gets blue tick)
        const senderSocketId = userSocketMap[sender];
        if (senderSocketId) {
          io.to(senderSocketId).emit("messageSeenByReceiver", {
            messageId: newMessage._id,
            receiver,
          });
        }
      }
    }

    res.json({ success: true, newMessage });
  } catch (error) {
    console.log(error.message);
    res.json({ success: false, message: error.message });
  }
};

// ⬇️ make sure this is inside controllers/messageController.js
export const editMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id.toString();
    const { text } = req.body;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ success: false, message: "Text is required" });
    }

    const msg = await Message.findById(messageId);
    if (!msg) {
      return res.status(404).json({ success: false, message: "Message not found" });
    }

    if (msg.sender.toString() !== userId) {
      return res.status(403).json({ success: false, message: "Not authorized to edit this message" });
    }

    if ((msg.seenBy || []).length > 0) {
      return res.status(400).json({ success: false, message: "Cannot edit message that has been seen" });
    }

    if (msg.image) {
      return res.status(400).json({ success: false, message: "Image messages cannot be edited" });
    }

    // ✅ update text + edit flags
    msg.text = text;
    msg.edited = true;
    msg.editedAt = new Date();
    await msg.save();

    const payload = {
      _id: msg._id.toString(),
      sender: msg.sender.toString(),
      receiver: msg.receiver.toString(),
      text: msg.text,
      edited: msg.edited,
      editedAt: msg.editedAt,
    };

    const senderSocket = userSocketMap[msg.sender.toString()];
    const receiverSocket = userSocketMap[msg.receiver.toString()];

    if (senderSocket) io.to(senderSocket).emit("messageEdited", payload);
    if (receiverSocket && receiverSocket !== senderSocket) {
      io.to(receiverSocket).emit("messageEdited", payload);
    }

    return res.json({ success: true, updatedMessage: payload });
  } catch (error) {
    console.error("editMessage error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};




// export const sendMessage = async (req, res) => {
//   try {
//     const sender = req.user._id;
//     const receiver = req.params.id;
//     const { text, image } = req.body;

//     let imageUrl;
//     if (image) {
//       const uploadedImage = await cloudinary.uploader.upload(image);
//       imageUrl = uploadedImage.secure_url;
//     }

//     // 🟢 Create new message
//     const newMessage = await Message.create({
//       sender,
//       receiver,
//       text,
//       image: imageUrl,
//     });

//     // 🟣 If receiver is online, mark message as delivered and send it
//     const receiverSocketId = userSocketMap[receiver];
//     if (receiverSocketId) {
//       newMessage.delivered = true;
//       await newMessage.save();

//       // 🟢 Send new message to receiver in real-time
//       io.to(receiverSocketId).emit("newMessage", newMessage);

//       // 🟢 Notify sender message delivered
//       io.to(userSocketMap[sender]).emit("messageDelivered", newMessage._id);

//       // 🟣 NEW: If receiver is already chatting with sender,
//       // instantly notify them and mark message as "seen"
//       io.to(receiverSocketId).emit("messageReceivedInActiveChat", {
//         messageId: newMessage._id,
//         sender, // sender = the one who sent it
//       });
//     }

//     res.json({ success: true, newMessage });
//   } catch (error) {
    
//     res.json({ success: false, message: error.message });
//   }
// };
