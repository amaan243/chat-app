import User from "../models/User.js";
import Message from "../models/Message.js";
import cloudinary from "../lib/cloudinaru.js";
import { io, userSocketMap } from "../server.js";


export const getUserforsidebar = async (req, res) => {
    try {
        const userId = req.user._id;
        const fillterdUser = await User.find({ _id: { $ne: userId } }).select("-password");

        //count unseen messages from each user
        let unseenMessage={};
        const promise=fillterdUser.map(async(user)=>{
        const message=await Message.find({sender:user._id,receiver:userId,seen:false});
          if(message.length>0){
            unseenMessage[user._id]=message.length;
          }
        })
        await Promise.all(promise);

        res.json({ success: true,  users: fillterdUser, unseenMessage });

    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }   
}

//get all message for selected user
export const getMessages = async (req, res) => {
    try {
        const {id:selectedUserId}=req.params;
        const myId = req.user._id;

        const messages = await Message.find({
            $or: [
                { sender: myId, receiver: selectedUserId },
                { sender: selectedUserId, receiver: myId }
            ]
        })
        await Message.updateMany(
            { sender: selectedUserId, receiver: myId},
            {seen:true }
        );
        res.json({ success: true, messages });
    } catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
}

//api to mark messages as seen
export const markMessagesAsSeen=async(req,res)=>{
    try{
        const{id}=req.params;
        await Message.findByIdAndUpdate(id,
            {seen:true}
            );
        res.json({success:true});
    }
    catch(error){
        console.log(error.message);
        res.json({ success: false, message: error.message }); }
}

//api to send message
    
export const sendMessage = async (req, res) => {
    try {
        const sender = req.user._id;
        const receiver=req.params.id;
        const { text, image } = req.body;
        
        let imageUrl;
        if(image){
            const upoadedImage=await cloudinary.uploader.upload(image);
            imageUrl=upoadedImage.secure_url;
        }
        const newMessage =await  Message.create({
            sender,
            receiver, 
            text,
            image: imageUrl});

            //emit socket event to receiver if online
            const receiverSocketId=userSocketMap[receiver];
            if(receiverSocketId){
                io.to(receiverSocketId).emit('newMessage',newMessage);  //send event to specific user
            }

            res.json({ success: true, newMessage });


    }
    catch (error) {
        console.log(error.message);
        res.json({ success: false, message: error.message });
    }
}

