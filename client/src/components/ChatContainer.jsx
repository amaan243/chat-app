
import React, { useContext, useState, useRef, useEffect } from 'react';
import assets from '../assets/assets';
import { formatMessageTime } from '../lib/utils';
import { ChatContext } from '../../context/ChatContext';
import { AuthContext } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const ChatContainer = () => {
  // Contexts
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    getMessages,
    typingUsers,
    deleteMessage,
  } = useContext(ChatContext);

  const { authUser, onlineUsers, socket } = useContext(AuthContext);

  // Refs & state
  const scrollEnd = useRef();
  const [input, setInput] = useState('');

  // Long-press (touch) detection (no loading UI)
  const LONG_PRESS_DURATION = 600; // ms needed to count as long-press on mobile
  const touchTimerRef = useRef(null);

  // Inline confirm popover target (messageId or null)
  const [confirmForMessage, setConfirmForMessage] = useState(null);

  // Close popover when clicking outside
  useEffect(() => {
    const onDocClick = (e) => {
      // If clicked outside any popover, close it
      setConfirmForMessage((prev) => {
        if (!prev) return prev;
        // We'll close regardless; finer checks handled by stopPropagation on popover
        return null;
      });
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // Helpers
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (input.trim() === '') return;
    await sendMessage({ text: input.trim() });
    setInput('');
  };

  const handleSendImage = async (e) => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) {
      toast.error('select an image file');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      await sendMessage({ image: reader.result });
      e.target.value = '';
    };
    reader.readAsDataURL(file);
  };

  // Long-press handlers (mobile only) — open inline confirm after hold (no loading UI)
  const onTouchStart = (msg) => {
    if (!msg || msg.sender !== authUser._id || msg.seenBy?.length || msg.deleted) return;
    touchTimerRef.current = setTimeout(() => {
      touchTimerRef.current = null;
      setConfirmForMessage(msg._id);
    }, LONG_PRESS_DURATION);
  };

  const onTouchEndOrCancel = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  // Desktop: double-click opens inline confirm; right-click opens inline confirm.
  const handleMessageDoubleClick = (e, msg) => {
    if (msg.sender !== authUser._id) return;
    e.stopPropagation();
    setConfirmForMessage(msg._id);
  };

  const handleContextMenu = (e, msg) => {
    if (msg.sender !== authUser._id) return;
    e.preventDefault();
    setConfirmForMessage(msg._id);
  };

  // Confirm delete action
  const confirmDelete = (messageId) => {
    const msg = messages.find((m) => m._id === messageId);
    if (!msg) {
      setConfirmForMessage(null);
      return;
    }
    if (msg.seenBy?.length > 0) {
      toast.error('Cannot delete message — it has been seen.');
      setConfirmForMessage(null);
      return;
    }
    deleteMessage(messageId);
    setConfirmForMessage(null);
  };

  // Effects: load messages, scroll, active chat emit
  useEffect(() => {
    if (selectedUser) getMessages(selectedUser._id);
  }, [selectedUser]);

  useEffect(() => {
    if (scrollEnd.current && messages) scrollEnd.current.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!socket) return;
    if (selectedUser) socket.emit('setActiveChat', selectedUser._id);
    else socket.emit('clearActiveChat');

    return () => {
      if (socket) socket.emit('clearActiveChat');
    };
  }, [socket, selectedUser]);

  // Render
  return selectedUser ? (
    <div className="h-full overflow-scroll relative backdrop-blur-lg">
      {/* Header */}
      <div className="flex items-center gap-3 py-3 mx-4 border-b border-stone-500 relative">
        <img src={selectedUser.profilePic || assets.avatar_icon} alt="" className="w-8 rounded-full" />
        <div className="flex flex-col relative">
          <div className="flex items-center gap-2">
            <p className="text-lg text-white">{selectedUser.fullName}</p>
            {onlineUsers.includes(selectedUser._id) && <span className="w-2 h-2 rounded-full bg-green-500" />}
          </div>
          {typingUsers?.[selectedUser._id] && <span className="text-sm text-purple-400 mt-[2px]">typing...</span>}
        </div>

        <img onClick={() => setSelectedUser(null)} src={assets.arrow_icon} alt="" className="md:hidden max-w-7 ml-auto cursor-pointer" />
        <img src={assets.help_icon} alt="" className="max-md:hidden max-w-5 ml-2" />
      </div>

      {/* Chat area */}
      <div className="flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6">
        {messages.map((msg, index) => {
          const isMine = msg.sender === authUser._id;

          return (
            <div
              key={msg._id || index}
              className={`flex items-end gap-2 justify-end ${!isMine && 'flex-row-reverse'}`}
              onContextMenu={(e) => handleContextMenu(e, msg)} // right-click (desktop)
              // touch handlers (mobile long-press)
              onTouchStart={() => onTouchStart(msg)}
              onTouchEnd={() => onTouchEndOrCancel()}
              onTouchCancel={() => onTouchEndOrCancel()}
              onTouchMove={() => onTouchEndOrCancel()}
              // desktop double click
              onDoubleClick={(e) => handleMessageDoubleClick(e, msg)}
              style={{ cursor: isMine ? 'pointer' : 'default' }}
            >
              {/* Message bubble / deleted placeholder */}
              {msg.deleted ? (
                <div className="p-2 md:text-sm font-light rounded-lg max-w-[220px] break-all bg-gray-600/30 text-gray-200 italic">
                  {String(msg.deletedBy) === String(authUser._id) ? 'You deleted this message' : 'This message was deleted'}
                </div>
              ) : msg.image ? (
                <div className="relative mb-8">
                  <img src={msg.image} alt="" className="max-w-[230px] border border-gray-700 rounded-lg overflow-hidden" />
                  {/* ticks */}
                  {isMine && (
                    <span className="absolute -bottom-5 right-2 text-sm font-bold tracking-wider">
                      {msg.seenBy?.length > 0 ? (
                        <span className="text-blue-500 font-extrabold">✓✓</span>
                      ) : msg.delivered ? (
                        <span className="text-gray-400 font-bold">✓✓</span>
                      ) : (
                        <span className="text-gray-500 font-bold">✓</span>
                      )}
                    </span>
                  )}

                  {/* Inline confirm popover anchored to this bubble */}
                  {confirmForMessage === msg._id && (
                    <div
                      className="absolute -top-12 right-0 w-[220px] bg-gray-900 rounded-md p-2 shadow-lg z-50"
                      onClick={(e) => e.stopPropagation()} // prevent doc click from closing immediately
                    >
                      <p className="text-sm text-gray-200 mb-2">Delete this message?</p>
                      {msg.seenBy?.length > 0 && <p className="text-xs text-gray-400 mb-2">Message seen — delete disabled.</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setConfirmForMessage(null)}
                          className="px-2 py-1 rounded bg-white/5 text-gray-200 hover:bg-white/10 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => confirmDelete(msg._id)}
                          className={`px-2 py-1 rounded text-sm ${msg.seenBy?.length > 0 ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                          disabled={msg.seenBy?.length > 0}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative mb-8 max-w-[220px]">
                  <p
                    className={`p-2 md:text-sm font-light rounded-lg break-all bg-violet-500/30 text-white ${isMine ? 'rounded-br-none self-end' : 'rounded-bl-none self-start'}`}
                    style={{ wordWrap: 'break-word' }}
                  >
                    {msg.text}
                  </p>

                  {/* ticks */}
                  {isMine && (
                    <span className="absolute -bottom-5 right-2 text-sm font-bold tracking-wider">
                      {msg.seenBy?.length > 0 ? (
                        <span className="text-blue-500 font-extrabold">✓✓</span>
                      ) : msg.delivered ? (
                        <span className="text-gray-400 font-bold">✓✓</span>
                      ) : (
                        <span className="text-gray-500 font-bold">✓</span>
                      )}
                    </span>
                  )}

                  {/* Inline confirm popover anchored to this bubble */}
                  {confirmForMessage === msg._id && (
                    <div
                      className="absolute -top-12 right-0 w-[220px] bg-gray-900 rounded-md p-2 shadow-lg z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-gray-200 mb-2">Delete this message?</p>
                      {msg.seenBy?.length > 0 && <p className="text-xs text-gray-400 mb-2">Message seen — delete disabled.</p>}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setConfirmForMessage(null)}
                          className="px-2 py-1 rounded bg-white/5 text-gray-200 hover:bg-white/10 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => confirmDelete(msg._id)}
                          className={`px-2 py-1 rounded text-sm ${msg.seenBy?.length > 0 ? 'bg-gray-600 text-gray-300 cursor-not-allowed' : 'bg-red-600 text-white hover:bg-red-700'}`}
                          disabled={msg.seenBy?.length > 0}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* avatar + time */}
              <div className="text-center text-xs">
                <img
                  className="w-7 rounded-full"
                  src={isMine ? authUser?.profilePic || assets.avatar_icon : selectedUser?.profilePic || assets.avatar_icon}
                  alt=""
                />
                <p className="text-gray-500">{formatMessageTime(msg.createdAt)}</p>
              </div>
            </div>
          );
        })}
        <div ref={scrollEnd} />
      </div>

      {/* bottom input */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 p-3">
        <div className="flex-1 flex items-center bg-gray-100/12 px-3 rounded-full">
          <input
            onChange={(e) => {
              setInput(e.target.value);
              if (selectedUser) {
                socket.emit('typing', { sender: authUser._id, receiver: selectedUser._id });
                clearTimeout(window.typingTimeout);
                window.typingTimeout = setTimeout(() => {
                  socket.emit('stopTyping', { sender: authUser._id, receiver: selectedUser._id });
                }, 1500);
              }
            }}
            value={input}
            onKeyDown={(e) => (e.key === 'Enter' ? handleSendMessage(e) : null)}
            type="text"
            placeholder="Send a message"
            className="flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400"
          />
          <input onChange={handleSendImage} type="file" id="image" accept="image/png, image/jpeg" hidden />
          <label htmlFor="image">
            <img src={assets.gallery_icon} alt="" className="w-5 mr-2 cursor-pointer" />
          </label>
        </div>
        <img onClick={handleSendMessage} src={assets.send_button} alt="" className="w-7 cursor-pointer" />
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center justify-center gap-2 text-gray-500 bg-white/10 max-md:hidden">
      <img src={assets.logo_icon} alt="" className="max-w-16" />
      <p className="text-lg font-medium text-white"> Chat anytime,anywhere</p>
    </div>
  );
};

export default ChatContainer;
