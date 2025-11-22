
import { createContext, useContext, useEffect, useState } from "react";
import { AuthContext } from "./AuthContext";
import toast from "react-hot-toast";

export const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const [messages, setMessages] = useState([]);
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [unseenMessages, setUnseenMessages] = useState({}); // ✅ make sure initialized as empty object
  const [typingUsers, setTypingUsers] = useState({}); // { userId: true/false }


  const { socket, axios, authUser } = useContext(AuthContext);

  // ✅ Fetch all users for sidebar
  const getUsers = async () => {
    try {
      const { data } = await axios.get("/api/messages/users");
      if (data.success) {
        setUsers(data.users);
        // ✅ if backend sends unseenMessages, load them; otherwise, start empty
        setUnseenMessages(data.unseenMessages || {});
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ✅ Get messages for selected user
  const getMessages = async (userId) => {
    try {
      const { data } = await axios.get(`/api/messages/${userId}`);
      if (data.success) {
        setMessages(data.messages);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ✅ Send a message
  const sendMessage = async (messageData) => {
    try {
      const { data } = await axios.post(
        `/api/messages/send/${selectedUser._id}`,
        messageData
      );
      if (data.success) {
        setMessages((prev) => [...prev, data.newMessage]);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

   const deleteMessage = async (messageId) => {
    try {
      const { data } = await axios.delete(`/api/messages/${messageId}`);
      if (data.success) {
        // We don't rely on response to update UI; server will emit 'messageDeleted' as well.
        // But optimistically update local state to reflect deletion quickly:
        setMessages((prev) =>
          prev.map((m) =>
            m._id === messageId ? { ...m, deleted: true, deletedBy: authUser._id } : m
          )
        );
      } else {
        toast.error(data.message || "Unable to delete message");
      }
    } catch (error) {
      toast.error(error.message || "Error deleting message");
    }
  };

  // ✅ Listen for new messages via socket

const subscribeToMessages = async () => {
  if (!socket) return;

  // 🟣 Receive new incoming message
  socket.on("newMessage", (newMessage) => {
    

    const senderId = newMessage.sender;
    const receiverId = newMessage.receiver;

    // ✅ If currently chatting with sender, mark seen immediately
    if (selectedUser && senderId === selectedUser._id) {
      newMessage.seenBy = [authUser._id];
      setMessages((prev) => [...prev, newMessage]);
      axios.put(`/api/messages/mark/${newMessage._id}`).catch(() => {});
    }
    // ✅ Else, mark as unseen (increase unseen count)
    else if (receiverId === authUser._id) {
      setUnseenMessages((prev = {}) => {
        const updated = {
          ...prev,
          [senderId]: (prev?.[senderId] || 0) + 1,
        };
        return updated;
      });
    }
  });

  // 🟢 Message delivered update (from backend)
  socket.on("messageDelivered", (messageId) => {
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg._id === messageId ? { ...msg, delivered: true } : msg
      )
    );
  });

  // 🟢 Messages seen update (from backend)
  socket.on("messagesSeen", ({ by, user }) => {
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg.receiver === by
          ? { ...msg, seenBy: [...(msg.seenBy || []), by] }
          : msg
      )
    );
  });

  // ✅ NEW: Receiver has chat open → mark message seen instantly
  socket.on("messageReceivedInActiveChat", async ({ messageId, sender }) => {
   

    try {
      // Update database (mark as seen)
      await axios.put(`/api/messages/mark/${messageId}`);

      // Update receiver’s local state immediately
      setMessages((prev) =>
        prev.map((msg) =>
          msg._id === messageId
            ? { ...msg, seenBy: [...(msg.seenBy || []), authUser._id] }
            : msg
        )
      );

      // 🔁 Tell sender immediately that message was seen
      socket.emit("messageSeenByReceiver", {
        messageId,
        receiver: authUser._id,
        sender,
      });
    } catch (error) {
      console.log("❌ Error marking message as seen:", error.message);
    }
  });

  // ✅ NEW: Sender gets real-time blue tick when receiver sees message
  socket.on("messageSeenByReceiver", ({ messageId, receiver }) => {
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg._id === messageId
          ? { ...msg, seenBy: [...(msg.seenBy || []), receiver] }
          : msg
      )
    );
  });

  // 🟣 Typing events
  socket.on("userTyping", ({ sender }) => {
    setTypingUsers((prev) => ({ ...prev, [sender]: true }));
  });

  socket.on("userStopTyping", ({ sender }) => {
    setTypingUsers((prev) => ({ ...prev, [sender]: false }));
  });

  socket.on("messageDeleted", ({ messageId, deletedBy }) => {
    
    setMessages((prev) =>
      prev.map((m) =>
        m._id === messageId ? { ...m, deleted: true, deletedBy } : m
      )
    );
  });
};


const unsubscribeFromMessages = () => {
  if (socket) {
    socket.off("newMessage");
    socket.off("messageDelivered");
    socket.off("messagesSeen");
    socket.off("userTyping");
    socket.off("userStopTyping");
    socket.off("messageReceivedInActiveChat"); 
    socket.off("messageSeenByReceiver"); 
    socket.off("messageDeleted");

  }
};


 

  useEffect(() => {
    subscribeToMessages();
    return () => unsubscribeFromMessages();
  }, [socket, selectedUser]);

  const value = {
    messages,
    users,
    selectedUser,
    getUsers,
    sendMessage,
    setSelectedUser,
    unseenMessages,
    setUnseenMessages,
    getMessages,
    typingUsers,
    deleteMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

