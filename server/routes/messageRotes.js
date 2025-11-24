
import express from "express";
import { protectRoute } from "../middleware/auth.js";
import {
  getUserforsidebar,
  getMessages,
  markMessagesAsSeen,
  sendMessage,
  deleteMessage,
} from "../controllers/messageController.js";

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUserforsidebar);
messageRouter.get("/:id", protectRoute, getMessages);
messageRouter.put("/mark/:id", protectRoute, markMessagesAsSeen);
messageRouter.post("/send/:id", protectRoute, sendMessage);
messageRouter.delete("/:id", protectRoute, deleteMessage); 

export default messageRouter;
