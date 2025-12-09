
// src/components/ChatContainer.jsx
import React, { useContext, useState, useRef, useEffect } from 'react';
import assets from '../assets/assets';
import { formatMessageTime } from '../lib/utils';
import { ChatContext } from '../../context/ChatContext';
import { AuthContext } from '../../context/AuthContext';
import toast from 'react-hot-toast';

const TEN_MINUTES_MS = 10 * 60 * 1000;

const ChatContainer = () => {
  // Contexts
  const {
    messages,
    selectedUser,
    setSelectedUser,
    sendMessage,
    getMessages,
    typingUsers, // optional upstream typing map
    deleteMessage, // provided by ChatContext
  } = useContext(ChatContext);

  // axios + socket + authUser from AuthContext
  const { authUser, onlineUsers, socket, axios } = useContext(AuthContext);

  // Refs & state
  const scrollEnd = useRef();
  const [input, setInput] = useState('');

  // Typing handling
  const typingTimeoutRef = useRef(null);
  const TYPING_STOP_DELAY = 1500;
  const [remoteTyping, setRemoteTyping] = useState({});

  // Long-press
  const LONG_PRESS_DURATION = 600;
  const touchTimerRef = useRef(null);

  // Popover + edit state
  const [confirmForMessage, setConfirmForMessage] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingOriginal, setEditingOriginal] = useState('');
  const [recentEditedId, setRecentEditedId] = useState(null);

  // ticker so UI re-evaluates elapsed times
  const [now, setNow] = useState(Date.now());

  // close popovers on doc click
  useEffect(() => {
    const onDocClick = () => setConfirmForMessage(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  // ticker to update "now" every 30s so edited labels expire in real time
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  // typing emits
  const emitTyping = (isTyping) => {
    if (!socket || !selectedUser || !authUser) return;
    const payload = { sender: String(authUser._id), receiver: String(selectedUser._id) };
    if (isTyping) socket.emit('typing', payload);
    else socket.emit('stopTyping', payload);
  };

  const handleLocalTyping = (value) => {
    setInput(value);
    if (!socket || !selectedUser || !authUser) return;
    emitTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      emitTyping(false);
      typingTimeoutRef.current = null;
    }, TYPING_STOP_DELAY);
  };

  // receive typing events
  useEffect(() => {
    if (!socket) return;
    const onUserTyping = ({ sender }) => {
      if (!sender) return;
      setRemoteTyping((p) => ({ ...p, [String(sender)]: true }));
    };
    const onUserStopTyping = ({ sender }) => {
      if (!sender) return;
      setRemoteTyping((p) => {
        const copy = { ...p };
        delete copy[String(sender)];
        return copy;
      });
    };
    socket.on('userTyping', onUserTyping);
    socket.on('userStopTyping', onUserStopTyping);
    return () => {
      socket.off('userTyping', onUserTyping);
      socket.off('userStopTyping', onUserStopTyping);
    };
  }, [socket]);

  const selectedUserIsTyping = () => {
    if (!selectedUser) return false;
    if (typingUsers && typingUsers[selectedUser._id]) return true;
    if (remoteTyping[String(selectedUser._id)]) return true;
    return false;
  };

  // send / edit
  const handleSendMessage = async (e) => {
    e?.preventDefault?.();
    if (editingMessageId) {
      await saveEdit();
      return;
    }
    if (input.trim() === '') return;
    await sendMessage({ text: input.trim() });
    setInput('');
    if (socket && selectedUser && authUser) {
      socket.emit('stopTyping', { sender: String(authUser._id), receiver: String(selectedUser._id) });
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
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

  // long-press handlers
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

  // double/right click
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

  // delete/edit actions
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

  const startEdit = (msg) => {
    if (!msg || msg.sender !== authUser._id || msg.seenBy?.length || msg.deleted) {
      toast.error('Cannot edit this message.');
      return;
    }
    if (msg.image) {
      toast.error('Image messages cannot be edited.');
      return;
    }
    setEditingMessageId(msg._id);
    setEditingOriginal(msg.text || '');
    setInput(msg.text || '');
    setConfirmForMessage(null);
    setTimeout(() => {
      const el = document.querySelector('input[placeholder="Send a message"]');
      if (el) el.focus();
    }, 50);
  };

  const cancelEdit = () => {
    setEditingMessageId(null);
    setEditingOriginal('');
    setInput('');
  };

  // save edit -> backend should set edited: true and editedAt: Date.now()
  const saveEdit = async () => {
    if (!editingMessageId) return;
    const newText = (input || '').trim();
    if (newText === '') {
      toast.error('Message cannot be empty.');
      return;
    }
    try {
      const editId = editingMessageId;
      const { data } = await axios.put(`/api/messages/edit/${editId}`, { text: newText });
      if (data?.success) {
        if (selectedUser) await getMessages(selectedUser._id);
        setRecentEditedId(editId);
        setTimeout(() => setRecentEditedId((cur) => (cur === editId ? null : cur)), 1200);
        setEditingMessageId(null);
        setEditingOriginal('');
        setInput('');
        toast.success('Message edited');
      } else {
        throw new Error(data?.message || 'Edit failed');
      }
    } catch (err) {
      console.error('Edit error', err);
      toast.error(err.message || 'Failed to edit message');
    }
  };

  const handleKeyDownOnInput = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (editingMessageId) saveEdit();
      else handleSendMessage(e);
    }
  };

  // Effects: load messages, scroll, active chat emit
  useEffect(() => {
    if (selectedUser) getMessages(selectedUser._id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // utility: returns true if we should show edited label for this message
  const shouldShowEditLabel = (msg) => {
    // If backend provided editedAt, use it to decide (10 min window)
    if (msg.editedAt) {
      const editedAtMs = new Date(msg.editedAt).getTime();
      if (Number.isNaN(editedAtMs)) return !!msg.edited; // fallback
      return now - editedAtMs < TEN_MINUTES_MS;
    }
    // If no editedAt, respect edited flag but only briefly via recentEditedId
    if (recentEditedId === msg._id) return true;
    return !!msg.edited && false;
  };

  // Edited label component — always on RIGHT, text = "edited"
  const EditedLabel = ({ animate = false }) => (
    <span
      className={`absolute bottom-0 right-2 text-[9px] italic text-gray-400 pointer-events-none transition-opacity duration-300 ${
        animate ? 'opacity-100' : 'opacity-90'
      }`}
      aria-hidden="true"
      style={{ lineHeight: 1 }}
    >
      edit
    </span>
  );

  // render
  return selectedUser ? (
    <div className="h-full overflow-scroll relative backdrop-blur-lg">
      {/* Header */}
      <div className="flex items-center gap-3 py-3 mx-4 border-b border-stone-500 relative">
        <img src={selectedUser.profilePic || assets.avatar_icon} alt="" className="w-8 rounded-full" />
        <div className="flex flex-col relative">
          <div className="flex items-center gap-2">
            <p className="text-lg text-white">{selectedUser.fullName}</p>
            {Array.isArray(onlineUsers) && onlineUsers.map(String).includes(String(selectedUser._id)) && (
              <span className="w-2 h-2 rounded-full bg-green-500" />
            )}
          </div>

          {(typingUsers?.[selectedUser._id] || remoteTyping[String(selectedUser._id)]) && (
            <span className="text-sm text-purple-400 mt-[2px]">typing...</span>
          )}
        </div>

        <img
          onClick={() => setSelectedUser(null)}
          src={assets.arrow_icon}
          alt=""
          className="md:hidden max-w-7 ml-auto cursor-pointer"
        />
        <img src={assets.help_icon} alt="" className="max-md:hidden max-w-5 ml-2" />
      </div>

      {/* Chat area */}
      <div className="flex flex-col h-[calc(100%-120px)] overflow-y-scroll p-3 pb-6">
        {messages.map((msg, index) => {
          const isMine = msg.sender === authUser._id;
          const disabledBySeen = msg.seenBy?.length > 0;
          const justEdited = recentEditedId && recentEditedId === msg._id;
          const showEdited = shouldShowEditLabel(msg) || justEdited;

          return (
            <div
              key={msg._id || index}
              className={`flex items-end gap-2 justify-end ${!isMine && 'flex-row-reverse'}`}
              onContextMenu={(e) => handleContextMenu(e, msg)}
              onTouchStart={() => onTouchStart(msg)}
              onTouchEnd={() => onTouchEndOrCancel()}
              onTouchCancel={() => onTouchEndOrCancel()}
              onTouchMove={() => onTouchEndOrCancel()}
              onDoubleClick={(e) => handleMessageDoubleClick(e, msg)}
              style={{ cursor: isMine ? 'pointer' : 'default' }}
            >
              {msg.deleted ? (
                <div className="p-2 md:text-sm font-light rounded-lg max-w-[220px] break-all bg-gray-600/30 text-gray-200 italic">
                  {String(msg.deletedBy) === String(authUser._id)
                    ? 'You deleted this message'
                    : 'This message was deleted'}
                </div>
              ) : msg.image ? (
                <div className="relative mb-8 overflow-visible">
                  <img src={msg.image} alt="" className="max-w-[230px] border border-gray-700 rounded-lg overflow-hidden" />
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
                  {confirmForMessage === msg._id && (
                    <div
                      className="absolute -top-12 right-0 w-[220px] bg-gray-900 rounded-md p-2 shadow-lg z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-gray-200 mb-2">Delete this message?</p>
                      {disabledBySeen && (
                        <p className="text-xs text-gray-400 mb-2">
                          Message seen — delete & edit disabled.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setConfirmForMessage(null)}
                          className="px-2 py-1 rounded bg-white/5 text-gray-200 hover:bg-white/10 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => confirmDelete(msg._id)}
                          className={`px-2 py-1 rounded text-sm ${
                            disabledBySeen
                              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          disabled={disabledBySeen}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="relative mb-8 max-w-[220px] overflow-visible">
                  <div className="relative p-2 rounded-lg break-words bg-violet-500/30 text-white max-w-full overflow-visible">
                    <p
                      className={`md:text-sm font-light ${isMine ? 'text-right' : 'text-left'}`}
                      style={{ wordWrap: 'break-word' }}
                    >
                      {msg.text}
                    </p>

                    {showEdited && <EditedLabel animate={justEdited} />}
                  </div>

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

                  {confirmForMessage === msg._id && (
                    <div
                      className="absolute -top-12 right-0 w-[240px] bg-gray-900 rounded-md p-2 shadow-lg z-50"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="text-sm text-gray-200 mb-2">Choose action</p>
                      {disabledBySeen && (
                        <p className="text-xs text-gray-400 mb-2">
                          Message seen — delete & edit disabled.
                        </p>
                      )}
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => setConfirmForMessage(null)}
                          className="px-2 py-1 rounded bg-white/5 text-gray-200 hover:bg-white/10 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => startEdit(msg)}
                          className={`px-2 py-1 rounded text-sm ${
                            disabledBySeen || msg.image
                              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                              : 'bg-yellow-600 text-white hover:bg-yellow-700'
                          }`}
                          disabled={disabledBySeen || msg.image}
                          title={msg.image ? 'Cannot edit image messages' : undefined}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => confirmDelete(msg._id)}
                          className={`px-2 py-1 rounded text-sm ${
                            disabledBySeen
                              ? 'bg-gray-600 text-gray-300 cursor-not-allowed'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          disabled={disabledBySeen}
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
            onChange={(e) => handleLocalTyping(e.target.value)}
            value={input}
            onKeyDown={handleKeyDownOnInput}
            type="text"
            placeholder="Send a message"
            className="flex-1 text-sm p-3 border-none rounded-lg outline-none text-white placeholder-gray-400"
            aria-label="message-input"
          />
          <input onChange={handleSendImage} type="file" id="image" accept="image/png, image/jpeg" hidden />
          <label htmlFor="image">
            <img src={assets.gallery_icon} alt="" className="w-5 mr-2 cursor-pointer" />
          </label>

          {editingMessageId ? (
            <div className="flex items-center gap-2 ml-2">
              <span className="px-2 py-1 rounded bg-yellow-600 text-black text-sm font-medium">
                Editing…
              </span>
              <button
                onClick={cancelEdit}
                className="px-2 py-1 rounded bg-white/5 text-gray-200 hover:bg-white/10 text-sm"
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>

        <button onClick={handleSendMessage} className="w-9 h-9 flex items-center justify-center">
          <img src={assets.send_button} alt="send" className="w-7 cursor-pointer" />
        </button>
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


    