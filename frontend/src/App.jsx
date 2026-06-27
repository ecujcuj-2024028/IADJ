import { useState, useRef, useEffect } from 'react'
import {
  Send, Music, SkipForward, ThumbsDown, ThumbsUp, Radio,
  User, Headphones, Loader2, Volume2, Mic, MicOff, PlayCircle,
  Disc, ListMusic
} from 'lucide-react'
import './App.css'

function App() {
  const [message, setMessage] = useState('')
  const [chatHistory, setChatHistory] = useState([
    { sender: 'dj', text: '¡Qué onda mucha! Soy tu DJ de Gemini Radio. ¿Qué te pongo hoy?' }
  ])
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [currentSong, setCurrentSong] = useState(null)
  const [loading, setLoading] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [queue, setQueue] = useState([])
  const [history, setHistory] = useState([])
  const [queueSource, setQueueSource] = useState(null)
  const [manualSearch, setManualSearch] = useState('')
  const [isLiked, setIsLiked] = useState(false)
  const [isDisliked, setIsDisliked] = useState(false)
  const [dislikeStreak, setDislikeStreak] = useState(0)
  const [searchType, setSearchType] = useState('song')

  const modes = [
    { id: 'song', icon: Music, title: 'Modo Canción', placeholder: 'canción' },
    { id: 'album', icon: Disc, title: 'Modo Álbum', placeholder: 'álbum' },
    { id: 'playlist', icon: ListMusic, title: 'Modo Playlist', placeholder: 'playlist' },
    { id: 'artist', icon: User, title: 'Modo Artista', placeholder: 'artista' }
  ];
  
  // El activo siempre va primero en la lista visual para que se vea cuando está colapsado
  const sortedModes = [...modes].sort((a, b) => a.id === searchType ? -1 : b.id === searchType ? 1 : 0);
  const activeMode = modes.find(m => m.id === searchType);  

  const playerRef = useRef(null)
  const chatEndRef = useRef(null)   
  const audioPlayerRef = useRef(new Audio())

  const syncStatus = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/status')
      const data = await res.json()
      setIsConnected(data.status === 'logeado')
      setQueue(data.queue || [])
      setHistory(data.history || [])
      setQueueSource(data.source)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    syncStatus()
    const interval = setInterval(syncStatus, 5000);
    return () => clearInterval(interval);
  }, [])

  const handleAddManual = async (e) => {
    if (e) e.preventDefault()
    const trimmed = manualSearch.trim()
    if (!trimmed) return
    const isYoutubeLink = trimmed.includes('youtube.com') || trimmed.includes('youtu.be')
    if (!isYoutubeLink) {
      alert("Solo se permiten links directos de YouTube.");
      setManualSearch('')
      return
    }
    try {
      await fetch(`http://127.0.0.1:8000/queue/add?q=${encodeURIComponent(trimmed)}`, { method: 'POST' })
      setManualSearch('')
      syncStatus()
    } catch (e) { console.error(e) }
  }

  const speakBrowser = (text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    window.speechSynthesis.speak(utterance);
  };

  const playDJVoice = (audioUrl, text) => {
    if (!audioUrl) { speakBrowser(text); return; }
    if (playerRef.current && playerRef.current.setVolume) playerRef.current.setVolume(20);
    audioPlayerRef.current.src = `http://127.0.0.1:3001${audioUrl}`;
    audioPlayerRef.current.play().catch(() => speakBrowser(text));
    audioPlayerRef.current.onended = () => {
      if (playerRef.current && playerRef.current.setVolume) playerRef.current.setVolume(100);
    };
  };

  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'es-ES';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setMessage(prev => (prev ? prev + ' ' : '') + finalTranscript.trim());
        }
      };
      recognition.onerror = (event) => {
        console.error("Error de reconocimiento:", event.error);
        if (event.error === 'not-allowed') {
          alert("Permiso de micrófono denegado. Por favor, actívalo en tu navegador.");
        }
        setIsListening(false);
      };
      recognition.onend = () => {
        if (recognitionRef.current && isListening) {
           setIsListening(false);
        }
      };
      recognitionRef.current = recognition;
    }
  }, [isListening]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Tu navegador no soporta reconocimiento de voz.");
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = "https://www.youtube.com/iframe_api";
      document.body.appendChild(tag);
    }
  }, [])

  useEffect(() => {
    if (!currentSong?.videoId) return
    setIsLiked(false)
    setIsDisliked(false)
    const initPlayer = () => {
      if (!playerRef.current) {
        playerRef.current = new window.YT.Player('youtube-player', {
          height: '100%', width: '100%', videoId: currentSong.videoId,
          playerVars: { 'autoplay': 1, 'origin': window.location.origin },
          events: { 'onStateChange': (e) => e.data === 0 && handleNext() }
        })
      } else { playerRef.current.loadVideoById(currentSong.videoId) }
    }
    window.YT && window.YT.Player ? initPlayer() : setTimeout(initPlayer, 1000);
  }, [currentSong?.videoId])

  const handleMoveInQueue = async (videoId, toIndex) => {
    try {
      await fetch(`http://127.0.0.1:8000/queue/move/${videoId}?to_index=${toIndex}`, { method: 'POST' })
      syncStatus()
    } catch (e) { console.error(e) }
  }

  const handleRemoveFromQueue = async (videoId) => {
    try {
      await fetch(`http://127.0.0.1:8000/queue/remove/${videoId}`, { method: 'POST' })
      syncStatus()
    } catch (e) { console.error(e) }
  }

  const handleSendMessage = async (e, directText = null) => {
    if (e) e.preventDefault()
    const textToSend = directText || message.trim()
    if (!textToSend) return
    setMessage(''); setLoading(true);
    setChatHistory(prev => [...prev, { sender: 'user', text: textToSend }])
    
    try {
      const response = await fetch('http://127.0.0.1:3001/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: textToSend, currentSong, searchType })
      })
      const data = await response.json()
      if (data.dj_comment) {
        setChatHistory(prev => [...prev, { sender: 'dj', text: data.dj_comment }])
        playDJVoice(data.audioUrl, data.dj_comment)
      }
      if (data.nextSong?.videoId) {
        setCurrentSong(data.nextSong)
        syncStatus()
      }
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const handleNext = () => handleSendMessage(null, "Siguiente canción DJ.");
  const handlePrevious = () => handleSendMessage(null, "DJ, pon la canción anterior.");
  
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      // Siguiente
      if (e.key === 'MediaTrackNext' || (e.ctrlKey && e.key === 'ArrowRight')) {
        handleNext();
      }
      // Anterior
      if (e.key === 'MediaTrackPrevious' || (e.ctrlKey && e.key === 'ArrowLeft')) {
        handlePrevious();
      }
    };

    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
      navigator.mediaSession.setActionHandler('previoustrack', handlePrevious);
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
      }
    };
  }, [handleNext, handlePrevious]);

  const handleLike = async () => {
    if (!currentSong || isLiked) return
    setIsLiked(true)
    setDislikeStreak(0)
    try {
      await fetch(`http://127.0.0.1:8000/like/${currentSong.videoId}?artist=${encodeURIComponent(currentSong.artist)}&current_title=${encodeURIComponent(currentSong.title)}`, { 
        method: 'POST' 
      })
      syncStatus()
    } catch (e) { setIsLiked(false); console.error(e) }
  };

  const handleDislike = async () => {
    if (!currentSong || isDisliked) return
    setIsDisliked(true)
    const newStreak = dislikeStreak + 1
    setDislikeStreak(newStreak)
    try {
      await fetch(`http://127.0.0.1:8000/dislike/${currentSong.videoId}?artist=${encodeURIComponent(currentSong.artist)}`, { 
        method: 'POST' 
      })
      if (newStreak >= 3) {
        handleSendMessage(null, "He dado dislike a varias canciones seguidas. DJ, cambia totalmente de estilo y pregúntame qué quiero escuchar ahora mismo.");
        setDislikeStreak(0)
      } else {
        // Forzamos al DJ a mirar la nueva cola de favoritos/historial que acabamos de crear en el backend
        setTimeout(() => handleSendMessage(null, "He dado dislike. Ponme algo de mi historial o favoritos ahora mismo."), 300)
      }
    } catch (e) { setIsDisliked(false); console.error(e) }
  };

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [chatHistory])

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-content">
          <Radio className="logo-icon" size={28} />
          <h1>Gemini Radio AI</h1>
        </div>
        <div className={`yt-status-pill ${isConnected ? 'connected' : ''}`}>
          <PlayCircle size={18} fill={isConnected ? "#1ed760" : "#FF0000"} color="#FFF" />
          <span>{isConnected ? 'Account' : 'Modo Invitado'}</span>
        </div>
      </header>

      <main className="main-content">
        <section className="chat-section">
          <div className="chat-header"><Headphones size={18} /><span>DJ Booth</span></div>
          <div className="chat-window">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`chat-bubble-container ${msg.sender}`}>
                <div className={`chat-bubble ${msg.sender}`}><p>{msg.text}</p></div>
              </div>
            ))}
            {loading && <div className="loading-indicator dj"><Loader2 className="spinner" size={16} /><span>DJ pensando...</span></div>}
            <div ref={chatEndRef} />
          </div>
          <form className="chat-input-form" onSubmit={handleSendMessage}>
            <div 
              className={`mode-selector ${isMenuOpen ? 'expanded' : 'collapsed'}`}
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {sortedModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    className={`mode-btn ${searchType === mode.id ? 'active' : ''}`}
                    onClick={(e) => {
                      if (isMenuOpen) {
                        e.stopPropagation();
                        setSearchType(mode.id);
                        setIsMenuOpen(false);
                      }
                    }}
                    title={mode.title}
                  >
                    <Icon size={18} />
                  </button>
                );
              })}
            </div>
            
            <button 
              type="button" 
              className={`mic-btn ${isListening ? 'listening' : ''}`} 
              onClick={toggleListening}
              title={isListening ? "Detener micrófono" : "Hablar"}
            >
              {isListening ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <input 
              type="text" 
              value={message} 
              onChange={e => setMessage(e.target.value)} 
              placeholder={`Pedir ${activeMode?.placeholder || 'canción'}...`} 
            />
            <button type="submit" className="send-btn" disabled={loading}><Send size={18} /></button>
          </form>
        </section>
        
        <section className="player-section">
          <div className="player-wrapper">
            <div className="video-container"><div id="youtube-player"></div>{!currentSong && <div className="no-video"><Music size={48} className="placeholder-icon" /><p>Sintonizando...</p></div>}</div>
            <div className="player-info-card">
              {currentSong ? <div className="song-details"><div className="song-main"><h2>{currentSong.title}</h2><p>{currentSong.artist}</p></div></div> : <div className="song-details empty"><h2>Esperando señal...</h2><p>Pide algo al DJ</p></div>}
              <div className="player-controls">
                <button 
                  className={`control-btn like ${isLiked ? 'active' : ''}`} 
                  onClick={handleLike}
                  title="Actualizará la lista en base a esta canción para ponerte más temas similares"
                >
                  <ThumbsUp size={20} fill={isLiked ? "currentColor" : "none"} />
                  <span>{isLiked ? 'Liked!' : 'Like'}</span>
                </button>
                <button 
                  className={`control-btn dislike ${isDisliked ? 'active' : ''}`} 
                  onClick={handleDislike}
                  title="Se cambiará de canción a una diferente y el DJ evitará este estilo en la sesión"
                >
                  <ThumbsDown size={20} fill={isDisliked ? "currentColor" : "none"} />
                  <span>Dislike</span>
                </button>
                <button className="control-btn next" onClick={handleNext}><span>Siguiente</span><SkipForward size={20} /></button>
              </div>
            </div>

            <div className="queue-container">
              <div className="queue-header">
                <h3>Próximas canciones</h3>
                {queueSource && <span className="queue-source">{queueSource}</span>}
              </div>
              
              <form className="manual-add-form" onSubmit={handleAddManual}>
                <input 
                  type="text" 
                  value={manualSearch} 
                  onChange={e => setManualSearch(e.target.value)} 
                  placeholder="Añadir link de YouTube a la cola..." 
                />
                <button type="submit">Añadir</button>
              </form>

              <div className="queue-list">
                {queue.slice(0, 10).map((song, idx) => (
                  <div key={idx} className="queue-item">
                    <span className="queue-index">{idx + 1}</span>
                    <div className="queue-item-info">
                      <span className="queue-title">{song.title}</span>
                      <span className="queue-artist">{song.artist}</span>
                    </div>
                    <div className="queue-actions">
                      <button className="action-btn" onClick={() => handleMoveInQueue(song.videoId, 0)} title="Poner primero">↑↑</button>
                      <button className="action-btn" onClick={() => handleMoveInQueue(song.videoId, Math.max(0, idx - 1))} title="Subir">↑</button>
                      <button className="action-btn" onClick={() => handleMoveInQueue(song.videoId, Math.min(queue.length - 1, idx + 1))} title="Bajar">↓</button>
                      <button className="remove-item" onClick={() => handleRemoveFromQueue(song.videoId)}>×</button>
                    </div>
                  </div>
                ))}
                {queue.length > 10 && <div className="queue-more">y {queue.length - 10} más...</div>}
                {queue.length === 0 && <p className="empty-msg">No hay más canciones en cola</p>}
              </div>

              {history.length > 0 && (
                <div className="history-section">
                  <div className="queue-header">
                    <h3>Ya escuchadas</h3>
                  </div>
                  <div className="queue-list history">
                    {history.slice(0, 5).map((song, idx) => (
                      <div key={idx} className="queue-item played">
                        <div className="queue-item-info">
                          <span className="queue-title">{song.title}</span>
                          <span className="queue-artist">{song.artist}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
