
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

  // ✅ Listen for new messages via socket
  const subscribeToMessages = async () => {
    if (!socket) return;

    socket.on("newMessage", (newMessage) => {
      console.log("🟣 Incoming message:", newMessage);

      

      const senderId = newMessage.sender ;
      const receiverId = newMessage.receiver;

      

      // ✅ If I am currently chatting with the sender → show immediately
      if (selectedUser && senderId === selectedUser._id) {
        newMessage.seen = true;
        setMessages((prev) => [...prev, newMessage]);
        axios.put(`/api/messages/mark/${newMessage._id}`).catch(() => {});
      }
      // ✅ Else, this message is unseen
      else if (receiverId === authUser._id) {
        setUnseenMessages((prev = {}) => {
          const updated = {
            ...prev,
            [senderId]: (prev?.[senderId] || 0) + 1,
          };
          console.log("✅ Updated unseenMessages:", updated);
          return updated;
        });
      }
    });
    socket.on("userTyping", ({ sender }) => {
  setTypingUsers((prev) => ({ ...prev, [sender]: true }));
});

socket.on("userStopTyping", ({ sender }) => {
  setTypingUsers((prev) => ({ ...prev, [sender]: false }));
});
  };

  // ✅ Cleanup
  const unsubscribeFromMessages = () => {
    if (socket){ 
      socket.off("newMessage");
      socket.off("userTyping");
      socket.off("userStopTyping");
  
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
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};

