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
}, { timestamps: true });

const Message = mongoose.model("Message", messageSchema);

export default Message;