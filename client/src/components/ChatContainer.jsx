import React, { useContext, useState } from 'react'
import assets, { messagesDummyData } from '../assets/assets'
import { formatMessageTime } from '../lib/utils';
import { useRef } from 'react';
import { useEffect } from 'react';
import { ChatContext } from '../../context/ChatContext';
import { AuthContext } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const ChatContainer = () => {

  const { messages, selectedUser,
    setSelectedUser, sendMessage, getMessages, typingUsers, deleteMessage } = useContext(ChatContext);
  const { authUser,
    onlineUsers, socket } = useContext(AuthContext);

  const scrollEnd = useRef();

  const [input, setInput] = useState("");

  const longPressTimer = useRef(null);
  const longPressTarget = useRef(null);
  const LONG_PRESS_DURATION = 600;



  const handelSendMessage = async (e) => {
    e.preventDefault();
    if (input.trim() === "") return null;
    await sendMessage({ text: input.trim() });
    setInput("");
  }

  const handelSendImage = async (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith("image/")) {
      toast.error("select an image file");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      await sendMessage({ image: reader.result });
      e.target.value = "";
    }

    reader.readAsDataURL(file);
  }

  useEffect(() => {
    if (selectedUser) {
      getMessages(selectedUser._id)
    }
  }, [selectedUser])

  useEffect(() => {
    if (scrollEnd.current && messages) {
      scrollEnd.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages])

  useEffect(() => {
    if (!socket) return;

    if (selectedUser) {
      socket.emit('setActiveChat', selectedUser._id);
    } else {
      socket.emit('clearActiveChat');
    }

    return () => {
      if (socket) socket.emit('clearActiveChat');
    };
  }, [socket, selectedUser]);

  const startLongPress = (e, msg) => {
    // Prevent multiple timers
    clearTimeout(longPressTimer.current);
    longPressTarget.current = msg;

    // Start timer
    longPressTimer.current = setTimeout(() => {
      // Only allow delete if sender is authUser and not seen
      if (msg.sender === authUser._id) {
        if (!msg.seenBy?.length) {
          // confirm popup (replace with custom modal if you have one)
          const confirmDelete = window.confirm("Delete message for everyone? This can't be undone.");
          if (confirmDelete) {
            deleteMessage(msg._id);
          }
        } else {
          toast.error("Cannot delete message — it has been seen.");
        }
      }
    }, LONG_PRESS_DURATION);
  };

  const cancelLongPress = () => {
    clearTimeout(longPressTimer.current);
    longPressTarget.current = null;
  };

  const onTouchMoveHandler = (e) => {
    // small move tolerance could be added; for simplicity cancel immediately
    cancelLongPress();
  };

  return selectedUser ? (
    <div className='h-full overflow-scroll relative backdrop-blur-lg'>

      {/* ----Header---- */}
      <div className="flex items-center gap-3 py-3 mx-4 border-b border-stone-500 relative">
        <img
          src={selectedUser.profilePic || assets.avatar_icon}
          alt=""
          className="w-8 rounded-full"
        />

        {/* Username + Online + Typing */}
        <div className="flex flex-col relative">
          <div className="flex items-center gap-2">
            <p className="text-lg text-white">{selectedUser.fullName}</p>

            {onlineUsers.includes(selectedUser._id) && (
              <span className="w-2 h-2 rounded-full bg-green-500"></span>
            )}
          </div>

          {/* ✅ Typing Indicator */}
          {typingUsers?.[selectedUser._id] && (
            <span className="text-sm text-purple-400 mt-[2px]">typing...</span>
          )}
        </div>

        <img
          onClick={() => setSelectedUser(null)}
          src={assets.arrow_icon}
          alt=""
          className="md:hidden max-w-7 ml-auto cursor-pointer"
        />
        <img
          src={assets.help_icon}
          alt=""
          className="max-md:hidden max-w-5 ml-2"
        />
      </div>

      {/* ----Chat Area---- */}
      <div className='flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6'>
        {
          messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 justify-end ${msg.sender !== authUser._id && 'flex-row-reverse'}`}
              onContextMenu={(e) => {
                // ONLY allow sender to attempt delete
                if (msg.sender === authUser._id && !msg.seenBy?.length) {
                  e.preventDefault();
                  const confirmDelete = window.confirm("Delete message for everyone? This can't be undone.");
                  if (confirmDelete) {
                    // use deleteMessage from ChatContext
                    deleteMessage(msg._id);
                  }
                } else if (msg.sender === authUser._id && msg.seenBy?.length) {
                  e.preventDefault();
                  toast.error("Cannot delete message — it has been seen.");
                }
              }}
              style={{ cursor: msg.sender === authUser._id ? "context-menu" : "default" }}
              onTouchStart={(e) => startLongPress(e, msg)}
              onTouchEnd={(e) => cancelLongPress()}
              onTouchCancel={(e) => cancelLongPress()}
              onTouchMove={onTouchMoveHandler}

              onMouseDown={(e) => startLongPress(e, msg)}
              onMouseUp={cancelLongPress}
              onMouseLeave={cancelLongPress}>

              {msg.deleted ? (
                <div className={`p-2 md:text-sm font-light rounded-lg max-w-[220px] break-all bg-gray-600/30 text-gray-200 italic`}>
                  {msg.deletedBy === authUser._id ? "You deleted this message" : "This message was deleted"}
                </div>
              ) : msg.image ? (
                <div className="relative mb-8">
                  <img
                    src={msg.image}
                    alt=""
                    className="max-w-[230px] border border-gray-700 rounded-lg overflow-hidden"
                  />
                  {msg.sender === authUser._id && (
                    <span className="absolute -bottom-5 right-2 text-sm font-bold text-gray-300 tracking-wider">
                      {msg.seenBy?.length > 0 ? (
                        <span className="text-blue-500 font-extrabold">✓✓</span> // seen
                      ) : msg.delivered ? (
                        <span className="text-gray-400 font-bold">✓✓</span> // delivered
                      ) : (
                        <span className="text-gray-500 font-bold">✓</span> // sent
                      )}
                    </span>
                  )}
                </div>
              ) : (
                <div className="relative mb-8 max-w-[220px]">
                  <p
                    className={`p-2 md:text-sm font-light rounded-lg break-all bg-violet-500/30 text-white ${msg.sender === authUser._id
                      ? "rounded-br-none self-end"
                      : "rounded-bl-none self-start"
                      }`}
                    style={{ wordWrap: "break-word" }}
                  >
                    {msg.text}
                  </p>

                  {/* ✅ Ticks for sender messages only */}
                  {msg.sender === authUser._id && (
                    <span className="absolute -bottom-5 right-2 text-sm font-bold tracking-wider">
                      {msg.seenBy?.length > 0 ? (
                        <span className="text-blue-500 font-extrabold">✓✓</span> // seen
                      ) : msg.delivered ? (
                        <span className="text-gray-400 font-bold">✓✓</span> // delivered
                      ) : (
                        <span className="text-gray-500 font-bold">✓</span> // sent
                      )}
                    </span>
                  )}
                </div>
              )}

              <div className='text-center text-xs'>
                <img className='w-7 rounded-full' src={msg.sender === authUser._id ? authUser?.profilePic || assets.avatar_icon : selectedUser?.profilePic || assets.avatar_icon} alt="" />
                <p className='text-gray-500'>
                  {formatMessageTime(msg.createdAt)}
                </p>
              </div>

            </div>
          ))
        }
        <div ref={scrollEnd}> </div>

      </div>
      {/* bottom */}
      <div className='absolute bottom-0 left-0 right-0 flex items-center gap-3 p-3'>
        <div className='flex-1 flex items-center bg-gray-100/12 px-3 rounded-full'>
          <input onChange={(e) => {
            setInput(e.target.value);
            if (selectedUser) {
              socket.emit('typing', { sender: authUser._id, receiver: selectedUser._id });
              clearTimeout(window.typingTimeout);
              window.typingTimeout = setTimeout(() => {
                socket.emit('stopTyping', { sender: authUser._id, receiver: selectedUser._id });
              }, 1500); // stop typing after 1.5s of no input
            }

          }} value={input}
            onKeyDown={(e) => e.key === 'Enter' ? handelSendMessage(e) : null} type="text" placeholder='Send a message' className='flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400' />
          <input onChange={handelSendImage} type="file" id="image" accept='image/png, image/jpeg' hidden />
          <label htmlFor="image">
            <img src={assets.gallery_icon} alt="" className='w-5 mr-2 cursor-pointer' />
          </label>
        </div>
        <img onClick={handelSendMessage} src={assets.send_button} alt="" className='w-7 cursor-pointer' />
      </div>
    </div>
  ) : (
    <div className='flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden'>
      <img src={assets.logo_icon} alt="" className='max-w-16' />
      <p className='text-lg font-medium text-white'> Chat anytime,anywhere</p>
    </div>
  )
}

export default ChatContainer
