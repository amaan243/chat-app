import mongoose from "mongoose";


const messageSchema = new mongoose.Schema({
    sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    receiver: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String,},
    image: { type: String,},
    delivered: { type: Boolean, default: false },
    seenBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    deleted: { type: Boolean, default: false },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    deletedAt: { type: Date, default: null },

     edited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
}, { timestamps: true });

//  chat between two users (fast message loading)
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 });

//  Reverse direction (receiver → sender)
messageSchema.index({ receiver: 1, sender: 1, createdAt: -1 });

//  Seen / unread optimization
messageSchema.index({ receiver: 1, delivered: 1 });

//  Cleanup / deleted messages
messageSchema.index({ deleted: 1 });

//  Timeline queries (latest messages)
messageSchema.index({ createdAt: -1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;