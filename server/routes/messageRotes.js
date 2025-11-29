
import express from "express";
import { protectRoute } from "../middleware/auth.js";
import {
  getUserforsidebar,
  getMessages,
  markMessagesAsSeen,
  sendMessage,
  deleteMessage,
  editMessage
} from "../controllers/messageController.js";

const messageRouter = express.Router();

messageRouter.get("/users", protectRoute, getUserforsidebar);
messageRouter.get("/:id", protectRoute, getMessages);
messageRouter.put("/mark/:id", protectRoute, markMessagesAsSeen);
messageRouter.post("/send/:id", protectRoute, sendMessage);
messageRouter.delete("/:id", protectRoute, deleteMessage); 
messageRouter.put("/edit/:id", protectRoute, editMessage);

export default messageRouter;
