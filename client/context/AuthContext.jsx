
import { createContext, useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { io } from "socket.io-client";

const backendUrl = import.meta.env.VITE_BACKEND_URL;
axios.defaults.baseURL = backendUrl;

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [authUser, setAuthUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [socket, setSocket] = useState(null);

  // ---------------------------
  //  CHECK AUTH
  // ---------------------------
  const checkAuth = async () => {
    try {
      const { data } = await axios.get("/api/auth/check");
      if (data.success) {
        setAuthUser(data.user);
        connectSocket(data.user);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ---------------------------
  //  LOGIN
  // ---------------------------
  const login = async (state, credentials) => {
    try {
      const { data } = await axios.post(`/api/auth/${state}`, credentials);

      if (data.success) {
        setAuthUser(data.userData);
        axios.defaults.headers.common["token"] = data.token;
        setToken(data.token);
        localStorage.setItem("token", data.token);
        toast.success(data.message);

        // disconnect old socket if exists
        if (socket) socket.disconnect();

        connectSocket(data.userData);
      } else {
        toast.error(data.message);
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ---------------------------
  //  LOGOUT
  // ---------------------------
  const logout = async () => {
    localStorage.removeItem("token");
    setToken(null);
    setAuthUser(null);
    setOnlineUsers([]);
    axios.defaults.headers.common["token"] = null;

    toast.success("Logged out successfully");

    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
  };

  // ---------------------------
  //  UPDATE PROFILE
  // ---------------------------
  const updateProfile = async (body) => {
    try {
      const { data } = await axios.put("/api/auth/update-profile", body);
      if (data.success) {
        setAuthUser(data.user);
        toast.success("Profile updated successfully");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // ---------------------------
  //  CONNECT SOCKET  (IMPORTANT FIX)
  // ---------------------------
  const connectSocket = (userData) => {
    if (!userData?._id) return;

    // If socket already connected → do NOT reconnect
    if (socket?.connected) return;

    // Fully close old socket
    if (socket) socket.disconnect();

    const newSocket = io(backendUrl, {
      auth: { userId: userData._id }, // recommended
      query: { userId: userData._id }, // fallback compatibility
      transports: ["websocket"], // CRITICAL for Render
      reconnection: true,
    });

    // Set socket instance
    setSocket(newSocket);

    // Listen for online users
    newSocket.on("getOnlineUsers", (userIds) => {
      setOnlineUsers(Array.isArray(userIds) ? userIds.map(String) : []);
    });

    // Log connect errors (helps debugging)
    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err.message);
    });
  };

  // ---------------------------
  // LOAD USER ON START
  // ---------------------------
  useEffect(() => {
    if (token) axios.defaults.headers.common["token"] = token;

    checkAuth();
  }, []);

  const value = {
    axios,
    authUser,
    onlineUsers,
    socket,
    login,
    logout,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
