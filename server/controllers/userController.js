import { generateToken } from "../lib/utils.js";
import User from "../models/User.js";
import bcrypt from "bcryptjs";
import cloudinary from "../lib/cloudinaru.js";

export const signup = async (req, res) => {
    const { fullName, email, password, bio } = req.body;
    try {
        if (!fullName || !email || !password || !bio) {
            return res.json({ succses: false, message: "Missing details" });
        }
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.json({ success: false, message: "User already exists" });
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await User.create({
            fullName,
            email, password: hashedPassword, bio
        });

        const token=generateToken(newUser._id);
        res.json({ success: true, message: "Account created successfully", token, userData: newUser });
    } catch (error) {
          console.log(error.message);
          res.json({ success: false, message:error.message });
    }
}


export const login=async (req,res)=>{
    
    try{
      const{email,password}=req.body;
      const userData=await User.findOne({email});
      if(!userData){
        return res.json({success:false,message:"User not found"});
      }
        const isPasswordCorrect=await bcrypt.compare(password,userData.password);
        if(!isPasswordCorrect){
            return res.json({success:false,message:"Invalid credentials"});
        }
        const token=generateToken(userData._id);
        res.json({success:true,message:"Login successful",token,userData});
    }
    catch(error){
        console.log(error.message);
        res.json({ success: false, message:error.message });
    }
}

export const checkAuth=async(req,res)=>{
        res.json({success:true,message:"User is authenticated",user:req.user}); 
}

//update user profile

export const updateProfile=async(req,res)=>{
    try{
      const {profilePic,fullName,bio}=req.body;
      const userId=req.user._id;

      let updatedData;

      if(!profilePic){
        updatedData=await User.findByIdAndUpdate(userId,
            {fullName,bio},
            {new:true}
            );
      }else{
        const uploadRes=await cloudinary.uploader.upload(profilePic);

        updatedData=await User.findByIdAndUpdate(userId,
            {profilePic:uploadRes.secure_url,fullName,bio},
            {new:true}
            );  
      }
      res.json({success:true,message:"Profile updated successfully",user:updatedData});
    }
    catch(error){
        console.log(error.message);
        res.json({ success: false, message:error.message });
    }
}