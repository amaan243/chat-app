import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    fullName: { type: String, required: true},
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true ,minlenghth:6},
    profilePic: { type: String, default: "" },
    bio: { type: String},
}, { timestamps: true });


userSchema.index({ email: 1 }, { unique: true });


userSchema.index({ fullName: 1 });


userSchema.index({ createdAt: -1 });


const User = mongoose.model("User", userSchema);

export default User;